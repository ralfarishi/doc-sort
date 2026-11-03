import test from 'node:test';
import assert from 'node:assert';
import {
  archiveHandoverToHistory,
  reconcileHandoverWithHistory,
  validateDataIntegrity,
} from './logic.ts';

test('1. Multi-surveyor archiving in one atomic pass (ALL)', () => {
  const handover = {
    'CANDRA MAULANA': [
      { id: 'c-1', debitur: 'BUDI', no: 1, id_klaim: '1', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', originalPosition: 1, item_data: {}, timestamp: '' }
    ],
    'ACHMAD RIDWAN': [
      { id: 'a-1', debitur: 'ANWAR', no: 1, id_klaim: '2', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'ACHMAD RIDWAN', originalPosition: 1, item_data: {}, timestamp: '' }
    ],
    'KIKI SUMARNA': [
      { id: 'k-1', debitur: 'KIKI DEBTOR', no: 1, id_klaim: '3', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'KIKI SUMARNA', originalPosition: 1, item_data: {}, timestamp: '' }
    ]
  };
  const history = {};

  const result = archiveHandoverToHistory(handover, history, 'ALL');

  assert.strictEqual(result.archivedCount, 3, 'Should archive all 3 documents');
  assert.strictEqual(result.nextHistory['CANDRA MAULANA'].length, 1);
  assert.strictEqual(result.nextHistory['ACHMAD RIDWAN'].length, 1);
  assert.strictEqual(result.nextHistory['KIKI SUMARNA'].length, 1);
  assert.deepStrictEqual(result.nextHandover, {}, 'Handover queue must be completely empty');
});

test('2. Single-surveyor archiving leaves other surveyors untouched', () => {
  const handover = {
    'CANDRA MAULANA': [
      { id: 'c-1', debitur: 'BUDI', no: 1, id_klaim: '1', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', originalPosition: 1, item_data: {}, timestamp: '' }
    ],
    'ACHMAD RIDWAN': [
      { id: 'a-1', debitur: 'ANWAR', no: 1, id_klaim: '2', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'ACHMAD RIDWAN', originalPosition: 1, item_data: {}, timestamp: '' }
    ]
  };
  const history = {};

  const result = archiveHandoverToHistory(handover, history, 'CANDRA MAULANA');

  assert.strictEqual(result.archivedCount, 1);
  assert.strictEqual(result.nextHistory['CANDRA MAULANA'].length, 1);
  assert.strictEqual(result.nextHandover['CANDRA MAULANA'], undefined);
  assert.strictEqual(result.nextHandover['ACHMAD RIDWAN'].length, 1, 'Achmad Ridwan remains untouched');
});

test('3. Ghost item reconciliation removes documents already archived in history', () => {
  const history = {
    'CANDRA MAULANA': [
      { id: 'c-1', debitur: 'BUDI', no: 1, id_klaim: '1', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', handedOverAt: '2026-10-01T00:00:00Z', notes: '' }
    ]
  };

  // Suppose handover has a stale resurrecting item 'c-1' AND a legitimate active item 'c-2'
  const staleHandover = {
    'CANDRA MAULANA': [
      { id: 'c-1', debitur: 'BUDI', no: 1, id_klaim: '1', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', originalPosition: 1, item_data: {}, timestamp: '' },
      { id: 'c-2', debitur: 'SITI', no: 2, id_klaim: '2', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', originalPosition: 2, item_data: {}, timestamp: '' }
    ]
  };

  const healed = reconcileHandoverWithHistory(staleHandover, history);

  assert.strictEqual(healed['CANDRA MAULANA'].length, 1, 'Ghost item c-1 should be eliminated');
  assert.strictEqual(healed['CANDRA MAULANA'][0].id, 'c-2', 'Legitimate item c-2 should be retained');
});

test('4. Ghost reconciliation removes empty arrays and returns empty object when all are ghosts', () => {
  const history = {
    'CANDRA MAULANA': [
      { id: 'c-1', debitur: 'BUDI', no: 1, id_klaim: '1', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', handedOverAt: '2026-10-01T00:00:00Z', notes: '' }
    ]
  };

  const staleHandover = {
    'CANDRA MAULANA': [
      { id: 'c-1', debitur: 'BUDI', no: 1, id_klaim: '1', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', originalPosition: 1, item_data: {}, timestamp: '' }
    ]
  };

  const healed = reconcileHandoverWithHistory(staleHandover, history);
  assert.deepStrictEqual(healed, {}, 'All ghost items purged, resulting in empty state');
});

test('5. Data integrity validator identifies ghost items between handover and history', () => {
  const master = {
    'CANDRA MAULANA': [
      { debitur: 'VALID DEBTOR', no: 1, id_klaim: '1', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' }
    ]
  };
  const history = {
    'CANDRA MAULANA': [
      { id: 'h-1', debitur: 'BUDI', no: 2, id_klaim: '2', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', handedOverAt: '', notes: '' }
    ]
  };
  // Handover has BUDI who is already in history
  const handover = {
    'CANDRA MAULANA': [
      { id: 'h-1', debitur: 'BUDI', no: 2, id_klaim: '2', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', originalPosition: 2, item_data: master['CANDRA MAULANA'][0], timestamp: '' }
    ]
  };

  const report = validateDataIntegrity(master, handover, history);
  assert.strictEqual(report.isValid, false);
  assert.strictEqual(report.violations.length, 1);
  assert.ok(report.violations[0].includes('Ghost Document Detected'));
});

test('6. Data integrity validator reports valid when state partitions are strictly disjoint', () => {
  const master = {
    'CANDRA MAULANA': [
      { debitur: 'A', no: 1, id_klaim: '1', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' }
    ]
  };
  const handover = {
    'CANDRA MAULANA': [
      { id: 'hand-1', debitur: 'B', no: 2, id_klaim: '2', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', originalPosition: 2, item_data: master['CANDRA MAULANA'][0], timestamp: '' }
    ]
  };
  const history = {
    'CANDRA MAULANA': [
      { id: 'hist-1', debitur: 'C', no: 3, id_klaim: '3', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', handedOverAt: '', notes: '' }
    ]
  };

  const report = validateDataIntegrity(master, handover, history);
  assert.strictEqual(report.isValid, true);
  assert.strictEqual(report.violations.length, 0);
  assert.strictEqual(report.totalMasterDocs, 1);
  assert.strictEqual(report.totalHandoverDocs, 1);
  assert.strictEqual(report.totalHistoryDocs, 1);
});
