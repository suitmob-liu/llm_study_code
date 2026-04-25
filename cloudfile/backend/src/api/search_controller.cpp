#include "cloudfile/api/search_controller.h"

#include "cloudfile/domain/search.h"
#include "cloudfile/domain/user.h"

#include <drogon/HttpResponse.h>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <cstdint>
#include <optional>
#include <string>

using json = nlohmann::json;

namespace cloudfile::api {

namespace {

constexpr std::size_t kDefaultLimit = 20;
constexpr std::size_t kMaxLimit     = 100;

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

void SearchController::search(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
    auto u = current_user(req);
    if (!u) {
        callback(error_response(drogon::k401Unauthorized, "not authenticated"));
        return;
    }

    auto q = req->getParameter("q");
    if (q.empty()) {
        callback(error_response(drogon::k400BadRequest,
                                "missing query parameter: q"));
        return;
    }

    std::size_t limit = kDefaultLimit;
    auto limit_param = req->getParameter("limit");
    if (!limit_param.empty()) {
        try {
            long long n = std::stoll(limit_param);
            if (n < 1) n = 1;
            limit = std::min(static_cast<std::size_t>(n), kMaxLimit);
        } catch (const std::exception&) {
            callback(error_response(drogon::k400BadRequest, "invalid limit"));
            return;
        }
    }

    auto hits = cloudfile::domain::search::search(q, u->username, limit);
    json arr = json::array();
    for (const auto& h : hits) {
        arr.push_back({
            {"path",    h.path},
            {"title",   h.title},
            {"snippet", h.snippet},
            {"rank",    h.rank},
        });
    }
    callback(json_response(drogon::k200OK, {
        {"query", q},
        {"hits",  std::move(arr)},
    }));
}

}  // namespace cloudfile::api
