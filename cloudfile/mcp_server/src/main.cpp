// cloudfile_mcp: 独立 MCP server 进程
//
// Phase 2b：stdio JSON-RPC 2.0 主循环 + libcurl HTTP 客户端骨架 + list_docs 烟测工具。
// Phase 2c 会补齐 read_doc / write_doc / search_docs / backlinks_of / recent_edits。
//
// 协议：MCP（spec 2025-06-18），传输 stdio + 行式 JSON。
//   - 客户端发请求：{"jsonrpc":"2.0","id":N,"method":"...","params":{...}}
//   - 我们回响应：{"jsonrpc":"2.0","id":N,"result":{...}} 或 {"...","error":{...}}
//   - 通知（无 id）：例如 notifications/initialized，不返回任何东西
//
// 必需方法：initialize / tools/list / tools/call
//
// 架构决策 1.2：薄代理。所有数据访问走 HTTP 转发到 backend，bearer token 认证。
// stdout 严禁 print 任何非协议数据（spdlog 全走 stderr）。

#include <curl/curl.h>
#include <nlohmann/json.hpp>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/spdlog.h>

#include <cstdlib>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>

using json = nlohmann::json;

namespace {

constexpr const char* kProtocolVersion = "2025-06-18";
constexpr const char* kServerName      = "cloudfile";
constexpr const char* kServerVersion   = "0.1.0";

struct Config {
    std::string backend_url;   // e.g. http://127.0.0.1:8080
    std::string token;
};

Config load_config() {
    auto env_or = [](const char* k, const char* fb) -> std::string {
        const char* v = std::getenv(k);
        return (v && *v) ? std::string(v) : std::string(fb);
    };
    Config c;
    c.backend_url = env_or("CLOUDFILE_BACKEND_URL", "http://127.0.0.1:8080");
    c.token       = env_or("CLOUDFILE_MCP_TOKEN", "");
    return c;
}

/// libcurl 写回调：把 body 累到 std::string。
size_t curl_write_cb(char* ptr, std::size_t size, std::size_t nmemb, void* userdata) {
    auto* dst = static_cast<std::string*>(userdata);
    dst->append(ptr, size * nmemb);
    return size * nmemb;
}

class HttpClient {
public:
    struct Response {
        long        status = 0;
        std::string body;
    };

    HttpClient(std::string base_url, std::string token)
        : base_url_(std::move(base_url)), token_(std::move(token)) {
        curl_ = curl_easy_init();
        if (!curl_) throw std::runtime_error("curl_easy_init failed");
    }

    ~HttpClient() {
        if (curl_) curl_easy_cleanup(curl_);
    }

    HttpClient(const HttpClient&) = delete;
    HttpClient& operator=(const HttpClient&) = delete;

    Response get(std::string_view path) {
        return request("GET", path, std::string_view{});
    }

    Response put_json(std::string_view path, std::string_view body) {
        return request("PUT", path, body);
    }

    Response del(std::string_view path) {
        return request("DELETE", path, std::string_view{});
    }

private:
    Response request(const char* method,
                     std::string_view path,
                     std::string_view body) {
        std::string url = base_url_ + std::string(path);
        Response resp;

        curl_easy_reset(curl_);
        curl_easy_setopt(curl_, CURLOPT_URL, url.c_str());
        curl_easy_setopt(curl_, CURLOPT_CUSTOMREQUEST, method);
        curl_easy_setopt(curl_, CURLOPT_FOLLOWLOCATION, 0L);
        curl_easy_setopt(curl_, CURLOPT_TIMEOUT, 30L);
        curl_easy_setopt(curl_, CURLOPT_WRITEFUNCTION, curl_write_cb);
        curl_easy_setopt(curl_, CURLOPT_WRITEDATA, &resp.body);

        struct curl_slist* headers = nullptr;
        std::string auth_h = "Authorization: Bearer " + token_;
        headers = curl_slist_append(headers, auth_h.c_str());
        if (!body.empty()) {
            headers = curl_slist_append(headers, "Content-Type: application/json");
            curl_easy_setopt(curl_, CURLOPT_POSTFIELDS, body.data());
            curl_easy_setopt(curl_, CURLOPT_POSTFIELDSIZE, static_cast<long>(body.size()));
        }
        curl_easy_setopt(curl_, CURLOPT_HTTPHEADER, headers);

        auto rc = curl_easy_perform(curl_);
        curl_easy_getinfo(curl_, CURLINFO_RESPONSE_CODE, &resp.status);
        curl_slist_free_all(headers);

        if (rc != CURLE_OK) {
            throw std::runtime_error(std::string("curl error: ")
                                     + curl_easy_strerror(rc));
        }
        return resp;
    }

    std::string base_url_;
    std::string token_;
    CURL*       curl_ = nullptr;
};

// ---------- Protocol handlers ----------

json handle_initialize(const json& params) {
    // 协议版本：拿客户端给的当回应（broadly compatible）
    std::string client_pv = params.value("protocolVersion", kProtocolVersion);
    return {
        {"protocolVersion", client_pv},
        {"capabilities", {
            {"tools", json::object()},   // 我们提供 tools，但不订阅 tools/listChanged
        }},
        {"serverInfo", {
            {"name",    kServerName},
            {"version", kServerVersion},
        }},
    };
}

json handle_tools_list() {
    json tools = json::array();
    tools.push_back({
        {"name", "list_docs"},
        {"description",
            "List all Markdown documents visible to the current user "
            "(own directory + shared/), sorted by modification time descending. "
            "Returns JSON with `docs` array of {path, size_bytes, modified_at}."},
        {"inputSchema", {
            {"type", "object"},
            {"properties", json::object()},
            {"required", json::array()},
            {"additionalProperties", false},
        }},
    });
    return {{"tools", std::move(tools)}};
}

/// 把 backend HTTP 响应包成 MCP tools/call result。非 2xx → isError。
json wrap_http_result(const HttpClient::Response& r) {
    bool ok = r.status >= 200 && r.status < 300;
    json result = {
        {"content", json::array({
            {
                {"type", "text"},
                {"text", r.body.empty() ? std::string("(empty)") : r.body},
            },
        })},
    };
    if (!ok) {
        result["isError"] = true;
        // 给 LLM 留个 hint
        std::string hint = "backend returned HTTP " + std::to_string(r.status);
        result["content"][0]["text"] = hint + ": " + r.body;
    }
    return result;
}

json handle_tools_call(const json& params, HttpClient& http) {
    std::string name = params.value("name", "");
    json args        = params.value("arguments", json::object());

    if (name == "list_docs") {
        auto r = http.get("/api/docs");
        return wrap_http_result(r);
    }

    return {
        {"isError", true},
        {"content", json::array({
            {
                {"type", "text"},
                {"text", "unknown tool: " + name},
            },
        })},
    };
}

/// 构造 JSON-RPC 错误响应。
json make_error(const json& id, int code, const std::string& msg) {
    json e = {
        {"jsonrpc", "2.0"},
        {"id",      id.is_null() ? json(nullptr) : id},
        {"error",   {{"code", code}, {"message", msg}}},
    };
    return e;
}

}  // anonymous namespace

int main() {
    // 日志走 stderr——stdout 留给协议
    auto logger = spdlog::stderr_color_mt("mcp");
    spdlog::set_default_logger(logger);
    spdlog::set_level(spdlog::level::info);
    spdlog::set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%^%l%$] %v");

    auto cfg = load_config();
    if (cfg.token.empty()) {
        spdlog::critical("CLOUDFILE_MCP_TOKEN env var is required");
        return 1;
    }
    spdlog::info("cloudfile_mcp v{} starting, backend={}",
                 kServerVersion, cfg.backend_url);

    if (curl_global_init(CURL_GLOBAL_DEFAULT) != 0) {
        spdlog::critical("curl_global_init failed");
        return 1;
    }
    HttpClient http(cfg.backend_url, cfg.token);

    // stdio 主循环：行式 JSON
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;

        json req;
        try {
            req = json::parse(line);
        } catch (const json::exception& e) {
            spdlog::warn("invalid JSON: {} | line={}", e.what(), line);
            // 收到非 JSON：按 spec 用 null id 报 -32700
            std::cout << make_error(json(nullptr), -32700,
                std::string("parse error: ") + e.what()).dump()
                      << "\n" << std::flush;
            continue;
        }

        json id = req.contains("id") ? req["id"] : json(nullptr);
        bool is_notification = !req.contains("id");
        std::string method = req.value("method", "");
        json params        = req.value("params", json::object());

        spdlog::debug("recv method={} id={}", method,
                      is_notification ? "(notif)" : id.dump());

        json resp;
        resp["jsonrpc"] = "2.0";
        if (!is_notification) resp["id"] = id;

        try {
            if (method == "initialize") {
                resp["result"] = handle_initialize(params);
            } else if (method == "notifications/initialized"
                    || method == "notifications/cancelled") {
                // 客户端通知，无需响应
                continue;
            } else if (method == "tools/list") {
                resp["result"] = handle_tools_list();
            } else if (method == "tools/call") {
                resp["result"] = handle_tools_call(params, http);
            } else if (method == "ping") {
                resp["result"] = json::object();
            } else {
                resp.erase("result");
                resp["error"] = {
                    {"code",    -32601},
                    {"message", "method not found: " + method},
                };
            }
        } catch (const std::exception& e) {
            resp.erase("result");
            resp["error"] = {
                {"code",    -32603},
                {"message", std::string("internal error: ") + e.what()},
            };
            spdlog::error("handler exception: {}", e.what());
        }

        if (!is_notification) {
            std::cout << resp.dump() << "\n" << std::flush;
        }
    }

    curl_global_cleanup();
    spdlog::info("cloudfile_mcp shutting down");
    return 0;
}
