#pragma once

#include <SQLiteCpp/SQLiteCpp.h>
#include <filesystem>
#include <memory>
#include <mutex>
#include <string>

namespace cloudfile::storage {

/// SQLite 连接 + schema 初始化 + 并发保护
///
/// 设计决策（来自 /plan-eng-review）：
/// - 1.1 文件系统 + git 为唯一真相源，SQLite 是派生索引
/// - 1.3 所有 git 操作走进程内 threading.Lock（这里是 std::mutex）
/// - WAL 模式 + foreign_keys = ON
class Database {
public:
    /// 打开或创建数据库，初始化 schema 到最新版本（迁移）
    /// @param db_path SQLite 文件路径（通常是 docs_repo 的兄弟目录）
    explicit Database(const std::filesystem::path& db_path);

    /// 禁止拷贝
    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;

    /// 允许移动
    Database(Database&&) noexcept = default;
    Database& operator=(Database&&) noexcept = default;

    /// 获取底层连接的引用
    /// 并发安全：调用者持有的 mutex 锁仅在需要事务原子性时才取
    SQLite::Database& raw() { return *db_; }

    /// git 写操作 + SQLite 写索引的原子性锁
    /// 用法：std::scoped_lock lock(db.write_mutex());
    std::mutex& write_mutex() { return write_mutex_; }

    /// 返回当前 schema 版本号
    int schema_version();

private:
    std::unique_ptr<SQLite::Database> db_;
    std::mutex write_mutex_;

    void run_migrations();
};

}  // namespace cloudfile::storage
