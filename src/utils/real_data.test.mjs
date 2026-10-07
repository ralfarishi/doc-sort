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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Real dataset paths (relative to web/src/utils/ -> root is ../../../)
const MASTER_JSON_PATH = path.resolve(__dirname, '../../../tumpukan_master.json');
const INDEXED_JSON_PATH = path.resolve(__dirname, '../../../indexed_visit_data.json');

const realMaster = JSON.parse(fs.readFileSync(MASTER_JSON_PATH, 'utf8'));
const realIndexed = JSON.parse(fs.readFileSync(INDEXED_JSON_PATH, 'utf8'));

test('Real Data: Verify master structure and real records consistency', () => {
  assert.ok(realMaster['CANDRA MAULANA'], 'Candra Maulana exists in real master');
  assert.ok(realMaster['ACHMAD RIDWAN'], 'Achmad Ridwan exists in real master');
  assert.strictEqual(realMaster['CANDRA MAULANA'].length, 54);
  assert.strictEqual(realMaster['ACHMAD RIDWAN'].length, 44);

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
  const initialCount = initialPile.length; // 54

  // Pilih 3 debitur nyata dari berbagai posisi tumpukan:
  // 1. #1 'A SUMARDI' (paling atas)
  // 2. #23 'MAMAN ABDUL ROHMAN' (tengah)
  // 3. #54 'YULIANI' (paling bawah)
  const target1 = initialPile[0];
  const target2 = initialPile[22];
  const target3 = initialPile[53];

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
  assert.strictEqual(takenItems[1].debitur, target2.debitur);
  assert.strictEqual(takenItems[1].originalPosition, 23);
  assert.strictEqual(takenItems[2].debitur, target3.debitur);
  assert.strictEqual(takenItems[2].originalPosition, 54);

  // 2. Sisa dokumen di tumpukan master otomatis rapat (compacted) tanpa celah
  const remainingPile = nextMaster[surveyor];
  assert.strictEqual(remainingPile.length, initialCount - 3); // 51
  assert.strictEqual(nextMaster['ACHMAD RIDWAN'].length, 44, 'Surveyor lain tidak terpengaruh');

  // Dokumen nomor 1 sekarang menjadi 'ACAH' (sebelumnya nomor 2 di master asli)
  assert.strictEqual(remainingPile[0].debitur, 'ACAH');

  // Dokumen yang diambil sudah tidak ada di sisa tumpukan meja
  const remainingKeys = new Set(remainingPile.map((x) => `${x.jenis_case}#${x.no}`));
  assert.ok(!remainingKeys.has(`${target1.jenis_case}#${target1.no}`));
  assert.ok(!remainingKeys.has(`${target2.jenis_case}#${target2.no}`));
  assert.ok(!remainingKeys.has(`${target3.jenis_case}#${target3.no}`));

  // 3. Verifikasi daftar penyerahan: urutan atas adalah tumpukan atas
  const handoverList = nextHandover[surveyor];
  assert.strictEqual(handoverList.length, 3);
  assert.strictEqual(handoverList[0].debitur, target1.debitur); // Paling atas
  assert.strictEqual(handoverList[1].debitur, target2.debitur); // Tengah
  assert.strictEqual(handoverList[2].debitur, target3.debitur); // Bawah

  // Data yang ditampilkan di daftar penyerahan lengkap sesuai requirement:
  // No urut (1..N), Nama Nasabah, Wilayah, Jenis Case
  assert.ok(handoverList[0].wilayah, 'Memiliki wilayah');
  assert.ok(handoverList[0].jenis_case, 'Memiliki jenis case');
  assert.strictEqual(handoverList[0].jenis_case, '410');
});

test('Real Data: Kembalikan (undo) berkas yang diambil ke tumpukan asli', () => {
  const surveyor = 'CANDRA MAULANA';
  const initialPile = [...realMaster[surveyor]];

  // Ambil MAMAN ABDUL ROHMAN (posisi 23)
  const target = initialPile[22];
  const targetKeys = new Set([`${target.jenis_case}#${target.no}`]);

  const masterState = { [surveyor]: initialPile };
  const handoverState = {};

  const { nextMaster, nextHandover, takenItems } = takeItemsForHandover(
    masterState,
    handoverState,
    surveyor,
    targetKeys
  );

  assert.strictEqual(nextMaster[surveyor].length, 53);
  assert.strictEqual(takenItems.length, 1);
  const takenId = takenItems[0].id;

  // Sekarang lakukan pengembalian berkas (return to master)
  const restored = returnHandoverItemToMaster(nextMaster, nextHandover, surveyor, takenId);

  // Panjang tumpukan kembali utuh 54
  assert.strictEqual(restored.nextMaster[surveyor].length, 54);
  assert.strictEqual(restored.nextHandover[surveyor], undefined, 'Daftar penyerahan kosong');

  // Cek posisi berkas yang dikembalikan: harus berada di antara LILIS ROHAETI dan MAMAN TURISMAN
  const restoredNames = restored.nextMaster[surveyor].map((x) => x.debitur);
  const restoredIndex = restoredNames.indexOf('MAMAN ABDUL ROHMAN');
  assert.strictEqual(restoredIndex, 22, 'Kembali ke posisi indeks 22 semula');
  assert.strictEqual(restoredNames[restoredIndex - 1], 'LILIS ROHAETI');
  assert.strictEqual(restoredNames[restoredIndex + 1], 'MAMAN TURISMAN');
});

test('Real Data: Pencarian fisik dan status penyerahan pada ACHMAD RIDWAN', () => {
  const surveyor = 'ACHMAD RIDWAN';
  const initialPile = [...realMaster[surveyor]];

  // Cari berkas 'BIBIN MUNAWAR'
  const searchResults = searchPhysicalLocation('BIBIN', { [surveyor]: initialPile });
  assert.ok(searchResults.length > 0);
  const found = searchResults.find((r) => r.item.debitur.includes('BIBIN MUNAWAR'));
  assert.ok(found, 'Ditemukan berkas BIBIN MUNAWAR');
  assert.strictEqual(found.position, 5, 'Posisi fisik di tumpukan adalah #5');

  // Ambil berkas BIBIN MUNAWAR untuk diserahkan
  const targetKeys = new Set([`${found.item.jenis_case}#${found.item.no}`]);
  const { nextMaster, nextHandover } = takeItemsForHandover(
    { [surveyor]: initialPile },
    {},
    surveyor,
    targetKeys
  );

  assert.strictEqual(nextMaster[surveyor].length, 43);
  assert.strictEqual(nextHandover[surveyor].length, 1);
  assert.strictEqual(nextHandover[surveyor][0].debitur, 'BIBIN MUNAWAR');
  assert.strictEqual(nextHandover[surveyor][0].wilayah, 'Kab Sukabumi');
  assert.strictEqual(nextHandover[surveyor][0].jenis_case, '147');

  // Cek langsung pada tumpukan fisik master setelah berkas diambil:
  // Item di posisi index 4 (urutan fisik #5) sekarang bergeser ke item ke-6 asli ('DADANG...')
  assert.strictEqual(
    nextMaster[surveyor][4].debitur,
    initialPile[5].debitur,
    'Posisi #5 di tumpukan fisik bergeser ke item ke-6 asli'
  );

  // Verifikasi via searchPhysicalLocation dengan query nama debitur pengganti
  const nextDebName = initialPile[5].debitur;
  const searchAfter = searchPhysicalLocation(nextDebName, { [surveyor]: nextMaster[surveyor] });
  assert.ok(searchAfter.length > 0);
  assert.strictEqual(searchAfter[0].position, 5, 'Posisi fisiknya sekarang terverifikasi nomor #5');
});

test('Real Data: Fuzzy query matching terhadap dataset excel & folder', () => {
  const excel = realIndexed.excel;
  const folders = realIndexed.folders;

  // Test nama asli dengan sedikit typo/variasi
  const result = matchQuery('TATANG SUJANA', excel, folders, 'CANDRA MAULANA');
  assert.ok(result && result.found_excel);
  assert.strictEqual(result.excel.debitur, 'TATANG SUJANA');
  assert.strictEqual(result.excel.jenis_case, '410');
  assert.strictEqual(result.excel.kota, 'Kab Bandung');
});
