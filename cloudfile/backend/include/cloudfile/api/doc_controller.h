#pragma once

#include <drogon/HttpController.h>

namespace cloudfile::api {

/// 文档 CRUD API。
///
/// 路由：
///   GET    /api/docs               → list_for_user
///   GET    /api/docs/{path...}     → read
///   PUT    /api/docs/{path...}     → write（body: {"content": "..."}）
///   DELETE /api/docs/{path...}     → delete
///
/// 全部挂 AuthFilter。
/// path 规则：`<username>/...` 或 `shared/...`，必须 `.md` 结尾。
class DocController : public drogon::HttpController<DocController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(DocController::listDocs, "/api/docs", drogon::Get,
                  "cloudfile::api::AuthFilter");

    // 通配路径：(.+) 捕获 `/api/docs/` 之后的所有段
    ADD_METHOD_VIA_REGEX(DocController::readDoc,
                         "/api/docs/(.+)", drogon::Get,
                         "cloudfile::api::AuthFilter");
    ADD_METHOD_VIA_REGEX(DocController::writeDoc,
                         "/api/docs/(.+)", drogon::Put,
                         "cloudfile::api::AuthFilter");
    ADD_METHOD_VIA_REGEX(DocController::deleteDoc,
                         "/api/docs/(.+)", drogon::Delete,
                         "cloudfile::api::AuthFilter");
    METHOD_LIST_END

    void listDocs(const drogon::HttpRequestPtr& req,
                  std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void readDoc(const drogon::HttpRequestPtr& req,
                 std::function<void(const drogon::HttpResponsePtr&)>&& callback,
                 std::string path);
    void writeDoc(const drogon::HttpRequestPtr& req,
                  std::function<void(const drogon::HttpResponsePtr&)>&& callback,
                  std::string path);
    void deleteDoc(const drogon::HttpRequestPtr& req,
                   std::function<void(const drogon::HttpResponsePtr&)>&& callback,
                   std::string path);
};

}  // namespace cloudfile::api
