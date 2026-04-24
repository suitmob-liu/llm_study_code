#include "cloudfile/domain/user.h"

#include "cloudfile/storage/db.h"

#include <SQLiteCpp/SQLiteCpp.h>

#include <stdexcept>
#include <string>

namespace cloudfile::domain::user {

namespace {

User row_to_user(SQLite::Statement& q) {
    User u;
    u.id         = q.getColumn("id").getInt64();
    u.username   = q.getColumn("username").getText();
    u.email      = q.getColumn("email").getText();
    u.is_admin   = q.getColumn("is_admin").getInt() != 0;
    u.created_at = q.getColumn("created_at").getText();
    return u;
}

}  // anonymous namespace

User create(std::string_view username,
            std::string_view email,
            std::string_view password_hash,
            bool is_admin) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    // SQLite UNIQUE 约束违反会抛 SQLite::Exception。先手动检查给更清晰的错误。
    if (find_by_username(username).has_value()) {
        throw std::runtime_error("username already exists");
    }
    if (find_by_email(email).has_value()) {
        throw std::runtime_error("email already exists");
    }

    SQLite::Statement ins(db.raw(),
        "INSERT INTO users(username, email, password_hash, is_admin) "
        "VALUES (?, ?, ?, ?)");
    ins.bind(1, std::string(username));
    ins.bind(2, std::string(email));
    ins.bind(3, std::string(password_hash));
    ins.bind(4, is_admin ? 1 : 0);
    ins.exec();

    const std::int64_t id = db.raw().getLastInsertRowid();

    // 回读 created_at（SQLite 默认 CURRENT_TIMESTAMP 填的）
    SQLite::Statement q(db.raw(),
        "SELECT created_at FROM users WHERE id = ?");
    q.bind(1, id);
    if (!q.executeStep()) {
        throw std::runtime_error("created user not found (impossible?)");
    }

    User u;
    u.id         = id;
    u.username   = std::string(username);
    u.email      = std::string(email);
    u.is_admin   = is_admin;
    u.created_at = q.getColumn(0).getText();
    return u;
}

std::optional<User> find_by_username(std::string_view username) {
    auto& db = storage::Database::instance();
    SQLite::Statement q(db.raw(),
        "SELECT id, username, email, is_admin, created_at "
        "FROM users WHERE username = ?");
    q.bind(1, std::string(username));
    if (q.executeStep()) return row_to_user(q);
    return std::nullopt;
}

std::optional<User> find_by_email(std::string_view email) {
    auto& db = storage::Database::instance();
    SQLite::Statement q(db.raw(),
        "SELECT id, username, email, is_admin, created_at "
        "FROM users WHERE email = ?");
    q.bind(1, std::string(email));
    if (q.executeStep()) return row_to_user(q);
    return std::nullopt;
}

std::optional<User> find_by_id(std::int64_t id) {
    auto& db = storage::Database::instance();
    SQLite::Statement q(db.raw(),
        "SELECT id, username, email, is_admin, created_at "
        "FROM users WHERE id = ?");
    q.bind(1, id);
    if (q.executeStep()) return row_to_user(q);
    return std::nullopt;
}

std::optional<std::pair<User, std::string>>
find_with_hash_by_login(std::string_view username_or_email) {
    auto& db = storage::Database::instance();
    SQLite::Statement q(db.raw(),
        "SELECT id, username, email, is_admin, created_at, password_hash "
        "FROM users WHERE username = ? OR email = ?");
    q.bind(1, std::string(username_or_email));
    q.bind(2, std::string(username_or_email));
    if (q.executeStep()) {
        auto u    = row_to_user(q);
        auto hash = q.getColumn("password_hash").getText();
        return std::make_pair(std::move(u), std::string(hash));
    }
    return std::nullopt;
}

std::int64_t count() {
    auto& db = storage::Database::instance();
    SQLite::Statement q(db.raw(), "SELECT COUNT(*) FROM users");
    if (q.executeStep()) return q.getColumn(0).getInt64();
    return 0;
}

std::vector<User> list_all() {
    auto& db = storage::Database::instance();
    SQLite::Statement q(db.raw(),
        "SELECT id, username, email, is_admin, created_at "
        "FROM users ORDER BY id");
    std::vector<User> out;
    while (q.executeStep()) out.push_back(row_to_user(q));
    return out;
}

}  // namespace cloudfile::domain::user
