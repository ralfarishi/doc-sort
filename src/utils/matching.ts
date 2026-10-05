/**
 * High-Performance Fuzzy Name Matching Engine for Indonesian Names
 * Combines Jaro-Winkler, Token Sort Ratio, Token Set Ratio, and Indonesian Linguistic Preprocessing.
 */

// Common Indonesian academic and honorary titles to ignore during name comparison
const TITLES_REGEX = /\b(S\.?PD|S\.?E|S\.?SI|S\.?T|S\.?H|S\.?KOM|S\.?SOS|DRA?|DRS|HJ|H|BA|B\.?A|M\.?PD|M\.?M|M\.?KOM)\b/gi;

// Common Indonesian name abbreviations
const ABBREVIATIONS: Record<string, string> = {
  M: 'MUHAMMAD',
  MUH: 'MUHAMMAD',
  MOCH: 'MUHAMMAD',
  MOH: 'MUHAMMAD',
  MHD: 'MUHAMMAD',
  ACH: 'ACHMAD',
  AKH: 'ACHMAD',
  ABD: 'ABDUL',
};

/**
 * Standard Jaro Similarity Metric
 * Time Complexity: O(|s1| * |s2|) with matching window optimization
 */
export function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const l1 = s1.length;
  const l2 = s2.length;
  if (l1 === 0 || l2 === 0) return 0.0;

  const bound = Math.max(0, Math.floor(Math.max(l1, l2) / 2) - 1);
  const s1M = new Array<boolean>(l1).fill(false);
  const s2M = new Array<boolean>(l2).fill(false);

  let matches = 0;
  for (let i = 0; i < l1; i++) {
    const st = Math.max(0, i - bound);
    const en = Math.min(i + bound + 1, l2);
    for (let j = st; j < en; j++) {
      if (!s2M[j] && s1[i] === s2[j]) {
        s1M[i] = true;
        s2M[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let trans = 0;
  let k = 0;
  for (let i = 0; i < l1; i++) {
    if (s1M[i]) {
      while (!s2M[k]) k++;
      if (s1[i] !== s2[k]) trans++;
      k++;
    }
  }

  trans = Math.floor(trans / 2);
  return (matches / l1 + matches / l2 + (matches - trans) / matches) / 3.0;
}

/**
 * Jaro-Winkler Similarity with prefix bonus
 */
export function jaroWinkler(s1: string, s2: string, prefixWeight = 0.1, maxPrefix = 4): number {
  const j = jaroSimilarity(s1, s2);
  let prefix = 0;
  const limit = Math.min(s1.length, s2.length, maxPrefix);
  for (let i = 0; i < limit; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return j + prefix * prefixWeight * (1.0 - j);
}

/**
 * Levenshtein Distance with O(min(|s1|, |s2|)) memory space
 */
export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  const l1 = s1.length;
  const l2 = s2.length;
  if (l1 === 0) return l2;
  if (l2 === 0) return l1;

  // Ensure s2 is the shorter string for memory efficiency
  let a = s1;
  let b = s2;
  if (l1 < l2) {
    a = s2;
    b = s1;
  }

  const bLen = b.length;
  let prev = new Array<number>(bLen + 1);
  for (let j = 0; j <= bLen; j++) prev[j] = j;

  const aLen = a.length;
  for (let i = 1; i <= aLen; i++) {
    const curr = new Array<number>(bLen + 1);
    curr[0] = i;
    const c1 = a[i - 1];
    for (let j = 1; j <= bLen; j++) {
      if (c1 === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = Math.min(prev[j - 1], prev[j], curr[j - 1]) + 1;
      }
    }
    prev = curr;
  }
  return prev[bLen];
}

/**
 * Normalized Levenshtein ratio (0.0 to 1.0)
 */
export function levenshteinRatio(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return (maxLen - dist) / maxLen;
}

export const stringSimilarity = levenshteinRatio;

/**
 * Word-level similarity evaluator
 * Applies initial matching, edit-distance bounds, and Jaro-Winkler refinement
 */
export function wordSimilarity(w1: string, w2: string): number {
  if (w1 === w2) return 1.0;
  const len1 = w1.length;
  const len2 = w2.length;

  // Single letter initial matching (e.g., 'A' vs 'ADE')
  if ((len1 === 1 && w2.startsWith(w1)) || (len2 === 1 && w1.startsWith(w2))) {
    return 0.80;
  }

  const maxLen = Math.max(len1, len2);
  const dist = levenshteinDistance(w1, w2);
  const levRatio = (maxLen - dist) / maxLen;

  // If words diverge significantly, penalize to avoid false positives (e.g., MAMAN vs MULYADI)
  if (dist > 2 && dist / maxLen > 0.35) {
    return levRatio;
  }

  // For genuine typo candidates, Jaro-Winkler handles transpositions and character alignment
  const jw = jaroWinkler(w1, w2);
  return Math.max(levRatio, jw);
}

/**
 * Preprocessing pipeline tailored for Indonesian personal names
 */
export function normalizeName(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return '';
  const str = String(text).toUpperCase().replace(TITLES_REGEX, ' ');
  const rawWords = str.match(/[A-Z0-9]+/g) || [];
  
  // Expand common abbreviations
  const expanded = rawWords.map((w) => ABBREVIATIONS[w] || w);
  
  // Harmonize historical spelling variations (Soewandi/van Ophuijsen)
  const harmonized = expanded.map((w) =>
    w.replace(/DJ/g, 'J')
     .replace(/OE/g, 'U')
     .replace(/TJ/g, 'C')
     .replace(/CH/g, 'H')
  );
  return harmonized.join(' ');
}

/**
 * Hybrid Name Similarity Metric
 * @param name1 Query or candidate name
 * @param name2 Target comparison name
 * @param isQuerySearch When true, treats name1 as a partial search query
 */
export function nameSimilarity(
  name1: string | number | null | undefined,
  name2: string | number | null | undefined,
  isQuerySearch = false
): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (!n1 || !n2) return 0.0;
  if (n1 === n2) return 1.0;

  const tokens1 = n1.split(' ');
  const tokens2 = n2.split(' ');

  // 1. Sorted tokens match (Word order inversion, e.g. "BUDI SANTOSO" vs "SANTOSO BUDI")
  const sorted1 = [...tokens1].sort().join(' ');
  const sorted2 = [...tokens2].sort().join(' ');
  if (sorted1 === sorted2) return 1.0;

  // 2. Token Sort Ratio (Levenshtein on sorted strings)
  const sortDist = levenshteinDistance(sorted1, sorted2);
  const maxLen = Math.max(sorted1.length, sorted2.length);
  const tokenSortScore = maxLen > 0 ? (maxLen - sortDist) / maxLen : 1.0;

  // 3. Token Set / Subset Matching
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  let intersectCount = 0;
  for (const t of set1) {
    if (set2.has(t)) intersectCount++;
  }

  let tokenSetScore = 0.0;
  if (intersectCount > 0) {
    if (isQuerySearch) {
      if (intersectCount === set1.size) {
        tokenSetScore = 0.85 + 0.15 * (set1.size / set2.size);
      } else {
        tokenSetScore = intersectCount / set1.size;
      }
    } else {
      const minSize = Math.min(set1.size, set2.size);
      const maxSize = Math.max(set1.size, set2.size);
      if (intersectCount === minSize) {
        tokenSetScore = 0.85 + 0.15 * (minSize / maxSize);
      } else {
        tokenSetScore = (intersectCount / set1.size + intersectCount / set2.size) / 2.0;
      }
    }
  }

  // 4. Token-level Alignment with Gatekeeper
  // Prevents false positives between distinct people who share a common first name (e.g. BUDI SANTOSO vs BUDI SETIAWAN)
  let tokenAlignScore = 0.0;
  if (tokens1.length === tokens2.length) {
    const used2 = new Set<number>();
    const tokenSims: number[] = [];

    for (const w1 of tokens1) {
      let bestSim = -1.0;
      let bestIdx = -1;
      for (let idx2 = 0; idx2 < tokens2.length; idx2++) {
        if (used2.has(idx2)) continue;
        const sim = wordSimilarity(w1, tokens2[idx2]);
        if (sim > bestSim) {
          bestSim = sim;
          bestIdx = idx2;
        }
      }
      if (bestIdx >= 0) {
        used2.add(bestIdx);
        tokenSims.push(bestSim);
      } else {
        tokenSims.push(0.0);
      }
    }

    const minSim = tokenSims.length > 0 ? Math.min(...tokenSims) : 0.0;
    const avgSim = tokenSims.length > 0 ? tokenSims.reduce((a, b) => a + b, 0) / tokenSims.length : 0.0;

    // Strict rejection if a non-matching word exists
    if (minSim < 0.60) {
      tokenAlignScore = avgSim * 0.50;
    } else {
      tokenAlignScore = avgSim;
    }
  }

  const finalScore = Math.max(tokenSortScore, tokenSetScore, tokenAlignScore);
  return Number(finalScore.toFixed(4));
}
