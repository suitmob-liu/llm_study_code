#include "httplib.h"
#include "sqlite3.h"
#include "sha256.h"

#include <string>
#include <unordered_map>
#include <mutex>
#include <random>
#include <chrono>
#include <sstream>
#include <iostream>
#include <cstdint>
#include <csignal>
#include <filesystem>

namespace fs = std::filesystem;

constexpr int64_t MAX_STORAGE = 1LL * 1024 * 1024 * 1024;
constexpr int SESSION_EXPIRY_SECONDS = 7 * 24 * 3600;

// ==================== JSON Helpers ====================

static std::string json_escape(const std::string& s) {
    std::string r;
    r.reserve(s.size() + 16);
    for (char c : s) {
        switch (c) {
            case '"':  r += "\\\""; break;
            case '\\': r += "\\\\"; break;
            case '\n': r += "\\n";  break;
            case '\r': r += "\\r";  break;
            case '\t': r += "\\t";  break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char buf[8];
                    snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned char>(c));
                    r += buf;
                } else {
                    r += c;
                }
        }
    }
    return r;
}

static std::string json_get_string(const std::string& json, const std::string& key) {
    size_t i = 0;
    while (i < json.size() && json[i] != '{') i++;
    if (++i >= json.size()) return "";
    while (i < json.size()) {
        while (i < json.size() && (json[i] <= ' ' || json[i] == ',')) i++;
        if (i >= json.size() || json[i] == '}') break;
        if (json[i] != '"') break;
        i++;
        std::string k;
        while (i < json.size() && json[i] != '"') {
            if (json[i] == '\\' && i + 1 < json.size()) { i++; k += json[i]; }
            else k += json[i];
            i++;
        }
        if (++i >= json.size()) return "";
        while (i < json.size() && json[i] != ':') i++;
        if (++i >= json.size()) return "";
        while (i < json.size() && json[i] <= ' ') i++;
        if (i < json.size() && json[i] == '"') {
            i++;
            std::string val;
            while (i < json.size() && json[i] != '"') {
                if (json[i] == '\\' && i + 1 < json.size()) {
                    i++;
                    switch (json[i]) {
                        case 'n': val += '\n'; break;
                        case 'r': val += '\r'; break;
                        case 't': val += '\t'; break;
                        default:  val += json[i]; break;
                    }
                } else { val += json[i]; }
                i++;
            }
            if (i < json.size()) i++;
            if (k == key) return val;
        } else {
            // Extract non-string value as string for matching key
            size_t vstart = i;
            int depth = 0; bool in_str = false;
            while (i < json.size()) {
                if (in_str) {
                    if (json[i] == '\\') i++;
                    else if (json[i] == '"') in_str = false;
                } else {
                    if (json[i] == '"') in_str = true;
                    else if (json[i] == '{' || json[i] == '[') depth++;
                    else if (json[i] == '}' || json[i] == ']') { if (depth == 0) break; depth--; }
                    else if (depth == 0 && json[i] == ',') break;
                }
                i++;
            }
            if (k == key) {
                std::string val = json.substr(vstart, i - vstart);
                // Trim whitespace
                while (!val.empty() && val.back() <= ' ') val.pop_back();
                if (val == "null") return "";
                return val;
            }
        }
    }
    return "";
}

static int json_get_int(const std::string& json, const std::string& key, int def = 0) {
    std::string v = json_get_string(json, key);
    if (v.empty()) return def;
    try { return std::stoi(v); } catch (...) { return def; }
}

// ==================== Token Generation ====================

static std::string generate_token(size_t len = 32) {
    static std::random_device rd;
    static std::mt19937 gen(rd());
    static const char chars[] = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    std::uniform_int_distribution<> dis(0, sizeof(chars) - 2);
    std::string token;
    token.reserve(len);
    for (size_t i = 0; i < len; i++) token += chars[dis(gen)];
    return token;
}

// ==================== Database ====================

class Database {
public:
    explicit Database(const std::string& db_path) {
        if (sqlite3_open(db_path.c_str(), &db_) != SQLITE_OK)
            throw std::runtime_error("Failed to open database: " + std::string(sqlite3_errmsg(db_)));
        exec("PRAGMA journal_mode=WAL;");
        exec("PRAGMA foreign_keys=ON;");
        exec(R"(CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL, salt TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP);)");
        exec(R"(CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);)");
        exec(R"(CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
            name TEXT NOT NULL, sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);)");
        // Migration: add columns if missing (safe to call multiple times)
        sqlite3_exec(db_, "ALTER TABLE notes ADD COLUMN folder_id INTEGER DEFAULT NULL", nullptr, nullptr, nullptr);
        sqlite3_exec(db_, "ALTER TABLE notes ADD COLUMN note_type TEXT DEFAULT 'text'", nullptr, nullptr, nullptr);
    }

    ~Database() { if (db_) sqlite3_close(db_); }

    // ---- Auth ----
    bool verify_user(const std::string& username, const std::string& password) {
        std::lock_guard<std::mutex> lock(mtx_);
        sqlite3_stmt* stmt;
        if (sqlite3_prepare_v2(db_, "SELECT password_hash, salt FROM users WHERE username=?",
                               -1, &stmt, nullptr) != SQLITE_OK) return false;
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
        bool ok = false;
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            auto stored = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
            auto salt   = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
            ok = (sha256_hash(std::string(salt) + password) == std::string(stored));
        }
        sqlite3_finalize(stmt);
        return ok;
    }

    int get_user_id(const std::string& username) {
        std::lock_guard<std::mutex> lock(mtx_);
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "SELECT id FROM users WHERE username=?", -1, &stmt, nullptr);
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
        int id = -1;
        if (sqlite3_step(stmt) == SQLITE_ROW) id = sqlite3_column_int(stmt, 0);
        sqlite3_finalize(stmt);
        return id;
    }

    // ---- Folders ----
    std::string get_folders_json(int user_id) {
        std::lock_guard<std::mutex> lock(mtx_);
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "SELECT f.id, f.name, f.sort_order, "
            "(SELECT COUNT(*) FROM notes WHERE folder_id=f.id AND user_id=?) "
            "FROM folders f WHERE f.user_id=? ORDER BY f.sort_order, f.name",
            -1, &stmt, nullptr);
        sqlite3_bind_int(stmt, 1, user_id);
        sqlite3_bind_int(stmt, 2, user_id);
        std::ostringstream oss;
        oss << "[";
        bool first = true;
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            if (!first) oss << ",";
            first = false;
            oss << "{\"id\":" << sqlite3_column_int(stmt, 0)
                << ",\"name\":\"" << json_escape(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1))) << "\""
                << ",\"sort_order\":" << sqlite3_column_int(stmt, 2)
                << ",\"count\":" << sqlite3_column_int(stmt, 3) << "}";
        }
        oss << "]";
        sqlite3_finalize(stmt);
        return oss.str();
    }

    int create_folder(int user_id, const std::string& name) {
        std::lock_guard<std::mutex> lock(mtx_);
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "INSERT INTO folders (user_id, name) VALUES (?,?)", -1, &stmt, nullptr);
        sqlite3_bind_int(stmt, 1, user_id);
        sqlite3_bind_text(stmt, 2, name.c_str(), -1, SQLITE_TRANSIENT);
        int id = -1;
        if (sqlite3_step(stmt) == SQLITE_DONE) id = static_cast<int>(sqlite3_last_insert_rowid(db_));
        sqlite3_finalize(stmt);
        return id;
    }

    bool rename_folder(int folder_id, int user_id, const std::string& name) {
        std::lock_guard<std::mutex> lock(mtx_);
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "UPDATE folders SET name=? WHERE id=? AND user_id=?", -1, &stmt, nullptr);
        sqlite3_bind_text(stmt, 1, name.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int(stmt, 2, folder_id);
        sqlite3_bind_int(stmt, 3, user_id);
        bool ok = (sqlite3_step(stmt) == SQLITE_DONE && sqlite3_changes(db_) > 0);
        sqlite3_finalize(stmt);
        return ok;
    }

    bool delete_folder(int folder_id, int user_id) {
        std::lock_guard<std::mutex> lock(mtx_);
        // Move notes to unfiled
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "UPDATE notes SET folder_id=NULL WHERE folder_id=? AND user_id=?", -1, &stmt, nullptr);
        sqlite3_bind_int(stmt, 1, folder_id);
        sqlite3_bind_int(stmt, 2, user_id);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        // Delete folder
        sqlite3_prepare_v2(db_, "DELETE FROM folders WHERE id=? AND user_id=?", -1, &stmt, nullptr);
        sqlite3_bind_int(stmt, 1, folder_id);
        sqlite3_bind_int(stmt, 2, user_id);
        bool ok = (sqlite3_step(stmt) == SQLITE_DONE && sqlite3_changes(db_) > 0);
        sqlite3_finalize(stmt);
        return ok;
    }

    // ---- Notes ----
    std::string get_notes_json(int user_id) {
        std::lock_guard<std::mutex> lock(mtx_);
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "SELECT id, title, substr(content,1,100), created_at, updated_at, folder_id, note_type "
            "FROM notes WHERE user_id=? ORDER BY updated_at DESC",
            -1, &stmt, nullptr);
        sqlite3_bind_int(stmt, 1, user_id);
        std::ostringstream oss;
        oss << "[";
        bool first = true;
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            if (!first) oss << ",";
            first = false;
            oss << "{\"id\":" << sqlite3_column_int(stmt, 0)
                << ",\"title\":\"" << json_escape(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1))) << "\""
                << ",\"preview\":\"" << json_escape(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2))) << "\""
                << ",\"created_at\":\"" << reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3)) << "\""
                << ",\"updated_at\":\"" << reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4)) << "\"";
            if (sqlite3_column_type(stmt, 5) == SQLITE_NULL) oss << ",\"folder_id\":null";
            else oss << ",\"folder_id\":" << sqlite3_column_int(stmt, 5);
            auto nt = sqlite3_column_text(stmt, 6);
            oss << ",\"note_type\":\"" << (nt ? reinterpret_cast<const char*>(nt) : "text") << "\"}";
        }
        oss << "]";
        sqlite3_finalize(stmt);
        return oss.str();
    }

    std::string get_note_json(int note_id, int user_id) {
        std::lock_guard<std::mutex> lock(mtx_);
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "SELECT id, title, content, created_at, updated_at, folder_id, note_type "
            "FROM notes WHERE id=? AND user_id=?", -1, &stmt, nullptr);
        sqlite3_bind_int(stmt, 1, note_id);
        sqlite3_bind_int(stmt, 2, user_id);
        std::string result;
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            std::ostringstream oss;
            oss << "{\"id\":" << sqlite3_column_int(stmt, 0)
                << ",\"title\":\"" << json_escape(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1))) << "\""
                << ",\"content\":\"" << json_escape(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2))) << "\""
                << ",\"created_at\":\"" << reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3)) << "\""
                << ",\"updated_at\":\"" << reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4)) << "\"";
            if (sqlite3_column_type(stmt, 5) == SQLITE_NULL) oss << ",\"folder_id\":null";
            else oss << ",\"folder_id\":" << sqlite3_column_int(stmt, 5);
            auto nt = sqlite3_column_text(stmt, 6);
            oss << ",\"note_type\":\"" << (nt ? reinterpret_cast<const char*>(nt) : "text") << "\"}";
            result = oss.str();
        }
        sqlite3_finalize(stmt);
        return result;
    }

    int create_note(int user_id, const std::string& title, const std::string& content,
                    int folder_id, const std::string& note_type) {
        std::lock_guard<std::mutex> lock(mtx_);
        if (storage_used_nolock() + static_cast<int64_t>(content.size() + title.size()) > MAX_STORAGE)
            return -1;
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "INSERT INTO notes (user_id, title, content, folder_id, note_type) VALUES (?,?,?,?,?)",
            -1, &stmt, nullptr);
        sqlite3_bind_int(stmt, 1, user_id);
        sqlite3_bind_text(stmt, 2, title.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 3, content.c_str(), -1, SQLITE_TRANSIENT);
        if (folder_id > 0) sqlite3_bind_int(stmt, 4, folder_id);
        else sqlite3_bind_null(stmt, 4);
        sqlite3_bind_text(stmt, 5, note_type.c_str(), -1, SQLITE_TRANSIENT);
        int id = -1;
        if (sqlite3_step(stmt) == SQLITE_DONE) id = static_cast<int>(sqlite3_last_insert_rowid(db_));
        sqlite3_finalize(stmt);
        return id;
    }

    bool update_note(int note_id, int user_id, const std::string& title, const std::string& content) {
        std::lock_guard<std::mutex> lock(mtx_);
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "SELECT LENGTH(content)+LENGTH(title) FROM notes WHERE id=? AND user_id=?",
                           -1, &stmt, nullptr);
        sqlite3_bind_int(stmt, 1, note_id);
        sqlite3_bind_int(stmt, 2, user_id);
        int64_t old_size = 0;
        bool found = (sqlite3_step(stmt) == SQLITE_ROW);
        if (found) old_size = sqlite3_column_int64(stmt, 0);
        sqlite3_finalize(stmt);
        if (!found) return false;
        if (storage_used_nolock() - old_size + static_cast<int64_t>(content.size() + title.size()) > MAX_STORAGE)
            return false;
        sqlite3_prepare_v2(db_,
            "UPDATE notes SET title=?, content=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?",
            -1, &stmt, nullptr);
        sqlite3_bind_text(stmt, 1, title.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, content.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int(stmt, 3, note_id);
        sqlite3_bind_int(stmt, 4, user_id);
        bool ok = (sqlite3_step(stmt) == SQLITE_DONE && sqlite3_changes(db_) > 0);
        sqlite3_finalize(stmt);
        return ok;
    }

    bool move_note(int note_id, int user_id, int folder_id) {
        std::lock_guard<std::mutex> lock(mtx_);
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "UPDATE notes SET folder_id=? WHERE id=? AND user_id=?", -1, &stmt, nullptr);
        if (folder_id > 0) sqlite3_bind_int(stmt, 1, folder_id);
        else sqlite3_bind_null(stmt, 1);
        sqlite3_bind_int(stmt, 2, note_id);
        sqlite3_bind_int(stmt, 3, user_id);
        bool ok = (sqlite3_step(stmt) == SQLITE_DONE && sqlite3_changes(db_) > 0);
        sqlite3_finalize(stmt);
        return ok;
    }

    bool delete_note(int note_id, int user_id) {
        std::lock_guard<std::mutex> lock(mtx_);
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "DELETE FROM notes WHERE id=? AND user_id=?", -1, &stmt, nullptr);
        sqlite3_bind_int(stmt, 1, note_id);
        sqlite3_bind_int(stmt, 2, user_id);
        bool ok = (sqlite3_step(stmt) == SQLITE_DONE && sqlite3_changes(db_) > 0);
        sqlite3_finalize(stmt);
        return ok;
    }

    int64_t get_storage_used() {
        std::lock_guard<std::mutex> lock(mtx_);
        return storage_used_nolock();
    }

private:
    sqlite3* db_ = nullptr;
    std::mutex mtx_;
    void exec(const char* sql) {
        char* err = nullptr;
        sqlite3_exec(db_, sql, nullptr, nullptr, &err);
        if (err) { std::string m = err; sqlite3_free(err); throw std::runtime_error("SQL: " + m); }
    }
    int64_t storage_used_nolock() {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "SELECT COALESCE(SUM(LENGTH(content)+LENGTH(title)),0) FROM notes",
                           -1, &stmt, nullptr);
        int64_t u = 0;
        if (sqlite3_step(stmt) == SQLITE_ROW) u = sqlite3_column_int64(stmt, 0);
        sqlite3_finalize(stmt);
        return u;
    }
};

// ==================== Session Manager ====================

struct Session { std::string username; int user_id; std::chrono::steady_clock::time_point expires; };

class SessionManager {
public:
    std::string create(const std::string& username, int user_id) {
        std::lock_guard<std::mutex> lock(mtx_);
        cleanup_expired();
        std::string token = generate_token();
        sessions_[token] = {username, user_id,
            std::chrono::steady_clock::now() + std::chrono::seconds(SESSION_EXPIRY_SECONDS)};
        return token;
    }
    const Session* get(const std::string& token) {
        std::lock_guard<std::mutex> lock(mtx_);
        auto it = sessions_.find(token);
        if (it == sessions_.end()) return nullptr;
        if (std::chrono::steady_clock::now() > it->second.expires) { sessions_.erase(it); return nullptr; }
        return &it->second;
    }
    void remove(const std::string& token) { std::lock_guard<std::mutex> lock(mtx_); sessions_.erase(token); }
private:
    std::unordered_map<std::string, Session> sessions_;
    std::mutex mtx_;
    void cleanup_expired() {
        auto now = std::chrono::steady_clock::now();
        for (auto it = sessions_.begin(); it != sessions_.end();)
            if (now > it->second.expires) it = sessions_.erase(it); else ++it;
    }
};

// ==================== Helpers ====================

static std::string extract_cookie(const std::string& cookies, const std::string& name) {
    std::string prefix = name + "=";
    size_t pos = cookies.find(prefix);
    if (pos == std::string::npos) return "";
    size_t start = pos + prefix.size();
    size_t end = cookies.find(';', start);
    return (end == std::string::npos) ? cookies.substr(start) : cookies.substr(start, end - start);
}

static httplib::Server* g_svr = nullptr;
static void signal_handler(int) { if (g_svr) g_svr->stop(); }

// ==================== Main ====================

int main(int argc, char* argv[]) {
    int port = 8080;
    std::string data_dir = "data", static_dir = "static";
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "-p" && i+1 < argc) port = std::stoi(argv[++i]);
        else if (arg == "-d" && i+1 < argc) data_dir = argv[++i];
        else if (arg == "-s" && i+1 < argc) static_dir = argv[++i];
        else if (arg == "-h" || arg == "--help") {
            std::cout << "Usage: " << argv[0] << " [-p PORT] [-d DATA_DIR] [-s STATIC_DIR]\n"; return 0;
        }
    }
    fs::create_directories(data_dir);
    Database db(data_dir + "/notes.db");
    SessionManager sessions;
    httplib::Server svr;
    g_svr = &svr;
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    auto get_session = [&](const httplib::Request& req) -> const Session* {
        auto it = req.headers.find("Cookie");
        if (it == req.headers.end()) return nullptr;
        std::string token = extract_cookie(it->second, "session");
        return token.empty() ? nullptr : sessions.get(token);
    };
    auto require_auth = [&](const httplib::Request& req, httplib::Response& res) -> const Session* {
        auto s = get_session(req);
        if (!s) { res.status = 401; res.set_content(R"({"error":"unauthorized"})", "application/json"); }
        return s;
    };

    // ---- Auth ----
    svr.Post("/api/login", [&](const httplib::Request& req, httplib::Response& res) {
        auto u = json_get_string(req.body, "username"), p = json_get_string(req.body, "password");
        if (u.empty() || p.empty()) { res.status = 400; res.set_content(R"({"error":"missing"})", "application/json"); return; }
        if (!db.verify_user(u, p)) { res.status = 401; res.set_content(R"({"error":"invalid"})", "application/json"); return; }
        int uid = db.get_user_id(u);
        std::string token = sessions.create(u, uid);
        res.set_header("Set-Cookie", "session=" + token + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + std::to_string(SESSION_EXPIRY_SECONDS));
        res.set_content("{\"ok\":true,\"username\":\"" + json_escape(u) + "\"}", "application/json");
    });
    svr.Post("/api/logout", [&](const httplib::Request& req, httplib::Response& res) {
        auto it = req.headers.find("Cookie");
        if (it != req.headers.end()) { auto t = extract_cookie(it->second, "session"); if (!t.empty()) sessions.remove(t); }
        res.set_header("Set-Cookie", "session=; Path=/; HttpOnly; Max-Age=0");
        res.set_content(R"({"ok":true})", "application/json");
    });
    svr.Get("/api/check", [&](const httplib::Request& req, httplib::Response& res) {
        auto s = get_session(req);
        if (s) res.set_content("{\"ok\":true,\"username\":\"" + json_escape(s->username) + "\"}", "application/json");
        else { res.status = 401; res.set_content(R"({"ok":false})", "application/json"); }
    });

    // ---- Folders ----
    svr.Get("/api/folders", [&](const httplib::Request& req, httplib::Response& res) {
        auto s = require_auth(req, res); if (!s) return;
        res.set_content("{\"folders\":" + db.get_folders_json(s->user_id) + "}", "application/json");
    });
    svr.Post("/api/folders", [&](const httplib::Request& req, httplib::Response& res) {
        auto s = require_auth(req, res); if (!s) return;
        auto name = json_get_string(req.body, "name");
        if (name.empty()) { res.status = 400; res.set_content(R"({"error":"name required"})", "application/json"); return; }
        int id = db.create_folder(s->user_id, name);
        res.set_content("{\"id\":" + std::to_string(id) + "}", "application/json");
    });
    svr.Put(R"(/api/folders/(\d+))", [&](const httplib::Request& req, httplib::Response& res) {
        auto s = require_auth(req, res); if (!s) return;
        int id = std::stoi(req.matches[1]);
        auto name = json_get_string(req.body, "name");
        if (!db.rename_folder(id, s->user_id, name)) { res.status = 404; res.set_content(R"({"error":"not found"})", "application/json"); }
        else res.set_content(R"({"ok":true})", "application/json");
    });
    svr.Delete(R"(/api/folders/(\d+))", [&](const httplib::Request& req, httplib::Response& res) {
        auto s = require_auth(req, res); if (!s) return;
        int id = std::stoi(req.matches[1]);
        if (!db.delete_folder(id, s->user_id)) { res.status = 404; res.set_content(R"({"error":"not found"})", "application/json"); }
        else res.set_content(R"({"ok":true})", "application/json");
    });

    // ---- Notes ----
    svr.Get("/api/notes", [&](const httplib::Request& req, httplib::Response& res) {
        auto s = require_auth(req, res); if (!s) return;
        res.set_content("{\"notes\":" + db.get_notes_json(s->user_id) + "}", "application/json");
    });
    svr.Get(R"(/api/notes/(\d+))", [&](const httplib::Request& req, httplib::Response& res) {
        auto s = require_auth(req, res); if (!s) return;
        auto json = db.get_note_json(std::stoi(req.matches[1]), s->user_id);
        if (json.empty()) { res.status = 404; res.set_content(R"({"error":"not found"})", "application/json"); }
        else res.set_content(json, "application/json");
    });
    svr.Post("/api/notes", [&](const httplib::Request& req, httplib::Response& res) {
        auto s = require_auth(req, res); if (!s) return;
        auto title = json_get_string(req.body, "title");
        auto content = json_get_string(req.body, "content");
        int folder_id = json_get_int(req.body, "folder_id", 0);
        auto note_type = json_get_string(req.body, "note_type");
        if (title.empty()) title = "Untitled";
        if (note_type.empty()) note_type = "text";
        int id = db.create_note(s->user_id, title, content, folder_id, note_type);
        if (id < 0) { res.status = 507; res.set_content(R"({"error":"storage limit"})", "application/json"); }
        else res.set_content("{\"id\":" + std::to_string(id) + "}", "application/json");
    });
    svr.Put(R"(/api/notes/(\d+))", [&](const httplib::Request& req, httplib::Response& res) {
        auto s = require_auth(req, res); if (!s) return;
        auto title = json_get_string(req.body, "title");
        auto content = json_get_string(req.body, "content");
        if (!db.update_note(std::stoi(req.matches[1]), s->user_id, title, content)) {
            res.status = 400; res.set_content(R"({"error":"failed"})", "application/json");
        } else res.set_content(R"({"ok":true})", "application/json");
    });
    svr.Put(R"(/api/notes/(\d+)/move)", [&](const httplib::Request& req, httplib::Response& res) {
        auto s = require_auth(req, res); if (!s) return;
        int fid = json_get_int(req.body, "folder_id", 0);
        if (!db.move_note(std::stoi(req.matches[1]), s->user_id, fid)) {
            res.status = 404; res.set_content(R"({"error":"not found"})", "application/json");
        } else res.set_content(R"({"ok":true})", "application/json");
    });
    svr.Delete(R"(/api/notes/(\d+))", [&](const httplib::Request& req, httplib::Response& res) {
        auto s = require_auth(req, res); if (!s) return;
        if (!db.delete_note(std::stoi(req.matches[1]), s->user_id)) {
            res.status = 404; res.set_content(R"({"error":"not found"})", "application/json");
        } else res.set_content(R"({"ok":true})", "application/json");
    });
    svr.Get("/api/storage", [&](const httplib::Request& req, httplib::Response& res) {
        auto s = require_auth(req, res); if (!s) return;
        int64_t used = db.get_storage_used();
        res.set_content("{\"used\":" + std::to_string(used) + ",\"limit\":" + std::to_string(MAX_STORAGE) + "}", "application/json");
    });

    svr.set_mount_point("/", static_dir);
    std::cout << "Online Note server on port " << port << " (data: " << data_dir << ")\n";
    if (!svr.listen("0.0.0.0", port)) { std::cerr << "Failed to listen\n"; return 1; }
    return 0;
}
