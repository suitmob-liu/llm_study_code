#include "sqlite3.h"
#include "sha256.h"
#include <iostream>
#include <string>
#include <cstring>
#include <filesystem>

namespace fs = std::filesystem;

static void usage(const char* prog) {
    std::cerr << "Usage:\n"
              << "  " << prog << " add <username> <password>\n"
              << "  " << prog << " delete <username>\n"
              << "  " << prog << " passwd <username> <new_password>\n"
              << "  " << prog << " list\n"
              << "\nOptions:\n"
              << "  -d DIR    Data directory (default: data)\n";
}

int main(int argc, char* argv[]) {
    std::string data_dir = "data";

    // Parse -d option
    int arg_start = 1;
    for (int i = 1; i < argc - 1; i++) {
        if (std::string(argv[i]) == "-d") {
            data_dir = argv[i + 1];
            arg_start = i + 2;
            // Shift remaining args
            int shift = 2;
            for (int j = i; j + shift < argc; j++) argv[j] = argv[j + shift];
            argc -= shift;
            break;
        }
    }

    if (argc < 2) { usage(argv[0]); return 1; }

    fs::create_directories(data_dir);
    std::string db_path = data_dir + "/notes.db";

    sqlite3* db;
    if (sqlite3_open(db_path.c_str(), &db) != SQLITE_OK) {
        std::cerr << "Failed to open database: " << db_path << std::endl;
        return 1;
    }

    sqlite3_exec(db, R"(
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    )", nullptr, nullptr, nullptr);

    std::string cmd = argv[1];

    if (cmd == "add" && argc >= 4) {
        std::string username = argv[2];
        std::string password = argv[3];
        std::string salt = generate_salt();
        std::string hash = sha256_hash(salt + password);

        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db,
            "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
            -1, &stmt, nullptr);
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 3, salt.c_str(), -1, SQLITE_TRANSIENT);

        if (sqlite3_step(stmt) == SQLITE_DONE) {
            std::cout << "User '" << username << "' added successfully." << std::endl;
        } else {
            std::cerr << "Failed to add user (username may already exist)." << std::endl;
        }
        sqlite3_finalize(stmt);

    } else if (cmd == "delete" && argc >= 3) {
        std::string username = argv[2];

        // Delete user's notes first
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db,
            "DELETE FROM notes WHERE user_id = (SELECT id FROM users WHERE username = ?)",
            -1, &stmt, nullptr);
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);

        sqlite3_prepare_v2(db, "DELETE FROM users WHERE username = ?", -1, &stmt, nullptr);
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        if (sqlite3_changes(db) > 0) {
            std::cout << "User '" << username << "' and their notes deleted." << std::endl;
        } else {
            std::cerr << "User not found." << std::endl;
        }
        sqlite3_finalize(stmt);

    } else if (cmd == "passwd" && argc >= 4) {
        std::string username = argv[2];
        std::string password = argv[3];
        std::string salt = generate_salt();
        std::string hash = sha256_hash(salt + password);

        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db,
            "UPDATE users SET password_hash = ?, salt = ? WHERE username = ?",
            -1, &stmt, nullptr);
        sqlite3_bind_text(stmt, 1, hash.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, salt.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 3, username.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        if (sqlite3_changes(db) > 0) {
            std::cout << "Password updated for '" << username << "'." << std::endl;
        } else {
            std::cerr << "User not found." << std::endl;
        }
        sqlite3_finalize(stmt);

    } else if (cmd == "list") {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db, "SELECT id, username, created_at FROM users ORDER BY id",
                           -1, &stmt, nullptr);
        std::cout << "ID\tUsername\t\tCreated At" << std::endl;
        std::cout << "---\t--------\t\t----------" << std::endl;
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            std::cout << sqlite3_column_int(stmt, 0) << "\t"
                      << reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1)) << "\t\t"
                      << reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2)) << std::endl;
        }
        sqlite3_finalize(stmt);

    } else {
        usage(argv[0]);
        sqlite3_close(db);
        return 1;
    }

    sqlite3_close(db);
    return 0;
}
