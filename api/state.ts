import { createClient, type Client } from '@libsql/client';

const MAX_SURVEYORS = 50;
const MAX_ITEMS_PER_PILE = 2000;
const MAX_NAME_LENGTH = 100;

type Pile = Record<string, unknown>[];

let cachedClient: Client | null = null;
let schemaReady: Promise<unknown> | null = null;

function getClient(url: string, authToken?: string): Client {
  cachedClient ??= createClient({ url, authToken });
  return cachedClient;
}

function ensureSchema(db: Client) {
  schemaReady ??= db.execute(`
    CREATE TABLE IF NOT EXISTS physical_desk_piles (
      surveyor TEXT PRIMARY KEY,
      items_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return schemaReady;
}

/** Validates the POST body: { [surveyor]: MasterItem[] } with sane bounds. */
function parseState(body: unknown): Record<string, Pile> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_SURVEYORS) return null;

  for (const [surveyor, items] of entries) {
    if (!surveyor.trim() || surveyor.length > MAX_NAME_LENGTH) return null;
    if (!Array.isArray(items) || items.length > MAX_ITEMS_PER_PILE) return null;
    const valid = items.every(
      (it) => it && typeof it === 'object' && typeof (it as { debitur?: unknown }).debitur === 'string'
    );
    if (!valid) return null;
  }
  return body as Record<string, Pile>;
}

export default async function handler(req: any, res: any) {
  // Same-origin API: no CORS headers on purpose. Never cache state responses.
  res.setHeader('Cache-Control', 'no-store');

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

    if (req.method === 'GET') {
      const result = await db.execute('SELECT surveyor, items_json FROM physical_desk_piles');
      const state: Record<string, unknown[]> = {};
      for (const row of result.rows) {
        try {
          state[String(row.surveyor)] = JSON.parse(String(row.items_json));
        } catch {
          state[String(row.surveyor)] = [];
        }
      }
      res.status(200).json(state);
      return;
    }

    if (req.method === 'POST') {
      const state = parseState(req.body);
      if (!state) {
        res.status(400).json({ error: 'Payload tidak valid.' });
        return;
      }

      const surveyors = Object.keys(state);
      // Snapshot semantics in ONE atomic transaction: upsert everything sent,
      // then delete piles that are no longer present (otherwise removed ordners resurrect).
      await db.batch(
        [
          ...surveyors.map((surveyor) => ({
            sql: `INSERT INTO physical_desk_piles (surveyor, items_json, updated_at)
                  VALUES (?, ?, datetime('now'))
                  ON CONFLICT(surveyor) DO UPDATE SET
                    items_json = excluded.items_json,
                    updated_at = excluded.updated_at`,
            args: [surveyor, JSON.stringify(state[surveyor])],
          })),
          {
            sql: `DELETE FROM physical_desk_piles WHERE surveyor NOT IN (${surveyors.map(() => '?').join(',')})`,
            args: surveyors,
          },
        ],
        'write'
      );

      res.status(200).json({ success: true, count: surveyors.length });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    // Log details server-side only; never leak DB internals to the client.
    console.error('Turso state error:', error);
    res.status(500).json({ error: 'Internal Database Error' });
  }
}
