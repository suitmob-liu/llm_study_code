#include "cloudfile/domain/wiki_link.h"

#include "cloudfile/storage/db.h"

#include <SQLiteCpp/SQLiteCpp.h>
#include <spdlog/spdlog.h>

#include <algorithm>
#include <fstream>
#include <set>
#include <sstream>
#include <string>
#include <system_error>

namespace cloudfile::domain::wiki_link {

namespace {

constexpr const char* kMdExt = ".md";

std::string_view trim(std::string_view s) {
    while (!s.empty() && (s.front() == ' ' || s.front() == '\t')) s.remove_prefix(1);
    while (!s.empty() && (s.back()  == ' ' || s.back()  == '\t')) s.remove_suffix(1);
    return s;
}

bool ends_with(std::string_view s, std::string_view suffix) {
    return s.size() >= suffix.size()
        && std::equal(suffix.rbegin(), suffix.rend(), s.rbegin());
}

bool starts_with(std::string_view s, std::string_view prefix) {
    return s.size() >= prefix.size()
        && std::equal(prefix.begin(), prefix.end(), s.begin());
}

std::string ensure_md(std::string_view name) {
    std::string out(name);
    if (!ends_with(out, kMdExt)) out += kMdExt;
    return out;
}

}  // anonymous namespace

std::vector<Parsed> parse(std::string_view content) {
    std::vector<Parsed> out;
    bool in_fence = false;

    std::size_t pos = 0;
    while (pos < content.size()) {
        std::size_t nl = content.find('\n', pos);
        std::size_t end = (nl == std::string_view::npos) ? content.size() : nl;
        std::string_view line = content.substr(pos, end - pos);
        if (!line.empty() && line.back() == '\r') line.remove_suffix(1);

        // ``` 单独成行（前后可有空白）切 fence
        std::string_view trimmed = trim(line);
        if (trimmed.size() >= 3 && trimmed.substr(0, 3) == "```") {
            in_fence = !in_fence;
        } else if (!in_fence) {
            // 扫 [[...]]
            std::size_t i = 0;
            while (i + 1 < line.size()) {
                if (line[i] == '[' && line[i + 1] == '[') {
                    auto close = line.find("]]", i + 2);
                    if (close == std::string_view::npos) break;
                    auto inner = line.substr(i + 2, close - i - 2);
                    // inner 含 [ 视为非法（避免 [[[a]]] 之类）
                    if (!inner.empty() && inner.find('[') == std::string_view::npos
                        && inner.find('\n') == std::string_view::npos) {
                        Parsed p;
                        auto bar = inner.find('|');
                        if (bar == std::string_view::npos) {
                            p.target = std::string(trim(inner));
                        } else {
                            p.target = std::string(trim(inner.substr(0, bar)));
                            p.alias  = std::string(trim(inner.substr(bar + 1)));
                        }
                        if (!p.target.empty()) out.push_back(std::move(p));
                    }
                    i = close + 2;
                } else {
                    ++i;
                }
            }
        }

        if (nl == std::string_view::npos) break;
        pos = nl + 1;
    }
    return out;
}

std::string resolve(std::string_view target,
                    std::string_view src_path,
                    const ExistsFn& exists_fn) {
    target = trim(target);
    if (target.empty()) return {};

    // 推 src_user
    std::string src_user;
    auto slash = src_path.find('/');
    if (slash != std::string_view::npos) {
        src_user.assign(src_path.substr(0, slash));
    }

    // 含 `/` → repo-relative
    if (target.find('/') != std::string_view::npos) {
        return ensure_md(target);
    }

    std::string name = ensure_md(target);

    // 优先用户自己目录
    if (!src_user.empty()) {
        std::string c1 = src_user + "/" + name;
        if (exists_fn && exists_fn(c1)) return c1;
    }
    // fallback shared/
    std::string c2 = std::string("shared/") + name;
    if (exists_fn && exists_fn(c2)) return c2;

    // 都不存在：orphan，默认归在用户目录（admin/无前缀时归 shared）
    if (!src_user.empty()) return src_user + "/" + name;
    return c2;
}

std::vector<std::string> extract_links(std::string_view content,
                                       std::string_view src_path,
                                       const ExistsFn& exists_fn) {
    auto parsed = parse(content);
    std::set<std::string> uniq;
    std::string self(src_path);
    for (auto& p : parsed) {
        auto resolved = resolve(p.target, src_path, exists_fn);
        if (resolved.empty() || resolved == self) continue;
        uniq.insert(std::move(resolved));
    }
    return std::vector<std::string>(uniq.begin(), uniq.end());
}

void index_replace(std::string_view src_path,
                   const std::vector<std::string>& dst_paths) {
    auto& db = storage::Database::instance();
    std::string src(src_path);

    SQLite::Statement del(db.raw(),
        "DELETE FROM wiki_links WHERE src_path = ?");
    del.bind(1, src);
    del.exec();

    if (dst_paths.empty()) return;

    SQLite::Statement ins(db.raw(),
        "INSERT OR IGNORE INTO wiki_links(src_path, dst_path) VALUES (?, ?)");
    for (const auto& dst : dst_paths) {
        ins.reset();
        ins.bind(1, src);
        ins.bind(2, dst);
        ins.exec();
    }
}

void index_delete_src(std::string_view src_path) {
    auto& db = storage::Database::instance();
    SQLite::Statement del(db.raw(),
        "DELETE FROM wiki_links WHERE src_path = ?");
    del.bind(1, std::string(src_path));
    del.exec();
}

std::vector<std::string> backlinks_of(std::string_view dst_path) {
    auto& db = storage::Database::instance();
    std::vector<std::string> out;
    SQLite::Statement q(db.raw(),
        "SELECT src_path FROM wiki_links WHERE dst_path = ? ORDER BY src_path");
    q.bind(1, std::string(dst_path));
    while (q.executeStep()) {
        out.push_back(q.getColumn(0).getText());
    }
    return out;
}

std::size_t rebuild_links_at(const std::filesystem::path& repo_root) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    // walk 1：收集所有 .md 路径（用于 exists 判定）
    std::set<std::string> all_paths;
    std::error_code ec;
    if (!std::filesystem::is_directory(repo_root, ec)) {
        spdlog::error("rebuild_links: repo_root not a directory: {}",
                      repo_root.string());
        return 0;
    }

    for (auto& entry : std::filesystem::recursive_directory_iterator(
             repo_root,
             std::filesystem::directory_options::skip_permission_denied, ec)) {
        if (ec) break;
        auto rel = std::filesystem::relative(entry.path(), repo_root, ec);
        if (ec) continue;
        std::string rel_str = rel.generic_string();
        if (starts_with(rel_str, ".git/") || rel_str == ".git"
            || starts_with(rel_str, ".trash/") || rel_str == ".trash") continue;
        if (!entry.is_regular_file(ec)) continue;
        if (entry.path().extension() != kMdExt) continue;
        all_paths.insert(std::move(rel_str));
    }

    auto exists_fn = [&all_paths](std::string_view p) -> bool {
        return all_paths.count(std::string(p)) > 0;
    };

    SQLite::Transaction txn(db.raw());
    db.raw().exec("DELETE FROM wiki_links");

    SQLite::Statement ins(db.raw(),
        "INSERT OR IGNORE INTO wiki_links(src_path, dst_path) VALUES (?, ?)");

    std::size_t count = 0;
    for (const auto& path : all_paths) {
        std::ifstream f(repo_root / path, std::ios::binary);
        if (!f) continue;
        std::ostringstream ss;
        ss << f.rdbuf();
        auto links = extract_links(ss.str(), path, exists_fn);
        for (const auto& dst : links) {
            ins.reset();
            ins.bind(1, path);
            ins.bind(2, dst);
            ins.exec();
        }
        ++count;
    }
    txn.commit();
    spdlog::info("rebuilt wiki_links: {} src docs", count);
    return count;
}

}  // namespace cloudfile::domain::wiki_link
