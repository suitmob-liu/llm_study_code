#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace cloudfile::domain::user {

struct User {
    std::int64_t id;
    std::string  username;
    std::string  email;
    bool         is_admin;
    std::string  created_at;   // ISO 8601 字符串，由 SQLite 的 CURRENT_TIMESTAMP 填充
};

/// 创建用户。password_hash 必须已经是 password::hash() 的结果（不是明文！）。
/// 抛 std::runtime_error：
///   - "username already exists"
///   - "email already exists"
User create(std::string_view username,
            std::string_view email,
            std::string_view password_hash,
            bool is_admin);

std::optional<User> find_by_username(std::string_view username);
std::optional<User> find_by_email(std::string_view email);
std::optional<User> find_by_id(std::int64_t id);

/// 用于 login：按 username 或 email 查找，同时返回 password_hash 用于验证。
std::optional<std::pair<User, std::string>>
find_with_hash_by_login(std::string_view username_or_email);

std::int64_t count();

std::vector<User> list_all();

}  // namespace cloudfile::domain::user
