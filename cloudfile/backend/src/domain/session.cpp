#include "cloudfile/domain/session.h"

#include "cloudfile/storage/db.h"

#include <SQLiteCpp/SQLiteCpp.h>
#include <sodium.h>

#include <array>
#include <chrono>
#include <stdexcept>
#include <string>

namespace cloudfile::domain::session {

namespace {

constexpr std::size_t kTokenBytes = 32;                       // 64 hex chars
constexpr std::size_t kHashBytes  = crypto_generichash_BYTES; // 32

std::string generate_plaintext_token() {
    std::array<unsigned char, kTokenBytes> buf{};
    randombytes_buf(buf.data(), buf.size());
    std::array<char, kTokenBytes * 2 + 1> hex{};
    sodium_bin2hex(hex.data(), hex.size(), buf.data(), buf.size());
    return std::string(hex.data());
}

Session row_to_session(SQLite::Statement& q) {
    Session s;
    s.id           = q.getColumn("id").getText();
    s.user_id      = q.getColumn("user_id").getInt64();
    s.expires_at   = q.getColumn("expires_at").getText();
    s.created_at   = q.getColumn("created_at").getText();
    s.last_seen_at = q.getColumn("last_seen_at").getText();
    {
        auto c = q.getColumn("user_agent");
        if (!c.isNull()) s.user_agent = c.getText();
    }
    {
        auto c = q.getColumn("ip");
        if (!c.isNull()) s.ip = c.getText();
    }
    return s;
}

}  // anonymous namespace

std::string hash_token(std::string_view plaintext) {
    std::array<unsigned char, kHashBytes> hash{};
    crypto_generichash(hash.data(), hash.size(),
                       reinterpret_cast<const unsigned char*>(plaintext.data()),
                       plaintext.size(),
                       nullptr, 0);
    std::array<char, kHashBytes * 2 + 1> hex{};
    sodium_bin2hex(hex.data(), hex.size(), hash.data(), hash.size());
    return std::string(hex.data());
}

CreateResult create(std::int64_t user_id,
                    std::optional<std::string_view> user_agent,
                    std::optional<std::string_view> ip,
                    std::chrono::seconds lifetime) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    std::string plaintext = generate_plaintext_token();
    std::string id_hash   = hash_token(plaintext);

    std::string modifier = "+" + std::to_string(lifetime.count()) + " seconds";

    SQLite::Statement ins(db.raw(),
        "INSERT INTO sessions(id, user_id, expires_at, user_agent, ip) "
        "VALUES (?, ?, datetime('now', ?), ?, ?)");
    ins.bind(1, id_hash);
    ins.bind(2, user_id);
    ins.bind(3, modifier);
    if (user_agent.has_value()) ins.bind(4, std::string(*user_agent));
    else                        ins.bind(4);
    if (ip.has_value())         ins.bind(5, std::string(*ip));
    else                        ins.bind(5);
    ins.exec();

    // 回读（为了拿 created_at / last_seen_at 的 CURRENT_TIMESTAMP 值）
    SQLite::Statement q(db.raw(),
        "SELECT id, user_id, expires_at, created_at, last_seen_at, user_agent, ip "
        "FROM sessions WHERE id = ?");
    q.bind(1, id_hash);
    if (!q.executeStep()) {
        throw std::runtime_error("session vanished after insert (impossible?)");
    }
    return CreateResult{row_to_session(q), std::move(plaintext)};
}

std::optional<Session> find_active_and_touch(std::string_view plaintext) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());   // 我们要写 last_seen_at

    auto id_hash = hash_token(plaintext);

    // 条件 UPDATE + RETURNING 更干净，但 SQLiteCpp 对 RETURNING 支持参差；
    // 拆成 SELECT + UPDATE 两步，都在同一个 mutex 下，没有竞态。
    SQLite::Statement q(db.raw(),
        "SELECT id, user_id, expires_at, created_at, last_seen_at, user_agent, ip "
        "FROM sessions "
        "WHERE id = ? AND expires_at > datetime('now')");
    q.bind(1, id_hash);
    if (!q.executeStep()) return std::nullopt;

    Session s = row_to_session(q);

    SQLite::Statement upd(db.raw(),
        "UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?");
    upd.bind(1, id_hash);
    upd.exec();

    return s;
}

bool delete_by_token(std::string_view plaintext) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    SQLite::Statement del(db.raw(), "DELETE FROM sessions WHERE id = ?");
    del.bind(1, hash_token(plaintext));
    return del.exec() > 0;
}

int delete_all_for_user(std::int64_t user_id) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    SQLite::Statement del(db.raw(), "DELETE FROM sessions WHERE user_id = ?");
    del.bind(1, user_id);
    return del.exec();
}

int delete_expired() {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    SQLite::Statement del(db.raw(),
        "DELETE FROM sessions WHERE expires_at <= datetime('now')");
    return del.exec();
}

}  // namespace cloudfile::domain::session
