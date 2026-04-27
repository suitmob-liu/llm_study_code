#include "cloudfile/domain/share.h"

#include "cloudfile/storage/db.h"

#include <SQLiteCpp/SQLiteCpp.h>
#include <sodium.h>

#include <array>
#include <chrono>
#include <stdexcept>
#include <string>

namespace cloudfile::domain::share {

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

Token row_to_token(SQLite::Statement& q) {
    Token t;
    t.id         = q.getColumn("id").getInt64();
    t.token_hash = q.getColumn("token_hash").getText();
    t.doc_path   = q.getColumn("doc_path").getText();
    t.created_by = q.getColumn("created_by").getInt64();
    t.created_at = q.getColumn("created_at").getText();
    {
        auto c = q.getColumn("expires_at");
        if (!c.isNull()) t.expires_at = c.getText();
    }
    {
        auto c = q.getColumn("revoked_at");
        if (!c.isNull()) t.revoked_at = c.getText();
    }
    return t;
}

constexpr const char* kSelectCols =
    "id, token_hash, doc_path, created_by, created_at, expires_at, revoked_at";

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

Status status_of(const Token& t) {
    if (t.revoked_at.has_value()) return Status::Revoked;
    if (t.expires_at.has_value()) {
        // 比较留给 SQL；此函数在已查询出的对象上判断时不知道当前时刻。
        // 调用方场景：list 时容忍把 active-but-near-expiry 显示成 Active 即可，
        // verify() 走 SQL 严格判定。
    }
    return Status::Active;
}

const char* status_name(Status s) {
    switch (s) {
        case Status::Active:  return "active";
        case Status::Revoked: return "revoked";
        case Status::Expired: return "expired";
    }
    return "unknown";
}

CreateResult create(std::string_view doc_path,
                    std::int64_t created_by,
                    std::chrono::seconds lifetime) {
    if (doc_path.empty()) throw std::runtime_error("share doc_path must not be empty");

    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    std::string plaintext = generate_plaintext();
    std::string th        = hash_token(plaintext);

    if (lifetime.count() <= 0) {
        SQLite::Statement ins(db.raw(),
            "INSERT INTO share_tokens(token_hash, doc_path, created_by, expires_at) "
            "VALUES (?, ?, ?, NULL)");
        ins.bind(1, th);
        ins.bind(2, std::string(doc_path));
        ins.bind(3, created_by);
        ins.exec();
    } else {
        std::string mod = "+" + std::to_string(lifetime.count()) + " seconds";
        SQLite::Statement ins(db.raw(),
            "INSERT INTO share_tokens(token_hash, doc_path, created_by, expires_at) "
            "VALUES (?, ?, ?, datetime('now', ?))");
        ins.bind(1, th);
        ins.bind(2, std::string(doc_path));
        ins.bind(3, created_by);
        ins.bind(4, mod);
        ins.exec();
    }

    auto id = db.raw().getLastInsertRowid();
    SQLite::Statement q(db.raw(),
        std::string("SELECT ") + kSelectCols + " FROM share_tokens WHERE id = ?");
    q.bind(1, id);
    if (!q.executeStep()) throw std::runtime_error("share token vanished after insert");

    return CreateResult{row_to_token(q), std::move(plaintext)};
}

std::optional<Token> verify(std::string_view plaintext_token) {
    auto& db = storage::Database::instance();
    auto th = hash_token(plaintext_token);

    SQLite::Statement q(db.raw(),
        std::string("SELECT ") + kSelectCols +
        " FROM share_tokens "
        " WHERE token_hash = ? AND revoked_at IS NULL "
        "   AND (expires_at IS NULL OR expires_at > datetime('now'))");
    q.bind(1, th);
    if (!q.executeStep()) return std::nullopt;
    return row_to_token(q);
}

bool revoke_by_id(std::int64_t id) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    SQLite::Statement upd(db.raw(),
        "UPDATE share_tokens SET revoked_at = datetime('now') "
        "WHERE id = ? AND revoked_at IS NULL");
    upd.bind(1, id);
    return upd.exec() > 0;
}

std::vector<Token> list_for_doc(std::string_view doc_path) {
    auto& db = storage::Database::instance();
    std::vector<Token> out;
    SQLite::Statement q(db.raw(),
        std::string("SELECT ") + kSelectCols +
        " FROM share_tokens WHERE doc_path = ? ORDER BY id DESC");
    q.bind(1, std::string(doc_path));
    while (q.executeStep()) out.push_back(row_to_token(q));
    return out;
}

std::vector<Token> list_all() {
    auto& db = storage::Database::instance();
    std::vector<Token> out;
    SQLite::Statement q(db.raw(),
        std::string("SELECT ") + kSelectCols +
        " FROM share_tokens ORDER BY id DESC");
    while (q.executeStep()) out.push_back(row_to_token(q));
    return out;
}

}  // namespace cloudfile::domain::share
