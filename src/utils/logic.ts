import type { ExcelRecord, FolderRecord, MasterItem, MatchResult, InsertionStep, MasterState, SearchPhysicalResult } from '../types';

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

export function matchQuery(query: string, excelList: ExcelRecord[], folderList: FolderRecord[]): MatchResult | null {
  const qNorm = normalize(query);
  if (!qNorm) return null;

  let bestMatch: ExcelRecord | null = null;
  let bestScore = 0.0;

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

    if (score > bestScore) {
      bestScore = score;
      bestMatch = ex;
    }
  }

  if (!bestMatch || bestScore < 0.55) {
    return {
      query,
      found_excel: false,
      score: 0,
      excel: null,
      folders: [],
    };
  }

  const exNameNorm = normalize(bestMatch.debitur);
  const surveyorExcel = bestMatch.surveyor ? bestMatch.surveyor.trim() : '';

  let matchedFolders: FolderRecord[] = [];
  for (const fo of folderList) {
    const foNorm = normalize(fo.clean_name);
    if (exNameNorm === foNorm || qNorm === foNorm) {
      matchedFolders.push(fo);
    }
  }

  if (matchedFolders.length === 0) {
    const exTokens = new Set(bestMatch.debitur.toUpperCase().match(/\w+/g) || []);
    for (const fo of folderList) {
      const foTokens = new Set((fo.clean_name || '').toUpperCase().match(/\w+/g) || []);
      if (exTokens.size > 0 && foTokens.size > 0) {
        const intersection = new Set([...exTokens].filter(x => foTokens.has(x)));
        if (intersection.size === exTokens.size && intersection.size === foTokens.size) {
          matchedFolders.push(fo);
        } else if (intersection.size >= 2) {
          matchedFolders.push(fo);
        }
      }
    }
  }

  if (matchedFolders.length > 1 && surveyorExcel) {
    const survMatch = matchedFolders.filter(f =>
      f.surveyor && normalize(surveyorExcel).includes(normalize(f.surveyor))
    );
    if (survMatch.length > 0) {
      matchedFolders = survMatch;
    }
  }

  return {
    query,
    found_excel: true,
    score: bestScore,
    excel: bestMatch,
    folders: matchedFolders,
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
  newBatchResults: MatchResult[]
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

    const newItem: MasterItem = {
      debitur: ex.debitur,
      no: ex.no,
      id_klaim: ex.id_klaim,
      kota: ex.kota,
      wilayah: determineWilayah(ex.kota),
      jenis_case: ex.jenis_case,
      surveyor: ex.surveyor,
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

const STORAGE_KEY = 'ORGANIZER_FISIK_MASTER_STATE_V2';

export function loadStoredMasterState(defaultState: MasterState): MasterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      saveStoredMasterState(defaultState);
      return defaultState;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return defaultState;
  } catch (err) {
    console.error('Failed to load state from localStorage', err);
    return defaultState;
  }
}

export function saveStoredMasterState(state: MasterState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save state to localStorage', err);
  }
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
