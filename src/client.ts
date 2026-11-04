// HTTP client to a HIVE queen. Thin wrapper around fetch — no extra deps, no
// retries, no streaming. The MCP host (Claude Desktop, Cursor, …) re-invokes
// the tool if it wants to retry; we do not paper over transient failures.
//
// Auth: a queen with HIVE_API_KEY set requires a bearer token on /api/query.
// Pass it as HIVE_API_KEY. Without one, the client asks the queen's public
// /api/public-bootstrap for its demo token (query-only since HIVE v1.4.1), so
// public queens such as https://hive.capybaralabs.tech work with no config.

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
  rerank_score?: number;
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
  last_indexed_at?: string | null;
}

export interface StatsResponse {
  mode?: string;
  version?: string;
  fragments?: number;
  bees?: number;
  topics?: number;
  peers?: number;
  last_indexed_at?: string | null;
}

export class HiveClient {
  private token: string | undefined;
  private bootstrapped = false;

  constructor(
    private readonly baseUrl: string,
    apiKey?: string,
  ) {
    this.token = apiKey || undefined;
    this.bootstrapped = !!this.token;
  }

  /** True when the client is using the queen's public demo token. */
  get usingDemoToken(): boolean {
    return this.bootstrapped && !process.env.HIVE_API_KEY && !!this.token;
  }

  // Fetch the queen's public demo token once, when no HIVE_API_KEY was given.
  // A queen without a demo token (or an older one) just leaves us anonymous.
  // Concurrent tool calls share one in-flight bootstrap.
  private bootstrapPromise: Promise<void> | null = null;
  private ensureToken(): Promise<void> {
    if (this.bootstrapped) return Promise.resolve();
    this.bootstrapPromise ??= (async () => {
      try {
        const res = await fetch(new URL('/api/public-bootstrap', this.baseUrl));
        if (!res.ok) return;
        const boot = (await res.json()) as { demoToken?: string | null };
        if (boot?.demoToken) this.token = boot.demoToken;
      } catch { /* unreachable or pre-v0.8.8 queen — stay anonymous */ }
      finally { this.bootstrapped = true; }
    })();
    return this.bootstrapPromise;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    await this.ensureToken();
    const url = new URL(path, this.baseUrl).toString();
    const res = await fetch(url, { ...init, headers: { ...this.headers(), ...(init?.headers ?? {}) } });
    if (res.status === 401) {
      throw new Error(`HIVE 401 Unauthorized (${url}): this queen requires a token. Set HIVE_API_KEY in the MCP server's env.`);
    }
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

  stats(): Promise<StatsResponse> {
    return this.req<StatsResponse>('/api/stats');
  }

  directory(): Promise<DirectoryResponse> {
    return this.req<DirectoryResponse>('/api/directory');
  }
}
