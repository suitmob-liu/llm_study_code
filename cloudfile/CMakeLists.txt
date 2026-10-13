cmake_minimum_required(VERSION 3.20)

project(cloudfile
    VERSION 0.1.0
    DESCRIPTION "Self-hosted AI-first cloud document system"
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID STREQUAL "Clang")
    add_compile_options(-Wall -Wextra -Wpedantic -Wno-unused-parameter)
endif()

include(CTest)

add_subdirectory(backend)
add_subdirectory(mcp_server)
add_subdirectory(admin_cli)
