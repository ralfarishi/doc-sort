import test from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Closed-loop test of the real Vercel handler (api/state.ts) against a throw-away local
 * libSQL file: optimistic locking, server-side invariants, history shrink guard, backups.
 */
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'orgfisik-')), 'test.db');
process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
delete process.env.TURSO_AUTH_TOKEN;

const { default: handler } = await import('../../api/state.ts');
const { createClient } = await import('@libsql/client');

function call(method, scope, { body, baseVersion } = {}) {
  return new Promise((resolve) => {
    const headers = {};
    if (baseVersion !== undefined) headers['x-base-version'] = String(baseVersion);
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(payload) { resolve({ status: this.statusCode, headers: this.headers, body: payload }); },
    };
    handler({ method, url: `/api/state?scope=${scope}`, body, headers }, res);
  });
}

const doc = (no, debitur = `NAMA ${no}`, jenis_case = '410') => ({ no, debitur, jenis_case, id: `id-${jenis_case}-${no}`, surveyor: 'X' });

test('API: GET kosong mengembalikan versi 0, POST tanpa versi ditolak 428', async () => {
  const get = await call('GET', 'master');
  assert.strictEqual(get.status, 200);
  assert.strictEqual(get.headers['x-state-version'], '0');
  const post = await call('POST', 'master', { body: { A: [doc(1)] } });
  assert.strictEqual(post.status, 428);
});

test('API: optimistic lock - versi benar diterima, versi basi ditolak 409 dan data tidak tertimpa', async () => {
  const first = await call('POST', 'master', { body: { A: [doc(1), doc(2)] }, baseVersion: 0 });
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.body.version, 1);

  const stale = await call('POST', 'master', { body: { A: [doc(99)] }, baseVersion: 0 });
  assert.strictEqual(stale.status, 409);

  const get = await call('GET', 'master');
  assert.strictEqual(get.headers['x-state-version'], '1');
  assert.deepStrictEqual(get.body.A.map((d) => d.no), [1, 2]);

  const next = await call('POST', 'master', { body: { A: [doc(1)], B: [doc(2)] }, baseVersion: 1 });
  assert.strictEqual(next.status, 200);
  assert.strictEqual(next.body.version, 2);
});

test('API: dokumen ganda antar pile ditolak 422', async () => {
  const v = Number((await call('GET', 'master')).headers['x-state-version']);
  const res = await call('POST', 'master', { body: { A: [doc(7)], B: [doc(7)] }, baseVersion: v });
  assert.strictEqual(res.status, 422);
  assert.strictEqual(Number((await call('GET', 'master')).headers['x-state-version']), v);
});

test('API: backup bergulir dibuat sebelum menimpa dan dibatasi 20 versi', async () => {
  let v = Number((await call('GET', 'master')).headers['x-state-version']);
  for (let i = 0; i < 25; i++) {
    const r = await call('POST', 'master', { body: { A: [doc(1000 + i)] }, baseVersion: v });
    assert.strictEqual(r.status, 200);
    v = r.body.version;
  }
  const db = createClient({ url: process.env.TURSO_DATABASE_URL });
  const rows = await db.execute("SELECT COUNT(*) AS n FROM state_backups WHERE scope = 'master'");
  assert.strictEqual(Number(rows.rows[0].n), 20);
  db.close();
});

test('API: penyusutan riwayat >50% ditolak, penambahan diterima', async () => {
  const big = { A: Array.from({ length: 30 }, (_, i) => doc(i + 1)) };
  const ok = await call('POST', 'history', { body: big, baseVersion: 0 });
  assert.strictEqual(ok.status, 200);
  const wipe = await call('POST', 'history', { body: { A: [doc(1)] }, baseVersion: 1 });
  assert.strictEqual(wipe.status, 422);
  const grow = await call('POST', 'history', { body: { A: [...big.A, doc(31)] }, baseVersion: 1 });
  assert.strictEqual(grow.status, 200);
});

test('API: handover boleh kosong sepenuhnya (antrean dibatalkan)', async () => {
  const a = await call('POST', 'handover', { body: { A: [doc(1)] }, baseVersion: 0 });
  assert.strictEqual(a.status, 200);
  const empty = await call('POST', 'handover', { body: {}, baseVersion: 1 });
  assert.strictEqual(empty.status, 200);
});
