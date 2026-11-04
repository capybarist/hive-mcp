// MCP tool definitions (USE-CASES.md case 14):
//   hive_query        — retrieve signed fragments (no queen-side LLM; the host synthesises)
//   hive_list_sources — what topics this queen actually covers
//   hive_status       — is the queen alive, how big is it, when did it last grow
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
export const StatusArgs = z.object({});

function ago(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (Number.isNaN(min)) return null;
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function formatHit(h: SearchHit, idx: number): string {
  const flag = h.relevant === false ? '·' : '*';
  const title = h.title || '(no title)';
  const url = h.url ? ` ${h.url}` : '';
  const snippet = (h.text ?? '').replace(/\s+/g, ' ').slice(0, 240);
  const rr = typeof h.rerank_score === 'number' ? ` rerank=${h.rerank_score.toFixed(3)}` : '';
  return `[${idx + 1}] ${flag} score=${h.score.toFixed(3)}${rr} · ${title}${url}\n    ${snippet}${snippet.length >= 240 ? '…' : ''}\n    id=${h.id} node=${h.node_id}`;
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

export async function handleStatus(client: HiveClient, _args: z.infer<typeof StatusArgs>) {
  const [st, stats] = await Promise.all([client.status(), client.stats().catch(() => null)]);
  const last = ago(st.last_indexed_at ?? stats?.last_indexed_at);
  const lines = [
    `HIVE ${st.mode} v${st.version} · node ${st.nodeId?.slice(0, 20) ?? '?'}`,
    `${(st.indexed ?? 0).toLocaleString('en-US')} signed fragments indexed${stats?.bees != null ? ` from ${stats.bees} bee(s)` : ''}${stats?.topics != null ? ` · ${stats.topics} declared source(s)` : ''}`,
    `${st.peers ?? 0} peer(s) connected · embedder ${st.embedder_online ? 'online' : 'offline'}${st.model ? ` (${st.model})` : ''}`,
  ];
  if (last) lines.push(`Last new fragment indexed ${last}`);
  if (client.usingDemoToken) lines.push('Auth: using this queen\'s public demo token (query-only)');
  return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
}
