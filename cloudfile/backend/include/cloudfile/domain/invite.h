#pragma once

#include <chrono>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace cloudfile::domain::invite {

/// 邀请码记录。注意 DB 里只存 token 的 BLAKE2b hash，不存明文。
/// 明文 token 在 create() 返回值里一次性给出，错过就找不回了（只能 revoke 重发）。
struct Invite {
    std::int64_t                   id;
    std::string                    token_hash;    // 64 hex chars (BLAKE2b-256)
    std::int64_t                   created_by;    // users.id
    std::optional<std::string>     email_hint;    // 收件人邮箱（仅提示，不强校验）
    std::string                    expires_at;    // ISO 8601
    std::optional<std::string>     used_at;
    std::optional<std::int64_t>    used_by;
    std::optional<std::string>     revoked_at;
    std::string                    created_at;
};

/// 当前状态。revoked > used > expired > active（按严重程度）
enum class Status { Active, Used, Revoked, Expired };

Status status_of(const Invite& inv);
const char* status_name(Status s);

/// create() 的返回：DB 记录 + 一次性明文 token（给用户用的）
struct CreateResult {
    Invite      record;
    std::string plaintext_token;
};

/// 生成一条新 invite。
/// token 由 libsodium randombytes_buf 生成 32 字节随机数，hex 编码成 64 字符。
/// DB 里只存 BLAKE2b(token)。
///
/// @param created_by  签发人 user id（必须是已存在的 user）
/// @param email_hint  可选收件人邮箱
/// @param lifetime    有效期（默认 7 天）
CreateResult create(std::int64_t created_by,
                    std::optional<std::string_view> email_hint,
                    std::chrono::seconds lifetime = std::chrono::hours(24 * 7));

/// 按明文 token 查。内部会算 hash 再查 token_hash 列。找不到返回 nullopt。
/// 注意：仅查 DB，不判断 expired / used / revoked 状态——用 status_of() 另外判断。
std::optional<Invite> find_by_token(std::string_view plaintext_token);

/// 按 id 查。CLI list 后要 revoke 某一条时用。
std::optional<Invite> find_by_id(std::int64_t id);

std::vector<Invite> list_all();

/// 撤销。幂等：已 revoked 还返回 true；已 used 的也允许标记 revoked_at（记账而已）。
/// 找不到返回 false。
bool revoke_by_id(std::int64_t id);

/// Phase 1a-2b 的 HTTP register 会调：把 invite 标成已使用。
/// 仅当 status == Active 时生效，其他状态返回 false（调用方要报错）。
bool mark_used(std::string_view plaintext_token, std::int64_t user_id);

/// 内部用的 helper（导出是为了测试方便）。BLAKE2b-256, hex encoded.
std::string hash_token(std::string_view plaintext_token);

}  // namespace cloudfile::domain::invite
