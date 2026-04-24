// Phase 0 占位；Phase 1 实现：
//   cloudfile_admin init-admin --email <email>
//   cloudfile_admin invite <email>
//   cloudfile_admin list-users
//   cloudfile_admin revoke-invite <token_id>

#include <spdlog/spdlog.h>

#include <cstring>
#include <iostream>
#include <string_view>

namespace {

void print_usage() {
    std::cout <<
        "cloudfile_admin - 管理员 CLI (Phase 0 占位)\n"
        "\n"
        "用法：\n"
        "  cloudfile_admin init-admin --email <email>   [Phase 1]\n"
        "  cloudfile_admin invite <email>               [Phase 1]\n"
        "  cloudfile_admin list-users                   [Phase 1]\n"
        "  cloudfile_admin revoke-invite <token_id>     [Phase 1]\n"
        "\n"
        "环境变量：\n"
        "  CLOUDFILE_DATA_ROOT  数据根目录（默认 /var/lib/cloudfile）\n"
        "  CLOUDFILE_INITIAL_ADMIN_PASSWORD  init-admin 读取密码（非交互模式）\n";
}

}  // anonymous namespace

int main(int argc, char** argv) {
    if (argc < 2) {
        print_usage();
        return 1;
    }

    std::string_view cmd = argv[1];

    if (cmd == "--help" || cmd == "-h" || cmd == "help") {
        print_usage();
        return 0;
    }

    spdlog::warn("Command '{}' not yet implemented (Phase 0 stub)", cmd);
    spdlog::info("See cloudfile/DESIGN.md § Next Steps Week 1 for roadmap");
    return 0;
}
