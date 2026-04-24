#pragma once

#include <drogon/HttpController.h>

namespace cloudfile::api {

/// 认证 API：register / login / logout / me
///
/// 注：register/login/logout 不挂 filter；me 挂 SessionAuthFilter。
/// logout 需要读 cookie 但允许没有（idempotent 204 响应）。
class AuthController : public drogon::HttpController<AuthController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(AuthController::registerUser, "/api/register", drogon::Post);
    ADD_METHOD_TO(AuthController::login,        "/api/login",    drogon::Post);
    ADD_METHOD_TO(AuthController::logout,       "/api/logout",   drogon::Post);
    ADD_METHOD_TO(AuthController::me,           "/api/me",       drogon::Get,
                  "cloudfile::api::SessionAuthFilter");
    METHOD_LIST_END

    void registerUser(const drogon::HttpRequestPtr& req,
                      std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void login(const drogon::HttpRequestPtr& req,
               std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void logout(const drogon::HttpRequestPtr& req,
                std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void me(const drogon::HttpRequestPtr& req,
            std::function<void(const drogon::HttpResponsePtr&)>&& callback);
};

}  // namespace cloudfile::api
