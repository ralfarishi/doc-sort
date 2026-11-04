import test from 'node:test';
import assert from 'node:assert';
import {
  normalize,
  nameSimilarity,
  simulateHandInsertion,
  takeItemsForHandover,
  returnHandoverItemToMaster,
  archiveHandoverToHistory,
  restoreHistoryItemToHandover,
  clearHandoverList,
  isMasterState,
  isHandoverState,
  isHandoverHistoryState,
  validateDataIntegrity,
  searchHandoverLocation,
  searchHistoryLocation,
  scoreDebtorMatch,
  collectHandledDebtorKeys,
  formatCatalogMarkdown,
  createTransitItemFromMatch,
  healHistory,
  reassignUnassignedBucket,
  countUnassignedBucket,
} from './logic.ts';

test('Boundary: Normalization handles null, whitespace, and extreme characters', () => {
  assert.strictEqual(normalize(''), '');
  assert.strictEqual(normalize('   '), '');
  assert.strictEqual(normalize('DRS.  FARIZAL, S.H.'), 'DRSFARIZALSH');
  assert.strictEqual(normalize('MAMAN   ABDUL   ROHMAN'), 'MAMANABDULROHMAN');
  assert.strictEqual(normalize('NO_#12_KLAIM/410'), 'NO12KLAIM410');
});

test('Boundary: Name similarity handles zero-length and exact match edge cases', () => {
  assert.strictEqual(nameSimilarity('', ''), 0.0);
  assert.strictEqual(nameSimilarity('BUDI', ''), 0.0);
  assert.strictEqual(nameSimilarity('', 'BUDI'), 0.0);
  assert.strictEqual(nameSimilarity('BUDI SANTOSO', 'BUDI SANTOSO'), 1.0);
  assert.ok(nameSimilarity('MAMAN ABDUL ROHMAN', 'MAMAN ABDUL') >= 0.7);
});

test('Boundary: Hand insertion simulation into empty, top, bottom, and duplicate piles', () => {
  const emptyPile = [];
  const item1 = { debitur: 'B', no: 1, id_klaim: '1', kota: '', wilayah: '', jenis_case: '410', surveyor: 'S', visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' };

  // 1. First item into empty pile
  const res1 = simulateHandInsertion(emptyPile, [{ query: 'B', found_excel: true, score: 1, excel: item1, folders: [] }], 'S');
  assert.strictEqual(res1.steps.length, 1);
  assert.strictEqual(res1.steps[0].new_pos, 1);
  assert.ok(res1.steps[0].instruksi.includes('dasar tumpukan pertama'));
  assert.strictEqual(res1.deskPile.length, 1);

  // 2. Insert A (top) and C (bottom)
  const currentPile = [item1];
  const itemTop = { ...item1, debitur: 'A' };
  const itemBottom = { ...item1, debitur: 'C' };

  const res2 = simulateHandInsertion(currentPile, [
    { query: 'A', found_excel: true, score: 1, excel: itemTop, folders: [] },
    { query: 'C', found_excel: true, score: 1, excel: itemBottom, folders: [] },
  ], 'S');

  assert.strictEqual(res2.steps.length, 2);
  assert.strictEqual(res2.steps[0].new_pos, 1, 'A must be at the very top (pos 1)');
  assert.strictEqual(res2.steps[1].new_pos, 3, 'C must be at the bottom (pos 3)');
  assert.strictEqual(res2.deskPile.length, 3);
  assert.strictEqual(res2.deskPile[0].debitur, 'A');
  assert.strictEqual(res2.deskPile[1].debitur, 'B');
  assert.strictEqual(res2.deskPile[2].debitur, 'C');

  // 3. Insert identical duplicate name 'B'
  const resDuplicate = simulateHandInsertion([item1], [{ query: 'B', found_excel: true, score: 1, excel: item1, folders: [] }], 'S');
  assert.strictEqual(resDuplicate.steps.length, 1);
  assert.ok(resDuplicate.steps[0].new_pos >= 1);
  assert.strictEqual(resDuplicate.deskPile.length, 2);
});

test('Boundary: Handover operations on empty states or invalid IDs do not throw', () => {
  const master = {};
  const handover = {};

  // Take from empty master
  const resTake = takeItemsForHandover(master, handover, 'S', new Set(['410#999']));
  assert.deepStrictEqual(resTake.takenItems, []);
  assert.deepStrictEqual(resTake.nextMaster, {});
  assert.deepStrictEqual(resTake.nextHandover, {});

  // Return non-existent handover ID
  const resReturn = returnHandoverItemToMaster(master, handover, 'S', 'non-existent-id');
  assert.deepStrictEqual(resReturn.nextMaster, {});
  assert.deepStrictEqual(resReturn.nextHandover, {});

  // Archive empty handover
  const resArchive = archiveHandoverToHistory(handover, {}, 'S');
  assert.strictEqual(resArchive.archivedCount, 0);

  // Restore non-existent history ID
  const resRestore = restoreHistoryItemToHandover({}, handover, 'S', 'ghost-id');
  assert.deepStrictEqual(resRestore.nextHistory, {});
  assert.deepStrictEqual(resRestore.nextHandover, {});

  // Clear non-existent surveyor
  const resClear = clearHandoverList(handover, 'UNKNOWN');
  assert.deepStrictEqual(resClear, {});
});

test('Boundary: Runtime Type Guards reject malformed and corrupted payloads', () => {
  // Primitives and nulls
  assert.strictEqual(isMasterState(null), false);
  assert.strictEqual(isMasterState(undefined), false);
  assert.strictEqual(isMasterState('string'), false);
  assert.strictEqual(isMasterState(123), false);
  assert.strictEqual(isMasterState([]), false);

  // Object with non-array values
  assert.strictEqual(isMasterState({ 'SURV': 'not an array' }), false);

  // Valid empty snapshot
  assert.strictEqual(isMasterState({}), true);
  assert.strictEqual(isHandoverState({}), true);
  assert.strictEqual(isHandoverHistoryState({}), true);

  // Handover items missing required fields
  assert.strictEqual(isHandoverState({ 'S': [{ invalid: true }] }), false);
  assert.strictEqual(isHandoverState({ 'S': [{ id: '1', debitur: 'D', surveyor: 'S' }] }), true);

  // History items missing handedOverAt
  assert.strictEqual(isHandoverHistoryState({ 'S': [{ id: '1', debitur: 'D', surveyor: 'S' }] }), false);
  assert.strictEqual(isHandoverHistoryState({ 'S': [{ id: '1', debitur: 'D', surveyor: 'S', handedOverAt: '2026-01-01' }] }), true);
});

test('Boundary: validateDataIntegrity catches corrupted items with blank debtor names', () => {
  const master = {
    'CANDRA': [
      { debitur: '   ', no: 1, id_klaim: '1', kota: '', wilayah: '', jenis_case: '410', surveyor: 'CANDRA', visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' }
    ]
  };
  const report = validateDataIntegrity(master, {}, {});
  assert.strictEqual(report.isValid, false);
  assert.ok(report.violations[0].includes('Berkas kosong di ordner'));
});

test('Boundary: searchHandoverLocation and searchHistoryLocation accurately find items by name and ID', () => {
  const handover = {
    'CANDRA MAULANA': [
      { id: 'h1', debitur: 'DRS FARIZAL', no: 12, id_klaim: '99881', kota: 'Bandung', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', originalPosition: 3, item_data: {}, timestamp: '2026-11-01' }
    ]
  };

  const history = {
    'DEDI ROCHMANSYAH': [
      { id: 'his1', debitur: 'MAMAN ABDUL ROHMAN', no: 45, id_klaim: '77221', kota: 'Bogor', wilayah: 'Jabar', jenis_case: '410', surveyor: 'DEDI ROCHMANSYAH', handedOverAt: '2026-10-30' }
    ]
  };

  // 1. Search handover by debtor name
  const resHandover = searchHandoverLocation('FARIZAL', handover);
  assert.strictEqual(resHandover.length, 1);
  assert.strictEqual(resHandover[0]?.surveyor, 'CANDRA MAULANA');
  assert.strictEqual(resHandover[0]?.item.debitur, 'DRS FARIZAL');

  // 2. Search handover by ID klaim
  const resHandoverId = searchHandoverLocation('99881', handover);
  assert.strictEqual(resHandoverId.length, 1);
  assert.strictEqual(resHandoverId[0]?.item.id, 'h1');

  // 3. Search history by debtor name
  const resHistory = searchHistoryLocation('MAMAN ABDUL', history);
  assert.strictEqual(resHistory.length, 1);
  assert.strictEqual(resHistory[0]?.surveyor, 'DEDI ROCHMANSYAH');
  assert.strictEqual(resHistory[0]?.item.debitur, 'MAMAN ABDUL ROHMAN');

  // 4. Non-matching query returns empty
  assert.strictEqual(searchHandoverLocation('NONEXISTENT_DEBTOR', handover).length, 0);
  assert.strictEqual(searchHistoryLocation('NONEXISTENT_DEBTOR', history).length, 0);
});

test('DRY Best Practice: scoreDebtorMatch and collectHandledDebtorKeys unify matching and key extraction', () => {
  const item = { debitur: 'DRS FARIZAL', id_klaim: '12345', no: 10 };

  // ID Klaim exact match
  assert.strictEqual(scoreDebtorMatch('12345', item), 1.0);
  assert.strictEqual(scoreDebtorMatch('  12345  ', item), 1.0);

  // #no exact match
  assert.strictEqual(scoreDebtorMatch('#10', item), 1.0);

  // Fuzzy debtor name match
  assert.ok(scoreDebtorMatch('FARIZAL', item) >= 0.7);

  // Collect keys from multiple states
  const stateA = { 'S1': [{ debitur: 'A', jenis_case: '410', no: 1 }] };
  const stateB = { 'S2': [{ debitur: 'B', jenis_case: '410', no: 2 }] };
  const keys = collectHandledDebtorKeys(stateA, stateB, undefined);

  assert.strictEqual(keys.has('A'), false); // names never dedupe: same-name debtors in other cases stay visible
  assert.ok(keys.has('410#1'));
  assert.strictEqual(keys.has('B'), false);
  assert.ok(keys.has('410#2'));
  assert.strictEqual(keys.has('C'), false);

  // formatCatalogMarkdown builds valid markdown table
  const md = formatCatalogMarkdown('CANDRA MAULANA', [
    { debitur: 'A SUMARDI', no: 1, id_klaim: '29487', kota: 'Bandung', wilayah: 'BANDUNG', jenis_case: '410', surveyor: 'CANDRA MAULANA', visit: 'YES', status_laporan: 'DONE', hasil_visit: 'clean', files_count: 5, folder_path: '/path' }
  ]);
  assert.ok(md.includes('ORDNER CANDRA MAULANA'));
  assert.ok(md.includes('A SUMARDI'));
  assert.ok(md.includes('[CANDRA] 410 No.1 - A SUMARDI'));

  // createTransitItemFromMatch builds TransitItem or returns null if unassigned
  const validMatch = {
    query: 'ABAN',
    found_excel: true,
    score: 1,
    excel: { debitur: 'ABAN', no: 3, id_klaim: '32273', kota: 'Bandung', wilayah: 'BANDUNG', jenis_case: '410', surveyor: 'Achmad Ridwan', visit: 'YES', status_laporan: 'DONE', hasil_visit: 'clean' },
    folders: [{ clean_name: 'ABAN', path: '/aban', files_count: 4 }],
    candidates: [],
    hasAmbiguity: false,
    surveyorMismatch: true,
    isUnassigned: false,
  };
  const transit = createTransitItemFromMatch(validMatch, 'CANDRA MAULANA');
  assert.ok(transit !== null);
  assert.strictEqual(transit?.targetSurveyor, 'ACHMAD RIDWAN');
  assert.strictEqual(transit?.sourceSurveyor, 'CANDRA MAULANA');
  assert.strictEqual(transit?.folderRecord?.files_count, 4);

  const unassignedMatch = {
    ...validMatch,
    excel: { ...validMatch.excel, surveyor: 'Belum Ditugaskan' },
  };
  assert.strictEqual(createTransitItemFromMatch(unassignedMatch, 'CANDRA MAULANA'), null);
});

test('Healing: healHistory is non-destructive and safely preserves existing history', () => {
  const mk = (id, debitur, no, jenis = '410') => ({ id, debitur, no, id_klaim: 1, kota: '', wilayah: '', jenis_case: jenis, surveyor: 'X', handedOverAt: '2026-10-24T00:00:00.000Z' });
  const history = {
    A: [mk('hist-410-141', 'HARYATI', 141), mk('hist-410-79', 'DARYATI', 79), mk('hist-147-5', 'CASE147', 5)],
    B: [mk('uuid-1', 'USERDEB', 5), mk('hist-410-9', 'NOFILE', 9)],
  };
  const healed = healHistory(history);
  // Must preserve every entry without deleting based on external state
  assert.strictEqual(healed.A.length, 3);
  assert.strictEqual(healed.B.length, 2);
});

test('Healing: unassigned bucket moves to a real investigator in A-Z order without duplicates', () => {
  const item = (debitur, no, surveyor) => ({ debitur, no, jenis_case: '410', surveyor, id_klaim: 1, kota: '', wilayah: '', visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' });
  const master = {
    'BELUM DITUGASKAN': [item('ODIN', 261, 'BELUM DITUGASKAN')],
    'DEDI ROCHMANSYAH': [item('ALPHA', 1, 'DEDI ROCHMANSYAH'), item('ZETA', 2, 'DEDI ROCHMANSYAH')],
  };
  const handover = {
    'BELUM DITUGASKAN': [{ id: 'h1', debitur: 'ODIN', no: 261, id_klaim: 1, kota: '', wilayah: '', jenis_case: '410', surveyor: 'BELUM DITUGASKAN', originalPosition: 1, item_data: item('ODIN', 261, 'BELUM DITUGASKAN'), timestamp: '' }],
  };
  assert.strictEqual(countUnassignedBucket(master, handover), 2);

  const { nextMaster, nextHandover, moved } = reassignUnassignedBucket(master, handover, 'DEDI ROCHMANSYAH');
  assert.strictEqual(moved, 2);
  assert.deepStrictEqual(nextMaster['DEDI ROCHMANSYAH'].map((i) => i.debitur), ['ALPHA', 'ODIN', 'ZETA']);
  assert.strictEqual(nextMaster['BELUM DITUGASKAN'], undefined);
  assert.strictEqual(nextHandover['DEDI ROCHMANSYAH'][0].surveyor, 'DEDI ROCHMANSYAH');
  assert.strictEqual(countUnassignedBucket(nextMaster, nextHandover), 0);

  // Placeholder targets are rejected
  assert.strictEqual(reassignUnassignedBucket(master, handover, 'BELUM DITUGASKAN').moved, 0);
});
