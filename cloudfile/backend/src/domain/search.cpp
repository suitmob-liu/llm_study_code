#include "cloudfile/domain/search.h"

#include "cloudfile/storage/db.h"

#include <SQLiteCpp/SQLiteCpp.h>
#include <spdlog/spdlog.h>

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <system_error>

namespace cloudfile::domain::search {

namespace {

constexpr const char* kMdExt = ".md";

/// FTS5 phrase escape：用户输入包成 "..."，内部 " 翻倍。
/// trigram tokenizer 下，phrase 搜索会按相邻 trigram 匹配——对中文/英文都自然。
std::string fts_phrase(std::string_view q) {
    std::string out;
    out.reserve(q.size() + 4);
    out.push_back('"');
    for (char c : q) {
        if (c == '"') out += "\"\"";
        else out.push_back(c);
    }
    out.push_back('"');
    return out;
}

/// 构造 path LIKE 模式：username/% 和 shared/%，让 SQLite 按 prefix 过滤。
std::string user_path_like(std::string_view username) {
    std::string s(username);
    s += "/%";
    return s;
}

}  // anonymous namespace

std::string extract_title(std::string_view content, std::string_view fallback_path) {
    // 扫每一行，找第一个 "# heading"
    std::size_t pos = 0;
    while (pos < content.size()) {
        std::size_t nl = content.find('\n', pos);
        std::size_t end = (nl == std::string_view::npos) ? content.size() : nl;
        std::string_view line = content.substr(pos, end - pos);
        if (!line.empty() && line.back() == '\r') line.remove_suffix(1);

        if (line.size() >= 2 && line[0] == '#' && line[1] == ' ') {
            std::string_view title = line.substr(2);
            while (!title.empty() && (title.back() == ' ' || title.back() == '\t')) {
                title.remove_suffix(1);
            }
            if (!title.empty()) return std::string(title);
        }

        if (nl == std::string_view::npos) break;
        pos = nl + 1;
    }

    // fallback：basename without .md
    auto slash = fallback_path.rfind('/');
    std::string_view base = (slash == std::string_view::npos)
        ? fallback_path
        : fallback_path.substr(slash + 1);
    if (base.size() >= 3 && base.substr(base.size() - 3) == kMdExt) {
        base.remove_suffix(3);
    }
    return std::string(base);
}

void index_upsert(std::string_view path, std::string_view content) {
    auto& db = storage::Database::instance();
    // 调用方持锁

    std::string path_str(path);
    std::string title = extract_title(content, path);

    SQLite::Statement del(db.raw(), "DELETE FROM docs_fts WHERE path = ?");
    del.bind(1, path_str);
    del.exec();

    SQLite::Statement ins(db.raw(),
        "INSERT INTO docs_fts(path, title, content) VALUES (?, ?, ?)");
    ins.bind(1, path_str);
    ins.bind(2, title);
    ins.bind(3, std::string(content));
    ins.exec();
}

void index_delete(std::string_view path) {
    auto& db = storage::Database::instance();
    SQLite::Statement del(db.raw(), "DELETE FROM docs_fts WHERE path = ?");
    del.bind(1, std::string(path));
    del.exec();
}

std::vector<Hit> search(std::string_view query,
                        std::string_view username,
                        std::size_t limit) {
    std::vector<Hit> out;
    if (query.empty() || username.empty()) return out;

    auto& db = storage::Database::instance();
    std::string match_query = fts_phrase(query);
    std::string user_like = user_path_like(username);

    try {
        SQLite::Statement q(db.raw(),
            "SELECT path, title, "
            "       snippet(docs_fts, 2, '<mark>', '</mark>', '…', 16) AS snippet, "
            "       bm25(docs_fts) AS rank "
            "FROM docs_fts "
            "WHERE docs_fts MATCH ? "
            "  AND (path LIKE ? OR path LIKE 'shared/%') "
            "ORDER BY rank "
            "LIMIT ?");
        q.bind(1, match_query);
        q.bind(2, user_like);
        q.bind(3, static_cast<int>(limit));

        while (q.executeStep()) {
            Hit h;
            h.path    = q.getColumn(0).getText();
            h.title   = q.getColumn(1).getText();
            h.snippet = q.getColumn(2).getText();
            h.rank    = q.getColumn(3).getDouble();
            out.push_back(std::move(h));
        }
    } catch (const SQLite::Exception& e) {
        // FTS5 对非法 query 抛 "fts5: syntax error near ..."；返空结果
        spdlog::warn("FTS search failed for query '{}': {}", query, e.what());
        return {};
    }
    return out;
}

std::size_t rebuild_index_at(const std::filesystem::path& repo_root) {
    auto& db = storage::Database::instance();
    std::scoped_lock lock(db.write_mutex());

    SQLite::Transaction txn(db.raw());

    db.raw().exec("DELETE FROM docs_fts");

    SQLite::Statement ins(db.raw(),
        "INSERT INTO docs_fts(path, title, content) VALUES (?, ?, ?)");

    std::size_t count = 0;
    std::error_code ec;
    if (!std::filesystem::is_directory(repo_root, ec)) {
        spdlog::error("rebuild_index: repo_root not a directory: {}",
                      repo_root.string());
        return 0;
    }

    for (auto& entry : std::filesystem::recursive_directory_iterator(
             repo_root,
             std::filesystem::directory_options::skip_permission_denied, ec)) {
        if (ec) break;

        // 跳过 .git 和 .trash 目录
        auto rel = std::filesystem::relative(entry.path(), repo_root, ec);
        if (ec) continue;
        std::string rel_str = rel.generic_string();
        if (rel_str.starts_with(".git/") || rel_str == ".git"
            || rel_str.starts_with(".trash/") || rel_str == ".trash") {
            if (entry.is_directory(ec)) {
                // 我们没办法跳过整个子树（recursive_directory_iterator::disable_recursion_pending
                // 需要 non-const）。靠每条 entry 用 starts_with 过滤——
                // .git 下文件多但都不是 .md，浪费有限。
            }
            continue;
        }

        if (!entry.is_regular_file(ec)) continue;
        if (entry.path().extension() != kMdExt) continue;

        // 读文件内容
        std::ifstream f(entry.path(), std::ios::binary);
        if (!f) continue;
        std::ostringstream ss;
        ss << f.rdbuf();
        std::string content = ss.str();
        std::string title   = extract_title(content, rel_str);

        ins.reset();
        ins.bind(1, rel_str);
        ins.bind(2, title);
        ins.bind(3, content);
        ins.exec();
        ++count;
    }

    txn.commit();
    spdlog::info("rebuilt FTS index: {} docs", count);
    return count;
}

}  // namespace cloudfile::domain::search
