# Admin CLI：init-admin / invite / list-users / revoke 等
# Phase 0 占位；Phase 1 实现 init-admin 和 invite

find_package(SQLiteCpp CONFIG REQUIRED)
find_package(spdlog CONFIG REQUIRED)
find_package(fmt CONFIG REQUIRED)
find_package(unofficial-sodium CONFIG REQUIRED)

add_executable(cloudfile_admin src/main.cpp)

target_include_directories(cloudfile_admin
    PRIVATE
        ${CMAKE_SOURCE_DIR}/backend/include
)

target_link_libraries(cloudfile_admin
    PRIVATE
        SQLiteCpp
        spdlog::spdlog
        fmt::fmt
        unofficial-sodium::sodium
)
