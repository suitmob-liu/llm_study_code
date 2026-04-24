#include "cloudfile/api/doc_controller.h"

#include "cloudfile/domain/doc.h"
#include "cloudfile/domain/user.h"

#include <drogon/HttpResponse.h>
#include <fmt/core.h>
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

/// 从 filter 塞进来的 user_id 读出当前用户。未找到则返回 nullopt（调用方返 401）。
std::optional<cloudfile::domain::user::User> current_user(
        const drogon::HttpRequestPtr& req) {
    auto attrs = req->attributes();
    if (!attrs->find("user_id")) return std::nullopt;
    auto user_id = attrs->get<std::int64_t>("user_id");
    return cloudfile::domain::user::find_by_id(user_id);
}

/// 路径预处理：normalize + check_access。失败时 cb 返回具体错并返回 nullopt。
std::optional<std::string> validate_path(
        const drogon::HttpRequestPtr&,
        const std::function<void(const drogon::HttpResponsePtr&)>& cb,
        const std::string& raw_path,
        const cloudfile::domain::user::User& u) {
    auto norm = cloudfile::domain::doc::normalize(raw_path);
    if (!norm) {
        cb(error_response(drogon::k400BadRequest,
            "invalid path (must be non-empty, no '..', end with .md)"));
        return std::nullopt;
    }
    if (!cloudfile::domain::doc::check_access(u.username, *norm)) {
        cb(error_response(drogon::k403Forbidden,
            "access denied (path must be under your user dir or shared/)"));
        return std::nullopt;
    }
    return norm;
}

}  // anonymous namespace

void DocController::listDocs(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
    auto u = current_user(req);
    if (!u) {
        callback(error_response(drogon::k401Unauthorized, "not authenticated"));
        return;
    }

    auto docs = cloudfile::domain::doc::list_for_user(u->username);
    json arr = json::array();
    for (const auto& m : docs) {
        arr.push_back({
            {"path",        m.path},
            {"size_bytes",  m.size_bytes},
            {"modified_at", m.modified_at},
        });
    }
    callback(json_response(drogon::k200OK, {{"docs", std::move(arr)}}));
}

void DocController::readDoc(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback,
        std::string path) {
    auto u = current_user(req);
    if (!u) {
        callback(error_response(drogon::k401Unauthorized, "not authenticated"));
        return;
    }

    auto norm = validate_path(req, callback, path, *u);
    if (!norm) return;

    auto content = cloudfile::domain::doc::read(*norm);
    if (!content) {
        callback(error_response(drogon::k404NotFound, "document not found"));
        return;
    }
    callback(json_response(drogon::k200OK, {
        {"path",    *norm},
        {"content", *content},
    }));
}

void DocController::writeDoc(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback,
        std::string path) {
    auto u = current_user(req);
    if (!u) {
        callback(error_response(drogon::k401Unauthorized, "not authenticated"));
        return;
    }

    auto norm = validate_path(req, callback, path, *u);
    if (!norm) return;

    // Parse body: {"content": "..."}
    std::string content;
    try {
        auto body = json::parse(req->getBody());
        if (!body.is_object() || !body.contains("content")
            || !body.at("content").is_string()) {
            callback(error_response(drogon::k400BadRequest,
                "body must be JSON object with string 'content'"));
            return;
        }
        content = body.at("content").get<std::string>();
    } catch (const json::exception&) {
        callback(error_response(drogon::k400BadRequest, "invalid JSON body"));
        return;
    }

    bool is_new = !cloudfile::domain::doc::exists(*norm);
    try {
        cloudfile::domain::doc::write(*norm, content,
                                       u->username, u->email, is_new);
    } catch (const std::exception& e) {
        spdlog::error("doc::write failed for {}: {}", *norm, e.what());
        callback(error_response(drogon::k500InternalServerError,
                                "failed to write document"));
        return;
    }

    callback(json_response(is_new ? drogon::k201Created : drogon::k200OK, {
        {"path",    *norm},
        {"created", is_new},
    }));
}

void DocController::deleteDoc(
        const drogon::HttpRequestPtr& req,
        std::function<void(const drogon::HttpResponsePtr&)>&& callback,
        std::string path) {
    auto u = current_user(req);
    if (!u) {
        callback(error_response(drogon::k401Unauthorized, "not authenticated"));
        return;
    }

    auto norm = validate_path(req, callback, path, *u);
    if (!norm) return;

    bool ok;
    try {
        ok = cloudfile::domain::doc::remove(*norm, u->username, u->email);
    } catch (const std::exception& e) {
        spdlog::error("doc::remove failed for {}: {}", *norm, e.what());
        callback(error_response(drogon::k500InternalServerError,
                                "failed to delete document"));
        return;
    }
    if (!ok) {
        callback(error_response(drogon::k404NotFound, "document not found"));
        return;
    }
    callback(json_response(drogon::k200OK, {{"status", "deleted"}}));
}

}  // namespace cloudfile::api
