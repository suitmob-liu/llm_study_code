#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace cloudfile::domain::mcp_token {

/// MCP token：长生命周期 bearer，给 cloudfile_mcp 进程认证用。
/// DB 里 token_hash 列存的是 BLAKE2b(plaintext)，明文只在 create() 返回一次。
struct McpToken {
    std::int64_t               id;
    std::string                token_hash;     // 64 hex
    std::int64_t               user_id;
    std::string                name;           // 人读标签，如 "claude-code-laptop"
    std::string                created_at;
    std::optional<std::string> last_used_at;
    std::optional<std::string> revoked_at;
};

struct CreateResult {
    McpToken    record;
    std::string plaintext_token;   // 64 hex；丢了只能 revoke 重发
};

/// 签发新 token。
CreateResult create(std::int64_t user_id, std::string_view name);

/// 校验 plaintext token：未过期未撤销时返回 token + 顺手 UPDATE last_used_at = now。
/// 调用方 = AuthFilter 每个请求一次。
std::optional<McpToken> verify(std::string_view plaintext_token);

/// 撤销（设 revoked_at = now）。幂等。返回是否本次实际改动了一行。
bool revoke_by_id(std::int64_t id);

/// 列所有 token（admin 用）。
std::vector<McpToken> list_all();

/// 列某用户的 token。
std::vector<McpToken> list_for_user(std::int64_t user_id);

/// 状态判定。
enum class Status { Active, Revoked };
Status status_of(const McpToken& t);
const char* status_name(Status s);

/// 暴露给测试。
std::string hash_token(std::string_view plaintext);

}  // namespace cloudfile::domain::mcp_token
