find_package(Drogon CONFIG REQUIRED)
find_package(SQLiteCpp CONFIG REQUIRED)
find_package(libgit2 CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(spdlog CONFIG REQUIRED)
find_package(fmt CONFIG REQUIRED)
find_package(unofficial-sodium CONFIG REQUIRED)

# 共享库：被 backend exe 和 admin_cli exe 共同使用的 domain/storage 代码
# 放成 static lib 避免编两遍 + 保证行为一致
set(CLOUDFILE_CORE_SOURCES
    src/storage/db.cpp
    src/domain/password.cpp
    src/domain/user.cpp
    src/domain/invite.cpp
    src/domain/session.cpp
    src/domain/search.cpp
    src/domain/wiki_link.cpp
    src/domain/mcp_token.cpp
)

add_library(cloudfile_core STATIC ${CLOUDFILE_CORE_SOURCES})

target_include_directories(cloudfile_core
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(cloudfile_core
    PUBLIC
        SQLiteCpp
        spdlog::spdlog
        fmt::fmt
        unofficial-sodium::sodium
)

# backend HTTP 服务
# 注：storage/repo.cpp + domain/doc.cpp + api/doc_controller.cpp 放这里（不进 core）
# 原因：repo.cpp 依赖 libgit2，admin_cli 不链 libgit2，把它们留在 exe 范围内。
set(BACKEND_SOURCES
    src/main.cpp
    src/storage/repo.cpp
    src/domain/doc.cpp
    src/api/health_controller.cpp
    src/api/auth_controller.cpp
    src/api/auth_filter.cpp
    src/api/doc_controller.cpp
    src/api/search_controller.cpp
    src/api/backlinks_controller.cpp
)

add_executable(cloudfile_backend ${BACKEND_SOURCES})

target_link_libraries(cloudfile_backend
    PRIVATE
        cloudfile_core
        Drogon::Drogon
        libgit2::libgit2package
        nlohmann_json::nlohmann_json
)

# Phase 0 还没写测试。tests/ 目录里有 CMakeLists.txt 才会启用——
# Phase 1 加测试时往 tests/CMakeLists.txt 里写东西就自动生效，不用改这里。
if(BUILD_TESTING AND EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/tests/CMakeLists.txt")
    add_subdirectory(tests)
endif()
