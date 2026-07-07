// Injectable fake for the postgres.js client used across the Worker.
//
// The seam: every code path reaches Postgres through `postgres(connectionString)`
// (routes/db.ts getSql on master; services/pg.ts getSql once the
// premium-ai-ratelimit work lands). Test files mock the `postgres` npm module and
// hand back one of these fakes, so no test ever opens a socket:
//
//   const pg = vi.hoisted(() => ({ current: null as unknown }));
//   vi.mock("postgres", () => ({ default: () => pg.current }));
//   ...
//   const sql = createFakeSql();
//   pg.current = sql;
//
// What it emulates (only what the Worker actually uses):
//   - tagged-template queries:   await sql`SELECT ... ${x}`  -> rows (array)
//   - fragment composition:      const frag = sql`(...)`; sql`... VALUES ${frag}`
//     (fragments are inlined into the parent query and never executed themselves;
//     postgres.js queries are lazy, execution happens on await)
//   - sql.json(v):               jsonb marker; the raw value lands in `values`
//   - sql.end():                 resolves, records that it was called
//   - sql.begin(fn):             runs fn with the same fake as the transaction
//     client and counts on `begins`; a throw propagates (postgres.js rolls the
//     real transaction back on throw; the fake has no state to roll back)
//
// Tests register handlers against a regex over the normalized query text (single
// spaces, no newlines). First matching handler wins; a handler may throw to
// simulate a DB error. Unmatched queries resolve to [] so incidental reads stay
// harmless. Executed queries are recorded on `sql.calls` for assertions.

export interface FakeQueryCall {
  text: string;
  values: unknown[];
}

type Handler = (
  q: FakeQueryCall
) => unknown[] | Promise<unknown[]>;

interface Fragment {
  __fragment: true;
  text: string;
  values: unknown[];
}

const JSON_MARKER = Symbol("fakeSql.json");

interface JsonWrapped {
  [JSON_MARKER]: true;
  value: unknown;
}

function isFragment(v: unknown): v is Fragment {
  return typeof v === "object" && v !== null && (v as Fragment).__fragment === true;
}

function isJsonWrapped(v: unknown): v is JsonWrapped {
  return typeof v === "object" && v !== null && JSON_MARKER in (v as object);
}

export interface FakeSql {
  (strings: TemplateStringsArray, ...vals: unknown[]): unknown;
  json(v: unknown): unknown;
  end(): Promise<void>;
  /** Transaction seam: fn runs against this same fake; throws propagate. */
  begin<T>(fn: (tx: FakeSql) => T | Promise<T>): Promise<T>;
  /** Number of begin() transactions started. */
  begins: number;
  /** Queries that actually executed (fragments excluded), in order. */
  calls: FakeQueryCall[];
  /** Register a handler; first regex match wins. Throw inside to simulate errors. */
  onQuery(match: RegExp, handler: Handler): void;
  /** Convenience: last executed query, or undefined. */
  lastCall(): FakeQueryCall | undefined;
  /** True once sql.end() was invoked (routes release the client in `finally`). */
  ended: boolean;
}

export function createFakeSql(): FakeSql {
  const calls: FakeQueryCall[] = [];
  const handlers: Array<{ match: RegExp; handler: Handler }> = [];

  function build(strings: TemplateStringsArray, vals: unknown[]): FakeQueryCall {
    let text = "";
    const values: unknown[] = [];
    strings.forEach((s, i) => {
      text += s;
      if (i < vals.length) {
        const v = vals[i];
        if (isFragment(v)) {
          text += v.text;
          values.push(...v.values);
        } else if (isJsonWrapped(v)) {
          values.push(v.value);
          text += `$${values.length}`;
        } else {
          values.push(v);
          text += `$${values.length}`;
        }
      }
    });
    return { text: text.replace(/\s+/g, " ").trim(), values };
  }

  const sql = ((strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = build(strings, vals);
    const exec = async (): Promise<unknown[]> => {
      calls.push(q);
      for (const { match, handler } of handlers) {
        if (match.test(q.text)) return handler(q);
      }
      return [];
    };
    // Lazy thenable, embeddable as a fragment: mirrors postgres.js semantics.
    return {
      __fragment: true as const,
      text: q.text,
      values: q.values,
      then: (
        onFulfilled?: (rows: unknown[]) => unknown,
        onRejected?: (err: unknown) => unknown
      ) => exec().then(onFulfilled, onRejected),
      catch: (onRejected?: (err: unknown) => unknown) => exec().catch(onRejected),
    };
  }) as FakeSql;

  sql.json = (v: unknown): JsonWrapped => ({ [JSON_MARKER]: true, value: v });
  sql.begins = 0;
  sql.begin = async <T>(fn: (tx: FakeSql) => T | Promise<T>): Promise<T> => {
    sql.begins += 1;
    return fn(sql);
  };
  sql.ended = false;
  sql.end = async () => {
    sql.ended = true;
  };
  sql.calls = calls;
  sql.onQuery = (match, handler) => {
    handlers.push({ match, handler });
  };
  sql.lastCall = () => calls[calls.length - 1];

  return sql;
}
