#include "cloudfile/storage/db.h"

#include <drogon/drogon.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/spdlog.h>
#include <sodium.h>

#include <cstdlib>
#include <filesystem>
#include <string>

namespace {

/// 从环境变量读取配置；缺失则用合理默认值
struct Config {
    std::string listen_host;
    uint16_t    listen_port;
    std::filesystem::path data_root;    // docs_repo + db 所在目录
    std::filesystem::path config_file;  // drogon 配置 JSON
    bool        dev_mode;
};

Config load_config() {
    auto env_or = [](const char* key, const char* fallback) -> std::string {
        const char* v = std::getenv(key);
        return v ? v : fallback;
    };

    Config c;
    c.listen_host = env_or("CLOUDFILE_HOST", "0.0.0.0");
    c.listen_port = static_cast<uint16_t>(
        std::stoi(env_or("CLOUDFILE_PORT", "8080")));
    c.data_root   = env_or("CLOUDFILE_DATA_ROOT", "/var/lib/cloudfile");
    c.config_file = env_or("CLOUDFILE_CONFIG", "/etc/cloudfile/cloudfile.conf");
    c.dev_mode    = std::string(env_or("CLOUDFILE_DEV", "0")) == "1";
    return c;
}

void setup_logging(bool dev_mode) {
    auto logger = spdlog::stdout_color_mt("cloudfile");
    spdlog::set_default_logger(logger);
    spdlog::set_level(dev_mode ? spdlog::level::debug : spdlog::level::info);
    spdlog::set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%^%l%$] %v");
}

}  // namespace

int main() {
    auto config = load_config();
    setup_logging(config.dev_mode);

    spdlog::info("cloudfile backend starting...");
    spdlog::info("  listen: {}:{}", config.listen_host, config.listen_port);
    spdlog::info("  data_root: {}", config.data_root.string());
    spdlog::info("  dev_mode: {}", config.dev_mode);

    // libsodium 必须在任何加密操作前初始化
    if (sodium_init() < 0) {
        spdlog::critical("libsodium init failed");
        return 1;
    }

    // 确保数据目录存在
    std::filesystem::create_directories(config.data_root);

    // 打开数据库（singleton；副作用：跑 schema 迁移）
    // 用 init 而不是局部变量——以后 controller/filter 可以 Database::instance() 取
    try {
        auto& db = cloudfile::storage::Database::init(
            config.data_root / "cloudfile.sqlite");
        spdlog::info("database schema at v{}", db.schema_version());
    } catch (const std::exception& e) {
        spdlog::critical("database init failed: {}", e.what());
        return 1;
    }

    // Drogon HTTP 服务
    auto& app = drogon::app();
    app.addListener(config.listen_host, config.listen_port);
    app.setLogLevel(config.dev_mode ? trantor::Logger::kDebug
                                    : trantor::Logger::kInfo);
    app.setThreadNum(4);  // 足够 ≤10 人并发

    spdlog::info("listening on http://{}:{}", config.listen_host, config.listen_port);
    app.run();

    spdlog::info("cloudfile backend shut down cleanly");
    return 0;
}
