import type { ExcelRecord, FolderRecord, MasterItem, MatchResult, MatchCandidate, InsertionStep, MasterState, SearchPhysicalResult, TransitItem, TransitState, HandoverItem, HandoverState, HandoverHistoryItem, HandoverHistoryState } from '../types';
import { nameSimilarity, normalizeName, stringSimilarity } from './matching.ts';

export { nameSimilarity, normalizeName, stringSimilarity };
export { jaroSimilarity, jaroWinkler, levenshteinDistance, levenshteinRatio, wordSimilarity } from './matching.ts';

export function normalize(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return '';
  return String(text).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** True when a (cleaned) surveyor name refers to a real investigator, not a placeholder bucket. */
export function isKnownSurveyor(cleanName: string | null | undefined): boolean {
  return Boolean(cleanName) && cleanName !== 'TIDAK TERIDENTIFIKASI' && cleanName !== 'BELUM DITUGASKAN';
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
    let score = nameSimilarity(query, ex.debitur, true);

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

      // Find folders for this candidate with fuzzy support
      const candFolders: FolderRecord[] = [];
      const exNameNorm = normalize(ex.debitur);
      for (const fo of folderList) {
        const foNorm = normalize(fo.clean_name);
        if (
          exNameNorm === foNorm ||
          qNorm === foNorm ||
          // Folders are physical evidence: only link on (token-order-insensitive) exact names, never near-misses
          // such as HARTINI vs KARTINI or SUMIATI vs DJUMIATI.
          nameSimilarity(ex.debitur, fo.clean_name) >= 1.0
        ) {
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
  if (!bestCandidate) {
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
    warningMessage = `Tercatat untuk investigator ${bestMatch.surveyor}, bukan ${targetSurveyor}.`;
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
    if (!res || !res.excel) continue;
    const ex = res.excel;
    const debName = ex.debitur;
    const debNorm = normalize(debName);

    let insertIdx = 0;
    while (insertIdx < deskPile.length) {
      const curItem = deskPile[insertIdx];
      if (!curItem || normalize(curItem.debitur) >= debNorm) break;
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
      nextDeb = deskPile[0]?.debitur ?? '';
      instruksi = `Letakkan di paling atas tumpukan meja (tepat di atas "${nextDeb}").`;
      stepType = 'top';
    } else if (insertIdx === deskPile.length) {
      prevDeb = deskPile[deskPile.length - 1]?.debitur ?? '';
      instruksi = `Letakkan di paling bawah tumpukan meja (tepat di bawah "${prevDeb}").`;
      stepType = 'bottom';
    } else {
      prevDeb = deskPile[insertIdx - 1]?.debitur ?? '';
      nextDeb = deskPile[insertIdx]?.debitur ?? '';
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
      files_count: res.folders?.[0]?.files_count ?? 0,
      folder_path: res.folders?.[0]?.path ?? '',
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

export type { SearchPhysicalResult };

export interface SearchHandoverResult {
  sim: number;
  surveyor: string;
  item: HandoverItem;
}

export interface SearchHistoryResult {
  sim: number;
  surveyor: string;
  item: HandoverHistoryItem;
}

/**
 * DRY scoring for debtor queries: handles exact ID klaim, '#no', and fuzzy name similarity.
 */
export function scoreDebtorMatch(
  query: string,
  item: { debitur: string; id_klaim: number | string; no: number | string }
): number {
  const trimmed = query.trim();
  if (String(item.id_klaim) === trimmed || `#${item.no}` === trimmed) {
    return 1.0;
  }
  return nameSimilarity(query, item.debitur, true);
}

/**
 * Collects 'case#no' composite keys from any organizer states. Names are deliberately
 * excluded: different debtors (and different cases) can share the same name.
 */
export function collectHandledDebtorKeys(
  ...states: (Record<string, { debitur: string; jenis_case: string; no: number | string }[]> | undefined)[]
): Set<string> {
  const keys = new Set<string>();
  for (const state of states) {
    if (!state) continue;
    for (const items of Object.values(state)) {
      for (const it of items) {
        keys.add(`${it.jenis_case}#${it.no}`);
      }
    }
  }
  return keys;
}

export function searchPhysicalLocation(query: string, masterState: MasterState): SearchPhysicalResult[] {
  if (!normalize(query)) return [];
  const results: SearchPhysicalResult[] = [];

  for (const [surveyor, items] of Object.entries(masterState)) {
    items.forEach((it, idx) => {
      const sim = scoreDebtorMatch(query, it);
      if (sim >= 0.55) {
        results.push({
          sim,
          surveyor,
          position: idx + 1,
          item: it,
          totalInPile: items.length,
          prevNeighbor: idx > 0 ? (items[idx - 1] ?? null) : null,
          nextNeighbor: idx < items.length - 1 ? (items[idx + 1] ?? null) : null,
        });
      }
    });
  }
  return results.sort((a, b) => b.sim - a.sim);
}

export function searchHandoverLocation(query: string, handoverState: HandoverState): SearchHandoverResult[] {
  if (!normalize(query)) return [];
  const results: SearchHandoverResult[] = [];

  for (const [surveyor, items] of Object.entries(handoverState)) {
    items.forEach((it) => {
      const sim = scoreDebtorMatch(query, it);
      if (sim >= 0.55) {
        results.push({ sim, surveyor, item: it });
      }
    });
  }
  return results.sort((a, b) => b.sim - a.sim);
}

export function searchHistoryLocation(query: string, historyState: HandoverHistoryState): SearchHistoryResult[] {
  if (!normalize(query)) return [];
  const results: SearchHistoryResult[] = [];

  for (const [surveyor, items] of Object.entries(historyState)) {
    items.forEach((it) => {
      const sim = scoreDebtorMatch(query, it);
      if (sim >= 0.55) {
        results.push({ sim, surveyor, item: it });
      }
    });
  }
  return results.sort((a, b) => b.sim - a.sim);
}

export interface FullBackupPayload {
  version: number;
  timestamp: string;
  master: MasterState;
  history?: HandoverHistoryState;
  transit?: TransitState;
  handover?: HandoverState;
}

function triggerJsonDownload(filenamePrefix: string, data: unknown): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
  const downloadAnchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `${filenamePrefix}_${date}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function exportFullBackupToJson(
  master: MasterState,
  history?: HandoverHistoryState,
  transit?: TransitState,
  handover?: HandoverState
): void {
  const payload: FullBackupPayload = {
    version: 2,
    timestamp: new Date().toISOString(),
    master,
    history,
    transit,
    handover,
  };
  triggerJsonDownload('organizer_backup_full', payload);
}

export function exportStateToJson(state: MasterState): void {
  triggerJsonDownload('tumpukan_master', state);
}

/** Formats a surveyor's master pile into a Markdown catalog table. */
export function formatCatalogMarkdown(surveyor: string, items: MasterItem[]): string {
  let md = `# KATALOG MASTER FISIK: ORDNER ${surveyor}\n\n`;
  md += `Total Berkas: ${items.length} Dokumen (A–Z)\n\n`;
  md += `| No. Fisik | Nama Debitur | Case | No. Excel | Wilayah | ID Klaim | Foto | Label Stiker |\n`;
  md += `|:---:|---|:---:|:---:|---|:---:|:---:|---|\n`;

  items.forEach((it, idx) => {
    const sticker = `[${surveyor.slice(0, 6)}] ${it.jenis_case} No.${it.no} - ${it.debitur}`;
    const foto = it.files_count > 0 ? `${it.files_count} file` : 'Belum ada';
    md += `| **#${idx + 1}** | **${it.debitur}** | ${it.jenis_case} | #${it.no} | ${it.wilayah} | ${it.id_klaim} | ${foto} | \`${sticker}\` |\n`;
  });
  return md;
}

/** Creates a TransitItem from a verified MatchResult if a valid target surveyor exists. */
export function createTransitItemFromMatch(item: MatchResult, sourceSurveyor: string): TransitItem | null {
  if (!item.excel) return null;
  const targetSurv = getCleanInvestigatorName(item.excel.surveyor);
  if (!isKnownSurveyor(targetSurv)) {
    return null;
  }
  return {
    id: createId(),
    debitur: item.excel.debitur,
    sourceSurveyor,
    targetSurveyor: targetSurv,
    timestamp: new Date().toISOString(),
    excelRecord: item.excel,
    folderRecord: item.folders.length > 0 ? item.folders[0] : undefined,
  };
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

/** Runtime check that an unknown value is a well-formed HandoverState (surveyor -> HandoverItem[]). */
export function isHandoverState(value: unknown): value is HandoverState {
  return isSnapshotOf(
    value,
    (it) =>
      typeof it.id === 'string' &&
      typeof it.debitur === 'string' &&
      typeof it.surveyor === 'string'
  );
}

/** Runtime check that an unknown value is a well-formed HandoverHistoryState (surveyor -> HandoverHistoryItem[]). */
export function isHandoverHistoryState(value: unknown): value is HandoverHistoryState {
  return isSnapshotOf(
    value,
    (it) =>
      typeof it.id === 'string' &&
      typeof it.debitur === 'string' &&
      typeof it.surveyor === 'string' &&
      typeof it.handedOverAt === 'string'
  );
}

// ---------------------------------------------------------------------------
// Persistence: localStorage + cloud (Turso via /api/state?scope=...)
// ---------------------------------------------------------------------------

export type SyncScope = 'master' | 'transit' | 'handover' | 'history';

export const STORAGE_KEYS: Record<SyncScope, string> = {
  master: 'ORGANIZER_FISIK_MASTER_STATE_V3',
  transit: 'ORGANIZER_FISIK_TRANSIT_STATE_V1',
  handover: 'ORGANIZER_FISIK_HANDOVER_STATE_V1',
  history: 'ORGANIZER_FISIK_HISTORY_STATE_V1',
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

/** Last server version seen per scope (optimistic lock token). Unknown until the first GET. */
const serverVersions = new Map<SyncScope, number>();

function rememberVersion(scope: SyncScope, res: Response): void {
  const raw = res.headers.get('X-State-Version');
  const v = raw === null ? NaN : Number(raw);
  if (Number.isInteger(v) && v >= 0) serverVersions.set(scope, v);
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
    if (!guard(data)) return null;
    rememberVersion(scope, res);
    return data;
  } catch {
    return null;
  }
}

/**
 * Pushes a snapshot with the optimistic-lock version. Resolves `'conflict'` when another
 * device wrote first (HTTP 409): the caller must refetch instead of overwriting.
 */
export async function pushServerSnapshot<T>(scope: SyncScope, state: T): Promise<boolean | 'conflict'> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const base = serverVersions.get(scope);
    if (base !== undefined) headers['X-Base-Version'] = String(base);
    const res = await fetch(apiUrl(scope), { method: 'POST', headers, body: JSON.stringify(state) });
    if (res.status === 409) return 'conflict';
    if (res.ok) rememberVersion(scope, res);
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

// ---------------------------------------------------------------------------
// Handover (Penyerahan Dokumen) helpers
// ---------------------------------------------------------------------------

/**
 * Extracts items from the surveyor's master pile to the handover list.
 * Automatically compacts and re-indexes the remaining pile.
 * Preserves top-to-bottom physical pile order ("urutan atas adalah tumpukan atas").
 */
export function takeItemsForHandover(
  master: MasterState,
  handover: HandoverState,
  surveyor: string,
  targetKeys: Set<string>
): { nextMaster: MasterState; nextHandover: HandoverState; takenItems: HandoverItem[] } {
  const currentPile = master[surveyor] ?? [];
  if (currentPile.length === 0 || targetKeys.size === 0) {
    return { nextMaster: master, nextHandover: handover, takenItems: [] };
  }

  const remainingPile: MasterItem[] = [];
  const newlyTaken: HandoverItem[] = [];

  currentPile.forEach((it, idx) => {
    const key = `${it.jenis_case}#${it.no}`;
    if (targetKeys.has(key)) {
      newlyTaken.push({
        id: createId(),
        debitur: it.debitur,
        no: it.no,
        id_klaim: it.id_klaim,
        kota: it.kota,
        wilayah: it.wilayah,
        jenis_case: it.jenis_case,
        surveyor,
        originalPosition: idx + 1,
        item_data: it,
        timestamp: new Date().toISOString(),
      });
    } else {
      remainingPile.push(it);
    }
  });

  if (newlyTaken.length === 0) {
    return { nextMaster: master, nextHandover: handover, takenItems: [] };
  }

  const nextMaster: MasterState = {
    ...master,
    [surveyor]: remainingPile,
  };

  // Combine with existing handover items for this surveyor,
  // sorted so that "urutan atas adalah tumpukan atas" (A-Z / top-to-bottom physical order)
  const existingHandover = handover[surveyor] ?? [];
  const combined = [...existingHandover, ...newlyTaken].sort((a, b) => {
    return normalize(a.debitur).localeCompare(normalize(b.debitur));
  });

  const nextHandover: HandoverState = {
    ...handover,
    [surveyor]: combined,
  };

  return { nextMaster, nextHandover, takenItems: newlyTaken };
}

/**
 * Restores a previously taken item from the handover list back into the surveyor's master pile.
 * Re-inserts the item in its proper alphabetical (A-Z) position in the physical pile.
 */
export function returnHandoverItemToMaster(
  master: MasterState,
  handover: HandoverState,
  surveyor: string,
  handoverId: string
): { nextMaster: MasterState; nextHandover: HandoverState; returnedItem?: MasterItem } {
  const currentHandover = handover[surveyor] ?? [];
  const targetIdx = currentHandover.findIndex((h) => h.id === handoverId);
  if (targetIdx === -1) {
    return { nextMaster: master, nextHandover: handover };
  }

  const itemToReturn = currentHandover[targetIdx];
  if (!itemToReturn) {
    return { nextMaster: master, nextHandover: handover };
  }
  const nextHandoverList = currentHandover.filter((_, idx) => idx !== targetIdx);

  const nextHandover: HandoverState = { ...handover };
  if (nextHandoverList.length > 0) {
    nextHandover[surveyor] = nextHandoverList;
  } else {
    delete nextHandover[surveyor];
  }

  // Insert back into master pile in alphabetical order (A-Z)
  const itemData: MasterItem = itemToReturn.item_data ?? {
    no: itemToReturn.no,
    id_klaim: itemToReturn.id_klaim,
    debitur: itemToReturn.debitur,
    kota: itemToReturn.kota,
    wilayah: itemToReturn.wilayah,
    jenis_case: itemToReturn.jenis_case,
    surveyor: itemToReturn.surveyor || surveyor,
    visit: '',
    status_laporan: '',
    hasil_visit: '',
    files_count: 0,
    folder_path: '',
  };

  const pile = [...(master[surveyor] ?? [])];
  const debNorm = normalize(itemData.debitur);
  let insertIdx = 0;
  while (insertIdx < pile.length) {
    const cur = pile[insertIdx];
    if (!cur || normalize(cur.debitur) >= debNorm) break;
    insertIdx++;
  }
  pile.splice(insertIdx, 0, itemData);

  const nextMaster: MasterState = {
    ...master,
    [surveyor]: pile,
  };

  return { nextMaster, nextHandover, returnedItem: itemData };
}

/**
 * Restores all items in handover list (or for a specific surveyor) back into the physical master piles.
 * Each item is restored in its proper alphabetical (A-Z) position in the physical pile.
 */
export function returnAllHandoverToMaster(
  master: MasterState,
  handover: HandoverState,
  surveyor?: string
): { nextMaster: MasterState; nextHandover: HandoverState; returnedCount: number } {
  const targetSurveyors = !surveyor || surveyor === 'ALL'
    ? Object.keys(handover)
    : (handover[surveyor] ? [surveyor] : []);

  let nextMaster: MasterState = { ...master };
  const nextHandover: HandoverState = { ...handover };
  let returnedCount = 0;

  for (const s of targetSurveyors) {
    const items = handover[s];
    if (!items || items.length === 0) continue;

    const pile = [...(nextMaster[s] ?? [])];
    for (const h of items) {
      const itemData: MasterItem = h.item_data ?? {
        no: h.no,
        id_klaim: h.id_klaim,
        debitur: h.debitur,
        kota: h.kota,
        wilayah: h.wilayah,
        jenis_case: h.jenis_case,
        surveyor: h.surveyor || s,
        visit: '',
        status_laporan: '',
        hasil_visit: '',
        files_count: 0,
        folder_path: '',
      };

      const existingIdx = pile.findIndex(
        (p) => `${p.jenis_case}#${p.no}` === `${itemData.jenis_case}#${itemData.no}`
      );
      if (existingIdx === -1) {
        const debNorm = normalize(itemData.debitur);
        let insertIdx = 0;
        while (insertIdx < pile.length) {
          const cur = pile[insertIdx];
          if (!cur || normalize(cur.debitur) >= debNorm) break;
          insertIdx++;
        }
        pile.splice(insertIdx, 0, itemData);
        returnedCount++;
      }
    }

    nextMaster[s] = pile;
    delete nextHandover[s];
  }

  return { nextMaster, nextHandover, returnedCount };
}

/**
 * Clears handover list for a surveyor, or all surveyors if surveyor is omitted or 'ALL'.
 */
export function clearHandoverList(
  handover: HandoverState,
  surveyor?: string
): HandoverState {
  if (!surveyor || surveyor === 'ALL') {
    return {};
  }
  const next = { ...handover };
  delete next[surveyor];
  return next;
}

/**
 * Finalizes handover items by moving them from active handover tray into persistent history.
 * If surveyor is omitted or 'ALL', archives ALL active surveyors atomically in one pass.
 */
export function archiveHandoverToHistory(
  handover: HandoverState,
  history: HandoverHistoryState,
  surveyor?: string,
  notes?: string
): { nextHandover: HandoverState; nextHistory: HandoverHistoryState; archivedCount: number } {
  const isAll = !surveyor || surveyor === 'ALL';
  const targetSurveyors = isAll
    ? Object.keys(handover).filter((s) => (handover[s] ?? []).length > 0)
    : (handover[surveyor] && handover[surveyor].length > 0 ? [surveyor] : []);

  if (targetSurveyors.length === 0) {
    return { nextHandover: handover, nextHistory: history, archivedCount: 0 };
  }

  const timestamp = new Date().toISOString();
  let totalArchived = 0;
  const nextHistory: HandoverHistoryState = { ...history };
  const nextHandover: HandoverState = { ...handover };

  for (const surv of targetSurveyors) {
    const items = handover[surv] ?? [];
    if (items.length === 0) continue;

    const existingHistory = nextHistory[surv] ?? [];
    const existingKeys = new Set(existingHistory.map((h) => `${h.jenis_case}#${h.no}`));

    const newHistoryEntries: HandoverHistoryItem[] = [];
    for (const it of items) {
      const key = `${it.jenis_case}#${it.no}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      newHistoryEntries.push({
        id: it.id || createId(),
        debitur: it.debitur,
        no: it.no,
        id_klaim: it.id_klaim,
        kota: it.kota,
        wilayah: it.wilayah,
        jenis_case: it.jenis_case,
        surveyor: surv,
        handedOverAt: timestamp,
        notes: notes || 'Diserahkan via web',
      });
    }

    nextHistory[surv] = [...existingHistory, ...newHistoryEntries].sort((a, b) =>
      normalize(a.debitur).localeCompare(normalize(b.debitur))
    );

    delete nextHandover[surv];
    totalArchived += items.length;
  }

  return { nextHandover, nextHistory, archivedCount: totalArchived };
}

function buildHistoryLookupSet(history: HandoverHistoryState): Set<string> {
  const set = new Set<string>();
  for (const [surv, items] of Object.entries(history || {})) {
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      if (it.id) set.add(it.id);
      // Identity is the row number, never the name: different people can share the same exact name.
      set.add(`${normalize(surv)}#${it.jenis_case || ''}#${it.no}`);
    }
  }
  return set;
}

function historyItemToHandoverItem(histItem: HandoverHistoryItem): HandoverItem {
  return {
    id: histItem.id || createId(),
    debitur: histItem.debitur,
    no: histItem.no,
    id_klaim: histItem.id_klaim,
    kota: histItem.kota,
    wilayah: histItem.wilayah,
    jenis_case: histItem.jenis_case,
    surveyor: histItem.surveyor,
    originalPosition: 0,
    item_data: {
      no: histItem.no,
      id_klaim: histItem.id_klaim,
      debitur: histItem.debitur,
      kota: histItem.kota,
      wilayah: histItem.wilayah,
      surveyor: histItem.surveyor,
      visit: '',
      status_laporan: '',
      hasil_visit: '',
      jenis_case: histItem.jenis_case,
      files_count: 0,
      folder_path: '',
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Ensures handover state contains no ghost items that have already been archived in history,
 * and prunes any empty surveyor keys.
 */
export function reconcileHandoverWithHistory(
  handover: HandoverState,
  history: HandoverHistoryState
): HandoverState {
  if (!handover || typeof handover !== 'object') return {};

  const historyKeySet = buildHistoryLookupSet(history);
  let changed = false;
  const next: HandoverState = {};

  for (const [surv, items] of Object.entries(handover)) {
    if (!Array.isArray(items) || items.length === 0) {
      changed = true;
      continue;
    }

    const filtered = items.filter((it) => {
      if (it.id && historyKeySet.has(it.id)) return false;
      const dedupeKey = `${normalize(surv)}#${it.jenis_case || ''}#${it.no}`;
      return !historyKeySet.has(dedupeKey);
    });

    if (filtered.length !== items.length) {
      changed = true;
    }

    if (filtered.length > 0) {
      next[surv] = filtered;
    }
  }

  return changed ? next : handover;
}

/**
 * Restores a single archived item from history back into the active handover tray.
 */
export function restoreHistoryItemToHandover(
  history: HandoverHistoryState,
  handover: HandoverState,
  surveyor: string,
  historyId: string
): { nextHistory: HandoverHistoryState; nextHandover: HandoverState; restoredItem?: HandoverItem } {
  const currentHistory = history[surveyor] ?? [];
  const targetIdx = currentHistory.findIndex((h) => h.id === historyId);
  const histItem = targetIdx !== -1 ? currentHistory[targetIdx] : undefined;
  if (!histItem) {
    return { nextHistory: history, nextHandover: handover };
  }

  const nextHistoryList = currentHistory.filter((_, idx) => idx !== targetIdx);
  const nextHistory: HandoverHistoryState = { ...history };
  if (nextHistoryList.length > 0) nextHistory[surveyor] = nextHistoryList;
  else delete nextHistory[surveyor];

  const restoredItem = historyItemToHandoverItem(histItem);
  const existingHandover = handover[surveyor] ?? [];
  const combined = [...existingHandover, restoredItem].sort((a, b) =>
    normalize(a.debitur).localeCompare(normalize(b.debitur))
  );

  return {
    nextHistory,
    nextHandover: { ...handover, [surveyor]: combined },
    restoredItem,
  };
}

/**
 * Restores all archived items for a surveyor from history back into active handover.
 */
export function restoreAllHistoryToHandover(
  history: HandoverHistoryState,
  handover: HandoverState,
  surveyor: string
): { nextHistory: HandoverHistoryState; nextHandover: HandoverState; restoredCount: number } {
  const currentHistory = history[surveyor] ?? [];
  if (currentHistory.length === 0) {
    return { nextHistory: history, nextHandover: handover, restoredCount: 0 };
  }

  const restoredItems = currentHistory.map(historyItemToHandoverItem);
  const nextHistory = { ...history };
  delete nextHistory[surveyor];

  const existingHandover = handover[surveyor] ?? [];
  const combined = [...existingHandover, ...restoredItems].sort((a, b) =>
    normalize(a.debitur).localeCompare(normalize(b.debitur))
  );

  return {
    nextHistory,
    nextHandover: { ...handover, [surveyor]: combined },
    restoredCount: restoredItems.length,
  };
}

export interface IntegrityReport {
  isValid: boolean;
  violations: string[];
  totalMasterDocs: number;
  totalHandoverDocs: number;
  totalHistoryDocs: number;
}

/**
 * Validates invariant rules across physical piles, handover tray, and history:
 *  1. No document in handover may simultaneously exist in history.
 *  2. Master items must have non-negative numbers and valid non-empty debtors.
 *  3. Invariant check is deterministic, pure, and safe to run continuously.
 */
export function validateDataIntegrity(
  master: MasterState,
  handover: HandoverState,
  history: HandoverHistoryState
): IntegrityReport {
  const violations: string[] = [];
  let totalMaster = 0;
  let totalHandover = 0;
  let totalHistory = 0;

  for (const items of Object.values(history || {})) {
    if (Array.isArray(items)) totalHistory += items.length;
  }
  const historyLookup = buildHistoryLookupSet(history);

  for (const [surv, items] of Object.entries(handover || {})) {
    if (!Array.isArray(items)) continue;
    totalHandover += items.length;
    for (const it of items) {
      const matchById = it.id && historyLookup.has(it.id);
      const matchByComposite = historyLookup.has(`${normalize(surv)}#${normalize(it.debitur)}#${it.jenis_case || ''}`);
      if (matchById || matchByComposite) {
        violations.push(`Ghost Document Detected: "${it.debitur}" (${surv}) ada di antrean ambil sekaligus sudah di riwayat.`);
      }
    }
  }

  for (const [surv, items] of Object.entries(master || {})) {
    if (!Array.isArray(items)) continue;
    totalMaster += items.length;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || !it.debitur || !it.debitur.trim()) {
        violations.push(`Invalid Master Item: Berkas kosong di ordner "${surv}" posisi #${i + 1}.`);
      }
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
    totalMasterDocs: totalMaster,
    totalHandoverDocs: totalHandover,
    totalHistoryDocs: totalHistory,
  };
}

// ---------------------------------------------------------------------------
// History healing & unassigned-bucket reassignment
// ---------------------------------------------------------------------------

const UNASSIGNED_BUCKET = 'BELUM DITUGASKAN';
const PURGED_HISTORY_KEY = 'ORGANIZER_PURGED_HISTORY_V1';

const historyKey = (it: { jenis_case: string; no: number | string }) => `${it.jenis_case}#${it.no}`;

/**
 * History is user data stored in Turso: it is never deleted or rewritten based on any local
 * folder or PDF index. This only recovers entries that an earlier app version wrongly purged
 * (kept in a local stash), then empties the stash.
 */
export function healHistory(history: HandoverHistoryState): HandoverHistoryState {
  const stash = readPurgedHistory();
  let changed = false;
  const next: HandoverHistoryState = {};

  // 1. Sanitize any legacy corrupted notes (e.g. ENTIN HARTINI having notes "PDF 410: 301_ENTIN_KARTINI.pdf")
  for (const [surveyor, items] of Object.entries(history || {})) {
    if (!Array.isArray(items)) continue;
    const sanitizedItems = items.map((it) => {
      if (it.notes && it.notes.startsWith('PDF 410:')) {
        const fname = it.notes
          .replace('PDF 410:', '')
          .replace(/^\s*\d+_/, '')
          .replace(/\.(docx?\.)?pdf$/i, '')
          .replace(/_10\d-.*$/, '')
          .replace(/_/g, ' ')
          .trim()
          .toUpperCase();
        const deb = it.debitur.trim().toUpperCase();
        if (deb !== fname && !fname.includes(deb) && !deb.includes(fname)) {
          changed = true;
          return { ...it, notes: 'Diserahkan via web' };
        }
      }
      return it;
    });
    next[surveyor] = sanitizedItems;
  }

  // 2. Restore any previously stashed items
  if (stash.length > 0) {
    const present = new Set(Object.values(next).flatMap((items) => items.map(historyKey)));
    for (const it of stash) {
      const key = historyKey(it);
      if (present.has(key)) continue;
      present.add(key);
      next[it.surveyor] = [...(next[it.surveyor] ?? []), it];
      changed = true;
    }
    writePurgedHistory([]);
  }

  return changed ? next : history;
}

function readPurgedHistory(): HandoverHistoryItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PURGED_HISTORY_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as HandoverHistoryItem[]) : [];
  } catch {
    return [];
  }
}

function writePurgedHistory(items: HandoverHistoryItem[]): void {
  try {
    localStorage.setItem(PURGED_HISTORY_KEY, JSON.stringify(items));
  } catch {
    // Storage unavailable: nothing to recover from.
  }
}
/**
 * True when a document (jenis_case#no) is already tracked anywhere: desk piles, handover
 * queue or history. Used to block duplicate insertion.
 */
export function isDocumentTracked(
  key: string,
  master: MasterState,
  handover: HandoverState,
  history: HandoverHistoryState
): boolean {
  return collectHandledDebtorKeys(master, handover, history).has(key);
}

/**
 * Invariant: a document lives in exactly ONE desk pile. If the same jenis_case#no appears in
 * several piles (stale device push, double insertion), keep one copy: `prefer` surveyor first,
 * then a real investigator, then the "BELUM DITUGASKAN" bucket. Returns the SAME reference when
 * nothing changed so callers skip re-renders and redundant pushes.
 */
export function dedupeMaster(master: MasterState, prefer?: string): MasterState {
  const rank = (s: string) => (s === prefer ? 0 : isKnownSurveyor(s) ? 1 : 2);
  const owner = new Map<string, string>();
  for (const [s, pile] of Object.entries(master)) {
    for (const it of pile) {
      const k = historyKey(it);
      const cur = owner.get(k);
      if (cur === undefined || rank(s) < rank(cur)) owner.set(k, s);
    }
  }

  let changed = false;
  const next: MasterState = {};
  for (const [s, pile] of Object.entries(master)) {
    const seen = new Set<string>();
    const kept = pile.filter((it) => {
      const k = historyKey(it);
      if (owner.get(k) !== s || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (kept.length !== pile.length) changed = true;
    next[s] = kept.length === pile.length ? pile : kept;
  }
  return changed ? next : master;
}

/** Number of documents sitting in the "BELUM DITUGASKAN" bucket of the desk and the handover queue. */
export function countUnassignedBucket(master: MasterState, handover: HandoverState): number {
  return (master[UNASSIGNED_BUCKET]?.length ?? 0) + (handover[UNASSIGNED_BUCKET]?.length ?? 0);
}

/**
 * Moves everything in the "BELUM DITUGASKAN" bucket (desk pile + handover queue) to a real
 * investigator. Desk items keep A–Z order; rows already present in the target are skipped.
 */
export function reassignUnassignedBucket(
  master: MasterState,
  handover: HandoverState,
  target: string
): { nextMaster: MasterState; nextHandover: HandoverState; moved: number } {
  if (!isKnownSurveyor(target)) return { nextMaster: master, nextHandover: handover, moved: 0 };

  const idOf = (r: { jenis_case: string; no: number | string }) => `${r.jenis_case}#${r.no}`;
  let moved = 0;

  const nextMaster: MasterState = { ...master };
  const pile = [...(nextMaster[target] ?? [])];
  const present = new Set(pile.map(idOf));
  for (const it of nextMaster[UNASSIGNED_BUCKET] ?? []) {
    if (present.has(idOf(it))) continue;
    const key = normalize(it.debitur);
    let at = 0;
    while (at < pile.length && normalize(pile[at]?.debitur) < key) at++;
    pile.splice(at, 0, { ...it, surveyor: target });
    present.add(idOf(it));
    moved++;
  }
  delete nextMaster[UNASSIGNED_BUCKET];
  if (moved > 0) nextMaster[target] = pile;

  const nextHandover: HandoverState = { ...handover };
  const queue = [...(nextHandover[target] ?? [])];
  const queued = new Set(queue.map(idOf));
  let movedHandover = 0;
  for (const it of nextHandover[UNASSIGNED_BUCKET] ?? []) {
    if (queued.has(idOf(it))) continue;
    queue.push({ ...it, surveyor: target, item_data: { ...it.item_data, surveyor: target } });
    queued.add(idOf(it));
    movedHandover++;
  }
  delete nextHandover[UNASSIGNED_BUCKET];
  if (movedHandover > 0) nextHandover[target] = queue;

  return { nextMaster, nextHandover, moved: moved + movedHandover };
}
