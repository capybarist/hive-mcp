#!/usr/bin/env node
// HIVE MCP server — exposes a HIVE queen to any MCP-aware host.
//
// Environment:
//   HIVE_QUEEN_URL  Base URL of the queen (default: the public demo queen,
//                   https://hive.capybaralabs.tech)
//   HIVE_API_KEY    Bearer token for a queen with auth enabled. Optional on a
//                   public queen: the client picks up its demo token itself.
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
import { createRequire } from 'node:module';
import { HiveClient } from './client.js';
import {
  QueryArgs,
  ListSourcesArgs,
  StatusArgs,
  handleQuery,
  handleListSources,
  handleStatus,
} from './tools.js';

const VERSION: string = createRequire(import.meta.url)('../package.json').version;
export const DEFAULT_QUEEN_URL = 'https://hive.capybaralabs.tech';
const QUEEN_URL = process.env.HIVE_QUEEN_URL || DEFAULT_QUEEN_URL;
const API_KEY = process.env.HIVE_API_KEY;

const client = new HiveClient(QUEEN_URL, API_KEY);

const server = new Server(
  { name: 'hive-mcp', version: VERSION },
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
  {
    name: 'hive_status',
    description: 'Report the HIVE queen\'s health and size: version, number of signed fragments indexed, bees and peers, embedding model, and when it last indexed a new fragment. Use it to check the queen is reachable and current before relying on it.',
    inputSchema: zodToJsonSchema(StatusArgs),
    handler: handleStatus,
  },
];

const ARG_SCHEMAS = { hive_query: QueryArgs, hive_list_sources: ListSourcesArgs, hive_status: StatusArgs } as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find((t) => t.name === req.params.name);
  if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
  const argsSchema = ARG_SCHEMAS[tool.name as keyof typeof ARG_SCHEMAS];
  const parsed = argsSchema.parse(req.params.arguments ?? {});
  return tool.handler(client, parsed as never);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Logging on a stdio MCP server MUST go to stderr — stdout is the protocol channel.
  console.error(`hive-mcp v${VERSION} connected · queen=${QUEEN_URL}${API_KEY ? ' · auth=on' : ' · auth=public demo token if offered'}`);
}

main().catch((err) => {
  console.error('hive-mcp fatal:', err);
  process.exit(1);
});
