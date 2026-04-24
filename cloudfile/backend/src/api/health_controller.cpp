#include "cloudfile/api/health_controller.h"

#include <nlohmann/json.hpp>

namespace cloudfile::api {

void HealthController::health(
    const drogon::HttpRequestPtr&,
    std::function<void(const drogon::HttpResponsePtr&)>&& callback) {

    nlohmann::json body = {
        {"status", "ok"},
        {"service", "cloudfile_backend"},
        {"version", "0.1.0"},
    };

    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(drogon::k200OK);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(body.dump());
    callback(resp);
}

}  // namespace cloudfile::api
