#include "cloudfile/storage/db.h"

#include <spdlog/spdlog.h>

namespace cloudfile::storage {

namespace {

/// Schema 迁移脚本：按版本号升序排列
/// 每次 schema 变更，追加一条；永远不修改已有条目
constexpr const char* kMigrations[] = {
    // v1: 初始 schema
    R"SQL(
        CREATE TABLE IF NOT EXISTS users (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            username     TEXT NOT NULL UNIQUE,
            email        TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_admin     INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS invite_links (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash   TEXT NOT NULL UNIQUE,
            created_by   INTEGER NOT NULL REFERENCES users(id),
            email_hint   TEXT,
            expires_at   TEXT NOT NULL,
            used_at      TEXT,
            used_by      INTEGER REFERENCES users(id),
            revoked_at   TEXT,
            created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_invite_expires
            ON invite_links(expires_at)
            WHERE used_at IS NULL AND revoked_at IS NULL;

        CREATE TABLE IF NOT EXISTS sessions (
            id           TEXT PRIMARY KEY,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at   TEXT NOT NULL,
            created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            user_agent   TEXT,
            ip           TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS mcp_tokens (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash   TEXT NOT NULL UNIQUE,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name         TEXT NOT NULL,
            created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_used_at TEXT,
            revoked_at   TEXT
        );

        CREATE TABLE IF NOT EXISTS wiki_links (
            src_path     TEXT NOT NULL,
            dst_path     TEXT NOT NULL,
            PRIMARY KEY (src_path, dst_path)
        );

        CREATE INDEX IF NOT EXISTS idx_wiki_links_dst ON wiki_links(dst_path);

        -- FTS5 虚表用 trigram tokenizer（SQLite 3.34+ 内置，对中文友好）
        CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
            path UNINDEXED,
            title,
            content,
            tokenize='trigram'
        );

        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        );
    )SQL",
};

constexpr int kLatestVersion = sizeof(kMigrations) / sizeof(kMigrations[0]);

}  // anonymous namespace

Database::Database(const std::filesystem::path& db_path) : path_(db_path) {
    spdlog::info("Opening SQLite at {}", db_path.string());
    db_ = std::make_unique<SQLite::Database>(
        db_path.string(),
        SQLite::OPEN_READWRITE | SQLite::OPEN_CREATE);

    // 启用 WAL + foreign keys
    db_->exec("PRAGMA journal_mode = WAL");
    db_->exec("PRAGMA foreign_keys = ON");
    db_->exec("PRAGMA synchronous = NORMAL");

    run_migrations();
}

namespace {
std::unique_ptr<Database> g_instance;
std::mutex g_init_mutex;
}  // anonymous namespace

Database& Database::init(const std::filesystem::path& db_path) {
    std::scoped_lock lock(g_init_mutex);
    if (g_instance) {
        if (g_instance->path_ != db_path) {
            throw std::logic_error("Database::init called with different path");
        }
        return *g_instance;
    }
    g_instance = std::unique_ptr<Database>(new Database(db_path));
    return *g_instance;
}

Database& Database::instance() {
    if (!g_instance) {
        throw std::logic_error("Database::instance() called before init()");
    }
    return *g_instance;
}

int Database::schema_version() {
    // schema_version 表可能还不存在（全新 DB）
    try {
        SQLite::Statement q(*db_, "SELECT MAX(version) FROM schema_version");
        if (q.executeStep() && !q.isColumnNull(0)) {
            return q.getColumn(0).getInt();
        }
    } catch (const SQLite::Exception&) {
        // 表不存在，返回 0
    }
    return 0;
}

void Database::run_migrations() {
    int current = schema_version();
    spdlog::info("Current schema version: {}, target: {}", current, kLatestVersion);

    for (int v = current; v < kLatestVersion; ++v) {
        spdlog::info("Applying migration v{}", v + 1);
        SQLite::Transaction txn(*db_);
        db_->exec(kMigrations[v]);
        SQLite::Statement ins(*db_, "INSERT INTO schema_version(version) VALUES (?)");
        ins.bind(1, v + 1);
        ins.exec();
        txn.commit();
    }

    spdlog::info("Schema at version {}", schema_version());
}

}  // namespace cloudfile::storage
