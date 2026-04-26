#pragma once

#include <filesystem>
#include <functional>
#include <string>
#include <string_view>
#include <vector>

namespace cloudfile::domain::wiki_link {

/// 解析出来的 [[target]] 或 [[target|alias]]。
struct Parsed {
    std::string target;   // 引号内 `|` 之前的部分（已 trim）
    std::string alias;    // `|` 之后；无 alias 时为空
};

/// 路径存在检查器：传 repo-relative path（如 "alice/notes.md"），返回是否存在。
using ExistsFn = std::function<bool(std::string_view)>;

/// 纯字符串解析：扫 markdown 内容里的 `[[...]]`。
/// 跳过 ``` 围栏代码块（v1 不处理 inline `code` —— 真要写 wiki link 教学文档再说）。
/// 不做去重，不做解析。
std::vector<Parsed> parse(std::string_view content);

/// 解析 target 到 repo-relative dst_path（恒为 .md 结尾）。
///   - target 含 `/`：当 repo-relative，缺 `.md` 自动加
///   - 否则裸名：先试 `<src_user>/<name>.md`，不存在试 `shared/<name>.md`，
///     都不存在 fallback 到 `<src_user>/<name>.md`（orphan，前端渲染红色）
/// src_path 用来推 src_user 前缀；空 target 返回空字符串。
std::string resolve(std::string_view target,
                    std::string_view src_path,
                    const ExistsFn& exists_fn);

/// parse + resolve + 去重 + 排除指向自己的链接。
std::vector<std::string> extract_links(std::string_view content,
                                       std::string_view src_path,
                                       const ExistsFn& exists_fn);

/// 替换 wiki_links 表中 src_path 的所有出边（DELETE + 批量 INSERT）。
/// 调用方持 Database::write_mutex。
void index_replace(std::string_view src_path,
                   const std::vector<std::string>& dst_paths);

/// 删除 src_path 为源的所有边（doc 被删时用）。dst_path 为该 path 的边保留——
/// 那些是孤儿引用，由 UI 渲染为"已删除"。
void index_delete_src(std::string_view src_path);

/// 列出指向 dst_path 的所有 src_path（按 src_path asc 排序）。
std::vector<std::string> backlinks_of(std::string_view dst_path);

/// 全量重建 wiki_links：扫 repo_root 所有 .md，先 walk 收集 path 集（用于 exists 判定），
/// 再 walk 解析 + INSERT。整体在 transaction 里。
/// 返回处理的源文档数。
std::size_t rebuild_links_at(const std::filesystem::path& repo_root);

}  // namespace cloudfile::domain::wiki_link
