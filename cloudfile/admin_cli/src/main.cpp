// cloudfile_admin: 管理员 CLI
//
// Phase 1a-1 / 1a-2 已实现：
//   init-admin [--username <u>] [--email <e>]
//       创建第一个管理员账户（幂等）
//   invite <email>
//       生成一条 7 天有效期的邀请 token，打印一次
//   list-users
//       列出所有用户
//   list-invites
//       列出所有邀请（active / used / revoked / expired）
//   revoke-invite <id>
//       撤销邀请（幂等）
//
// Phase 1b / 1c 将实现：delete-user、rebuild-index 等。

#include "cloudfile/domain/invite.h"
#include "cloudfile/domain/password.h"
#include "cloudfile/domain/user.h"
#include "cloudfile/storage/db.h"

#include <fmt/core.h>
#include <sodium.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/spdlog.h>

#include <cerrno>
#include <chrono>
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
        "  invite <email>\n"
        "      为 email 生成一条 7 天邀请 token。token 仅打印一次，\n"
        "      遗失只能 revoke-invite 后重新 invite。\n"
        "      created_by 默认取第一个管理员。\n"
        "\n"
        "  list-users\n"
        "      列出所有用户。\n"
        "\n"
        "  list-invites\n"
        "      列出所有邀请（含状态：active / used / revoked / expired）。\n"
        "\n"
        "  revoke-invite <id>\n"
        "      按 id 撤销邀请（id 从 list-invites 看）。幂等。\n"
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

/// 找第一个 admin。invite/CLI 其他操作都把"谁发的"归到这个账户。
/// 这样即使 admin 有多个（未来），CLI 不用挑——反正都是同机器上手动跑。
std::optional<cloudfile::domain::user::User> find_first_admin() {
    for (auto& u : cloudfile::domain::user::list_all()) {
        if (u.is_admin) return u;
    }
    return std::nullopt;
}

int cmd_invite(int argc, char** argv) {
    if (argc < 3 || std::string_view(argv[2]).substr(0, 2) == "--") {
        spdlog::error("usage: cloudfile_admin invite <email>");
        return 1;
    }
    const std::string email = argv[2];

    auto admin = find_first_admin();
    if (!admin) {
        spdlog::error("no admin user found; run 'init-admin' first");
        return 1;
    }

    try {
        auto result = cloudfile::domain::invite::create(
            admin->id,
            std::optional<std::string_view>(email),
            std::chrono::hours(24 * 7));

        // 打印到 stdout，让 admin 复制
        fmt::print("\n");
        fmt::print("[ok] invite created for {} (expires {} UTC)\n",
                   email, result.record.expires_at);
        fmt::print("\n");
        fmt::print("  token: {}\n", result.plaintext_token);
        fmt::print("\n");
        fmt::print("  share-link example:\n");
        fmt::print("    https://your-host/register?token={}&email={}\n",
                   result.plaintext_token, email);
        fmt::print("\n");
        fmt::print("  NOTE: token is shown ONCE. If lost, revoke-invite {} and re-invite.\n",
                   result.record.id);
        fmt::print("\n");
        return 0;
    } catch (const std::exception& e) {
        spdlog::critical("create invite failed: {}", e.what());
        return 1;
    }
}

int cmd_list_users(int /*argc*/, char** /*argv*/) {
    auto users = cloudfile::domain::user::list_all();
    if (users.empty()) {
        fmt::print("(no users)\n");
        return 0;
    }
    fmt::print("{:>4}  {:<24}  {:<32}  {:<6}  {}\n",
               "id", "username", "email", "role", "created_at");
    fmt::print("{:-<90}\n", "");
    for (const auto& u : users) {
        fmt::print("{:>4}  {:<24}  {:<32}  {:<6}  {}\n",
                   u.id, u.username, u.email,
                   u.is_admin ? "admin" : "user",
                   u.created_at);
    }
    return 0;
}

int cmd_list_invites(int /*argc*/, char** /*argv*/) {
    auto invites = cloudfile::domain::invite::list_all();
    if (invites.empty()) {
        fmt::print("(no invites)\n");
        return 0;
    }
    fmt::print("{:>4}  {:<30}  {:>10}  {:<8}  {:<20}  {}\n",
               "id", "email_hint", "created_by", "status", "expires_at(UTC)", "created_at(UTC)");
    fmt::print("{:-<100}\n", "");
    for (const auto& inv : invites) {
        auto st = cloudfile::domain::invite::status_of(inv);
        fmt::print("{:>4}  {:<30}  {:>10}  {:<8}  {:<20}  {}\n",
                   inv.id,
                   inv.email_hint.value_or("-"),
                   inv.created_by,
                   cloudfile::domain::invite::status_name(st),
                   inv.expires_at,
                   inv.created_at);
    }
    return 0;
}

int cmd_revoke_invite(int argc, char** argv) {
    if (argc < 3) {
        spdlog::error("usage: cloudfile_admin revoke-invite <id>");
        return 1;
    }
    std::int64_t id;
    try {
        id = std::stoll(argv[2]);
    } catch (const std::exception&) {
        spdlog::error("invalid invite id: {}", argv[2]);
        return 1;
    }
    if (cloudfile::domain::invite::revoke_by_id(id)) {
        spdlog::info("invite {} revoked", id);
        return 0;
    }
    spdlog::error("invite {} not found", id);
    return 1;
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

    if (cmd == "init-admin")    return cmd_init_admin(argc, argv);
    if (cmd == "invite")        return cmd_invite(argc, argv);
    if (cmd == "list-users")    return cmd_list_users(argc, argv);
    if (cmd == "list-invites")  return cmd_list_invites(argc, argv);
    if (cmd == "revoke-invite") return cmd_revoke_invite(argc, argv);

    spdlog::error("unknown command: {}", cmd);
    print_usage();
    return 1;
}
