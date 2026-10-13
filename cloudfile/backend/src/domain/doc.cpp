#include "cloudfile/domain/doc.h"

#include "cloudfile/domain/search.h"
#include "cloudfile/domain/wiki_link.h"
#include "cloudfile/storage/db.h"
#include "cloudfile/storage/repo.h"

#include <fmt/core.h>
#include <spdlog/spdlog.h>

#include <algorithm>
#include <chrono>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <system_error>
#include <vector>

namespace cloudfile::domain::doc {

namespace {

constexpr const char* kSharedPrefix = "shared/";
constexpr const char* kMdExt        = ".md";

bool starts_with(std::string_view s, std::string_view prefix) {
    return s.size() >= prefix.size()
        && std::equal(prefix.begin(), prefix.end(), s.begin());
}

bool ends_with(std::string_view s, std::string_view suffix) {
    return s.size() >= suffix.size()
        && std::equal(suffix.rbegin(), suffix.rend(), s.rbegin());
}

/// 把 ISO 8601 UTC 从 time_point 构造出来。
std::string iso_utc(std::filesystem::file_time_type t) {
    // file_time_type 在 C++20 有 clock_cast；为跨 libstdc++ 版本兼容，用 system_clock 近似
    auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
        t - std::filesystem::file_time_type::clock::now()
        + std::chrono::system_clock::now());
    auto tt = std::chrono::system_clock::to_time_t(sctp);
    std::tm tm{};
#ifdef _WIN32
    gmtime_s(&tm, &tt);
#else
    gmtime_r(&tt, &tm);
#endif
    std::ostringstream os;
    os << std::put_time(&tm, "%Y-%m-%dT%H:%M:%SZ");
    return os.str();
}

}  // anonymous namespace

std::optional<std::string> normalize(std::string_view rel_path) {
    if (rel_path.empty()) return std::nullopt;
    if (rel_path.front() == '/' || rel_path.front() == '\\') return std::nullopt;

    // 统一分隔符为 /
    std::string s(rel_path);
    std::replace(s.begin(), s.end(), '\\', '/');

    // 压缩多重 /，切段，拒 .. 和 .
    std::vector<std::string> segs;
    std::string cur;
    for (char c : s) {
        if (c == '/') {
            if (!cur.empty()) { segs.push_back(std::move(cur)); cur.clear(); }
        } else {
            cur.push_back(c);
        }
    }
    if (!cur.empty()) segs.push_back(std::move(cur));

    if (segs.empty()) return std::nullopt;
    for (const auto& seg : segs) {
        if (seg == "." || seg == ".." || seg.empty()) return std::nullopt;
        // 粗粒度拒绝控制字符 + NUL
        for (char ch : seg) {
            if (static_cast<unsigned char>(ch) < 0x20) return std::nullopt;
        }
    }

    // 必须 .md 结尾（Phase 1b-1 只支持 Markdown）
    if (!ends_with(segs.back(), kMdExt)) return std::nullopt;

    std::string joined;
    for (std::size_t i = 0; i < segs.size(); ++i) {
        if (i) joined.push_back('/');
        joined.append(segs[i]);
    }
    return joined;
}

bool check_access(std::string_view username, std::string_view normalized_path) {
    if (username.empty()) return false;

    // shared/xxx 所有人可读写
    if (starts_with(normalized_path, kSharedPrefix)) return true;

    // 必须在 <username>/ 下
    std::string prefix = std::string(username) + "/";
    return starts_with(normalized_path, prefix);
}

bool exists(std::string_view normalized_path) {
    auto& repo = storage::Repo::instance();
    auto abs = repo.root() / std::filesystem::path(std::string(normalized_path));
    std::error_code ec;
    return std::filesystem::is_regular_file(abs, ec);
}

std::vector<Meta> list_for_user(std::string_view username) {
    auto& repo = storage::Repo::instance();
    std::vector<Meta> out;

    auto walk = [&](const std::filesystem::path& sub) {
        auto dir = repo.root() / sub;
        std::error_code ec;
        if (!std::filesystem::is_directory(dir, ec)) return;
        for (auto& entry : std::filesystem::recursive_directory_iterator(
                 dir, std::filesystem::directory_options::skip_permission_denied, ec)) {
            if (ec) break;
            if (!entry.is_regular_file(ec)) continue;
            auto path = entry.path();
            if (path.extension() != kMdExt) continue;
            auto rel = std::filesystem::relative(path, repo.root(), ec);
            if (ec) continue;
            std::string rel_str = rel.generic_string();
            std::uint64_t sz = std::filesystem::file_size(path, ec);
            if (ec) continue;
            out.push_back(Meta{
                std::move(rel_str),
                sz,
                iso_utc(entry.last_write_time(ec))
            });
        }
    };

    walk(std::filesystem::path(std::string(username)));
    walk(std::filesystem::path("shared"));

    std::sort(out.begin(), out.end(), [](const Meta& a, const Meta& b) {
        return a.modified_at > b.modified_at;  // 最新在前
    });
    return out;
}

std::optional<std::string> read(std::string_view normalized_path) {
    auto& repo = storage::Repo::instance();
    auto abs = repo.root() / std::filesystem::path(std::string(normalized_path));
    std::error_code ec;
    if (!std::filesystem::is_regular_file(abs, ec)) return std::nullopt;

    std::ifstream in(abs, std::ios::binary);
    if (!in) return std::nullopt;
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

void write(std::string_view normalized_path,
           std::string_view content,
           std::string_view author_username,
           std::string_view author_email,
           bool is_new) {
    auto& db   = storage::Database::instance();
    auto& repo = storage::Repo::instance();

    std::scoped_lock lock(db.write_mutex());

    std::string msg = fmt::format("{}: {} (by @{})",
                                  is_new ? "create" : "edit",
                                  normalized_path,
                                  author_username);
    repo.commit_file(normalized_path, content,
                     author_username, author_email, msg);

    // FTS 索引随写更新（架构决策 1.1：SQLite 是派生索引，drift 时 rebuild-index）
    try {
        cloudfile::domain::search::index_upsert(normalized_path, content);
    } catch (const std::exception& e) {
        spdlog::warn("FTS index_upsert failed for {}: {} (run rebuild-index)",
                     normalized_path, e.what());
    }

    // wiki_links 索引随写更新（同把锁下）。exists_fn 闭包到 doc::exists——
    // 仅 read-only FS stat，不竞写锁。
    try {
        auto links = cloudfile::domain::wiki_link::extract_links(
            content, normalized_path,
            [](std::string_view p) { return exists(p); });
        cloudfile::domain::wiki_link::index_replace(normalized_path, links);
    } catch (const std::exception& e) {
        spdlog::warn("wiki_links update failed for {}: {} (run rebuild-index)",
                     normalized_path, e.what());
    }
}

bool remove(std::string_view normalized_path,
            std::string_view author_username,
            std::string_view author_email) {
    auto& db   = storage::Database::instance();
    auto& repo = storage::Repo::instance();

    std::scoped_lock lock(db.write_mutex());

    if (!exists(normalized_path)) return false;

    std::string msg = fmt::format("delete: {} (by @{})",
                                  normalized_path, author_username);
    try {
        repo.commit_delete(normalized_path, author_username, author_email, msg);
    } catch (const std::exception& e) {
        // 文件没在 index 里——理论上 exists 过了不应触发，但稳一点返回 false
        spdlog::warn("commit_delete failed for {}: {}", normalized_path, e.what());
        return false;
    }
    try {
        cloudfile::domain::search::index_delete(normalized_path);
    } catch (const std::exception& e) {
        spdlog::warn("FTS index_delete failed for {}: {} (run rebuild-index)",
                     normalized_path, e.what());
    }
    // 删本文档为源的所有 wiki link 出边。指向本文档的入边保留——
    // 它们成了 orphan，前端按设计 D7 渲染为"已删除"。
    try {
        cloudfile::domain::wiki_link::index_delete_src(normalized_path);
    } catch (const std::exception& e) {
        spdlog::warn("wiki_links delete_src failed for {}: {}",
                     normalized_path, e.what());
    }
    return true;
}

void ensure_user_dir(std::string_view username) {
    auto& repo = storage::Repo::instance();
    auto dir = repo.root() / std::filesystem::path(std::string(username));
    std::error_code ec;
    std::filesystem::create_directories(dir, ec);
    if (ec) {
        spdlog::warn("ensure_user_dir({}) failed: {}", username, ec.message());
    }
}

}  // namespace cloudfile::domain::doc
