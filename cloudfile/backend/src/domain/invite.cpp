#include "cloudfile/domain/invite.h"

#include "cloudfile/storage/db.h"

#include <SQLiteCpp/SQLiteCpp.h>
#include <sodium.h>

#include <array>
#include <chrono>
#include <cstring>
#include <ctime>
#include <stdexcept>
#include <string>

namespace cloudfile::domain::invite {

namespace {

constexpr std::size_t kTokenBytes = 32;   // plaintext token 长度（→ 64 hex 字符）
constexpr std::size_t kHashBytes  = crypto_generichash_BYTES;  // 32

/// 32 字节随机 → 64 字符 hex。libsodium 的 randombytes_buf 底层走 getrandom(2)。
std::string generate_plaintext_token() {
    std::array<unsigned char, kTokenBytes> buf{};
    randombytes_buf(buf.data(), buf.size());

    std::array<char, kTokenBytes * 2 + 1> hex{};
    sodium_bin2hex(hex.data(), hex.size(), buf.data(), buf.size());
    return std::string(hex.data());
}

/// UTC now 格式化成 SQLite datetime() 一样的 "YYYY-MM-DD HH:MM:SS"，用于状态判断。
/// SQLite 存的是 UTC，所以这里也要 UTC，字符串字典序就是时间序。
std::string utc_now_string() {
    auto now = std::chrono::system_clock::now();
    std::time_t tt = std::chrono::system_clock::to_time_t(now);
    std::tm tm_utc{};
#if defined(_WIN32)
    gmtime_s(&tm_utc, &tt);
#else
    gmtime_r(&tt, &tm_utc);
#endif
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &tm_utc);
    return std::string(buf);
}

Invite row_to_invite(SQLite::Statement& q) {
    Invite inv;
    inv.id         = q.getColumn("id").getInt64();
    inv.token_hash = q.getColumn("token_hash").getText();
    inv.created_by = q.getColumn("created_by").getInt64();
    {
        auto c = q.getColumn("email_hint");
        if (!c.isNull()) inv.email_hint = c.getText();
    }
    inv.expires_at = q.getColumn("expires_at").getText();
    {
        auto c = q.getColumn("used_at");
        if (!c.isNull()) inv.used_at = c.getText();
    }
    {
        auto c = q.getColumn("used_by");
        if (!c.isNull()) inv.used_by = c.getInt64();
    }
    {
        auto c = q.getColumn("revoked_at");
        if (!c.isNull()) inv.revoked_at = c.getText();
    }
    inv.created_at = q.getColumn("created_at").getText();
    return inv;
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

Status status_of(const Invite& inv) {
    if (inv.revoked_at.has_value()) return Status::Revoked;
    if (inv.used_at.has_value())    return Status::Used;
    if (inv.expires_at < utc_now_string()) return Status::Expired;
    return Status::Active;
}

const char* status_name(Status s) {
    switch (s) {
        case Status::Active:  return "active";
        case Status::Used:    return "used";
        case Status::Revoked: return "revoked";
        case Status::Expired: return "expired";
    }
    return "unknown";
}

CreateResult create(std::int64_t created_by,
                    std::optional<std::string_view> email_hint,
                    std::chrono::seconds lifetime) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    // 验证 created_by 存在。FK 约束会兜底，但先查能给更友好的错误。
    {
        SQLite::Statement q(db.raw(), "SELECT 1 FROM users WHERE id = ?");
        q.bind(1, created_by);
        if (!q.executeStep()) {
            throw std::runtime_error("created_by user does not exist");
        }
    }

    std::string plaintext = generate_plaintext_token();
    std::string hash      = hash_token(plaintext);

    // expires_at 用 SQL 算，避免 C++ 时间格式化踩坑；
    // datetime('now', '+NNN seconds') 是 SQLite 标准用法
    std::string modifier = "+" + std::to_string(lifetime.count()) + " seconds";

    SQLite::Statement ins(db.raw(),
        "INSERT INTO invite_links(token_hash, created_by, email_hint, expires_at) "
        "VALUES (?, ?, ?, datetime('now', ?))");
    ins.bind(1, hash);
    ins.bind(2, created_by);
    if (email_hint.has_value()) {
        ins.bind(3, std::string(*email_hint));
    } else {
        ins.bind(3);  // NULL
    }
    ins.bind(4, modifier);
    ins.exec();

    const std::int64_t id = db.raw().getLastInsertRowid();
    auto maybe = find_by_id(id);
    if (!maybe) {
        throw std::runtime_error("invite vanished after insert (impossible?)");
    }

    return CreateResult{std::move(*maybe), std::move(plaintext)};
}

std::optional<Invite> find_by_token(std::string_view plaintext) {
    auto& db = storage::Database::instance();
    SQLite::Statement q(db.raw(),
        "SELECT id, token_hash, created_by, email_hint, expires_at, "
        "       used_at, used_by, revoked_at, created_at "
        "FROM invite_links WHERE token_hash = ?");
    q.bind(1, hash_token(plaintext));
    if (q.executeStep()) return row_to_invite(q);
    return std::nullopt;
}

std::optional<Invite> find_by_id(std::int64_t id) {
    auto& db = storage::Database::instance();
    SQLite::Statement q(db.raw(),
        "SELECT id, token_hash, created_by, email_hint, expires_at, "
        "       used_at, used_by, revoked_at, created_at "
        "FROM invite_links WHERE id = ?");
    q.bind(1, id);
    if (q.executeStep()) return row_to_invite(q);
    return std::nullopt;
}

std::vector<Invite> list_all() {
    auto& db = storage::Database::instance();
    SQLite::Statement q(db.raw(),
        "SELECT id, token_hash, created_by, email_hint, expires_at, "
        "       used_at, used_by, revoked_at, created_at "
        "FROM invite_links ORDER BY id DESC");
    std::vector<Invite> out;
    while (q.executeStep()) out.push_back(row_to_invite(q));
    return out;
}

bool revoke_by_id(std::int64_t id) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    SQLite::Statement upd(db.raw(),
        "UPDATE invite_links SET revoked_at = datetime('now') "
        "WHERE id = ? AND revoked_at IS NULL");
    upd.bind(1, id);
    int changed = upd.exec();
    if (changed > 0) return true;

    // changed=0：要么 id 不存在，要么已经 revoked。后者视为幂等成功。
    return find_by_id(id).has_value();
}

bool mark_used(std::string_view plaintext, std::int64_t user_id) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    // 原子条件 UPDATE：只在 Active 状态下生效，避免 TOCTOU。
    // (未 used、未 revoked、未 expired)
    SQLite::Statement upd(db.raw(),
        "UPDATE invite_links "
        "SET used_at = datetime('now'), used_by = ? "
        "WHERE token_hash = ? "
        "  AND used_at IS NULL "
        "  AND revoked_at IS NULL "
        "  AND expires_at > datetime('now')");
    upd.bind(1, user_id);
    upd.bind(2, hash_token(plaintext));
    return upd.exec() > 0;
}

}  // namespace cloudfile::domain::invite
