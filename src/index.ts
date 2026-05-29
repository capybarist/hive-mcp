#!/usr/bin/env node
// HIVE MCP server — exposes a HIVE queen to any MCP-aware host.
//
// Environment:
//   HIVE_QUEEN_URL  Base URL of the queen (default: http://localhost:8090)
//   HIVE_API_KEY    Bearer token (optional today, required when queens enable
//                   the v0.9 auth path — see USE-CASES.md "Recurring properties").
//
// Transport: stdio (universal — Claude Desktop, Claude Code, Cursor, OpenClaw).
// SSE / HTTP-streamable transports are tracked for a follow-up release.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { HiveClient } from './client.js';
import {
  QueryArgs,
  ListSourcesArgs,
  handleQuery,
  handleListSources,
} from './tools.js';

const QUEEN_URL = process.env.HIVE_QUEEN_URL ?? 'http://localhost:8090';
const API_KEY = process.env.HIVE_API_KEY;

const client = new HiveClient(QUEEN_URL, API_KEY);

const server = new Server(
  { name: 'hive-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

const tools = [
  {
    name: 'hive_query',
    description: 'Retrieve signed knowledge fragments from a HIVE queen matching a free-text query. Returns the top-k fragments ranked by vector similarity, each with score, text snippet, URL, signing bee, and a relevance flag (* = passed retrieval gate, · = below gate threshold). HIVE does NOT synthesise — you (the calling LLM) compose the answer from the fragments. Cite by fragment id + URL; admit absence rather than fabricate when fragments are weak or empty.',
    inputSchema: zodToJsonSchema(QueryArgs),
    handler: handleQuery,
  },
  {
    name: 'hive_list_sources',
    description: 'List the bees registered on this HIVE queen and the sources each one declares (Wikipedia, arXiv, RSS feeds, custom adapters, …). Use this to discover what topics the queen covers before issuing queries.',
    inputSchema: zodToJsonSchema(ListSourcesArgs),
    handler: handleListSources,
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find((t) => t.name === req.params.name);
  if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
  const argsSchema = tool.name === 'hive_query' ? QueryArgs : ListSourcesArgs;
  const parsed = argsSchema.parse(req.params.arguments ?? {});
  return tool.handler(client, parsed as never);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Logging on a stdio MCP server MUST go to stderr — stdout is the protocol channel.
  console.error(`hive-mcp v0.1.0 connected · queen=${QUEEN_URL}${API_KEY ? ' · auth=on' : ''}`);
}

main().catch((err) => {
  console.error('hive-mcp fatal:', err);
  process.exit(1);
});
