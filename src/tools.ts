// MCP tool definitions. Three tools cover the MVP (USE-CASES.md case 14):
//   hive_query        — RAG with LLM synthesis (the primary call)
//   hive_search       — raw vector search without LLM (for "browse"-style use)
//   hive_list_sources — what topics this queen actually covers
//
// Each handler returns the MCP CallToolResult shape: { content: [{ type: 'text', text: ... }] }.
// We format text-for-LLM (concise, scannable, no JSON wall) rather than dumping
// raw API responses — the LLM is the consumer, so the output is tuned for it.

import { z } from 'zod';
import type { HiveClient, SearchHit } from './client.js';

const FilterShape = z.object({
  lang: z.string().optional(),
  source_type: z.string().optional(),
  node_id: z.string().optional(),
  status: z.string().optional(),
}).partial();

export const QueryArgs = z.object({
  question: z.string().min(1).describe('Free-text question or query. Vector search retrieves the most relevant signed fragments from HIVE; the calling LLM (you) does the synthesis from the returned fragments.'),
  top_k: z.number().int().min(1).max(50).optional().describe('Maximum number of fragments to return (default 8).'),
  filters: FilterShape.optional().describe('Optional filters on the returned fragments (lang, source_type, node_id, status).'),
});

export const ListSourcesArgs = z.object({});

function formatHit(h: SearchHit, idx: number): string {
  const flag = h.relevant === false ? '·' : '*';
  const title = h.title || '(no title)';
  const url = h.url ? ` ${h.url}` : '';
  const snippet = (h.text ?? '').replace(/\s+/g, ' ').slice(0, 240);
  return `[${idx + 1}] ${flag} score=${h.score.toFixed(3)} · ${title}${url}\n    ${snippet}${snippet.length >= 240 ? '…' : ''}\n    id=${h.id} node=${h.node_id}`;
}

export async function handleQuery(client: HiveClient, args: z.infer<typeof QueryArgs>) {
  // use_llm=false hard-coded: HIVE returns raw fragments; the MCP host's LLM
  // (Claude / Cursor / etc.) does the synthesis. HIVE's queen-side LLM is for
  // queen UI / non-MCP integrations where the consumer has no LLM of its own.
  const res = await client.query(args.question, { top_k: args.top_k, use_llm: false, filters: args.filters });
  if (!res.fragments?.length) {
    return { content: [{ type: 'text' as const, text: `HIVE has no relevant fragments for "${args.question}".` }] };
  }
  return {
    content: [{
      type: 'text' as const,
      text: `${res.fragments.length} fragment(s) for "${args.question}":\n\n${res.fragments.map(formatHit).join('\n\n')}`,
    }],
  };
}

export async function handleListSources(client: HiveClient, _args: z.infer<typeof ListSourcesArgs>) {
  const dir = await client.directory();
  if (!dir.bees?.length) {
    return { content: [{ type: 'text' as const, text: 'No bees registered on this queen yet.' }] };
  }
  const lines = dir.bees.map((b) => {
    const srcs = b.declared_sources.map((s) => s.id).join(', ') || '(none)';
    const langs = (b.declared_languages ?? []).join(',') || '?';
    return `- ${b.bee_id.slice(0, 16)} · sources: ${srcs} · langs: ${langs}`;
  });
  return {
    content: [{
      type: 'text' as const,
      text: `${dir.bees.length} bee(s) on this queen:\n${lines.join('\n')}`,
    }],
  };
}
