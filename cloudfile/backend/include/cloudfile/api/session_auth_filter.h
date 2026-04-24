#pragma once

#include <drogon/HttpFilter.h>

namespace cloudfile::api {

/// Drogon filter：要求请求带有效的 session cookie。
///
/// 行为：
///   - 读 cookie "cfsession"，空 → 401
///   - find_active_and_touch → 无效/过期 → 401
///   - 成功：user_id 塞进 req->attributes()，放行 chain
///
/// Controller 注册方法：
///   ADD_METHOD_TO(MyController::route, "/api/x", drogon::Get,
///                 "cloudfile::api::SessionAuthFilter");
class SessionAuthFilter : public drogon::HttpFilter<SessionAuthFilter> {
public:
    void doFilter(const drogon::HttpRequestPtr& req,
                  drogon::FilterCallback&& fcb,
                  drogon::FilterChainCallback&& fccb) override;
};

}  // namespace cloudfile::api
