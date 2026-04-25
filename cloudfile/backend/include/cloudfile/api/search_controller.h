#pragma once

#include <drogon/HttpController.h>

namespace cloudfile::api {

/// 全文搜索 API。
/// GET /api/search?q=<query>&limit=<n>
///   - q：必填，非空。FTS5 phrase 搜索（trigram tokenizer 对中文友好）
///   - limit：可选，默认 20，上限 100
/// 仅返回当前用户可见的命中（自己目录 + shared/）。
class SearchController : public drogon::HttpController<SearchController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(SearchController::search, "/api/search", drogon::Get,
                  "cloudfile::api::SessionAuthFilter");
    METHOD_LIST_END

    void search(const drogon::HttpRequestPtr& req,
                std::function<void(const drogon::HttpResponsePtr&)>&& callback);
};

}  // namespace cloudfile::api
