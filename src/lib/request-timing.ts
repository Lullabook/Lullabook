/**
 * Issue 191 — deterministic request timing + query/wave instrumentation.
 *
 * Pure, synchronous bookkeeping: the recorder only ever stores numbers
 * (milliseconds, query counts, wave counts). No tokens, emails, photo keys,
 * provider URLs, prompts, or credentials can pass through it — the mark-name
 * whitelist is a safe-header charset and values are numeric, so serialized
 * output (Server-Timing header, breadcrumbs) provably carries no user data.
 *
 * Wave semantics: a "sequential wave" is a batch of queries issued while at
 * least one query is still in flight. Back-to-back awaits = one wave each;
 * a Promise.all fan-out = a single wave. Wave count is the number of DB
 * round-trips a request serializes through, which is what actually bounds
 * latency.
 */

const SAFE_NAME = /^[a-z][a-z0-9-]*$/;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export class RequestRecorder {
  readonly start = nowMs();

  private readonly marks: Record<string, number> = {};
  private query = 0;
  private waves = 0;
  private inFlight = 0;

  /** Milliseconds since the recorder was created. */
  elapsed(): number {
    return nowMs() - this.start;
  }

  /** Record an explicit elapsed-duration mark (name must be a safe header token). */
  markMs(name: string, ms: number): void {
    if (!SAFE_NAME.test(name)) throw new Error(`Unsafe timing mark name: ${name}`);
    this.marks[name] = Math.max(0, ms);
  }

  /** Record a mark at the current elapsed time. */
  mark(name: string): void {
    this.markMs(name, this.elapsed());
  }

  /** A Supabase query started. */
  queryStarted(): void {
    this.query += 1;
    if (this.inFlight === 0) this.waves += 1;
    this.inFlight += 1;
  }

  /** A Supabase query settled. */
  querySettled(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  get queryCount(): number {
    return this.query;
  }

  get waveCount(): number {
    return this.waves;
  }

  /** Snapshot of named marks (auth/hydrate/…), in ms since start. */
  get marksSnapshot(): Readonly<Record<string, number>> {
    return this.marks;
  }

  /**
   * Mark the hydration phase: elapsed time since the request context finished
   * building (the `ctx` mark set by createRequestContext). Call right after
   * the auth member resolves.
   */
  markHydrate(): void {
    const ctxReady = this.marks["ctx"] ?? 0;
    this.markMs("hydrate", Math.max(0, this.elapsed() - ctxReady));
  }

  /** Server-Timing header value — `name;dur=N` marks + a `db;queries=N;waves=N` entry. */
  toServerTiming(): string {
    const parts: string[] = [];
    for (const name of ["auth", "hydrate", "total"]) {
      const ms = this.marks[name];
      if (ms !== undefined) parts.push(`${name};dur=${ms.toFixed(2)}`);
    }
    parts.push(`db;queries=${this.query};waves=${this.waves}`);
    return parts.join(", ");
  }

  /** Serializable state for breadcrumbs — numbers only, by construction. */
  toJSON(): Record<string, number> {
    return { ...this.marks, queryCount: this.query, waveCount: this.waves, totalMs: this.elapsed() };
  }
}

/**
 * Wrap a Supabase client so every `.from()` query execution is counted on the
 * recorder. Query builders are thenables — intercepting `then` counts exactly
 * the queries that are actually awaited (never the builder constructions) and
 * tracks in-flight queries for wave detection. The wrapped result resolves the
 * identical data; the only added cost is one `.finally` tick per query.
 */
export function instrumentClient<T extends { from?: (table: string) => unknown }>(
  client: T,
  recorder: RequestRecorder
): T {
  const from = client.from;
  if (typeof from !== "function") return client;
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) => wrapBuilder(from.call(target, table), recorder);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

function wrapBuilder(builder: unknown, recorder: RequestRecorder): unknown {
  if (
    builder === null ||
    (typeof builder !== "object" && typeof builder !== "function") ||
    typeof (builder as { then?: unknown }).then !== "function"
  ) {
    return builder;
  }
  const target = builder as object;
  return new Proxy(target, {
    get(obj, prop) {
      if (prop === "then") {
        const originalThen = Reflect.get(obj, prop) as (
          onFulfilled?: unknown,
          onRejected?: unknown
        ) => unknown;
        return (onFulfilled?: unknown, onRejected?: unknown) => {
          recorder.queryStarted();
          const result = originalThen.call(obj, onFulfilled, onRejected);
          return Promise.resolve(result).finally(() => recorder.querySettled());
        };
      }
      return Reflect.get(obj, prop);
    },
  });
}
