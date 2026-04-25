#pragma once

#include <cstddef>
#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

namespace cloudfile::domain::search {

/// 搜索命中。snippet 是 FTS5 高亮过的片段（含 <mark>...</mark>）。
struct Hit {
    std::string path;
    std::string title;
    std::string snippet;
    double      rank;       // bm25：值越小越相关
};

/// upsert 一条文档到 docs_fts。先 DELETE 后 INSERT。
/// title 自动从 content 第一行 `# heading` 提取，fallback basename。
/// 调用方必须持有 Database::write_mutex（与 git commit 在同一把锁下）。
void index_upsert(std::string_view path, std::string_view content);

/// 从 docs_fts 删一条。调用方必须持有 write_mutex。
void index_delete(std::string_view path);

/// 全文搜索。username 用来过滤可见性（自己目录 + shared/）。
/// limit 上限由调用方约束（API 层传 ≤100）。
/// 失败（FTS5 query syntax 不合法）时返回空 vector。
std::vector<Hit> search(std::string_view query,
                        std::string_view username,
                        std::size_t limit);

/// 全量重建：清空 docs_fts，walk repo_root 下所有 *.md 重新 INSERT。
/// 在 write_mutex 下跑。返回索引的文档数。
std::size_t rebuild_index_at(const std::filesystem::path& repo_root);

/// 暴露给 unit test 的 helper（也给 doc.cpp 用，避免重复 walk 逻辑）。
std::string extract_title(std::string_view content, std::string_view fallback_path);

}  // namespace cloudfile::domain::search
