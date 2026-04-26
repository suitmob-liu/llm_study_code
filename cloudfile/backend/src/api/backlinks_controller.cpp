#include "cloudfile/api/backlinks_controller.h"

#include "cloudfile/domain/doc.h"
#include "cloudfile/domain/user.h"
#include "cloudfile/domain/wiki_link.h"

#include <drogon/HttpResponse.h>
#include <nlohmann/json.hpp>

#include <cstdint>
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

std::optional<cloudfile::domain::user::User> current_user(
        const drogon::HttpRequestPtr& req) {
    auto attrs = req->attributes();
    if (!attrs->find("user_id")) return std::nullopt;
    auto user_id = attrs->get<std::int64_t>("user_id");
    return cloudfile::domain::user::find_by_id(user_id);
}

}  // anonymous namespace

void BacklinksController::get(
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
    // 必须能读才能问 backlinks（避免越权探测他人目录结构）
    if (!cloudfile::domain::doc::check_access(u->username, *norm)) {
        callback(error_response(drogon::k403Forbidden,
            "access denied (target must be under your user dir or shared/)"));
        return;
    }

    auto srcs = cloudfile::domain::wiki_link::backlinks_of(*norm);
    json arr = json::array();
    for (const auto& s : srcs) {
        // 过滤 src_path 当前用户可见的部分。看不见的悄悄隐藏，不计数也不暴露。
        if (cloudfile::domain::doc::check_access(u->username, s)) {
            arr.push_back(s);
        }
    }
    callback(json_response(drogon::k200OK, {
        {"path",      *norm},
        {"backlinks", std::move(arr)},
    }));
}

}  // namespace cloudfile::api
