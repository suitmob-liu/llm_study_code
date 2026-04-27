#include "cloudfile/api/share_controller.h"

#include "cloudfile/domain/doc.h"
#include "cloudfile/domain/share.h"
#include "cloudfile/domain/user.h"

#include <drogon/HttpResponse.h>
#include <fmt/core.h>
#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>

#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <optional>
#include <string>
#include <string_view>

using json = nlohmann::json;

namespace cloudfile::api {

namespace {

drogon::HttpResponsePtr json_response(drogon::HttpStatusCode code, json body) {
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(code);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(body.dump());
    return resp;
}

drogon::HttpResponsePtr error_response(drogon::HttpStatusCode code,
                                       std::string_view error) {
    return json_response(code, {{"error", std::string(error)}});
}

drogon::HttpResponsePtr html_response(drogon::HttpStatusCode code,
                                      const std::string& html) {
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(code);
    resp->setContentTypeString("text/html; charset=utf-8");
    resp->setBody(html);
    return resp;
}

std::optional<cloudfile::domain::user::User> current_user(
        const drogon::HttpRequestPtr& req) {
    auto attrs = req->attributes();
    if (!attrs->find("user_id")) return std::nullopt;
    auto user_id = attrs->get<std::int64_t>("user_id");
    return cloudfile::domain::user::find_by_id(user_id);
}

/// 公共域名前缀：`CLOUDFILE_PUBLIC_BASE_URL` 环境变量。如未设，回落到 request 的
/// scheme+host（适合内网/开发；上 HTTPS 后必须显式设）。
std::string public_base(const drogon::HttpRequestPtr& req) {
    const char* env = std::getenv("CLOUDFILE_PUBLIC_BASE_URL");
    if (env && *env) return std::string(env);
    // 回落：从请求里反推
    auto host = req->getHeader("Host");
    if (host.empty()) host = "127.0.0.1:8080";
    return std::string("http://") + host;
}

/// HTML 转义：避免分享内容里的 `<script>` 直接执行。我们把 markdown 内容塞进 JS 字符串
/// 字面量里，浏览器侧 marked.js 解析渲染——所以 `</script>` 等 sentinel 必须 escape。
/// 用 JSON encode 一手搞定（dump 自动转 control char 和 unicode）。
std::string js_string_literal(std::string_view s) {
    return json(std::string(s)).dump();   // 含两端引号
}

/// 公共渲染页 HTML（client-side marked.js 渲染）。
std::string render_share_html(std::string_view path,
                              std::string_view content) {
    return fmt::format(R"HTML(<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>{path}</title>
<style>
  :root {{
    --bg: #FFFBF5;
    --fg: #2A1F0E;
    --muted: #76675A;
    --accent: #D97706;
    --code-bg: #F5EFE5;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg: #17120B; --fg: #F4ECE0; --muted: #A99683; --code-bg: #2C231A; }}
  }}
  body {{ background: var(--bg); color: var(--fg);
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif;
         max-width: 760px; margin: 3rem auto; padding: 0 1.25rem;
         line-height: 1.7; }}
  header {{ font-size: 0.85rem; color: var(--muted); margin-bottom: 1.5rem;
            border-bottom: 1px solid color-mix(in srgb, var(--muted) 30%, transparent);
            padding-bottom: 0.6rem; }}
  header .badge {{ color: var(--accent); font-weight: 600; }}
  h1, h2, h3, h4 {{ line-height: 1.3; margin-top: 1.8rem; }}
  h1 {{ font-size: 1.9rem; }}
  a {{ color: var(--accent); }}
  code {{ background: var(--code-bg); padding: 0.1rem 0.35rem; border-radius: 4px;
          font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 0.92em; }}
  pre {{ background: var(--code-bg); padding: 1rem; border-radius: 6px; overflow-x: auto; }}
  pre code {{ background: transparent; padding: 0; }}
  blockquote {{ border-left: 3px solid var(--accent); margin: 1rem 0;
                padding: 0.2rem 1rem; color: var(--muted); }}
  table {{ border-collapse: collapse; }}
  th, td {{ border: 1px solid color-mix(in srgb, var(--muted) 30%, transparent);
            padding: 0.4rem 0.7rem; }}
  footer {{ margin-top: 4rem; font-size: 0.8rem; color: var(--muted);
            border-top: 1px solid color-mix(in srgb, var(--muted) 30%, transparent);
            padding-top: 0.6rem; }}
</style>
</head>
<body>
<header><span class="badge">cloudfile</span> · 公共分享 · <code>{path}</code></header>
<article id="content">Loading…</article>
<footer>由 <a href="https://github.com/suitmob-liu/llm_study_code/tree/master/cloudfile">cloudfile</a> 提供 · 任何人凭此链接可读</footer>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script>
  (function () {{
    var md = {js_content};
    if (typeof marked === 'undefined') {{
      // CDN 失败时降级为 <pre>
      var pre = document.createElement('pre');
      pre.textContent = md;
      document.getElementById('content').replaceWith(pre);
      return;
    }}
    document.getElementById('content').innerHTML = marked.parse(md, {{ gfm: true, breaks: false }});
  }})();
</script>
</body>
</html>
)HTML",
        fmt::arg("path", path),
        fmt::arg("js_content", js_string_literal(content)));
}

std::string render_404_html() {
    return R"HTML(<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>404</title>
<style>body{font-family:sans-serif;max-width:480px;margin:6rem auto;padding:0 1.25rem;color:#2A1F0E;background:#FFFBF5;}
h1{color:#D97706;}</style></head>
<body><h1>404</h1><p>分享链接不存在或已失效。</p></body></html>
)HTML";
}

}  // anonymous namespace

void ShareController::createShare(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback,
        std::string path) {
    auto u = current_user(req);
    if (!u) {
        callback(error_response(drogon::k401Unauthorized, "not authenticated"));
        return;
    }

    auto norm = cloudfile::domain::doc::normalize(path);
    if (!norm) {
        callback(error_response(drogon::k400BadRequest,
            "invalid path (must be non-empty, no '..', end with .md)"));
        return;
    }
    if (!cloudfile::domain::doc::check_access(u->username, *norm)) {
        callback(error_response(drogon::k403Forbidden,
            "access denied (target must be under your user dir or shared/)"));
        return;
    }
    if (!cloudfile::domain::doc::exists(*norm)) {
        callback(error_response(drogon::k404NotFound, "document not found"));
        return;
    }

    // 解析 lifetime_days：不传 → 永不过期；正整数 → 折成秒
    int lifetime_days = 0;
    try {
        if (!req->getBody().empty()) {
            auto body = json::parse(req->getBody());
            if (body.is_object() && body.contains("lifetime_days")) {
                if (!body.at("lifetime_days").is_number_integer()) {
                    callback(error_response(drogon::k400BadRequest,
                        "lifetime_days must be a non-negative integer"));
                    return;
                }
                lifetime_days = body.at("lifetime_days").get<int>();
                if (lifetime_days < 0) {
                    callback(error_response(drogon::k400BadRequest,
                        "lifetime_days must be >= 0 (0 = no expiry)"));
                    return;
                }
            }
        }
    } catch (const json::exception&) {
        callback(error_response(drogon::k400BadRequest, "invalid JSON body"));
        return;
    }

    cloudfile::domain::share::CreateResult r;
    try {
        r = cloudfile::domain::share::create(
            *norm, u->id,
            std::chrono::seconds(static_cast<long long>(lifetime_days) * 86400));
    } catch (const std::exception& e) {
        spdlog::error("share::create failed: {}", e.what());
        callback(error_response(drogon::k500InternalServerError,
                                "failed to create share"));
        return;
    }

    json body = {
        {"id",         r.record.id},
        {"path",       r.record.doc_path},
        {"token",      r.plaintext_token},
        {"share_url",  public_base(req) + "/s/" + r.plaintext_token},
        {"expires_at", r.record.expires_at.has_value()
                           ? json(*r.record.expires_at) : json(nullptr)},
    };
    callback(json_response(drogon::k201Created, std::move(body)));
}

void ShareController::listMine(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
    auto u = current_user(req);
    if (!u) {
        callback(error_response(drogon::k401Unauthorized, "not authenticated"));
        return;
    }
    auto tokens = cloudfile::domain::share::list_for_creator(u->id);
    json arr = json::array();
    // 注：DB 只存 token hash，明文 URL 在 create() 时仅返回一次。这里
    // 列表只能展示元数据；要再分享只能 revoke 旧的、create 新的。
    for (const auto& t : tokens) {
        const char* status = "active";
        if (t.revoked_at.has_value()) status = "revoked";
        arr.push_back({
            {"id",         t.id},
            {"path",       t.doc_path},
            {"status",     status},
            {"created_at", t.created_at},
            {"expires_at", t.expires_at.has_value() ? json(*t.expires_at) : json(nullptr)},
        });
    }
    callback(json_response(drogon::k200OK, {{"shares", std::move(arr)}}));
}

void ShareController::revokeShare(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback,
        std::string id_str) {
    auto u = current_user(req);
    if (!u) {
        callback(error_response(drogon::k401Unauthorized, "not authenticated"));
        return;
    }
    std::int64_t id;
    try { id = std::stoll(id_str); }
    catch (const std::exception&) {
        callback(error_response(drogon::k400BadRequest, "invalid share id"));
        return;
    }
    auto t = cloudfile::domain::share::find_by_id(id);
    if (!t) {
        callback(error_response(drogon::k404NotFound, "share not found"));
        return;
    }
    // owner 校验：用户只能撤销自己创建的（admin 走 CLI）
    if (t->created_by != u->id) {
        callback(error_response(drogon::k403Forbidden, "not your share"));
        return;
    }
    cloudfile::domain::share::revoke_by_id(id);   // 幂等
    callback(json_response(drogon::k200OK, {{"status", "revoked"}}));
}

void ShareController::publicView(
        const drogon::HttpRequestPtr&,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback,
        std::string token) {
    auto t = cloudfile::domain::share::verify(token);
    if (!t) {
        callback(html_response(drogon::k404NotFound, render_404_html()));
        return;
    }
    auto content = cloudfile::domain::doc::read(t->doc_path);
    if (!content) {
        // token 有效但目标 doc 已被删——给个干净 404，不暴露内部细节
        callback(html_response(drogon::k404NotFound, render_404_html()));
        return;
    }
    callback(html_response(drogon::k200OK,
                           render_share_html(t->doc_path, *content)));
}

}  // namespace cloudfile::api
