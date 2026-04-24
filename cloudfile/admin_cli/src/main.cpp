// cloudfile_admin: 管理员 CLI
//
// Phase 1a-1 已实现：
//   cloudfile_admin init-admin [--username <u>] [--email <e>]
//     从环境变量 CLOUDFILE_INITIAL_ADMIN_PASSWORD 或 stdin 读密码，
//     创建第一个 is_admin=1 用户。幂等：已存在同用户名则报错退出。
//
// Phase 1a-2 / 1b / 1c 将实现：invite、list-users、list-invites、
// revoke-invite、delete-user、rebuild-index 等。

#include "cloudfile/domain/password.h"
#include "cloudfile/domain/user.h"
#include "cloudfile/storage/db.h"

#include <sodium.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/spdlog.h>

#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <optional>
#include <string>
#include <string_view>
#include <termios.h>
#include <unistd.h>
#include <vector>

namespace {

void print_usage() {
    std::cout <<
        "cloudfile_admin - 管理员 CLI\n"
        "\n"
        "Commands:\n"
        "  init-admin [--username <u>] [--email <e>]\n"
        "      创建第一个管理员账户。\n"
        "      密码从环境变量 CLOUDFILE_INITIAL_ADMIN_PASSWORD 读，\n"
        "      或如果该变量未设，从 stdin 交互读取（echo off）。\n"
        "      默认 username=admin, email=admin@localhost。\n"
        "\n"
        "  invite <email>             [Phase 1a-2]\n"
        "  list-users                 [Phase 1a-2]\n"
        "  list-invites               [Phase 1a-2]\n"
        "  revoke-invite <id>         [Phase 1a-2]\n"
        "\n"
        "Environment:\n"
        "  CLOUDFILE_DATA_ROOT              数据目录（默认 /var/lib/cloudfile）\n"
        "  CLOUDFILE_INITIAL_ADMIN_PASSWORD init-admin 的非交互密码\n";
}

/// 从环境变量读，缺失返回 std::nullopt
std::optional<std::string> env(const char* key) {
    const char* v = std::getenv(key);
    if (!v) return std::nullopt;
    return std::string(v);
}

/// 从 stdin 读密码，echo 关闭。没有 tty 时返回 std::nullopt。
std::optional<std::string> read_password_from_tty(std::string_view prompt) {
    if (!isatty(STDIN_FILENO)) return std::nullopt;

    std::cout << prompt << std::flush;

    termios old_tc{};
    if (tcgetattr(STDIN_FILENO, &old_tc) != 0) return std::nullopt;
    termios new_tc = old_tc;
    new_tc.c_lflag &= ~static_cast<tcflag_t>(ECHO);
    if (tcsetattr(STDIN_FILENO, TCSANOW, &new_tc) != 0) return std::nullopt;

    std::string line;
    std::getline(std::cin, line);

    tcsetattr(STDIN_FILENO, TCSANOW, &old_tc);
    std::cout << '\n';
    return line;
}

/// 解析 --username/--email 之类的长选项
struct Args {
    std::vector<std::string_view> positional;
    std::string username;
    std::string email;
};

Args parse_args(int argc, char** argv, int start_idx) {
    Args a;
    for (int i = start_idx; i < argc; ++i) {
        std::string_view arg = argv[i];
        if (arg == "--username" && i + 1 < argc) {
            a.username = argv[++i];
        } else if (arg == "--email" && i + 1 < argc) {
            a.email = argv[++i];
        } else if (arg.size() >= 2 && arg.substr(0, 2) == "--") {
            spdlog::error("未知参数: {}", arg);
            std::exit(2);
        } else {
            a.positional.push_back(arg);
        }
    }
    return a;
}

int cmd_init_admin(int argc, char** argv) {
    auto args = parse_args(argc, argv, 2);

    const std::string username = !args.username.empty() ? args.username : "admin";
    const std::string email    = !args.email.empty()    ? args.email    : "admin@localhost";

    // 已有任何用户 → 拒绝（防止 init-admin 被当成"加管理员"用）
    if (cloudfile::domain::user::count() > 0) {
        // 如果同名管理员已存在，幂等返回成功；否则报错
        auto existing = cloudfile::domain::user::find_by_username(username);
        if (existing && existing->is_admin) {
            spdlog::info("admin '{}' already exists (id={}), nothing to do",
                         existing->username, existing->id);
            return 0;
        }
        spdlog::error("users already exist; init-admin is for first-run only");
        spdlog::error("  hint: use 'cloudfile_admin invite' to add more admins later (Phase 1a-2)");
        return 1;
    }

    // 密码：优先环境变量，fallback stdin
    std::string password;
    if (auto env_pw = env("CLOUDFILE_INITIAL_ADMIN_PASSWORD"); env_pw.has_value()) {
        password = std::move(*env_pw);
    } else {
        auto tty_pw = read_password_from_tty("Admin password (min 12 chars): ");
        if (!tty_pw.has_value()) {
            spdlog::error("no tty and CLOUDFILE_INITIAL_ADMIN_PASSWORD not set");
            spdlog::error("  hint: docker compose exec -e CLOUDFILE_INITIAL_ADMIN_PASSWORD='...' backend cloudfile_admin init-admin");
            return 1;
        }
        password = std::move(*tty_pw);
    }

    if (!cloudfile::domain::password::is_acceptable(password)) {
        spdlog::error("password rejected: must be {}-{} characters",
                      cloudfile::domain::password::kMinLength,
                      cloudfile::domain::password::kMaxLength);
        return 1;
    }

    std::string hash;
    try {
        hash = cloudfile::domain::password::hash(password);
    } catch (const std::exception& e) {
        spdlog::critical("password hashing failed: {}", e.what());
        return 1;
    }
    // 立即擦掉明文密码（尽力而为；C++ 没有真正的 secure erase）
    std::fill(password.begin(), password.end(), '\0');

    try {
        auto u = cloudfile::domain::user::create(username, email, hash, /*is_admin=*/true);
        spdlog::info("Created admin user: {} (id={}, email={})",
                     u.username, u.id, u.email);
        return 0;
    } catch (const std::exception& e) {
        spdlog::critical("create user failed: {}", e.what());
        return 1;
    }
}

}  // anonymous namespace

int main(int argc, char** argv) {
    // 日志配置：stderr 输出，管道友好
    auto logger = spdlog::stderr_color_mt("admin");
    spdlog::set_default_logger(logger);
    spdlog::set_level(spdlog::level::info);
    spdlog::set_pattern("[%^%l%$] %v");

    if (argc < 2) {
        print_usage();
        return 1;
    }

    std::string_view cmd = argv[1];
    if (cmd == "--help" || cmd == "-h" || cmd == "help") {
        print_usage();
        return 0;
    }

    // 初始化 libsodium（所有加密操作前必须）
    if (sodium_init() < 0) {
        spdlog::critical("libsodium init failed");
        return 1;
    }

    // 打开数据库
    std::filesystem::path data_root =
        env("CLOUDFILE_DATA_ROOT").value_or("/var/lib/cloudfile");
    std::filesystem::create_directories(data_root);

    try {
        cloudfile::storage::Database::init(data_root / "cloudfile.sqlite");
    } catch (const std::exception& e) {
        spdlog::critical("database init failed: {}", e.what());
        return 1;
    }

    if (cmd == "init-admin") return cmd_init_admin(argc, argv);

    // Phase 1a-2 命令
    if (cmd == "invite" || cmd == "list-users" || cmd == "list-invites"
            || cmd == "revoke-invite") {
        spdlog::warn("'{}' 在 Phase 1a-2 实现（下一次 CC 对话）", cmd);
        return 0;
    }

    spdlog::error("unknown command: {}", cmd);
    print_usage();
    return 1;
}
