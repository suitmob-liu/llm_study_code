# MCP Server：独立进程，方案 Y（薄代理转发到 backend）
# Phase 2b 实现：stdio JSON-RPC 2.0 + libcurl HTTP 客户端 + list_docs 烟测工具
# Phase 2c 补齐其余 5 个工具（read_doc / write_doc / search_docs / backlinks_of / recent_edits）

find_package(nlohmann_json CONFIG REQUIRED)
find_package(spdlog CONFIG REQUIRED)
find_package(fmt CONFIG REQUIRED)
find_package(CURL CONFIG REQUIRED)

add_executable(cloudfile_mcp src/main.cpp)

target_link_libraries(cloudfile_mcp
    PRIVATE
        nlohmann_json::nlohmann_json
        spdlog::spdlog
        fmt::fmt
        CURL::libcurl
)
