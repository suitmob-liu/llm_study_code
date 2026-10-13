#pragma once

#include <filesystem>
#include <mutex>
#include <string>
#include <string_view>

namespace cloudfile::storage {

/// libgit2 薄壳：管理 docs_repo 的 git 仓库。
///
/// 设计决策（/plan-eng-review 1.1 + 1.3）：
/// - 文件系统 + git 为唯一真相源；SQLite 是派生索引
/// - 所有 git 写操作走单把 write_mutex（这里复用 Database 的那把）
///
/// 生命周期：单例，backend main() 启动时 init()；exit 时 shutdown()。
/// admin_cli 不需要——CLI 只读 DB。
class Repo {
public:
    /// 打开或初始化仓库。目录不存在则 mkdir -p + git init。
    /// 首次 init 后自动创建 .gitignore 和一个 README 作为 initial commit。
    /// @param repo_path docs_repo 根目录
    /// @param author_name commit 作者名（从 CLOUDFILE_GIT_NAME 读或默认）
    /// @param author_email commit 作者邮箱
    static Repo& init(const std::filesystem::path& repo_path,
                      std::string author_name,
                      std::string author_email);

    static Repo& instance();

    /// libgit2 全局关闭。仅 main() 退出前调一次。
    static void shutdown_global();

    /// 写文件 + git add + git commit。rel_path 相对 repo root，不含前导斜杠。
    /// 调用方必须持有 write_mutex！
    /// @param content 新内容（UTF-8）
    /// @param author_override 非空则覆盖默认作者（用户提交时传 user.email/username）
    /// @param message commit 消息（如 "edit: alice/notes.md"）
    /// @throws std::runtime_error on git 错误
    void commit_file(std::string_view rel_path,
                     std::string_view content,
                     std::string_view author_name,
                     std::string_view author_email,
                     std::string_view message);

    /// rm 文件 + git rm + git commit。
    /// 调用方必须持有 write_mutex！
    void commit_delete(std::string_view rel_path,
                       std::string_view author_name,
                       std::string_view author_email,
                       std::string_view message);

    const std::filesystem::path& root() const { return root_; }

private:
    Repo(std::filesystem::path root,
         std::string default_author_name,
         std::string default_author_email);

    // libgit2 资源 RAII 放到 .cpp 里。Repo 只存路径+默认作者。
    std::filesystem::path root_;
    std::string default_name_;
    std::string default_email_;

    void bootstrap_if_empty();  // 首次 init：.gitignore + initial commit
};

}  // namespace cloudfile::storage
