# @capybaralabs/hive-mcp

MCP server that exposes a **HIVE** queen as native tools to any MCP-aware LLM host:
Claude Desktop, Claude Code, Cursor, Continue, Goose, [OpenClaw](https://openclaw.io/), and others.

HIVE is a decentralized, verifiable knowledge base for LLMs — peer-to-peer extraction
of signed knowledge fragments, embedded vector search, optional LLM synthesis.
This package is the bridge between any MCP-aware client and a running HIVE queen.

Reference: [USE-CASES.md → case 14](https://github.com/capybarist/hive/blob/main/docs/USE-CASES.md#14--mcp-server) in the HIVE repo.

## Install

Use directly (no install) for the canonical setup in a Claude Desktop / Cursor MCP config:

```bash
npx @capybaralabs/hive-mcp
```

Or install globally:

```bash
npm install -g @capybaralabs/hive-mcp
hive-mcp
```

## Configuration

Two environment variables:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `HIVE_QUEEN_URL` | no | `http://localhost:8090` | Base URL of the queen's HTTP API |
| `HIVE_API_KEY` | when queen auth is enabled (v0.9+) | (none) | Bearer token sent as `Authorization` header |

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) /
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "hive": {
      "command": "npx",
      "args": ["-y", "@capybaralabs/hive-mcp"],
      "env": {
        "HIVE_QUEEN_URL": "https://your-queen.example.com"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add hive npx -y @capybaralabs/hive-mcp \
  -e HIVE_QUEEN_URL=https://your-queen.example.com
```

### Cursor

`~/.cursor/mcp.json` (same JSON shape as Claude Desktop).

### OpenClaw

Discovered automatically by `mcporter` from npm — see
[docs.openclaw.ai/cli/mcp](https://docs.openclaw.ai/cli/mcp).

## Tools

| Tool | Purpose |
|---|---|
| `hive_query` | Retrieve signed knowledge fragments matching a free-text query. Returns top-k fragments with score, snippet, URL, signing bee. **No LLM synthesis** — the calling LLM (Claude/Cursor) composes the answer from the fragments. |
| `hive_list_sources` | List the bees registered on this queen and the sources each one declares. Useful for discovery. |

### Why no LLM synthesis in the MCP path?

HIVE's product is the **information** (signed fragments with provenance), not
the prose. When called from an MCP host, the host's own LLM (Claude Sonnet,
Cursor's model, etc.) is invariably stronger than any model the queen-side
might call — running fragments through a weaker LLM and then a stronger one
is redundant and loses fidelity. So `hive_query` returns raw fragments and
lets the host LLM synthesise.

The queen's `/api/query` endpoint still supports LLM synthesis (`use_llm: true`)
— it's used by the queen's own web UI, by non-MCP integrations, and by
[case 06 (Local AI · fully-offline stack)](https://github.com/capybarist/hive/blob/main/docs/USE-CASES.md#06--local-ai--fully-offline-stack).
Just not from MCP.

## Develop

```bash
git clone https://github.com/capybarist/hive-mcp
cd hive-mcp
npm install
npm run dev   # runs from src/ with tsx (no build step)
npm run build # emits dist/
```

Point at a local HIVE queen running on `http://localhost:8090` (default), or set
`HIVE_QUEEN_URL` to a remote one.

## Transport

stdio only in v0.1 — the universal denominator across MCP hosts. SSE / HTTP-streamable
transports are tracked for v0.2 (needed for remote multi-user queens).

## License

BUSL-1.1 — same as HIVE.
