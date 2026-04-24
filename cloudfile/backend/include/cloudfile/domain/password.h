#pragma once

#include <string>
#include <string_view>

namespace cloudfile::domain::password {

/// 密码最小长度（DESIGN § 关键风险 #1）
constexpr std::size_t kMinLength = 12;

/// 密码最大长度（防滥用；libsodium 对超长密码会算很久）
constexpr std::size_t kMaxLength = 1024;

/// 用 Argon2id 哈希明文密码。抛 std::runtime_error（OOM / libsodium 故障）。
///
/// 返回的字符串可直接存进 users.password_hash 列。libsodium 的 crypto_pwhash_str
/// 已经把 salt、参数、hash 都编码进同一字符串（形如 $argon2id$v=19$m=...$...）。
std::string hash(std::string_view plaintext);

/// 验证明文密码是否匹配哈希。constant-time。
/// 返回 true = 匹配。
bool verify(std::string_view plaintext, std::string_view hash_str);

/// 检查密码是否符合最低要求（长度在 [kMinLength, kMaxLength] 之间）。
/// Phase 1a-1 只做长度校验。以后可加字典攻击检测（P2）。
bool is_acceptable(std::string_view plaintext);

}  // namespace cloudfile::domain::password
