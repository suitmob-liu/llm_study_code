# Admin CLI：init-admin / invite / list-users / revoke 等
# Phase 1a-1 实现 init-admin。其余命令在后续 phase。

add_executable(cloudfile_admin src/main.cpp)

# cloudfile_core 是 backend 构建的 static lib，包含 storage + domain
# 直接 link 就能用 Database / password / user API
target_link_libraries(cloudfile_admin
    PRIVATE
        cloudfile_core
)
