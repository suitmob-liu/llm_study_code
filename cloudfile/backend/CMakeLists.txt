find_package(Drogon CONFIG REQUIRED)
find_package(SQLiteCpp CONFIG REQUIRED)
find_package(libgit2 CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(spdlog CONFIG REQUIRED)
find_package(fmt CONFIG REQUIRED)
find_package(unofficial-sodium CONFIG REQUIRED)

set(BACKEND_SOURCES
    src/main.cpp
    src/storage/db.cpp
    src/api/health_controller.cpp
)

add_executable(cloudfile_backend ${BACKEND_SOURCES})

target_include_directories(cloudfile_backend
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(cloudfile_backend
    PRIVATE
        Drogon::Drogon
        SQLiteCpp
        libgit2::libgit2package
        nlohmann_json::nlohmann_json
        spdlog::spdlog
        fmt::fmt
        unofficial-sodium::sodium
)

# Phase 0 还没写测试。tests/ 目录里有 CMakeLists.txt 才会启用——
# Phase 1 加测试时往 tests/CMakeLists.txt 里写东西就自动生效，不用改这里。
if(BUILD_TESTING AND EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/tests/CMakeLists.txt")
    add_subdirectory(tests)
endif()
