#pragma once

#include <drogon/HttpController.h>

namespace cloudfile::api {

/// MCP token 自助管理（替代 admin CLI 的 mcp-token 子命令，让用户自己签发）。
///
///   GET    /api/me/mcp-tokens         列出当前用户的 token
///   POST   /api/me/mcp-tokens         body: {"name": "..."}，返回明文一次
///   DELETE /api/mcp-tokens/{id}        owner 校验后撤销
///
/// 全部挂 AuthFilter（cookie 或 bearer 都可——用 bearer 创建 token 也允许，
/// 这样 LLM 客户端能为自己签发更多 token；权限上等价）。
class MCPTokenController : public drogon::HttpController<MCPTokenController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(MCPTokenController::listMine, "/api/me/mcp-tokens",
                  drogon::Get,  "cloudfile::api::AuthFilter");
    ADD_METHOD_TO(MCPTokenController::createMine, "/api/me/mcp-tokens",
                  drogon::Post, "cloudfile::api::AuthFilter");
    ADD_METHOD_VIA_REGEX(MCPTokenController::revoke,
                         "/api/mcp-tokens/([0-9]+)", drogon::Delete,
                         "cloudfile::api::AuthFilter");
    METHOD_LIST_END

    void listMine(const drogon::HttpRequestPtr& req,
                  std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void createMine(const drogon::HttpRequestPtr& req,
                    std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void revoke(const drogon::HttpRequestPtr& req,
                std::function<void(const drogon::HttpResponsePtr&)>&& callback,
                std::string id_str);
};

}  // namespace cloudfile::api
