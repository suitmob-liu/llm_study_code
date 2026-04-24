#include "cloudfile/storage/repo.h"

#include <git2.h>
#include <spdlog/spdlog.h>

#include <cstring>
#include <fstream>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>

namespace cloudfile::storage {

namespace {

std::unique_ptr<Repo> g_repo;
std::mutex            g_init_mutex;
bool                  g_libgit2_inited = false;

std::string git_last_error() {
    const git_error* e = git_error_last();
    return e && e->message ? std::string(e->message) : std::string("unknown git error");
}

void check(int rc, const char* what) {
    if (rc < 0) {
        throw std::runtime_error(std::string(what) + ": " + git_last_error());
    }
}

/// RAII 包装：退出作用域自动 git_*_free
template <typename T, void (*Free)(T*)>
struct GitPtr {
    T* p = nullptr;
    ~GitPtr() { if (p) Free(p); }
    GitPtr() = default;
    GitPtr(const GitPtr&) = delete;
    GitPtr& operator=(const GitPtr&) = delete;
    T** out() { return &p; }
    T*  get() const { return p; }
    operator T*() const { return p; }
};

using Repository = GitPtr<git_repository, git_repository_free>;
using Index      = GitPtr<git_index,      git_index_free>;
using Tree       = GitPtr<git_tree,       git_tree_free>;
using Commit     = GitPtr<git_commit,     git_commit_free>;
using Signature  = GitPtr<git_signature,  git_signature_free>;
using Reference  = GitPtr<git_reference,  git_reference_free>;

/// 读 HEAD parent。返回 true 表示仓库已有 HEAD（有 parent commit）；
/// false 表示空仓库（第一个 commit 没有 parent）。
bool load_head_parent(git_repository* repo, Commit& out) {
    Reference head;
    int rc = git_repository_head(repo, head.out());
    if (rc == GIT_EUNBORNBRANCH || rc == GIT_ENOTFOUND) {
        return false;  // 空仓库
    }
    check(rc, "git_repository_head");

    const git_oid* oid = git_reference_target(head);
    if (!oid) return false;
    check(git_commit_lookup(out.out(), repo, oid), "git_commit_lookup(HEAD)");
    return true;
}

/// 核心 commit 流程：index 已被调用方改好，在这里：
///   - write_tree
///   - create commit (with HEAD parent if any)
///   - update HEAD
void write_index_and_commit(git_repository* repo, git_index* idx,
                            const git_signature* sig, const char* message) {
    git_oid tree_oid;
    check(git_index_write(idx), "git_index_write");
    check(git_index_write_tree(&tree_oid, idx), "git_index_write_tree");

    Tree tree;
    check(git_tree_lookup(tree.out(), repo, &tree_oid), "git_tree_lookup");

    Commit parent;
    bool has_parent = load_head_parent(repo, parent);

    git_oid commit_oid;
    const git_commit* parents[1] = { parent.get() };
    check(git_commit_create(
            &commit_oid, repo, "HEAD",
            sig, sig,
            "UTF-8", message,
            tree.get(),
            has_parent ? 1 : 0,
            has_parent ? parents : nullptr),
          "git_commit_create");
}

}  // anonymous namespace

Repo::Repo(std::filesystem::path root,
           std::string default_author_name,
           std::string default_author_email)
    : root_(std::move(root)),
      default_name_(std::move(default_author_name)),
      default_email_(std::move(default_author_email)) {
}

Repo& Repo::init(const std::filesystem::path& repo_path,
                 std::string author_name,
                 std::string author_email) {
    std::scoped_lock lock(g_init_mutex);

    if (!g_libgit2_inited) {
        check(git_libgit2_init(), "git_libgit2_init");
        g_libgit2_inited = true;
    }

    if (g_repo) {
        if (g_repo->root_ != repo_path) {
            throw std::logic_error("Repo::init called with different path");
        }
        return *g_repo;
    }

    std::filesystem::create_directories(repo_path);

    // open or init
    Repository r;
    int rc = git_repository_open(r.out(), repo_path.string().c_str());
    if (rc == GIT_ENOTFOUND) {
        spdlog::info("git init at {}", repo_path.string());
        git_repository_init_options opts = GIT_REPOSITORY_INIT_OPTIONS_INIT;
        opts.flags = GIT_REPOSITORY_INIT_MKPATH;
        opts.initial_head = "main";
        check(git_repository_init_ext(r.out(), repo_path.string().c_str(), &opts),
              "git_repository_init_ext");
    } else {
        check(rc, "git_repository_open");
        spdlog::info("opened existing git repo at {}", repo_path.string());
    }

    g_repo = std::unique_ptr<Repo>(new Repo(
        repo_path, std::move(author_name), std::move(author_email)));

    // bootstrap：空仓库给个 initial commit，否则第一次 commit_file 会很别扭
    g_repo->bootstrap_if_empty();
    return *g_repo;
}

Repo& Repo::instance() {
    if (!g_repo) {
        throw std::logic_error("Repo::instance() called before init()");
    }
    return *g_repo;
}

void Repo::shutdown_global() {
    std::scoped_lock lock(g_init_mutex);
    g_repo.reset();
    if (g_libgit2_inited) {
        git_libgit2_shutdown();
        g_libgit2_inited = false;
    }
}

void Repo::bootstrap_if_empty() {
    Repository r;
    check(git_repository_open(r.out(), root_.string().c_str()),
          "git_repository_open(bootstrap)");

    Commit head_parent;
    if (load_head_parent(r.get(), head_parent)) {
        return;  // 已有 commit，跳过
    }

    // 写 .gitignore（排除临时/系统文件）
    auto gitignore = root_ / ".gitignore";
    if (!std::filesystem::exists(gitignore)) {
        std::ofstream out(gitignore);
        out << "# cloudfile docs_repo\n";
        out << ".DS_Store\n";
        out << "Thumbs.db\n";
        out << "*.swp\n";
        out << "*~\n";
    }

    Index idx;
    check(git_repository_index(idx.out(), r.get()), "git_repository_index");
    check(git_index_add_bypath(idx.get(), ".gitignore"), "git_index_add_bypath(.gitignore)");

    Signature sig;
    check(git_signature_now(sig.out(), default_name_.c_str(), default_email_.c_str()),
          "git_signature_now");

    write_index_and_commit(r.get(), idx.get(), sig.get(), "chore: initial commit");
    spdlog::info("docs_repo bootstrapped with initial commit");
}

void Repo::commit_file(std::string_view rel_path,
                       std::string_view content,
                       std::string_view author_name,
                       std::string_view author_email,
                       std::string_view message) {
    // 1. 写文件到磁盘（mkdir -p 父目录）
    auto abs = root_ / std::filesystem::path(std::string(rel_path));
    std::filesystem::create_directories(abs.parent_path());
    {
        std::ofstream out(abs, std::ios::binary | std::ios::trunc);
        if (!out) {
            throw std::runtime_error("failed to open for write: " + abs.string());
        }
        out.write(content.data(), static_cast<std::streamsize>(content.size()));
        if (!out) {
            throw std::runtime_error("failed to write: " + abs.string());
        }
    }

    // 2. git add + commit
    Repository r;
    check(git_repository_open(r.out(), root_.string().c_str()),
          "git_repository_open");

    Index idx;
    check(git_repository_index(idx.out(), r.get()), "git_repository_index");

    std::string rel_str(rel_path);
    check(git_index_add_bypath(idx.get(), rel_str.c_str()), "git_index_add_bypath");

    Signature sig;
    std::string name(author_name.empty() ? default_name_ : std::string(author_name));
    std::string email(author_email.empty() ? default_email_ : std::string(author_email));
    check(git_signature_now(sig.out(), name.c_str(), email.c_str()),
          "git_signature_now");

    std::string msg(message);
    write_index_and_commit(r.get(), idx.get(), sig.get(), msg.c_str());
}

void Repo::commit_delete(std::string_view rel_path,
                         std::string_view author_name,
                         std::string_view author_email,
                         std::string_view message) {
    auto abs = root_ / std::filesystem::path(std::string(rel_path));

    // 1. 删磁盘文件（不存在也继续，让 git 判断）
    std::error_code ec;
    std::filesystem::remove(abs, ec);
    // 不 throw——git_index_remove_bypath 会告诉我们它是否存在于 index

    // 2. git rm + commit
    Repository r;
    check(git_repository_open(r.out(), root_.string().c_str()),
          "git_repository_open");

    Index idx;
    check(git_repository_index(idx.out(), r.get()), "git_repository_index");

    std::string rel_str(rel_path);
    int rc = git_index_remove_bypath(idx.get(), rel_str.c_str());
    if (rc == GIT_ENOTFOUND) {
        throw std::runtime_error("file not tracked in git: " + rel_str);
    }
    check(rc, "git_index_remove_bypath");

    Signature sig;
    std::string name(author_name.empty() ? default_name_ : std::string(author_name));
    std::string email(author_email.empty() ? default_email_ : std::string(author_email));
    check(git_signature_now(sig.out(), name.c_str(), email.c_str()),
          "git_signature_now");

    std::string msg(message);
    write_index_and_commit(r.get(), idx.get(), sig.get(), msg.c_str());
}

}  // namespace cloudfile::storage
