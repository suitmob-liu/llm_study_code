#include "cloudfile/api/auth_controller.h"

#include "cloudfile/domain/doc.h"
#include "cloudfile/domain/invite.h"
#include "cloudfile/domain/password.h"
#include "cloudfile/domain/session.h"
#include "cloudfile/domain/user.h"

#include <drogon/HttpResponse.h>
#include <fmt/core.h>
#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <optional>
#include <string>
#include <string_view>

using json = nlohmann::json;

namespace cloudfile::api {

namespace {

constexpr const char* kSessionCookie = "cfsession";
constexpr int kSessionDays = 30;

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

json user_to_json(const cloudfile::domain::user::User& u) {
    return {
        {"id",         u.id},
        {"username",   u.username},
        {"email",      u.email},
        {"is_admin",   u.is_admin},
        {"created_at", u.created_at},
    };
}

/// 解析 request body 为 JSON object。失败时直接调 cb 返回 400 并返回 nullopt。
std::optional<json> parse_body(
        const drogon::HttpRequestPtr& req,
        const std::function<void(const drogon::HttpResponsePtr&)>& cb) {
    try {
        auto body = json::parse(req->getBody());
        if (!body.is_object()) {
            cb(error_response(drogon::k400BadRequest, "body must be JSON object"));
            return std::nullopt;
        }
        return body;
    } catch (const json::exception&) {
        cb(error_response(drogon::k400BadRequest, "invalid JSON body"));
        return std::nullopt;
    }
}

/// 从 JSON 读取必需的非空 string 字段。失败时 cb 400 返回 nullopt。
std::optional<std::string> get_required_string(
        const json& body, const char* key,
        const std::function<void(const drogon::HttpResponsePtr&)>& cb) {
    if (!body.contains(key)) {
        cb(error_response(drogon::k400BadRequest,
                          fmt::format("missing field: {}", key)));
        return std::nullopt;
    }
    const auto& v = body.at(key);
    if (!v.is_string()) {
        cb(error_response(drogon::k400BadRequest,
                          fmt::format("field must be string: {}", key)));
        return std::nullopt;
    }
    auto s = v.get<std::string>();
    if (s.empty()) {
        cb(error_response(drogon::k400BadRequest,
                          fmt::format("field must not be empty: {}", key)));
        return std::nullopt;
    }
    return s;
}

bool secure_cookie_enabled() {
    // CLOUDFILE_COOKIE_SECURE=1 时标记 Secure。HTTPS 上线后打开。
    const char* v = std::getenv("CLOUDFILE_COOKIE_SECURE");
    return v && std::string(v) == "1";
}

drogon::Cookie make_session_cookie(const std::string& token, int max_age_sec) {
    drogon::Cookie c(kSessionCookie, token);
    c.setHttpOnly(true);
    c.setPath("/");
    c.setSameSite(drogon::Cookie::SameSite::kLax);
    c.setMaxAge(max_age_sec);
    c.setSecure(secure_cookie_enabled());
    return c;
}

drogon::Cookie clear_session_cookie() {
    drogon::Cookie c(kSessionCookie, "");
    c.setHttpOnly(true);
    c.setPath("/");
    c.setSameSite(drogon::Cookie::SameSite::kLax);
    c.setMaxAge(0);
    c.setSecure(secure_cookie_enabled());
    return c;
}

std::optional<std::string_view> str_or_none(const std::string& s) {
    if (s.empty()) return std::nullopt;
    return std::optional<std::string_view>(s);
}

void secure_wipe(std::string& s) {
    std::fill(s.begin(), s.end(), '\0');
}

}  // anonymous namespace

void AuthController::registerUser(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback) {

    auto body = parse_body(req, callback);
    if (!body) return;

    auto invite_token = get_required_string(*body, "invite_token", callback);
    if (!invite_token) return;
    auto username = get_required_string(*body, "username", callback);
    if (!username) return;
    auto email = get_required_string(*body, "email", callback);
    if (!email) return;
    auto password = get_required_string(*body, "password", callback);
    if (!password) return;

    if (!cloudfile::domain::password::is_acceptable(*password)) {
        callback(error_response(drogon::k400BadRequest,
            fmt::format("password length must be {}-{} chars",
                cloudfile::domain::password::kMinLength,
                cloudfile::domain::password::kMaxLength)));
        return;
    }

    // Invite 状态检查（状态机阻塞 expired/used/revoked）
    auto inv = cloudfile::domain::invite::find_by_token(*invite_token);
    if (!inv) {
        callback(error_response(drogon::k400BadRequest, "invalid invite token"));
        return;
    }
    auto st = cloudfile::domain::invite::status_of(*inv);
    if (st != cloudfile::domain::invite::Status::Active) {
        callback(error_response(drogon::k410Gone,
            fmt::format("invite is {}", cloudfile::domain::invite::status_name(st))));
        return;
    }

    // Argon2id 哈希（~100-500ms）
    std::string hash;
    try {
        hash = cloudfile::domain::password::hash(*password);
    } catch (const std::exception& e) {
        spdlog::error("password hash failed: {}", e.what());
        callback(error_response(drogon::k500InternalServerError, "internal error"));
        return;
    }
    secure_wipe(*password);

    // 创建用户
    cloudfile::domain::user::User u;
    try {
        u = cloudfile::domain::user::create(*username, *email, hash, /*is_admin=*/false);
    } catch (const std::exception& e) {
        // username/email 冲突 → 409
        callback(error_response(drogon::k409Conflict, e.what()));
        return;
    }

    // 原子消费 invite（WHERE active 条件保证幂等 + 防重用）
    // 竞态：user 已创建但 mark_used 失败（另一请求抢先消费）——概率极低，不回滚 user；
    // 影响：该 invite 被别人用了，但当前用户已注册成功。
    if (!cloudfile::domain::invite::mark_used(*invite_token, u.id)) {
        spdlog::warn("mark_used failed after user create (user_id={}, invite_id={})",
                     u.id, inv->id);
    }

    // 创建用户专属目录（docs_repo/<username>/）。空目录不 git commit——
    // 用户写第一篇 md 时自然进 git。
    cloudfile::domain::doc::ensure_user_dir(u.username);

    // 签发 session + cookie
    auto ua = req->getHeader("User-Agent");
    auto ip = req->getPeerAddr().toIp();
    auto session = cloudfile::domain::session::create(
        u.id,
        str_or_none(ua),
        str_or_none(ip),
        std::chrono::hours(24 * kSessionDays));

    auto resp = json_response(drogon::k201Created, {{"user", user_to_json(u)}});
    resp->addCookie(make_session_cookie(session.plaintext_token,
                                        kSessionDays * 24 * 3600));
    callback(resp);
}

void AuthController::login(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback) {

    auto body = parse_body(req, callback);
    if (!body) return;

    auto login_id = get_required_string(*body, "login", callback);
    if (!login_id) return;
    auto password = get_required_string(*body, "password", callback);
    if (!password) return;

    auto found = cloudfile::domain::user::find_with_hash_by_login(*login_id);
    if (!found) {
        // 统一错误消息：不区分 "用户不存在" vs "密码错"，避免用户枚举
        callback(error_response(drogon::k401Unauthorized, "invalid credentials"));
        return;
    }

    if (!cloudfile::domain::password::verify(*password, found->second)) {
        callback(error_response(drogon::k401Unauthorized, "invalid credentials"));
        return;
    }
    secure_wipe(*password);

    auto ua = req->getHeader("User-Agent");
    auto ip = req->getPeerAddr().toIp();
    auto session = cloudfile::domain::session::create(
        found->first.id,
        str_or_none(ua),
        str_or_none(ip),
        std::chrono::hours(24 * kSessionDays));

    auto resp = json_response(drogon::k200OK, {{"user", user_to_json(found->first)}});
    resp->addCookie(make_session_cookie(session.plaintext_token,
                                        kSessionDays * 24 * 3600));
    callback(resp);
}

void AuthController::logout(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback) {

    auto token = req->getCookie(kSessionCookie);
    if (!token.empty()) {
        cloudfile::domain::session::delete_by_token(token);
    }
    // 即使没 cookie 也返回 200 + 清 cookie（幂等）
    auto resp = json_response(drogon::k200OK, {{"status", "ok"}});
    resp->addCookie(clear_session_cookie());
    callback(resp);
}

void AuthController::me(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback) {

    // Filter 已经在 attributes 里放了 user_id（不放行就走不到这里）
    auto attrs = req->attributes();
    if (!attrs->find("user_id")) {
        spdlog::error("me: SessionAuthFilter didn't set user_id");
        callback(error_response(drogon::k500InternalServerError, "auth misconfigured"));
        return;
    }
    auto user_id = attrs->get<std::int64_t>("user_id");

    auto u = cloudfile::domain::user::find_by_id(user_id);
    if (!u) {
        // Session 指向的 user 已被删除。清 cookie 给客户端。
        auto resp = error_response(drogon::k401Unauthorized, "user no longer exists");
        resp->addCookie(clear_session_cookie());
        callback(resp);
        return;
    }

    callback(json_response(drogon::k200OK, {{"user", user_to_json(*u)}}));
}

}  // namespace cloudfile::api
