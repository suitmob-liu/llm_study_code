#pragma once

#include <drogon/HttpController.h>

namespace cloudfile::api {

/// 公共分享 API。
///
/// `POST /api/docs/{path}/share`（挂 AuthFilter）
///   body：可选 `{"lifetime_days": N}`，缺省 = 永不过期
///   返回：`{token, share_url, expires_at}`
///
/// `GET /s/{token}`（**不挂 filter**）
///   返回 HTML 渲染页（marked.js CDN，纯客户端），任何人凭 URL 可读。
///   token 失效返回 404 HTML。
class ShareController : public drogon::HttpController<ShareController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_VIA_REGEX(ShareController::createShare,
                         "/api/docs/(.+)/share", drogon::Post,
                         "cloudfile::api::AuthFilter");
    ADD_METHOD_TO(ShareController::listMine, "/api/me/shares", drogon::Get,
                  "cloudfile::api::AuthFilter");
    ADD_METHOD_VIA_REGEX(ShareController::revokeShare,
                         "/api/shares/([0-9]+)", drogon::Delete,
                         "cloudfile::api::AuthFilter");
    ADD_METHOD_VIA_REGEX(ShareController::publicView,
                         "/s/([0-9a-fA-F]+)", drogon::Get);
    METHOD_LIST_END

    void createShare(const drogon::HttpRequestPtr& req,
                     std::function<void(const drogon::HttpResponsePtr&)>&& callback,
                     std::string path);

    void listMine(const drogon::HttpRequestPtr& req,
                  std::function<void(const drogon::HttpResponsePtr&)>&& callback);

    void revokeShare(const drogon::HttpRequestPtr& req,
                     std::function<void(const drogon::HttpResponsePtr&)>&& callback,
                     std::string id_str);

    void publicView(const drogon::HttpRequestPtr& req,
                    std::function<void(const drogon::HttpResponsePtr&)>&& callback,
                    std::string token);
};

}  // namespace cloudfile::api
