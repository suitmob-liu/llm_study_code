#include "cloudfile/api/auth_filter.h"

#include "cloudfile/domain/mcp_token.h"
#include "cloudfile/domain/session.h"

#include <drogon/HttpResponse.h>
#include <nlohmann/json.hpp>

#include <string>
#include <string_view>

namespace cloudfile::api {

namespace {

constexpr const char* kSessionCookie = "cfsession";
constexpr const char* kBearerPrefix  = "Bearer ";

drogon::HttpResponsePtr make_401(std::string_view reason) {
    nlohmann::json body = {{"error", std::string(reason)}};
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(drogon::k401Unauthorized);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(body.dump());
    return resp;
}

/// 提取 Authorization: Bearer <token>。空表示没传。
std::string parse_bearer(std::string_view authz) {
    if (authz.size() <= 7) return {};
    if (authz.substr(0, 7) != kBearerPrefix) return {};
    return std::string(authz.substr(7));
}

}  // anonymous namespace

void AuthFilter::doFilter(const drogon::HttpRequestPtr& req,
                          drogon::FilterCallback&& fcb,
                          drogon::FilterChainCallback&& fccb) {
    // 1) 优先看 cookie session（前端浏览器走这条）
    auto cookie_token = req->getCookie(kSessionCookie);
    if (!cookie_token.empty()) {
        auto s = cloudfile::domain::session::find_active_and_touch(cookie_token);
        if (s.has_value()) {
            req->attributes()->insert("user_id", s->user_id);
            fccb();
            return;
        }
        // cookie 存在但已过期/无效——不立即拒绝，继续尝试 bearer（一般两者不会都给）
    }

    // 2) 回落 Authorization: Bearer <mcp_token>（cloudfile_mcp 走这条）
    auto authz = req->getHeader("Authorization");
    auto bearer = parse_bearer(authz);
    if (!bearer.empty()) {
        auto t = cloudfile::domain::mcp_token::verify(bearer);
        if (t.has_value()) {
            req->attributes()->insert("user_id", t->user_id);
            fccb();
            return;
        }
        fcb(make_401("invalid or revoked mcp token"));
        return;
    }

    // 都没有
    if (!cookie_token.empty()) {
        fcb(make_401("session expired or invalid"));
    } else {
        fcb(make_401("not authenticated"));
    }
}

}  // namespace cloudfile::api
