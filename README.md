# @capybaralabs/hive-mcp

MCP server that exposes a **HIVE** queen as native tools to any MCP-aware LLM host:
Claude Desktop, Claude Code, Cursor, Continue, Goose, [OpenClaw](https://openclaw.io/), and others.

HIVE is a decentralized, verifiable knowledge base for LLMs — peer-to-peer extraction
of signed knowledge fragments, embedded vector search, optional LLM synthesis.
This package is the bridge between any MCP-aware client and a running HIVE queen.

Reference: [USE-CASES.md → case 14](https://github.com/capybarist/hive/blob/main/docs/USE-CASES.md#14--mcp-server) in the HIVE repo.

## Try it in one line

With no configuration it connects to the public demo queen at
[hive.capybaralabs.tech](https://hive.capybaralabs.tech) (~240 k signed
fragments from Wikipedia and news feeds), so you can try it before running
your own node:

```bash
claude mcp add hive -- npx -y @capybaralabs/hive-mcp
```

Then ask Claude something like *"use hive_status, then search HIVE for
retrieval-augmented generation"*.

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
| `HIVE_QUEEN_URL` | no | `https://hive.capybaralabs.tech` (public demo) | Base URL of the queen's HTTP API. Use `http://localhost:8090` for a local queen. |
| `HIVE_API_KEY` | for a private queen with auth enabled | (none) | Bearer token sent as `Authorization` header. Without it, the server uses the queen's public demo token if it publishes one (query-only). |

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
| `hive_status` | Queen health and size: version, fragments indexed, bees, peers, model, and when it last indexed a new fragment. |

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

By default it talks to the public demo queen. Set
`HIVE_QUEEN_URL=http://localhost:8090` to point it at a local queen.

## Transport

stdio only — the universal denominator across MCP hosts. A streamable-HTTP
transport (for remote multi-user queens) is the next item.

## Changelog

- **0.2.0** (2026-11): defaults to the public demo queen; picks up a queen's
  public demo token automatically when `HIVE_API_KEY` is unset; new
  `hive_status` tool; shows `rerank_score` when the queen reranks; clear error
  on 401; version read from `package.json`.
- **0.1.0** (2026-05): first release — `hive_query`, `hive_list_sources`.

## License

BUSL-1.1 — same as HIVE.
