#include "cloudfile/storage/db.h"
#include "cloudfile/storage/repo.h"

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
    std::filesystem::path web_root;     // 前端构建产物（dist/）
    std::string           git_author_name;
    std::string           git_author_email;
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
    c.web_root    = env_or("CLOUDFILE_WEB_ROOT", "/usr/local/share/cloudfile/web");
    c.git_author_name  = env_or("CLOUDFILE_GIT_NAME",  "cloudfile");
    c.git_author_email = env_or("CLOUDFILE_GIT_EMAIL", "cloudfile@localhost");
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

    // 打开/初始化 docs_repo（git 仓库），data_root/repo 下
    try {
        cloudfile::storage::Repo::init(
            config.data_root / "repo",
            config.git_author_name,
            config.git_author_email);
    } catch (const std::exception& e) {
        spdlog::critical("docs_repo init failed: {}", e.what());
        return 1;
    }

    // Drogon HTTP 服务
    auto& app = drogon::app();
    app.addListener(config.listen_host, config.listen_port);
    app.setLogLevel(config.dev_mode ? trantor::Logger::kDebug
                                    : trantor::Logger::kInfo);
    app.setThreadNum(4);  // 足够 ≤10 人并发

    // 前端静态托管 + SPA fallback
    // 优先级：注册的 controller > 静态文件 > defaultHandler/customErrorHandler
    if (std::filesystem::is_directory(config.web_root)) {
        spdlog::info("web root: {}", config.web_root.string());
        app.setDocumentRoot(config.web_root.string());
        std::string index_html = (config.web_root / "index.html").string();
        bool index_exists = std::filesystem::is_regular_file(index_html);

        // 没匹配到 controller / 静态文件的请求，由这里兜底：
        //   - /api/* 和 /s/* 路径返 JSON 404（按 API 习惯）
        //   - 其他路径返 index.html，让 React Router 接管
        app.setCustomErrorHandler(
            [index_html, index_exists](drogon::HttpStatusCode code,
                                       const drogon::HttpRequestPtr& req)
                                       -> drogon::HttpResponsePtr {
                auto path = req->getPath();
                bool is_api = path.rfind("/api/", 0) == 0
                           || path == "/api"
                           || path.rfind("/s/", 0) == 0;

                if (code == drogon::k404NotFound && !is_api && index_exists) {
                    auto resp = drogon::HttpResponse::newFileResponse(index_html);
                    resp->setStatusCode(drogon::k200OK);
                    return resp;
                }
                auto resp = drogon::HttpResponse::newHttpResponse();
                resp->setStatusCode(code);
                if (is_api) {
                    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
                    resp->setBody(R"({"error":"not found"})");
                }
                return resp;
            });
    } else {
        spdlog::warn("web root not found at {}, frontend disabled",
                     config.web_root.string());
    }

    spdlog::info("listening on http://{}:{}", config.listen_host, config.listen_port);
    app.run();

    cloudfile::storage::Repo::shutdown_global();
    spdlog::info("cloudfile backend shut down cleanly");
    return 0;
}
