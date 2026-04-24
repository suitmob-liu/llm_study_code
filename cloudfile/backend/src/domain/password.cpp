#include "cloudfile/domain/password.h"

#include <sodium.h>

#include <stdexcept>
#include <string>

namespace cloudfile::domain::password {

std::string hash(std::string_view plaintext) {
    char out[crypto_pwhash_STRBYTES];

    // OPSLIMIT_INTERACTIVE + MEMLIMIT_INTERACTIVE 是 libsodium 对普通交互式
    // 登录推荐的参数组合（大约 0.5 秒 hash，64 MB 内存）。
    // 如果以后 10 人并发同时登录嫌慢，可以降到 MODERATE，但 ≤10 人场景无所谓。
    const int rc = crypto_pwhash_str(
        out,
        plaintext.data(), plaintext.size(),
        crypto_pwhash_OPSLIMIT_INTERACTIVE,
        crypto_pwhash_MEMLIMIT_INTERACTIVE);

    if (rc != 0) {
        throw std::runtime_error("libsodium crypto_pwhash_str failed (out of memory?)");
    }
    return std::string(out);
}

bool verify(std::string_view plaintext, std::string_view hash_str) {
    // crypto_pwhash_str_verify 要求 hash 是 null-terminated。
    // string_view 不保证 null 结尾，先拷贝进 std::string。
    std::string hash_c(hash_str);
    return crypto_pwhash_str_verify(
        hash_c.c_str(),
        plaintext.data(), plaintext.size()) == 0;
}

bool is_acceptable(std::string_view plaintext) {
    return plaintext.size() >= kMinLength && plaintext.size() <= kMaxLength;
}

}  // namespace cloudfile::domain::password
