import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  takeItemsForHandover,
  returnHandoverItemToMaster,
  searchPhysicalLocation,
  matchQuery,
} from './logic.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MASTER_JSON_PATH = path.resolve(__dirname, '../data/tumpukan_master.json');
const INDEXED_JSON_PATH = path.resolve(__dirname, '../data/indexed_visit_data.json');

const realMaster = JSON.parse(fs.readFileSync(MASTER_JSON_PATH, 'utf8'));
const realIndexed = JSON.parse(fs.readFileSync(INDEXED_JSON_PATH, 'utf8'));

test('Real Data: Verify master structure and real records consistency', () => {
  assert.ok(realMaster['CANDRA MAULANA'], 'Candra Maulana exists in real master');
  assert.ok(realMaster['ACHMAD RIDWAN'], 'Achmad Ridwan exists in real master');
  assert.ok(realMaster['CANDRA MAULANA'].length > 0, 'Candra Maulana has items');

  // Excel mapping
  const excelKeys = new Set(realIndexed.excel.map((x) => `${x.jenis_case}#${x.no}`));
  for (const [_surveyor, pile] of Object.entries(realMaster)) {
    for (const item of pile) {
      assert.ok(
        excelKeys.has(`${item.jenis_case}#${item.no}`),
        `Item ${item.debitur} (${item.jenis_case}#${item.no}) must exist in real excel`
      );
    }
  }
});

test('Real Data: Handover extraction on CANDRA MAULANA real pile', () => {
  const surveyor = 'CANDRA MAULANA';
  const initialPile = [...realMaster[surveyor]];
  const initialCount = initialPile.length;

  const target1 = initialPile[0];
  const target2 = initialPile[Math.floor(initialCount / 2)];
  const target3 = initialPile[initialCount - 1];

  const targetKeys = new Set([
    `${target1.jenis_case}#${target1.no}`,
    `${target2.jenis_case}#${target2.no}`,
    `${target3.jenis_case}#${target3.no}`,
  ]);

  const masterState = {
    'CANDRA MAULANA': initialPile,
    'ACHMAD RIDWAN': [...realMaster['ACHMAD RIDWAN']],
  };
  const handoverState = {};

  const { nextMaster, nextHandover, takenItems } = takeItemsForHandover(
    masterState,
    handoverState,
    surveyor,
    targetKeys
  );

  // 1. Verifikasi item yang diambil
  assert.strictEqual(takenItems.length, 3);
  assert.strictEqual(takenItems[0].debitur, target1.debitur);
  assert.strictEqual(takenItems[0].originalPosition, 1);

  // 2. Sisa dokumen di tumpukan master otomatis rapat (compacted) tanpa celah
  const remainingPile = nextMaster[surveyor];
  assert.strictEqual(remainingPile.length, initialCount - 3);
  assert.strictEqual(nextMaster['ACHMAD RIDWAN'].length, realMaster['ACHMAD RIDWAN'].length, 'Surveyor lain tidak terpengaruh');

  // Dokumen yang diambil sudah tidak ada di sisa tumpukan meja
  const remainingKeys = new Set(remainingPile.map((x) => `${x.jenis_case}#${x.no}`));
  assert.ok(!remainingKeys.has(`${target1.jenis_case}#${target1.no}`));
  assert.ok(!remainingKeys.has(`${target2.jenis_case}#${target2.no}`));
  assert.ok(!remainingKeys.has(`${target3.jenis_case}#${target3.no}`));

  // 3. Verifikasi daftar antrean penyerahan (Handover List)
  const handoverList = nextHandover[surveyor];
  assert.strictEqual(handoverList.length, 3);

  // Data yang ditampilkan di daftar penyerahan lengkap sesuai requirement:
  assert.ok(handoverList[0].wilayah, 'Memiliki wilayah');
  assert.ok(handoverList[0].jenis_case, 'Memiliki jenis case');
});

test('Real Data: Kembalikan (undo) berkas yang diambil ke tumpukan asli', () => {
  const surveyor = 'CANDRA MAULANA';
  const initialPile = [...realMaster[surveyor]];
  const initialCount = initialPile.length;

  const target = initialPile[Math.floor(initialCount / 2)];
  const targetKeys = new Set([`${target.jenis_case}#${target.no}`]);

  const masterState = { [surveyor]: initialPile };
  const handoverState = {};

  const { nextMaster, nextHandover, takenItems } = takeItemsForHandover(
    masterState,
    handoverState,
    surveyor,
    targetKeys
  );

  assert.strictEqual(nextMaster[surveyor].length, initialCount - 1);
  assert.strictEqual(takenItems.length, 1);
  const takenId = takenItems[0].id;

  // Sekarang lakukan pengembalian berkas (return to master)
  const restored = returnHandoverItemToMaster(nextMaster, nextHandover, surveyor, takenId);

  // Panjang tumpukan kembali utuh
  assert.strictEqual(restored.nextMaster[surveyor].length, initialCount);
  assert.strictEqual(restored.nextHandover[surveyor], undefined, 'Daftar penyerahan kosong');
});

test('Real Data: Pencarian fisik dan status penyerahan pada ACHMAD RIDWAN', () => {
  const surveyor = 'ACHMAD RIDWAN';
  const initialPile = [...realMaster[surveyor]];
  assert.ok(initialPile.length > 0, 'Achmad Ridwan has remaining desk items');

  const testItem = initialPile[0];
  const searchResults = searchPhysicalLocation(testItem.debitur.split(' ')[0], { [surveyor]: initialPile });
  assert.ok(searchResults.length > 0);
  const found = searchResults.find((r) => r.item.debitur === testItem.debitur);
  assert.ok(found, `Ditemukan berkas ${testItem.debitur}`);
  assert.strictEqual(found.position, 1, 'Posisi fisik di tumpukan adalah #1');

  // Ambil berkas untuk diserahkan
  const targetKeys = new Set([`${found.item.jenis_case}#${found.item.no}`]);
  const { nextMaster, nextHandover } = takeItemsForHandover(
    { [surveyor]: initialPile },
    {},
    surveyor,
    targetKeys
  );

  assert.strictEqual(nextMaster[surveyor].length, initialPile.length - 1);
  assert.strictEqual(nextHandover[surveyor].length, 1);
  assert.strictEqual(nextHandover[surveyor][0].debitur, testItem.debitur);
});

test('Real Data: Fuzzy query matching terhadap dataset excel & folder', () => {
  const excelList = realIndexed.excel;
  const folderList = realIndexed.folders;

  // 1. Exact match query
  const res1 = matchQuery('ENTIN HARTINI', excelList, folderList);
  assert.ok(res1);
  assert.ok(res1.found_excel);
  assert.strictEqual(res1.excel.debitur, 'ENTIN HARTINI');

  // 2. Query ID Klaim
  const resId = matchQuery('28153', excelList, folderList);
  assert.ok(resId);
  assert.ok(resId.found_excel);
  assert.strictEqual(resId.excel.debitur, 'ENTIN HARTINI');

  // 3. Typo/partial query match
  const resTypo = matchQuery('ENTIN HARTIN', excelList, folderList);
  assert.ok(resTypo);
  assert.ok(resTypo.found_excel);
  assert.strictEqual(resTypo.excel.debitur, 'ENTIN HARTINI');
});
