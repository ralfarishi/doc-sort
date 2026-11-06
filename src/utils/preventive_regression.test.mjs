import test from 'node:test';
import assert from 'node:assert';
import {
  archiveHandoverToHistory,
  takeItemsForHandover,
  returnHandoverItemToMaster,
  returnAllHandoverToMaster,
  reconcileHandoverWithHistory,
  healHistory,
  validateDataIntegrity,
  nameSimilarity,
  collectHandledDebtorKeys,
  scoreDebtorMatch,
  normalize,
} from './logic.ts';

test('PREVENTIF 1: Collision Test - Nama sama persis namun beda orang (DARMAWAN #77 vs #78)', () => {
  // Kasus nyata di database: Dua debitur bernama sama "DARMAWAN", satu Serang (#77), satu Purwakarta (#78)
  const master = {
    'SURVEYOR A': [
      {
        debitur: 'DARMAWAN',
        no: 77,
        id_klaim: '104-19120020262-046',
        kota: 'Serang',
        wilayah: 'BANTEN',
        jenis_case: '410',
        surveyor: 'SURVEYOR A',
        visit: 'YES',
        status_laporan: 'DONE',
        hasil_visit: 'clean',
        files_count: 5,
        folder_path: '',
      },
      {
        debitur: 'DARMAWAN',
        no: 78,
        id_klaim: '104-19100019122-046',
        kota: 'Purwakarta',
        wilayah: 'PURWAKARTA',
        jenis_case: '410',
        surveyor: 'SURVEYOR A',
        visit: 'YES',
        status_laporan: 'DONE',
        hasil_visit: 'clean',
        files_count: 8,
        folder_path: '',
      },
    ],
  };

  // Ambil hanya satu orang (DARMAWAN #77) untuk diserahkan
  const targetKeys = new Set(['410#77']);
  const { nextMaster, nextHandover } = takeItemsForHandover(master, {}, 'SURVEYOR A', targetKeys);

  // Verifikasi DARMAWAN #78 tetap ada di meja, tidak ikut terambil
  assert.strictEqual(nextMaster['SURVEYOR A'].length, 1);
  assert.strictEqual(nextMaster['SURVEYOR A'][0].no, 78);
  assert.strictEqual(nextMaster['SURVEYOR A'][0].kota, 'Purwakarta');

  // Verifikasi DARMAWAN #77 berada di antrean penyerahan
  assert.strictEqual(nextHandover['SURVEYOR A'].length, 1);
  assert.strictEqual(nextHandover['SURVEYOR A'][0].no, 77);
  assert.strictEqual(nextHandover['SURVEYOR A'][0].kota, 'Serang');

  // Arsipkan DARMAWAN #77 ke history
  const { nextHandover: archivedHandover, nextHistory } = archiveHandoverToHistory(
    nextHandover,
    {},
    'SURVEYOR A'
  );

  assert.strictEqual(archivedHandover['SURVEYOR A'], undefined);
  assert.strictEqual(nextHistory['SURVEYOR A'].length, 1);
  assert.strictEqual(nextHistory['SURVEYOR A'][0].no, 77);

  // Rekonsiliasi: DARMAWAN #78 di meja DILARANG dianggap ghost hanya karena namanya sama persis dengan DARMAWAN #77 di history
  const handledKeys = collectHandledDebtorKeys(nextMaster, archivedHandover, nextHistory);
  assert.ok(handledKeys.has('410#77'), 'Key 410#77 terdata');
  assert.ok(handledKeys.has('410#78'), 'Key 410#78 terdata');
});

test('PREVENTIF 2: Near-Miss Test - Nama mirip 1 karakter beda orang (ENTIN HARTINI vs KARTINI)', () => {
  // ENTIN HARTINI (#123) dan ENTIN KARTINI (#124)
  const entinHartini = { debitur: 'ENTIN HARTINI', id_klaim: '28153', no: 123 };
  const entinKartini = { debitur: 'ENTIN KARTINI', id_klaim: '32753', no: 124 };

  // Query pencarian dengan ID klaim harus 100% tepat menunjuk ke orang yang bersangkutan
  assert.strictEqual(scoreDebtorMatch('28153', entinHartini), 1.0);
  assert.notStrictEqual(scoreDebtorMatch('28153', entinKartini), 1.0);

  // Normalisasi string tidak boleh menganggap HARTINI dan KARTINI adalah entitas yang identik
  assert.notStrictEqual(normalize(entinHartini.debitur), normalize(entinKartini.debitur));
});

test('PREVENTIF 3: Lifecycle Invariant - Dokumen diarsipkan tidak boleh hilang saat di-refresh/heal', () => {
  // Simulasi 15 data batch baru dimasukkan ke antrean handover
  const dummyHandover = {
    'INVESTIGATOR A': Array.from({ length: 15 }, (_, i) => ({
      id: `new-uuid-${i + 1}`,
      debitur: `NASABAH TAMBAHAN ${i + 1}`,
      no: 1000 + i,
      id_klaim: 50000 + i,
      kota: 'Bandung',
      wilayah: 'BANDUNG',
      jenis_case: '410',
      surveyor: 'INVESTIGATOR A',
      originalPosition: i + 1,
      item_data: {},
      timestamp: new Date().toISOString(),
    })),
  };

  // Klik tombol arsipkan
  const { nextHandover, nextHistory, archivedCount } = archiveHandoverToHistory(
    dummyHandover,
    {},
    'INVESTIGATOR A',
    'Arsip tambahan baru'
  );

  assert.strictEqual(archivedCount, 15);
  assert.strictEqual(nextHistory['INVESTIGATOR A'].length, 15);

  // SIMULASI REFRESH HALAMAN:
  // 1. Jalankan healHistory (harus non-destruktif, tidak memangkas 15 data tersebut)
  const afterReload = healHistory(nextHistory);
  assert.strictEqual(
    afterReload['INVESTIGATOR A'].length,
    15,
    '15 data baru di history tidak boleh hilang setelah fungsi heal dijalankan'
  );

  // 2. Jalankan reconcileHandoverWithHistory
  const reconciledHandover = reconcileHandoverWithHistory(nextHandover, afterReload);
  assert.deepStrictEqual(reconciledHandover, {});

  // 3. Validasi Invariant Integrity: Harus 100% valid tanpa ghost document
  const report = validateDataIntegrity({}, reconciledHandover, afterReload);
  assert.strictEqual(report.isValid, true);
  assert.strictEqual(report.violations.length, 0);
  assert.strictEqual(report.totalHistoryDocs, 15);
});

test('PREVENTIF 4: Handover Cancellation Invariant - Batal / Kosongkan Antrean mengembalikan berkas ke meja fisik', () => {
  const surveyor = 'CANDRA MAULANA';
  const initialMaster = {
    [surveyor]: [
      { debitur: 'AHMAD', no: 1, id_klaim: '101', kota: 'Bandung', wilayah: 'BDG', jenis_case: '410', surveyor, visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' },
      { debitur: 'BUDI', no: 2, id_klaim: '102', kota: 'Bandung', wilayah: 'BDG', jenis_case: '410', surveyor, visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' },
      { debitur: 'DANI', no: 3, id_klaim: '103', kota: 'Bandung', wilayah: 'BDG', jenis_case: '410', surveyor, visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' },
      { debitur: 'EKO', no: 4, id_klaim: '104', kota: 'Bandung', wilayah: 'BDG', jenis_case: '410', surveyor, visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' },
      { debitur: 'FARHAN', no: 5, id_klaim: '105', kota: 'Bandung', wilayah: 'BDG', jenis_case: '410', surveyor, visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' },
    ]
  };

  // User mengambil 5 data via "Ambil untuk diserahkan"
  const targetKeys = new Set(['410#1', '410#2', '410#3', '410#4', '410#5']);
  const { nextMaster: masterAfterTake, nextHandover: handoverAfterTake } = takeItemsForHandover(
    initialMaster,
    {},
    surveyor,
    targetKeys
  );

  assert.strictEqual((masterAfterTake[surveyor] ?? []).length, 0);
  assert.strictEqual(handoverAfterTake[surveyor].length, 5);

  // User membatalkan pengambilan (Kosongkan Antrean / Batal)
  const { nextMaster: masterAfterCancel, nextHandover: handoverAfterCancel, returnedCount } = returnAllHandoverToMaster(
    masterAfterTake,
    handoverAfterTake,
    surveyor
  );

  assert.strictEqual(returnedCount, 5);
  assert.strictEqual(handoverAfterCancel[surveyor], undefined);
  assert.strictEqual(masterAfterCancel[surveyor].length, 5);

  // Pastikan urutan kembali A-Z dengan tepat
  const restoredNames = masterAfterCancel[surveyor].map((it) => it.debitur);
  assert.deepStrictEqual(restoredNames, ['AHMAD', 'BUDI', 'DANI', 'EKO', 'FARHAN']);

  // Pastikan semua 5 berkas tercatat kembali sebagai "handled" (tidak berstatus "Belum ada di meja")
  const handledKeys = collectHandledDebtorKeys(masterAfterCancel, handoverAfterCancel, {});
  assert.strictEqual(handledKeys.has('410#1'), true);
  assert.strictEqual(handledKeys.has('410#2'), true);
  assert.strictEqual(handledKeys.has('410#3'), true);
  assert.strictEqual(handledKeys.has('410#4'), true);
  assert.strictEqual(handledKeys.has('410#5'), true);
});

test('PREVENTIF 5: Sequential Item Return - Mengembalikan 1 per 1 tetap mempertahankan urutan A-Z', () => {
  const surveyor = 'CANDRA MAULANA';
  const initialMaster = {
    [surveyor]: [
      { debitur: 'AHMAD', no: 1, id_klaim: '101', kota: 'Bandung', wilayah: 'BDG', jenis_case: '410', surveyor, visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' },
      { debitur: 'FARHAN', no: 5, id_klaim: '105', kota: 'Bandung', wilayah: 'BDG', jenis_case: '410', surveyor, visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' },
    ]
  };

  const initialHandover = {
    [surveyor]: [
      {
        id: 'h-dani',
        debitur: 'DANI',
        no: 3,
        id_klaim: '103',
        kota: 'Bandung',
        wilayah: 'BDG',
        jenis_case: '410',
        surveyor,
        originalPosition: 2,
        item_data: { debitur: 'DANI', no: 3, id_klaim: '103', kota: 'Bandung', wilayah: 'BDG', jenis_case: '410', surveyor, visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' },
        timestamp: new Date().toISOString()
      }
    ]
  };

  // Kembalikan DANI ke master
  const { nextMaster, nextHandover, returnedItem } = returnHandoverItemToMaster(
    initialMaster,
    initialHandover,
    surveyor,
    'h-dani'
  );

  assert.strictEqual(returnedItem?.debitur, 'DANI');
  assert.strictEqual(nextHandover[surveyor], undefined);
  // Posisi DANI harus berada di antara AHMAD dan FARHAN (A-Z)
  assert.deepStrictEqual(nextMaster[surveyor].map((it) => it.debitur), ['AHMAD', 'DANI', 'FARHAN']);
});

test('PREVENTIF 6: Dedup - dokumen yang sama di 2 pile hanya disisakan satu (prefer investigator asli)', async () => {
  const { dedupeMaster, isDocumentTracked } = await import('./logic.ts');
  const mk = (s) => ({ debitur: 'NURSIDAH', no: 588, id_klaim: '', kota: 'X', wilayah: 'X', jenis_case: 'Reguler 2', surveyor: s, visit: '', status_laporan: '', hasil_visit: '', files_count: 0, folder_path: '' });
  const master = { 'BELUM DITUGASKAN': [mk('BELUM DITUGASKAN')], 'KIKI SUMARNA': [mk('KIKI SUMARNA')] };
  const out = dedupeMaster(master);
  assert.strictEqual(out['BELUM DITUGASKAN'].length, 0);
  assert.strictEqual(out['KIKI SUMARNA'].length, 1);
  assert.strictEqual(dedupeMaster(out), out);
  assert.strictEqual(isDocumentTracked('Reguler 2#588', out, {}, {}), true);
});
