// Phase 0 占位：Phase 2 实现真正的 MCP JSON-RPC 2.0 server
//
// MCP 协议要点（spec 2025-03-26）：
// - 传输层：stdio（默认）或 HTTP
// - 格式：JSON-RPC 2.0
// - 必需方法：initialize, tools/list, tools/call
// - 工具集（见 cloudfile/DESIGN.md）：
//     list_docs, read_doc, write_doc, search_docs,
//     backlinks_of, recent_edits
// - 架构决策 1.2：写操作转发到 backend HTTP API

#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>

#include <iostream>

int main() {
    spdlog::info("cloudfile MCP server (Phase 0 stub)");
    spdlog::warn("Phase 0: MCP server not yet implemented");
    spdlog::warn("  Will be implemented in Phase 2 (Week 2)");
    return 0;
}
