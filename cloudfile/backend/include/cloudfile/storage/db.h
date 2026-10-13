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

    /// 禁止拷贝/移动——同一进程内只应有一个 Database 实例（via init/instance）
    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;
    Database(Database&&) = delete;
    Database& operator=(Database&&) = delete;

    /// 进程级单例。backend 的 main() 和 admin_cli 的 main() 都先调这个。
    /// 可以多次调用，但同一个 db_path 下只会真正打开一次；不同 db_path 会抛。
    static Database& init(const std::filesystem::path& db_path);

    /// 获取已 init 的单例。未 init 过会抛 std::logic_error。
    static Database& instance();

    /// 获取底层连接的引用。
    /// 并发安全：读操作（SELECT）可以不持锁；写操作要 scoped_lock(write_mutex())
    SQLite::Database& raw() { return *db_; }

    /// git 写操作 + SQLite 写索引的原子性锁（架构决策 1.3）
    /// 用法：std::scoped_lock lock(db.write_mutex());
    std::mutex& write_mutex() { return write_mutex_; }

    /// 返回当前 schema 版本号
    int schema_version();

private:
    std::unique_ptr<SQLite::Database> db_;
    std::mutex write_mutex_;
    std::filesystem::path path_;

    void run_migrations();
};

}  // namespace cloudfile::storage
