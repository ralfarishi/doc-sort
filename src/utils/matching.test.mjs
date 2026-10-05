import test from 'node:test';
import assert from 'node:assert';
import {
  jaroSimilarity,
  jaroWinkler,
  levenshteinDistance,
  levenshteinRatio,
  wordSimilarity,
  normalizeName,
  nameSimilarity,
} from './matching.ts';

test('Jaro & Jaro-Winkler Metric Tests', () => {
  // Identical strings
  assert.strictEqual(jaroSimilarity('SULAIMAN', 'SULAIMAN'), 1.0);
  assert.strictEqual(jaroWinkler('SULAIMAN', 'SULAIMAN'), 1.0);

  // Typos with shared prefix
  const jw1 = jaroWinkler('SULAIMAN', 'SULAEMAN');
  assert.ok(jw1 >= 0.90, `Expected jw >= 0.90, got ${jw1}`);

  // Transpositions
  const jw2 = jaroWinkler('MARLINA', 'MALRINA');
  assert.ok(jw2 >= 0.85, `Expected jw >= 0.85, got ${jw2}`);

  // Empty strings
  assert.strictEqual(jaroSimilarity('', 'ABC'), 0.0);
  assert.strictEqual(jaroWinkler('', 'ABC'), 0.0);
});

test('Levenshtein Distance & Ratio Tests', () => {
  assert.strictEqual(levenshteinDistance('KIKI', 'KIKI'), 0);
  assert.strictEqual(levenshteinDistance('RODJAK', 'ROJAK'), 1);
  assert.strictEqual(levenshteinDistance('MAMAN', 'MULYADI'), 5);

  assert.strictEqual(levenshteinRatio('KIKI', 'KIKI'), 1.0);
  assert.ok(levenshteinRatio('RODJAK', 'ROJAK') > 0.80);
});

test('Indonesian Name Normalization & Preprocessing', () => {
  // Academic & Honorary Titles
  assert.strictEqual(normalizeName('MARLINA S.SI'), 'MARLINA');
  assert.strictEqual(normalizeName('SUNARNO BA'), 'SUNARNO');
  assert.strictEqual(normalizeName('DRS. SULAEMAN'), 'SULAEMAN');
  assert.strictEqual(normalizeName('HJ. SITI AMINAH'), 'SITI AMINAH');

  // Abbreviations
  assert.strictEqual(normalizeName('M. RIZKI'), 'MUHAMMAD RIZKI');
  assert.strictEqual(normalizeName('MOCH. RIZKY'), 'MUHAMMAD RIZKY');
  assert.strictEqual(normalizeName('ABD. ROHIM'), 'ABDUL ROHIM');

  // Old spelling harmonization
  assert.strictEqual(normalizeName('ACHMAD DJUEDI SUPRIADI'), 'AHMAD JUEDI SUPRIADI');
  assert.strictEqual(normalizeName('SOEHARTO'), 'SUHARTO');
});

test('Word-Level Similarity with Gatekeeper', () => {
  // Exact
  assert.strictEqual(wordSimilarity('BUDI', 'BUDI'), 1.0);

  // Initial
  assert.strictEqual(wordSimilarity('A', 'ADE'), 0.80);

  // Typos (JW boost)
  assert.ok(wordSimilarity('SULAIMAN', 'SULAEMAN') >= 0.90);

  // Divergent words (gatekeeper protection)
  assert.ok(wordSimilarity('MAMAN', 'MULYADI') < 0.50);
  assert.ok(wordSimilarity('SANTOSO', 'SETIAWAN') < 0.60);
});

test('Full Name Matching Test Suite', () => {
  const cases = [
    { n1: 'BUDI SANTOSO', n2: 'BUDI SANTOSO', expectMatch: true, desc: 'Exact Match' },
    { n1: 'BUDI SANTOSO', n2: 'SANTOSO BUDI', expectMatch: true, desc: 'Word Order Swap' },
    { n1: 'CANDRA MAULANA', n2: 'MAULANA CANDRA', expectMatch: true, desc: 'Word Order Swap 2' },
    { n1: 'SULAIMAN', n2: 'SULAEMAN', expectMatch: true, desc: 'Typo 1 huruf' },
    { n1: 'RODJAK', n2: 'ROJAK', expectMatch: true, desc: 'Typo / Ejaan DJ->J' },
    { n1: 'M. RIZKI', n2: 'MUHAMMAD RIZKI', expectMatch: true, desc: 'Abbreviation M. -> MUHAMMAD' },
    { n1: 'MOCH. RIZKY', n2: 'MUHAMMAD RIZKI', expectMatch: true, desc: 'Abbreviation + Typo Y->I' },
    { n1: 'ACHMAD DJUEDI SUPRIADI', n2: 'AHMAD JUEDI SUPRIADI', expectMatch: true, desc: 'Old Spelling CH, DJ' },
    { n1: 'MARLINA S.SI', n2: 'MARLINA', expectMatch: true, desc: 'Academic Title S.SI' },
    { n1: 'SUNARNO BA', n2: 'SUNARNO', expectMatch: true, desc: 'Academic Title BA' },
    { n1: 'ADE MULYADI', n2: 'ADE MULYADI PUTRA', expectMatch: true, desc: 'Subset Name (Extra token)' },
    { n1: 'CANDRA', n2: 'CANDRA MAULANA', expectMatch: true, isQuery: true, desc: 'Search Query prefix' },

    // False Positive Checks (Strict Rejection: must be < 0.70)
    { n1: 'BUDI SANTOSO', n2: 'BUDI SETIAWAN', expectMatch: false, desc: 'Same first name, diff last' },
    { n1: 'ADE MAMAN', n2: 'ADE MULYADI', expectMatch: false, desc: 'Same first name, diff last 2' },
    { n1: 'A SUMARDI', n2: 'ADE MULYADI', expectMatch: false, desc: 'Different person entirely' },
    { n1: 'HARI BUTONI', n2: 'KIKI SUMARNA', expectMatch: false, desc: 'Completely Different Person' },
  ];

  for (const tc of cases) {
    const score = nameSimilarity(tc.n1, tc.n2, Boolean(tc.isQuery));
    const isMatch = score >= 0.70;
    assert.strictEqual(
      isMatch,
      tc.expectMatch,
      `[${tc.desc}] Failed: "${tc.n1}" vs "${tc.n2}" => Score ${score.toFixed(3)}, Expected match=${tc.expectMatch}`
    );
  }
});
