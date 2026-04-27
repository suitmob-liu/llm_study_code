#include "cloudfile/api/mcp_token_controller.h"

#include "cloudfile/domain/mcp_token.h"
#include "cloudfile/domain/user.h"

#include <drogon/HttpResponse.h>
#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>

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

json token_to_json(const cloudfile::domain::mcp_token::McpToken& t) {
    auto st = cloudfile::domain::mcp_token::status_of(t);
    return {
        {"id",           t.id},
        {"name",         t.name},
        {"status",       cloudfile::domain::mcp_token::status_name(st)},
        {"created_at",   t.created_at},
        {"last_used_at", t.last_used_at.has_value() ? json(*t.last_used_at) : json(nullptr)},
    };
}

}  // anonymous namespace

void MCPTokenController::listMine(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
    auto u = current_user(req);
    if (!u) {
        callback(error_response(drogon::k401Unauthorized, "not authenticated"));
        return;
    }
    auto tokens = cloudfile::domain::mcp_token::list_for_user(u->id);
    json arr = json::array();
    for (const auto& t : tokens) arr.push_back(token_to_json(t));
    callback(json_response(drogon::k200OK, {{"tokens", std::move(arr)}}));
}

void MCPTokenController::createMine(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
    auto u = current_user(req);
    if (!u) {
        callback(error_response(drogon::k401Unauthorized, "not authenticated"));
        return;
    }

    std::string name;
    try {
        auto body = json::parse(req->getBody());
        if (!body.is_object() || !body.contains("name") || !body["name"].is_string()) {
            callback(error_response(drogon::k400BadRequest,
                "body must be JSON object with string 'name'"));
            return;
        }
        name = body["name"].get<std::string>();
    } catch (const json::exception&) {
        callback(error_response(drogon::k400BadRequest, "invalid JSON body"));
        return;
    }
    if (name.empty()) {
        callback(error_response(drogon::k400BadRequest, "name must not be empty"));
        return;
    }

    cloudfile::domain::mcp_token::CreateResult r;
    try {
        r = cloudfile::domain::mcp_token::create(u->id, name);
    } catch (const std::exception& e) {
        spdlog::error("mcp_token::create failed: {}", e.what());
        callback(error_response(drogon::k500InternalServerError, "create failed"));
        return;
    }

    // 明文 token 一次性返回（DB 只存 hash）
    callback(json_response(drogon::k201Created, {
        {"id",         r.record.id},
        {"name",       r.record.name},
        {"token",      r.plaintext_token},
        {"status",     "active"},
        {"created_at", r.record.created_at},
    }));
}

void MCPTokenController::revoke(
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
        callback(error_response(drogon::k400BadRequest, "invalid token id"));
        return;
    }
    auto t = cloudfile::domain::mcp_token::find_by_id(id);
    if (!t) {
        callback(error_response(drogon::k404NotFound, "token not found"));
        return;
    }
    if (t->user_id != u->id) {
        callback(error_response(drogon::k403Forbidden, "not your token"));
        return;
    }
    cloudfile::domain::mcp_token::revoke_by_id(id);   // 幂等
    callback(json_response(drogon::k200OK, {{"status", "revoked"}}));
}

}  // namespace cloudfile::api
