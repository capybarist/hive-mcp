// HTTP client to a HIVE queen. Thin wrapper around fetch — no extra deps, no
// retries, no streaming. The MCP host (Claude Desktop, Cursor, …) re-invokes
// the tool if it wants to retry; we do not paper over transient failures.
//
// All endpoints accept JSON; the queen does not require auth today, but the
// v0.9 `HIVE_API_KEY` direction is wired in so adding it later is a config
// change, not a code change. See USE-CASES.md → "Recurring properties · v0.9".

export interface SearchFilters {
  lang?: string;
  source_type?: string;
  node_id?: string;
  status?: string;
}

export interface SearchHit {
  id: string;
  score: number;
  text: string;
  title: string;
  url: string;
  source: string;
  source_type: string;
  lang: string;
  node_id: string;
  relevant?: boolean;
}

export interface QueryResponse {
  fragments: SearchHit[];
  has_hive_data: boolean;
  embedder_online: boolean;
  mode: string;
  answer?: string;
}

export interface DeclaredSource {
  id: string;
  scope: unknown;
  policy?: string;
  partition?: string;
}

export interface BeeManifestSummary {
  bee_id: string;
  declared_sources: DeclaredSource[];
  declared_languages?: string[];
  replication?: string;
  version?: string;
  embedding_model?: string;
  schema_version?: number;
}

export interface DirectoryResponse {
  bees: BeeManifestSummary[];
}

export interface StatusResponse {
  api: string;
  version: string;
  mode: string;
  nodeId: string;
  indexed: number;
  embedder_online: boolean;
  model?: string;
  backend?: string;
  llm_ok?: boolean;
  llm_provider?: string;
  peers?: number;
}

export class HiveClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const url = new URL(path, this.baseUrl).toString();
    const res = await fetch(url, { ...init, headers: { ...this.headers(), ...(init?.headers ?? {}) } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HIVE ${res.status} ${res.statusText} (${url}): ${body.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  status(): Promise<StatusResponse> {
    return this.req<StatusResponse>('/api/status');
  }

  query(question: string, opts: { top_k?: number; use_llm?: boolean; filters?: SearchFilters } = {}): Promise<QueryResponse> {
    return this.req<QueryResponse>('/api/query', {
      method: 'POST',
      body: JSON.stringify({
        question,
        top_k: opts.top_k ?? 8,
        use_llm: opts.use_llm ?? true,
        filters: opts.filters,
      }),
    });
  }

  directory(): Promise<DirectoryResponse> {
    return this.req<DirectoryResponse>('/api/directory');
  }
}
