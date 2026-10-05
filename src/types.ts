export interface ExcelRecord {
  debitur: string;
  no: number | string;
  id_klaim: number | string;
  kota: string;
  wilayah: string;
  jenis_case: string;
  surveyor: string;
  visit: string;
  status_laporan: string;
  hasil_visit: string;
}

export interface FolderRecord {
  clean_name: string;
  path: string;
  files_count: number;
  surveyor?: string;
  case?: string;
  wilayah?: string;
}

export interface MasterItem {
  debitur: string;
  no: number | string;
  id_klaim: number | string;
  kota: string;
  wilayah: string;
  jenis_case: string;
  surveyor: string;
  visit: string;
  status_laporan: string;
  hasil_visit: string;
  files_count: number;
  folder_path: string;
}

export type MasterState = Record<string, MasterItem[]>;

export interface InsertionStep {
  step_no: number;
  debitur: string;
  instruksi: string;
  new_pos: number;
  item_data: MasterItem;
  prev_deb?: string;
  next_deb?: string;
  type: 'first' | 'top' | 'bottom' | 'middle';
}

export interface MatchCandidate {
  excel: ExcelRecord;
  score: number;
  isExactSurveyor: boolean;
  isUnassigned: boolean;
  folders: FolderRecord[];
}

export interface MatchResult {
  query: string;
  found_excel: boolean;
  score: number;
  excel: ExcelRecord | null;
  folders: FolderRecord[];
  candidates: MatchCandidate[];
  hasAmbiguity: boolean;
  surveyorMismatch: boolean;
  isUnassigned: boolean;
  warningMessage?: string;
}

export interface SearchPhysicalResult {
  sim: number;
  surveyor: string;
  position: number;
  item: MasterItem;
  totalInPile: number;
  prevNeighbor: MasterItem | null;
  nextNeighbor: MasterItem | null;
}

export interface TransitItem {
  id: string;
  debitur: string;
  sourceSurveyor: string;
  targetSurveyor: string;
  timestamp: string;
  excelRecord: ExcelRecord;
  folderRecord?: FolderRecord;
}

export type TransitState = Record<string, TransitItem[]>;
