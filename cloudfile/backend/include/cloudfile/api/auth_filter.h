#pragma once

#include <drogon/HttpFilter.h>

namespace cloudfile::api {

/// 统一认证 filter：cookie session 优先，未命中再读 `Authorization: Bearer <mcp_token>`。
///
/// - cookie 命中 → user_id 来自 sessions 表
/// - bearer 命中 → user_id 来自 mcp_tokens 表，且 token 必须未撤销
/// - 都未命中 → 401 JSON
///
/// 通过后把 user_id 塞到 `req->attributes()`，下游 controller 直接读。
class AuthFilter : public drogon::HttpFilter<AuthFilter> {
public:
    void doFilter(const drogon::HttpRequestPtr& req,
                  drogon::FilterCallback&& fcb,
                  drogon::FilterChainCallback&& fccb) override;
};

}  // namespace cloudfile::api
