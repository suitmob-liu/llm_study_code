#pragma once

#include <drogon/HttpController.h>

namespace cloudfile::api {

/// 反向链接 API。
/// GET /api/backlinks/{path}
///   返回所有指向 path 的源文档（src_path 列表，已按当前用户可见性过滤）。
///   挂 AuthFilter；调用方对 path 的可读权限先过 check_access。
class BacklinksController : public drogon::HttpController<BacklinksController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_VIA_REGEX(BacklinksController::get,
                         "/api/backlinks/(.+)", drogon::Get,
                         "cloudfile::api::AuthFilter");
    METHOD_LIST_END

    void get(const drogon::HttpRequestPtr& req,
             std::function<void(const drogon::HttpResponsePtr&)>&& callback,
             std::string path);
};

}  // namespace cloudfile::api
