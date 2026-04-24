#include "cloudfile/api/session_auth_filter.h"

#include "cloudfile/domain/session.h"

#include <drogon/HttpResponse.h>
#include <nlohmann/json.hpp>

namespace cloudfile::api {

namespace {

drogon::HttpResponsePtr make_401(std::string_view reason) {
    nlohmann::json body = {{"error", std::string(reason)}};
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(drogon::k401Unauthorized);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(body.dump());
    return resp;
}

}  // anonymous namespace

void SessionAuthFilter::doFilter(const drogon::HttpRequestPtr& req,
                                 drogon::FilterCallback&& fcb,
                                 drogon::FilterChainCallback&& fccb) {
    auto cookie_token = req->getCookie("cfsession");
    if (cookie_token.empty()) {
        fcb(make_401("not authenticated"));
        return;
    }

    auto s = cloudfile::domain::session::find_active_and_touch(cookie_token);
    if (!s.has_value()) {
        fcb(make_401("session expired or invalid"));
        return;
    }

    // user_id 挂到 request attributes，controller 直接读
    req->attributes()->insert("user_id", s->user_id);
    fccb();
}

}  // namespace cloudfile::api
