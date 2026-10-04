import { createClient } from '@libsql/client';

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    // Graceful fallback if Turso is not configured yet
    res.status(200).json({
      configured: false,
      message: 'TURSO_DATABASE_URL belum dikonfigurasi di Vercel Environment Variables.',
    });
    return;
  }

  try {
    const db = createClient({
      url,
      authToken,
    });

    // Auto-create SQLite table if not exists
    await db.execute(`
      CREATE TABLE IF NOT EXISTS physical_desk_piles (
        surveyor TEXT PRIMARY KEY,
        items_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    if (req.method === 'GET') {
      const result = await db.execute('SELECT surveyor, items_json FROM physical_desk_piles');
      const state: Record<string, any[]> = {};

      for (const row of result.rows) {
        const surveyor = String(row.surveyor);
        const rawJson = String(row.items_json);
        try {
          state[surveyor] = JSON.parse(rawJson);
        } catch {
          state[surveyor] = [];
        }
      }

      res.status(200).json(state);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'Body harus berupa JSON master state' });
        return;
      }

      // Execute upsert for each surveyor in atomic transaction
      const queries = Object.entries(body).map(([surveyor, items]) => ({
        sql: `
          INSERT INTO physical_desk_piles (surveyor, items_json, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(surveyor) DO UPDATE SET
            items_json = excluded.items_json,
            updated_at = excluded.updated_at
        `,
        args: [surveyor, JSON.stringify(items)],
      }));

      if (queries.length > 0) {
        await db.batch(queries, 'write');
      }

      res.status(200).json({ success: true, count: queries.length });
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error: any) {
    console.error('Turso SQLite error:', error);
    res.status(500).json({ error: error.message || 'Internal Database Error' });
  }
}
