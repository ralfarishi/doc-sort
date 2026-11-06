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
  handover: {
    table: 'physical_handover_lists',
    maxItems: 1000,
    allowEmpty: true,
    isItem: (it: Record<string, unknown>) =>
      typeof it.id === 'string' &&
      typeof it.debitur === 'string' &&
      typeof it.surveyor === 'string',
  },
  history: {
    table: 'physical_handover_history',
    maxItems: 3000,
    allowEmpty: true,
    isItem: (it: Record<string, unknown>) =>
      typeof it.id === 'string' &&
      typeof it.debitur === 'string' &&
      typeof it.surveyor === 'string',
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
    [
      ...Object.values(SCOPES).map(({ table }) => `
      CREATE TABLE IF NOT EXISTS ${table} (
        surveyor TEXT PRIMARY KEY,
        items_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
      // Optimistic-lock counter per scope.
      `CREATE TABLE IF NOT EXISTS state_meta (
        scope TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      // Rolling pre-write backups so a bad write can always be rolled back.
      `CREATE TABLE IF NOT EXISTS state_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
    ],
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

const BACKUPS_KEPT = 20;
const SHRINK_GUARD_MIN_ITEMS = 20;

const countItems = (s: Snapshot) => Object.values(s).reduce((n, items) => n + items.length, 0);

/** Returns the first jenis_case#no found in more than one place, or null. */
function findDuplicateKey(s: Snapshot): string | null {
  const seen = new Set<string>();
  for (const items of Object.values(s)) {
    for (const it of items) {
      if (it.jenis_case === undefined || it.no === undefined) continue;
      const key = `${String(it.jenis_case)}#${String(it.no)}`;
      if (seen.has(key)) return key;
      seen.add(key);
    }
  }
  return null;
}

async function readVersion(db: Client, scope: Scope): Promise<number> {
  const r = await db.execute({ sql: 'SELECT version FROM state_meta WHERE scope = ?', args: [scope] });
  return r.rows.length > 0 ? Number(r.rows[0]?.version ?? 0) : 0;
}

type WriteOutcome =
  | { status: 'ok'; version: number }
  | { status: 'conflict'; version: number }
  | { status: 'invalid'; reason: string };

/**
 * Guarded write: optimistic lock (client must send the version it last read), server-side
 * invariants, and a rolling backup of the previous snapshot - all in one transaction.
 */
async function guardedWrite(db: Client, scope: Scope, snapshot: Snapshot, baseVersion: number): Promise<WriteOutcome> {
  const dup = findDuplicateKey(snapshot);
  if (dup) return { status: 'invalid', reason: `Dokumen ganda: ${dup}` };

  const { table } = SCOPES[scope];
  const tx = await db.transaction('write');
  try {
    const current = await readVersion(tx as unknown as Client, scope);
    if (current !== baseVersion) {
      await tx.rollback();
      return { status: 'conflict', version: current };
    }

    const previous = await readSnapshot(tx as unknown as Client, table);
    const before = countItems(previous);
    // Handover history is irreplaceable user data: refuse a write that wipes most of it.
    if (scope === 'history' && before >= SHRINK_GUARD_MIN_ITEMS && countItems(snapshot) < before / 2) {
      await tx.rollback();
      return { status: 'invalid', reason: 'Penyusutan data riwayat terlalu besar ditolak.' };
    }

    if (before > 0) {
      await tx.execute({
        sql: `INSERT INTO state_backups (scope, version, snapshot_json, created_at)
              VALUES (?, ?, ?, datetime('now'))`,
        args: [scope, current, JSON.stringify(previous)],
      });
      await tx.execute({
        sql: `DELETE FROM state_backups WHERE scope = ? AND id NOT IN (
                SELECT id FROM state_backups WHERE scope = ? ORDER BY id DESC LIMIT ?)`,
        args: [scope, scope, BACKUPS_KEPT],
      });
    }

    await writeSnapshot(tx as unknown as Client, table, snapshot);
    const next = current + 1;
    await tx.execute({
      sql: `INSERT INTO state_meta (scope, version, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(scope) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at`,
      args: [scope, next],
    });
    await tx.commit();
    return { status: 'ok', version: next };
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  } finally {
    tx.close();
  }
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
      const [snapshot, version] = await Promise.all([readSnapshot(db, table), readVersion(db, scope)]);
      res.setHeader('X-State-Version', String(version));
      res.status(200).json(snapshot);
      return;
    }

    if (req.method === 'POST') {
      const snapshot = parseSnapshot(req.body, scope);
      if (!snapshot) {
        res.status(400).json({ error: 'Payload tidak valid.' });
        return;
      }
      const rawBase = req.headers?.['x-base-version'];
      const baseVersion = Number(Array.isArray(rawBase) ? rawBase[0] : rawBase);
      if (rawBase === undefined || !Number.isInteger(baseVersion) || baseVersion < 0) {
        // Stale clients that never read a version must reload before they may write.
        res.status(428).json({ error: 'Versi data tidak dikirim. Muat ulang aplikasi.' });
        return;
      }
      const outcome = await guardedWrite(db, scope, snapshot, baseVersion);
      if (outcome.status === 'conflict') {
        res.setHeader('X-State-Version', String(outcome.version));
        res.status(409).json({ error: 'Data sudah diubah dari perangkat lain.', version: outcome.version });
        return;
      }
      if (outcome.status === 'invalid') {
        res.status(422).json({ error: outcome.reason });
        return;
      }
      res.setHeader('X-State-Version', String(outcome.version));
      res.status(200).json({ success: true, count: Object.keys(snapshot).length, version: outcome.version });
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
