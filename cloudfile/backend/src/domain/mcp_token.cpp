#include "cloudfile/domain/mcp_token.h"

#include "cloudfile/storage/db.h"

#include <SQLiteCpp/SQLiteCpp.h>
#include <sodium.h>

#include <array>
#include <stdexcept>
#include <string>

namespace cloudfile::domain::mcp_token {

namespace {

constexpr std::size_t kTokenBytes = 32;
constexpr std::size_t kHashBytes  = crypto_generichash_BYTES;

std::string generate_plaintext() {
    std::array<unsigned char, kTokenBytes> buf{};
    randombytes_buf(buf.data(), buf.size());
    std::array<char, kTokenBytes * 2 + 1> hex{};
    sodium_bin2hex(hex.data(), hex.size(), buf.data(), buf.size());
    return std::string(hex.data());
}

McpToken row_to_token(SQLite::Statement& q) {
    McpToken t;
    t.id         = q.getColumn("id").getInt64();
    t.token_hash = q.getColumn("token_hash").getText();
    t.user_id    = q.getColumn("user_id").getInt64();
    t.name       = q.getColumn("name").getText();
    t.created_at = q.getColumn("created_at").getText();
    {
        auto c = q.getColumn("last_used_at");
        if (!c.isNull()) t.last_used_at = c.getText();
    }
    {
        auto c = q.getColumn("revoked_at");
        if (!c.isNull()) t.revoked_at = c.getText();
    }
    return t;
}

constexpr const char* kSelectCols =
    "id, token_hash, user_id, name, created_at, last_used_at, revoked_at";

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

CreateResult create(std::int64_t user_id, std::string_view name) {
    if (name.empty()) throw std::runtime_error("mcp token name must not be empty");

    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    std::string plaintext = generate_plaintext();
    std::string th        = hash_token(plaintext);

    SQLite::Statement ins(db.raw(),
        "INSERT INTO mcp_tokens(token_hash, user_id, name) VALUES (?, ?, ?)");
    ins.bind(1, th);
    ins.bind(2, user_id);
    ins.bind(3, std::string(name));
    ins.exec();

    auto id = db.raw().getLastInsertRowid();
    SQLite::Statement q(db.raw(),
        std::string("SELECT ") + kSelectCols + " FROM mcp_tokens WHERE id = ?");
    q.bind(1, id);
    if (!q.executeStep()) throw std::runtime_error("mcp token vanished after insert");

    return CreateResult{row_to_token(q), std::move(plaintext)};
}

std::optional<McpToken> verify(std::string_view plaintext_token) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    auto th = hash_token(plaintext_token);

    SQLite::Statement q(db.raw(),
        std::string("SELECT ") + kSelectCols +
        " FROM mcp_tokens WHERE token_hash = ? AND revoked_at IS NULL");
    q.bind(1, th);
    if (!q.executeStep()) return std::nullopt;

    auto t = row_to_token(q);

    SQLite::Statement upd(db.raw(),
        "UPDATE mcp_tokens SET last_used_at = datetime('now') WHERE id = ?");
    upd.bind(1, t.id);
    upd.exec();
    return t;
}

bool revoke_by_id(std::int64_t id) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    SQLite::Statement upd(db.raw(),
        "UPDATE mcp_tokens SET revoked_at = datetime('now') "
        "WHERE id = ? AND revoked_at IS NULL");
    upd.bind(1, id);
    return upd.exec() > 0;
}

std::vector<McpToken> list_all() {
    auto& db = storage::Database::instance();
    std::vector<McpToken> out;
    SQLite::Statement q(db.raw(),
        std::string("SELECT ") + kSelectCols +
        " FROM mcp_tokens ORDER BY id");
    while (q.executeStep()) out.push_back(row_to_token(q));
    return out;
}

std::optional<McpToken> find_by_id(std::int64_t id) {
    auto& db = storage::Database::instance();
    SQLite::Statement q(db.raw(),
        std::string("SELECT ") + kSelectCols +
        " FROM mcp_tokens WHERE id = ?");
    q.bind(1, id);
    if (!q.executeStep()) return std::nullopt;
    return row_to_token(q);
}

std::vector<McpToken> list_for_user(std::int64_t user_id) {
    auto& db = storage::Database::instance();
    std::vector<McpToken> out;
    SQLite::Statement q(db.raw(),
        std::string("SELECT ") + kSelectCols +
        " FROM mcp_tokens WHERE user_id = ? ORDER BY id");
    q.bind(1, user_id);
    while (q.executeStep()) out.push_back(row_to_token(q));
    return out;
}

Status status_of(const McpToken& t) {
    return t.revoked_at.has_value() ? Status::Revoked : Status::Active;
}

const char* status_name(Status s) {
    switch (s) {
        case Status::Active:  return "active";
        case Status::Revoked: return "revoked";
    }
    return "unknown";
}

}  // namespace cloudfile::domain::mcp_token
