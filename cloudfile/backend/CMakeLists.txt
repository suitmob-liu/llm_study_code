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

if(BUILD_TESTING)
    add_subdirectory(tests)
endif()
