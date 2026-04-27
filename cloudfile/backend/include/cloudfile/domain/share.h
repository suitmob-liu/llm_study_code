#pragma once

#include <chrono>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace cloudfile::domain::share {

/// 公共分享 token：任何人凭 URL 可读一篇 md（无 cookie/bearer）。
/// DB 存 BLAKE2b(plaintext)；明文只在 create() 返回一次。
struct Token {
    std::int64_t               id;
    std::string                token_hash;     // 64 hex
    std::string                doc_path;       // 规范化的 repo-relative path
    std::int64_t               created_by;
    std::string                created_at;
    std::optional<std::string> expires_at;     // NULL = 永不过期
    std::optional<std::string> revoked_at;
};

struct CreateResult {
    Token       record;
    std::string plaintext_token;   // 64 hex
};

enum class Status { Active, Revoked, Expired };
Status status_of(const Token& t);
const char* status_name(Status s);

/// 创建 share token。lifetime=0 表示永不过期（expires_at = NULL）。
/// doc_path 必须是已规范化的 repo-relative path——controller 调之前已 normalize+check_access。
CreateResult create(std::string_view doc_path,
                    std::int64_t created_by,
                    std::chrono::seconds lifetime);

/// 校验 plaintext token：未撤销未过期才返回。
std::optional<Token> verify(std::string_view plaintext_token);

/// 撤销（设 revoked_at）。幂等。
bool revoke_by_id(std::int64_t id);

/// 列某文档的所有 share token（管理 UI 用）。
std::vector<Token> list_for_doc(std::string_view doc_path);

/// 列所有 share token（admin CLI）。
std::vector<Token> list_all();

std::string hash_token(std::string_view plaintext);

}  // namespace cloudfile::domain::share
