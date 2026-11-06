import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import {
  takeItemsForHandover,
  returnHandoverItemToMaster,
  returnAllHandoverToMaster,
  archiveHandoverToHistory,
  restoreHistoryItemToHandover,
  restoreAllHistoryToHandover,
  dedupeMaster,
} from './logic.ts';

const load = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const keyOf = (it) => `${it.jenis_case}#${it.no}`;

/** Deterministic PRNG so a failing seed is reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function census(master, handover, history) {
  const where = new Map();
  for (const [scope, state] of [['master', master], ['handover', handover], ['history', history]]) {
    for (const items of Object.values(state)) {
      for (const it of items) {
        const k = keyOf(it);
        where.set(k, [...(where.get(k) ?? []), scope]);
      }
    }
  }
  return where;
}

function assertInvariants(master, handover, history, total, trace) {
  const where = census(master, handover, history);
  const dup = [...where.entries()].filter(([, w]) => w.length > 1);
  assert.deepStrictEqual(dup, [], `dokumen ganda setelah: ${trace.join(' > ')}`);
  assert.strictEqual(where.size, total, `jumlah dokumen berubah setelah: ${trace.join(' > ')}`);
  for (const items of Object.values(master)) {
    for (const it of items) assert.ok(it.debitur, `item kosong di master setelah: ${trace.join(' > ')}`);
  }
}

test('SIMULASI: urutan acak ambil/batal/arsip/tarik tidak pernah menggandakan atau menghilangkan dokumen', () => {
  const baseMaster = load('../data/tumpukan_master.json');
  const baseHistory = load('../data/tumpukan_history.json');
  const initialCensus = census(baseMaster, {}, baseHistory);
  assert.ok([...initialCensus.values()].every((w) => w.length === 1), 'data awal sudah mengandung duplikat');
  const total = initialCensus.size;

  for (let seed = 1; seed <= 40; seed++) {
    const rand = rng(seed);
    let master = structuredClone(baseMaster);
    let handover = {};
    let history = structuredClone(baseHistory);
    const trace = [];
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];

    for (let step = 0; step < 60; step++) {
      const op = pick(['take', 'take', 'return', 'clear', 'archive', 'restoreOne', 'restoreAll']);
      trace.push(`${op}@${seed}`);
      if (op === 'take') {
        const surveyors = Object.keys(master).filter((s) => master[s].length > 0);
        if (!surveyors.length) continue;
        const s = pick(surveyors);
        const n = 1 + Math.floor(rand() * 5);
        const keys = new Set(master[s].slice(0, n).map(keyOf));
        ({ nextMaster: master, nextHandover: handover } = takeItemsForHandover(master, handover, s, keys));
      } else if (op === 'return') {
        const s = pick(Object.keys(handover).concat(['__none__']));
        const h = handover[s]?.[0];
        if (!h) continue;
        ({ nextMaster: master, nextHandover: handover } = returnHandoverItemToMaster(master, handover, s, h.id));
      } else if (op === 'clear') {
        const s = rand() < 0.5 ? undefined : pick(Object.keys(handover).concat(['__none__']));
        ({ nextMaster: master, nextHandover: handover } = returnAllHandoverToMaster(master, handover, s));
      } else if (op === 'archive') {
        const s = rand() < 0.5 ? undefined : pick(Object.keys(handover).concat(['__none__']));
        ({ nextHandover: handover, nextHistory: history } = archiveHandoverToHistory(handover, history, s, 'sim'));
      } else if (op === 'restoreOne') {
        const s = pick(Object.keys(history));
        const h = history[s]?.[0];
        if (!h) continue;
        ({ nextHistory: history, nextHandover: handover } = restoreHistoryItemToHandover(history, handover, s, h.id));
      } else {
        const s = pick(Object.keys(history));
        ({ nextHistory: history, nextHandover: handover } = restoreAllHistoryToHandover(history, handover, s));
      }
      assertInvariants(master, handover, history, total, trace.slice(-6));
    }
  }
});

test('SIMULASI: dedupeMaster idempoten dan tidak mengubah jumlah dokumen unik', () => {
  const master = load('../data/tumpukan_master.json');
  const before = new Set(Object.values(master).flat().map(keyOf));
  const once = dedupeMaster(master);
  assert.strictEqual(once, master, 'data bersih tidak boleh dibuat ulang');
  const dirty = structuredClone(master);
  const victim = Object.values(dirty).find((p) => p.length > 0);
  dirty['KIKI SUMARNA'] = [...(dirty['KIKI SUMARNA'] ?? []), { ...victim[0] }];
  const healed = dedupeMaster(dirty);
  const after = new Set(Object.values(healed).flat().map(keyOf));
  assert.deepStrictEqual([...after].sort(), [...before].sort());
  assert.strictEqual(dedupeMaster(healed), healed);
});
