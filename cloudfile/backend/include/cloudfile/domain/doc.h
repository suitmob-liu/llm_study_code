#pragma once

#include <chrono>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace cloudfile::domain::doc {

/// 文档元信息（给 list 用）
struct Meta {
    std::string  path;          // 相对 docs_repo 的规范化路径，如 "alice/notes.md"
    std::uint64_t size_bytes;   // 文件 size
    std::string  modified_at;   // ISO 8601 UTC
};

/// 路径规范化：rel_path 必须是非空、不包含 .. 段、不以 / 开头、以 .md 结尾。
/// 返回规范化路径（正斜杠、移除冗余 /）。失败时 nullopt。
/// 注意：不检查命名空间（alice/ vs shared/），那是 check_access 的事。
std::optional<std::string> normalize(std::string_view rel_path);

/// 权限校验：用户 @username 能不能访问 @normalized_path。
/// Phase 1b-1 规则（硬编码）：
///   - 允许读写自己目录（`<username>/...`）和 shared/（`shared/...`）
///   - 其他用户目录一律拒绝（包括 admin，admin 走 CLI，不通过 HTTP）
bool check_access(std::string_view username,
                  std::string_view normalized_path);

/// 列出用户可见的所有文档（own dir + shared/）。
/// 扫文件系统，不走 SQLite（Phase 1b-1 没有 docs 表）。
/// ≤10 人 × ≤1000 文档数量级，单次 walk 几毫秒。
std::vector<Meta> list_for_user(std::string_view username);

/// 读文档内容。path 必须已经 normalize 过 + 通过 check_access。
/// 不存在返回 nullopt。
std::optional<std::string> read(std::string_view normalized_path);

/// 写文档 + git commit。原子（持 write_mutex）。
/// is_new 由调用方判断（读 exists → 决定 create vs update），用于 commit message。
/// 抛 std::runtime_error on IO/git 失败。
void write(std::string_view normalized_path,
           std::string_view content,
           std::string_view author_username,
           std::string_view author_email,
           bool is_new);

/// 删除文档 + git commit。原子。
/// 文件不存在（或已不在 git index）返回 false。
bool remove(std::string_view normalized_path,
            std::string_view author_username,
            std::string_view author_email);

/// 判断文件是否存在（磁盘）。便于 API 层区分 create vs update。
bool exists(std::string_view normalized_path);

/// 用户注册时调：mkdir docs_repo/<username>/。已存在幂等。
/// 不 git commit——空目录 git 不记录，用户写第一篇文档时自然带上。
void ensure_user_dir(std::string_view username);

}  // namespace cloudfile::domain::doc
