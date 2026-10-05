import { createClient, type Client } from '@libsql/client';

const MAX_SURVEYORS = 50;
const MAX_NAME_LENGTH = 100;

type Snapshot = Record<string, Record<string, unknown>[]>;

/**
 * One endpoint, two snapshot "scopes" (kept in a single file on purpose so the
 * Vercel function has no cross-file imports):
 *  - master  (default): the sorted desk piles   -> physical_desk_piles
 *  - transit:           the per-surveyor trays  -> physical_transit_trays
 * Table names come from this whitelist only, never from user input.
 */
const SCOPES = {
  master: {
    table: 'physical_desk_piles',
    maxItems: 2000,
    allowEmpty: false,
    isItem: (it: Record<string, unknown>) => typeof it.debitur === 'string',
  },
  transit: {
    table: 'physical_transit_trays',
    maxItems: 500,
    // Claiming every tray legitimately leaves an empty snapshot.
    allowEmpty: true,
    isItem: (it: Record<string, unknown>) =>
      typeof it.id === 'string' &&
      typeof it.debitur === 'string' &&
      typeof it.targetSurveyor === 'string',
  },
} as const;

type Scope = keyof typeof SCOPES;

let cachedClient: Client | null = null;
let schemaReady: Promise<unknown> | null = null;

function getClient(url: string, authToken?: string): Client {
  cachedClient ??= createClient({ url, authToken });
  return cachedClient;
}

function ensureSchema(db: Client) {
  schemaReady ??= db.batch(
    Object.values(SCOPES).map(({ table }) => `
      CREATE TABLE IF NOT EXISTS ${table} (
        surveyor TEXT PRIMARY KEY,
        items_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    'write'
  );
  return schemaReady;
}

function resolveScope(rawUrl: string | undefined): Scope | null {
  const scope = new URL(rawUrl ?? '/', 'http://localhost').searchParams.get('scope') ?? 'master';
  return scope in SCOPES ? (scope as Scope) : null;
}

/** Validates a POST body: { [surveyor]: item[] } with sane bounds. */
function parseSnapshot(body: unknown, scope: Scope): Snapshot | null {
  const rules = SCOPES[scope];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length > MAX_SURVEYORS) return null;
  if (entries.length === 0 && !rules.allowEmpty) return null;

  for (const [surveyor, items] of entries) {
    if (!surveyor.trim() || surveyor.length > MAX_NAME_LENGTH) return null;
    if (!Array.isArray(items) || items.length > rules.maxItems) return null;
    const valid = items.every(
      (it) => it && typeof it === 'object' && !Array.isArray(it) && rules.isItem(it as Record<string, unknown>)
    );
    if (!valid) return null;
  }
  return body as Snapshot;
}

async function readSnapshot(db: Client, table: string): Promise<Snapshot> {
  const result = await db.execute(`SELECT surveyor, items_json FROM ${table}`);
  const snapshot: Snapshot = {};
  for (const row of result.rows) {
    try {
      snapshot[String(row.surveyor)] = JSON.parse(String(row.items_json));
    } catch {
      snapshot[String(row.surveyor)] = [];
    }
  }
  return snapshot;
}

/**
 * Snapshot semantics in ONE atomic transaction: upsert everything sent, then
 * delete rows that are no longer present (otherwise removed entries resurrect).
 */
async function writeSnapshot(db: Client, table: string, snapshot: Snapshot): Promise<void> {
  const surveyors = Object.keys(snapshot);
  const prune =
    surveyors.length === 0
      ? { sql: `DELETE FROM ${table}`, args: [] }
      : {
          sql: `DELETE FROM ${table} WHERE surveyor NOT IN (${surveyors.map(() => '?').join(',')})`,
          args: surveyors,
        };

  await db.batch(
    [
      ...surveyors.map((surveyor) => ({
        sql: `INSERT INTO ${table} (surveyor, items_json, updated_at)
              VALUES (?, ?, datetime('now'))
              ON CONFLICT(surveyor) DO UPDATE SET
                items_json = excluded.items_json,
                updated_at = excluded.updated_at`,
        args: [surveyor, JSON.stringify(snapshot[surveyor])],
      })),
      prune,
    ],
    'write'
  );
}

export default async function handler(req: any, res: any) {
  // Same-origin API: no CORS headers on purpose. Never cache state responses.
  res.setHeader('Cache-Control', 'no-store');

  const scope = resolveScope(req.url);
  if (!scope) {
    res.status(400).json({ error: 'Scope tidak dikenal.' });
    return;
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    // Graceful fallback: the client treats this as "server not configured".
    res.status(200).json({
      configured: false,
      message: 'TURSO_DATABASE_URL belum dikonfigurasi di Vercel Environment Variables.',
    });
    return;
  }

  try {
    const db = getClient(url, authToken);
    await ensureSchema(db);
    const { table } = SCOPES[scope];

    if (req.method === 'GET') {
      res.status(200).json(await readSnapshot(db, table));
      return;
    }

    if (req.method === 'POST') {
      const snapshot = parseSnapshot(req.body, scope);
      if (!snapshot) {
        res.status(400).json({ error: 'Payload tidak valid.' });
        return;
      }
      await writeSnapshot(db, table, snapshot);
      res.status(200).json({ success: true, count: Object.keys(snapshot).length });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    // Log details server-side only; never leak DB internals to the client.
    console.error(`Turso ${scope} error:`, error);
    res.status(500).json({ error: 'Internal Database Error' });
  }
}
