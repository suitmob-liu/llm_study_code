#pragma once

#include <chrono>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace cloudfile::domain::session {

/// Session 记录。DB 里 id 列存的是 BLAKE2b(plaintext_token)，不是明文。
/// 明文只从 create() 返回一次，写进 Set-Cookie 给客户端。
struct Session {
    std::string                id;             // token hash (64 hex)
    std::int64_t               user_id;
    std::string                expires_at;     // ISO 8601
    std::string                created_at;
    std::string                last_seen_at;
    std::optional<std::string> user_agent;
    std::optional<std::string> ip;
};

struct CreateResult {
    Session     record;
    std::string plaintext_token;    // 64 hex，给 Set-Cookie 用
};

/// 签发一个 session。DB 存 hash(token)。plaintext_token 给调用方放进 cookie。
CreateResult create(std::int64_t user_id,
                    std::optional<std::string_view> user_agent,
                    std::optional<std::string_view> ip,
                    std::chrono::seconds lifetime = std::chrono::hours(24 * 30));

/// 按明文 token 查。自动过滤过期 session（expires_at <= now 视为找不到）。
/// 找到时顺便 UPDATE last_seen_at = now。
std::optional<Session> find_active_and_touch(std::string_view plaintext_token);

/// 删除（登出）。幂等，不存在返回 false。
bool delete_by_token(std::string_view plaintext_token);

/// 用户改密或被删时调。返回删了几条。
int delete_all_for_user(std::int64_t user_id);

/// 清理过期 session（后台任务可定期调；Phase 1a-2b 暂不自动跑）
int delete_expired();

/// 明文 token → id (hash)。导出仅为了测试或手动调试。
std::string hash_token(std::string_view plaintext_token);

}  // namespace cloudfile::domain::session
