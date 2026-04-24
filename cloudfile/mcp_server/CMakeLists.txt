# MCP Server：独立进程，方案 Y（薄代理转发到 backend）
# Phase 0 只占位一个 stub；Phase 2 再实现

find_package(nlohmann_json CONFIG REQUIRED)
find_package(spdlog CONFIG REQUIRED)
find_package(fmt CONFIG REQUIRED)

add_executable(cloudfile_mcp src/main.cpp)

target_link_libraries(cloudfile_mcp
    PRIVATE
        nlohmann_json::nlohmann_json
        spdlog::spdlog
        fmt::fmt
)
