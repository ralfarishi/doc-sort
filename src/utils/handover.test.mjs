import test from 'node:test';
import assert from 'node:assert';
import {
  takeItemsForHandover,
  returnHandoverItemToMaster,
  clearHandoverList,
} from './logic.ts';

test('takeItemsForHandover extracts items, compacts remaining pile, and preserves top-to-bottom order', () => {
  const surveyor = 'CANDRA MAULANA';
  const initialPile = [
    { debitur: 'ACHMAD FAUZI', no: 1, id_klaim: '101', kota: 'Bandung', wilayah: 'Jawa Barat', jenis_case: '410', surveyor, visit: 'YES', status_laporan: 'DONE', hasil_visit: 'clean', files_count: 5, folder_path: '/f1' },
    { debitur: 'BUDI SANTOSO', no: 2, id_klaim: '102', kota: 'Bandung', wilayah: 'Jawa Barat', jenis_case: '410', surveyor, visit: 'YES', status_laporan: 'DONE', hasil_visit: 'clean', files_count: 3, folder_path: '/f2' },
    { debitur: 'DEDI KURNIA', no: 3, id_klaim: '103', kota: 'Bandung', wilayah: 'Jawa Barat', jenis_case: '410', surveyor, visit: 'YES', status_laporan: 'DONE', hasil_visit: 'clean', files_count: 4, folder_path: '/f3' },
    { debitur: 'HENDRA WIJAYA', no: 4, id_klaim: '104', kota: 'Bandung', wilayah: 'Jawa Barat', jenis_case: '410', surveyor, visit: 'YES', status_laporan: 'DONE', hasil_visit: 'clean', files_count: 2, folder_path: '/f4' },
    { debitur: 'SITI AMINAH', no: 5, id_klaim: '105', kota: 'Bandung', wilayah: 'Jawa Barat', jenis_case: '410', surveyor, visit: 'YES', status_laporan: 'DONE', hasil_visit: 'clean', files_count: 6, folder_path: '/f5' },
  ];

  const master = { [surveyor]: initialPile };
  const handover = {};

  // Take items at position #2 (BUDI) and #4 (HENDRA)
  const targetKeys = new Set(['410#2', '410#4']);
  const { nextMaster, nextHandover, takenItems } = takeItemsForHandover(master, handover, surveyor, targetKeys);

  // 1. Verifikasi item yang diambil
  assert.strictEqual(takenItems.length, 2);
  assert.strictEqual(takenItems[0].debitur, 'BUDI SANTOSO');
  assert.strictEqual(takenItems[0].originalPosition, 2);
  assert.strictEqual(takenItems[1].debitur, 'HENDRA WIJAYA');
  assert.strictEqual(takenItems[1].originalPosition, 4);

  // 2. Verifikasi tumpukan master tersisa otomatis rapat / ter-reindex (tanpa gap)
  const remaining = nextMaster[surveyor];
  assert.strictEqual(remaining.length, 3);
  assert.strictEqual(remaining[0].debitur, 'ACHMAD FAUZI'); // posisi 1
  assert.strictEqual(remaining[1].debitur, 'DEDI KURNIA');  // sekarang posisi 2 (sebelumnya #3)
  assert.strictEqual(remaining[2].debitur, 'SITI AMINAH');  // sekarang posisi 3 (sebelumnya #5)

  // 3. Verifikasi daftar penyerahan (urutan atas adalah tumpukan atas)
  const list = nextHandover[surveyor];
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].debitur, 'BUDI SANTOSO'); // lebih atas di tumpukan
  assert.strictEqual(list[1].debitur, 'HENDRA WIJAYA');
});

test('returnHandoverItemToMaster restores item back to master in proper alphabetical pile order', () => {
  const surveyor = 'CANDRA MAULANA';
  const remainingPile = [
    { debitur: 'ACHMAD FAUZI', no: 1, id_klaim: '101', kota: 'Bandung', wilayah: 'Jawa Barat', jenis_case: '410', surveyor, visit: 'YES', status_laporan: 'DONE', hasil_visit: 'clean', files_count: 5, folder_path: '/f1' },
    { debitur: 'DEDI KURNIA', no: 3, id_klaim: '103', kota: 'Bandung', wilayah: 'Jawa Barat', jenis_case: '410', surveyor, visit: 'YES', status_laporan: 'DONE', hasil_visit: 'clean', files_count: 4, folder_path: '/f3' },
    { debitur: 'SITI AMINAH', no: 5, id_klaim: '105', kota: 'Bandung', wilayah: 'Jawa Barat', jenis_case: '410', surveyor, visit: 'YES', status_laporan: 'DONE', hasil_visit: 'clean', files_count: 6, folder_path: '/f5' },
  ];

  const budiItem = {
    id: 'handover-1',
    debitur: 'BUDI SANTOSO',
    no: 2,
    id_klaim: '102',
    kota: 'Bandung',
    wilayah: 'Jawa Barat',
    jenis_case: '410',
    surveyor,
    originalPosition: 2,
    item_data: { debitur: 'BUDI SANTOSO', no: 2, id_klaim: '102', kota: 'Bandung', wilayah: 'Jawa Barat', jenis_case: '410', surveyor, visit: 'YES', status_laporan: 'DONE', hasil_visit: 'clean', files_count: 3, folder_path: '/f2' },
    timestamp: '2026-10-07T00:00:00Z',
  };

  const master = { [surveyor]: remainingPile };
  const handover = { [surveyor]: [budiItem] };

  // Return BUDI back to master
  const { nextMaster, nextHandover } = returnHandoverItemToMaster(master, handover, surveyor, 'handover-1');

  // BUDI should be placed back between ACHMAD and DEDI (index 1)
  const restoredPile = nextMaster[surveyor];
  assert.strictEqual(restoredPile.length, 4);
  assert.strictEqual(restoredPile[0].debitur, 'ACHMAD FAUZI');
  assert.strictEqual(restoredPile[1].debitur, 'BUDI SANTOSO');
  assert.strictEqual(restoredPile[2].debitur, 'DEDI KURNIA');
  assert.strictEqual(restoredPile[3].debitur, 'SITI AMINAH');

  // Handover list for surveyor should now be empty / removed
  assert.strictEqual(nextHandover[surveyor], undefined);
});

test('clearHandoverList removes items for specified surveyor or all', () => {
  const handover = {
    'CANDRA MAULANA': [{ id: '1', debitur: 'BUDI', no: 1, id_klaim: '1', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'CANDRA MAULANA', originalPosition: 1, item_data: {}, timestamp: '' }],
    'DEDI ROCHMANSYAH': [{ id: '2', debitur: 'AGUS', no: 2, id_klaim: '2', kota: 'Bdg', wilayah: 'Jabar', jenis_case: '410', surveyor: 'DEDI ROCHMANSYAH', originalPosition: 1, item_data: {}, timestamp: '' }],
  };

  const clearedCandra = clearHandoverList(handover, 'CANDRA MAULANA');
  assert.strictEqual(clearedCandra['CANDRA MAULANA'], undefined);
  assert.strictEqual(clearedCandra['DEDI ROCHMANSYAH'].length, 1);

  const clearedAll = clearHandoverList(handover, 'ALL');
  assert.deepStrictEqual(clearedAll, {});
});
