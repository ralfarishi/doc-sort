import type { ExcelRecord, FolderRecord, MasterItem, MatchResult, MatchCandidate, InsertionStep, MasterState, SearchPhysicalResult, TransitItem, TransitState } from '../types';

export function normalize(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return '';
  return String(text).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function getCleanInvestigatorName(rawName: string | null | undefined): string {
  if (!rawName) return 'TIDAK TERIDENTIFIKASI';
  const name = String(rawName).trim().toUpperCase();
  const mapping: Record<string, string> = {
    'CANDRA': 'CANDRA MAULANA',
    'CANDRA MAULANA': 'CANDRA MAULANA',
    'DEDI': 'DEDI ROCHMANSYAH',
    'DEDI ROCHMANSYAH': 'DEDI ROCHMANSYAH',
    'KIKI': 'KIKI SUMARNA',
    'KIKI SUMARNA': 'KIKI SUMARNA',
    'AHMAD AGUS': 'AHMAD AGUS SALIM',
    'AHMAD AGUS SALIM': 'AHMAD AGUS SALIM',
    'ACHMAD RIDWAN': 'ACHMAD RIDWAN',
    'RAFA': 'RAFA RABBANI',
    'RAFA RABBANI': 'RAFA RABBANI',
    'HARI': 'HARI BUTONI',
    'HARI BUTONI': 'HARI BUTONI',
    'DEDY SUHARTO': 'DEDY SUHARTO',
    'SAWAL': 'SAWAL PURNAMA',
    'SAWAL PURNAMA': 'SAWAL PURNAMA',
  };

  for (const [k, v] of Object.entries(mapping)) {
    if (name.includes(k)) {
      return v;
    }
  }
  return name;
}

// SequenceMatcher-like string similarity
export function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;

  // Edit distance calculation
  const costs: number[] = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  return (longerLength - costs[shorter.length]) / longerLength;
}

export function matchQuery(
  query: string,
  excelList: ExcelRecord[],
  folderList: FolderRecord[],
  targetSurveyor?: string
): MatchResult | null {
  const qNorm = normalize(query);
  if (!qNorm) return null;

  const cleanTarget = targetSurveyor ? getCleanInvestigatorName(targetSurveyor) : '';

  // 1. Collect all candidates
  const candidates: MatchCandidate[] = [];

  for (const ex of excelList) {
    const exNorm = normalize(ex.debitur);
    let score = 0.0;

    if (qNorm === exNorm) {
      score = 1.0;
    } else if (exNorm.includes(qNorm) || qNorm.includes(exNorm)) {
      // Substring match
      const ratio = Math.min(qNorm.length, exNorm.length) / Math.max(qNorm.length, exNorm.length);
      score = Math.max(0.85, ratio);
    } else {
      const sim = stringSimilarity(qNorm, exNorm);
      if (sim > 0.6) {
        score = sim;
      }
    }

    // Also match ID Klaim or No
    if (String(ex.id_klaim) === query.trim() || `#${ex.no}` === query.trim()) {
      score = 1.0;
    }

    if (score >= 0.55) {
      const candSurveyor = getCleanInvestigatorName(ex.surveyor);
      const isUnassigned =
        !ex.surveyor ||
        candSurveyor.includes('BELUM DITUGASKAN') ||
        candSurveyor.includes('TIDAK TERIDENTIFIKASI');
      const isExactSurveyor = Boolean(cleanTarget && !isUnassigned && candSurveyor === cleanTarget);

      // Find folders for this candidate
      const candFolders: FolderRecord[] = [];
      const exNameNorm = normalize(ex.debitur);
      for (const fo of folderList) {
        const foNorm = normalize(fo.clean_name);
        if (exNameNorm === foNorm || qNorm === foNorm) {
          candFolders.push(fo);
        }
      }

      candidates.push({
        excel: ex,
        score,
        isExactSurveyor,
        isUnassigned,
        folders: candFolders,
      });
    }
  }

  if (candidates.length === 0) {
    return {
      query,
      found_excel: false,
      score: 0,
      excel: null,
      folders: [],
      candidates: [],
      hasAmbiguity: false,
      surveyorMismatch: false,
      isUnassigned: false,
    };
  }

  // 2. Sort candidates:
  // - If targetSurveyor is given, prioritize candidate matching targetSurveyor!
  // - High score next
  // - Non-unassigned over unassigned
  candidates.sort((a, b) => {
    if (cleanTarget) {
      if (a.isExactSurveyor && !b.isExactSurveyor) return -1;
      if (!a.isExactSurveyor && b.isExactSurveyor) return 1;
    }
    if (a.isUnassigned !== b.isUnassigned) {
      return a.isUnassigned ? 1 : -1;
    }
    return b.score - a.score;
  });

  const bestCandidate = candidates[0];
  const bestMatch = bestCandidate.excel;
  const bestScore = bestCandidate.score;

  // Check ambiguity: are there multiple candidates with high score?
  const highScorers = candidates.filter((c) => c.score >= 0.75 || normalize(c.excel.debitur) === qNorm);
  const hasAmbiguity = highScorers.length > 1;

  // Check surveyor mismatch
  const candSurveyorClean = getCleanInvestigatorName(bestMatch.surveyor);
  const isUnassigned = bestCandidate.isUnassigned;
  const surveyorMismatch = Boolean(cleanTarget && !isUnassigned && candSurveyorClean !== cleanTarget);

  let warningMessage: string | undefined = undefined;
  if (isUnassigned) {
    warningMessage = 'Nasabah ini tercatat "Belum Ditugaskan" di Master Excel.';
  } else if (surveyorMismatch) {
    warningMessage = `Tercatat untuk surveyor ${bestMatch.surveyor}, bukan ${targetSurveyor}.`;
  } else if (hasAmbiguity) {
    warningMessage = `Ditemukan ${highScorers.length} nasabah dengan nama identik/serupa.`;
  }

  return {
    query,
    found_excel: true,
    score: bestScore,
    excel: bestMatch,
    folders: bestCandidate.folders,
    candidates,
    hasAmbiguity,
    surveyorMismatch,
    isUnassigned,
    warningMessage,
  };
}

export function determineWilayah(kota: string): string {
  const k = (kota || '').toUpperCase();
  if (k.includes('TIMUR')) return 'JAKARTA TIMUR';
  if (k.includes('BANDUNG')) return 'BANDUNG';
  if (k.includes('SUBANG')) return 'SUBANG';
  if (k.includes('DEPOK') || k.includes('BOGOR')) return 'DEPOK / BOGOR';
  return kota || 'WILAYAH LAIN';
}

export function simulateHandInsertion(
  currentMasterItems: MasterItem[],
  newBatchResults: MatchResult[],
  targetSurveyor?: string
): { deskPile: MasterItem[]; steps: InsertionStep[] } {
  const deskPile: MasterItem[] = [...currentMasterItems];
  const steps: InsertionStep[] = [];

  for (let i = 0; i < newBatchResults.length; i++) {
    const res = newBatchResults[i];
    if (!res.excel) continue;
    const ex = res.excel;
    const debName = ex.debitur;
    const debNorm = normalize(debName);

    let insertIdx = 0;
    while (insertIdx < deskPile.length && normalize(deskPile[insertIdx].debitur) < debNorm) {
      insertIdx++;
    }

    let instruksi = '';
    let stepType: 'first' | 'top' | 'bottom' | 'middle' = 'middle';
    let prevDeb: string | undefined = undefined;
    let nextDeb: string | undefined = undefined;

    if (deskPile.length === 0) {
      instruksi = 'Letakkan di meja sebagai lembar dasar tumpukan pertama.';
      stepType = 'first';
    } else if (insertIdx === 0) {
      nextDeb = deskPile[0].debitur;
      instruksi = `Letakkan di paling atas tumpukan meja (tepat di atas "${nextDeb}").`;
      stepType = 'top';
    } else if (insertIdx === deskPile.length) {
      prevDeb = deskPile[deskPile.length - 1].debitur;
      instruksi = `Letakkan di paling bawah tumpukan meja (tepat di bawah "${prevDeb}").`;
      stepType = 'bottom';
    } else {
      prevDeb = deskPile[insertIdx - 1].debitur;
      nextDeb = deskPile[insertIdx].debitur;
      instruksi = `Selipkan di antara "${prevDeb}" dan "${nextDeb}".`;
      stepType = 'middle';
    }

    const finalSurveyor =
      targetSurveyor && (!ex.surveyor || getCleanInvestigatorName(ex.surveyor).includes('BELUM DITUGASKAN'))
        ? targetSurveyor
        : ex.surveyor || targetSurveyor || 'TIDAK TERIDENTIFIKASI';

    const newItem: MasterItem = {
      debitur: ex.debitur,
      no: ex.no,
      id_klaim: ex.id_klaim,
      kota: ex.kota,
      wilayah: ex.wilayah || determineWilayah(ex.kota),
      jenis_case: ex.jenis_case,
      surveyor: finalSurveyor,
      visit: ex.visit,
      status_laporan: ex.status_laporan,
      hasil_visit: ex.hasil_visit,
      files_count: res.folders && res.folders.length > 0 ? res.folders[0].files_count : 0,
      folder_path: res.folders && res.folders.length > 0 ? res.folders[0].path : '',
    };

    deskPile.splice(insertIdx, 0, newItem);

    steps.push({
      step_no: i + 1,
      debitur: debName,
      instruksi,
      new_pos: insertIdx + 1,
      item_data: newItem,
      prev_deb: prevDeb,
      next_deb: nextDeb,
      type: stepType,
    });
  }

  return { deskPile, steps };
}

export function searchPhysicalLocation(query: string, masterState: MasterState): SearchPhysicalResult[] {
  const qNorm = normalize(query);
  if (!qNorm) return [];

  const results: SearchPhysicalResult[] = [];

  for (const [surveyor, items] of Object.entries(masterState)) {
    items.forEach((it, idx) => {
      const debNorm = normalize(it.debitur);
      let sim = 0;

      if (debNorm === qNorm) {
        sim = 1.0;
      } else if (debNorm.includes(qNorm) || qNorm.includes(debNorm)) {
        sim = Math.max(0.85, qNorm.length / debNorm.length);
      } else {
        const s = stringSimilarity(qNorm, debNorm);
        if (s > 0.5) sim = s;
      }

      if (String(it.id_klaim) === query.trim() || `#${it.no}` === query.trim()) {
        sim = 1.0;
      }

      if (sim >= 0.55) {
        results.push({
          sim,
          surveyor,
          position: idx + 1,
          item: it,
          totalInPile: items.length,
          prevNeighbor: idx > 0 ? items[idx - 1] : null,
          nextNeighbor: idx < items.length - 1 ? items[idx + 1] : null,
        });
      }
    });
  }

  return results.sort((a, b) => b.sim - a.sim);
}

export function exportStateToJson(state: MasterState): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `tumpukan_master_${date}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

/** `{ [surveyor]: item[] }` where every item satisfies `isItem`. */
function isSnapshotOf(value: unknown, isItem: (it: Record<string, unknown>) => boolean): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(
    (list) =>
      Array.isArray(list) &&
      list.every((it) => !!it && typeof it === 'object' && !Array.isArray(it) && isItem(it))
  );
}

/** Runtime check that an unknown value is a well-formed MasterState (surveyor -> MasterItem[]). */
export function isMasterState(value: unknown): value is MasterState {
  return isSnapshotOf(value, (it) => typeof it.debitur === 'string');
}

/** Runtime check that an unknown value is a well-formed TransitState (surveyor -> TransitItem[]). */
export function isTransitState(value: unknown): value is TransitState {
  return isSnapshotOf(
    value,
    (it) =>
      typeof it.id === 'string' &&
      typeof it.debitur === 'string' &&
      typeof it.targetSurveyor === 'string'
  );
}

// ---------------------------------------------------------------------------
// Persistence: localStorage + cloud (Turso via /api/state?scope=...)
// ---------------------------------------------------------------------------

export type SyncScope = 'master' | 'transit';

const STORAGE_KEYS: Record<SyncScope, string> = {
  master: 'ORGANIZER_FISIK_MASTER_STATE_V3',
  transit: 'ORGANIZER_FISIK_TRANSIT_STATE_V1',
};

const apiUrl = (scope: SyncScope) => `/api/state?scope=${scope}`;

export function loadStored<T>(scope: SyncScope, guard: (v: unknown) => v is T, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[scope]);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : fallback;
  } catch (err) {
    console.error(`Failed to load ${scope} state from localStorage`, err);
    return fallback;
  }
}

export function saveStored<T>(scope: SyncScope, state: T): void {
  try {
    localStorage.setItem(STORAGE_KEYS[scope], JSON.stringify(state));
  } catch (err) {
    console.error(`Failed to save ${scope} state to localStorage`, err);
  }
}

/**
 * Returns the server snapshot, or `null` when the server is unreachable, unconfigured
 * or responds with a malformed payload. An empty `{}` means "reachable but empty".
 */
export async function fetchServerSnapshot<T>(scope: SyncScope, guard: (v: unknown) => v is T): Promise<T | null> {
  try {
    const res = await fetch(apiUrl(scope), { cache: 'no-store' });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return guard(data) ? data : null;
  } catch {
    return null;
  }
}

export async function pushServerSnapshot<T>(scope: SyncScope, state: T): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(scope), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Data healing & transit helpers
// ---------------------------------------------------------------------------

/**
 * Picks the photo folder for a debtor: prefer the ordner's own surveyor, then the
 * same case type, then any folder with that name.
 */
function pickFolder(candidates: FolderRecord[], ordner: string, jenisCase: string): FolderRecord | undefined {
  const own = candidates.filter((f) => getCleanInvestigatorName(f.surveyor) === ordner);
  const pool = own.length > 0 ? own : candidates;
  return pool.find((f) => String(f.case ?? '') === String(jenisCase)) ?? pool[0];
}

/**
 * Fills `files_count` / `folder_path` for items that have no photo info yet, using the
 * scanned folder index. Returns the SAME reference when nothing changed, so callers can
 * skip re-renders and redundant cloud pushes.
 */
export function backfillFolderInfo(state: MasterState, folders: FolderRecord[]): MasterState {
  const index = new Map<string, FolderRecord[]>();
  for (const f of folders) {
    const key = normalize(f.clean_name);
    if (!key) continue;
    const list = index.get(key);
    if (list) list.push(f);
    else index.set(key, [f]);
  }

  let changed = false;
  const next: MasterState = {};
  for (const [ordner, pile] of Object.entries(state)) {
    next[ordner] = pile.map((item) => {
      if (item.files_count > 0 && item.folder_path) return item;
      const folder = pickFolder(index.get(normalize(item.debitur)) ?? [], ordner, item.jenis_case);
      if (!folder || (folder.files_count === item.files_count && folder.path === item.folder_path)) {
        return item;
      }
      changed = true;
      return { ...item, files_count: folder.files_count, folder_path: folder.path };
    });
  }
  return changed ? next : state;
}

/** Unique id that also works on plain-HTTP LAN access, where `crypto.randomUUID` is unavailable. */
export function createId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Identity of an Excel row: case type + row number is unique, debtor names are not. */
const rowKey = (r: { jenis_case: string; no: number | string }) => `${r.jenis_case}#${r.no}`;

export function isInTransit(transit: TransitState, excel: ExcelRecord): boolean {
  const key = rowKey(excel);
  return Object.values(transit).some((tray) => tray.some((t) => rowKey(t.excelRecord) === key));
}

/** Adds items to their target trays, ignoring rows already in any tray (or repeated in the batch). */
export function addToTransit(transit: TransitState, items: TransitItem[]): TransitState {
  const seen = new Set(Object.values(transit).flatMap((tray) => tray.map((t) => rowKey(t.excelRecord))));
  const next = { ...transit };
  let added = false;
  for (const it of items) {
    const key = rowKey(it.excelRecord);
    if (seen.has(key)) continue;
    seen.add(key);
    next[it.targetSurveyor] = [...(next[it.targetSurveyor] ?? []), it];
    added = true;
  }
  return added ? next : transit;
}

/**
 * Removes tray items that are now filed in the surveyor's pile. Transit items are only
 * cleared once they are really saved, so nothing is lost if the wizard is abandoned.
 */
export function removeFiledFromTransit(transit: TransitState, surveyor: string, pile: MasterItem[]): TransitState {
  const tray = transit[surveyor];
  if (!tray?.length) return transit;
  const filed = new Set(pile.map(rowKey));
  const rest = tray.filter((t) => !filed.has(rowKey(t.excelRecord)));
  if (rest.length === tray.length) return transit;
  const next = { ...transit };
  if (rest.length > 0) next[surveyor] = rest;
  else delete next[surveyor];
  return next;
}

