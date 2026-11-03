import { useState } from 'react';
import type {
  ExcelRecord,
  FolderRecord,
  MasterState,
  MasterItem,
  InsertionStep,
  MatchResult,
  MatchCandidate,
  TransitItem,
} from '../types';
import {
  matchQuery,
  simulateHandInsertion,
  getCleanInvestigatorName,
  createTransitItemFromMatch,
} from '../utils/logic';

export interface UseInsertWizardParams {
  masterState: MasterState;
  excelList: ExcelRecord[];
  folderList: FolderRecord[];
  selectedSurveyor: string;
  prefillNames: string[];
  onSelectSurveyor: (surveyor: string) => void;
  onSaveNewMaster: (surveyor: string, newPile: MasterItem[], steps: InsertionStep[]) => void;
  onAddToTransit: (item: TransitItem) => void;
  onShowToast: (type: 'success' | 'warning' | 'error' | 'info', message: string, desc?: string) => void;
}

/** Pure helper to resolve unassigned/mismatched items to a target surveyor. */
const assignWarningsToSurveyor = (items: MatchResult[], surveyor: string): MatchResult[] =>
  items.map((m) =>
    (m.isUnassigned || m.surveyorMismatch) && m.excel
      ? {
          ...m,
          excel: { ...m.excel, surveyor },
          isUnassigned: false,
          surveyorMismatch: false,
          warningMessage: undefined,
        }
      : m
  );

export function useInsertWizard({
  masterState,
  excelList,
  folderList,
  selectedSurveyor,
  prefillNames,
  onSelectSurveyor,
  onSaveNewMaster,
  onAddToTransit,
  onShowToast,
}: UseInsertWizardParams) {
  const [stage, setStage] = useState<'input' | 'review' | 'stepper'>('input');
  const [mode, setMode] = useState<'sisip' | 'baru'>('sisip');
  const [rawInputText, setRawInputText] = useState(() => prefillNames.join('\n'));

  const [verifiedResults, setVerifiedResults] = useState<MatchResult[]>([]);
  const [failedQueries, setFailedQueries] = useState<string[]>([]);
  const [calculatedSteps, setCalculatedSteps] = useState<InsertionStep[] | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [showFullTable, setShowFullTable] = useState(false);
  const [isProblemConfirmModalOpen, setIsProblemConfirmModalOpen] = useState(false);

  const currentDeskPile = masterState[selectedSurveyor] ?? [];
  const pendingWarnings = verifiedResults.filter((m) => m.isUnassigned || m.surveyorMismatch);

  const handleSurveyorChange = (newSurv: string) => {
    onSelectSurveyor(newSurv);
    if (verifiedResults.length > 0) {
      setVerifiedResults(
        verifiedResults.map((r) => {
          const re = matchQuery(r.query, excelList, folderList, newSurv);
          return re && re.found_excel ? re : r;
        })
      );
    }
  };

  // Stage 1 -> Stage 2: Parse and Match
  const handleVerify = () => {
    const lines = rawInputText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      onShowToast('warning', 'Input Kosong', 'Ketik atau tempelkan minimal satu nama debitur.');
      return;
    }

    const matched: MatchResult[] = [];
    const failed: string[] = [];

    for (const line of lines) {
      const res = matchQuery(line, excelList, folderList, selectedSurveyor);
      if (res && res.found_excel && res.excel) {
        matched.push(res);
      } else {
        failed.push(line);
      }
    }

    if (matched.length === 0) {
      onShowToast('error', 'Tidak Ada Berkas Valid', 'Semua nama yang dimasukkan tidak ditemukan di Master Excel.');
      setVerifiedResults([]);
      setFailedQueries(failed);
      return;
    }

    setVerifiedResults(matched);
    setFailedQueries(failed);
    setStage('review');

    const warningCount = matched.filter((m) => m.hasAmbiguity || m.surveyorMismatch || m.isUnassigned).length;
    if (warningCount > 0) {
      onShowToast(
        'warning',
        'Verifikasi Memerlukan Review',
        `Ditemukan ${warningCount} berkas dengan nama identik atau status belum ditugaskan.`
      );
    } else {
      onShowToast('success', 'Verifikasi Selesai', `${matched.length} berkas valid dan cocok dengan Ordner ${selectedSurveyor}.`);
    }
  };

  const handleSelectCandidate = (resultIndex: number, candidate: MatchCandidate) => {
    setVerifiedResults((prev) => {
      const updated = [...prev];
      const cur = updated[resultIndex];
      if (!cur) return prev;

      const cleanTarget = getCleanInvestigatorName(selectedSurveyor);
      const candSurveyor = getCleanInvestigatorName(candidate.excel.surveyor);
      const isUnassigned = candidate.isUnassigned;
      const surveyorMismatch = Boolean(cleanTarget && !isUnassigned && candSurveyor !== cleanTarget);

      let warningMessage: string | undefined;
      if (isUnassigned) {
        warningMessage = 'Nasabah ini tercatat "Belum Ditugaskan" di Master Excel.';
      } else if (surveyorMismatch) {
        warningMessage = `Tercatat untuk investigator ${candidate.excel.surveyor}, bukan ${selectedSurveyor}.`;
      }

      updated[resultIndex] = {
        ...cur,
        excel: candidate.excel,
        folders: candidate.folders,
        score: candidate.score,
        isUnassigned,
        surveyorMismatch,
        warningMessage,
      };
      return updated;
    });
  };

  const handleAssignItemToCurrentOrdner = (index: number) => {
    setVerifiedResults((prev) => {
      const updated = [...prev];
      const cur = updated[index];
      if (!cur || !cur.excel) return prev;
      updated[index] = {
        ...cur,
        excel: { ...cur.excel, surveyor: selectedSurveyor },
        isUnassigned: false,
        surveyorMismatch: false,
        warningMessage: undefined,
      };
      return updated;
    });
    onShowToast(
      'success',
      'Ditetapkan ke Ordner Ini',
      `${verifiedResults[index]?.excel?.debitur ?? 'Berkas'} resmi dialihkan ke ${selectedSurveyor}.`
    );
  };

  const handleAssignAllWarnings = () => {
    setVerifiedResults((prev) => assignWarningsToSurveyor(prev, selectedSurveyor));
    onShowToast(
      'success',
      'Semua Berkas Ditetapkan',
      `${pendingWarnings.length} berkas ditetapkan ke Ordner ${selectedSurveyor}.`
    );
  };

  const handleSendToTransit = (index: number) => {
    const item = verifiedResults[index];
    if (!item) return;
    const transitItem = createTransitItemFromMatch(item, selectedSurveyor);
    if (!transitItem) {
      onShowToast('warning', 'Surveyor Tidak Diketahui', 'Berkas ini belum ditugaskan ke surveyor manapun di database.');
      return;
    }

    onAddToTransit(transitItem);
    setVerifiedResults((prev) => prev.filter((_, idx) => idx !== index));
    onShowToast(
      'info',
      `Disisihkan ke Map Transit ${transitItem.targetSurveyor}`,
      `Kertas fisik "${transitItem.debitur}" silakan masukkan ke stopmap transit ${transitItem.targetSurveyor} di meja.`
    );
  };

  const handleSendAllMismatchesToTransit = () => {
    const mismatches = verifiedResults.filter((m) => m.surveyorMismatch && m.excel);
    if (mismatches.length === 0) return;

    const successfullyRoutedKeys = new Set<string>();
    mismatches.forEach((item) => {
      const transitItem = createTransitItemFromMatch(item, selectedSurveyor);
      if (!transitItem || !item.excel) return;
      onAddToTransit(transitItem);
      successfullyRoutedKeys.add(`${item.excel.jenis_case}#${item.excel.no}`);
    });

    if (successfullyRoutedKeys.size > 0) {
      setVerifiedResults((prev) =>
        prev.filter((m) => !m.excel || !successfullyRoutedKeys.has(`${m.excel.jenis_case}#${m.excel.no}`))
      );
      onShowToast(
        'info',
        'Semua Mismatch Disisihkan ke Transit',
        `${successfullyRoutedKeys.size} berkas telah dialihkan ke map transit surveyor masing-masing.`
      );
    } else {
      onShowToast(
        'warning',
        'Tidak Dapat Dialihkan',
        'Semua berkas yang bermasalah belum memiliki target surveyor yang jelas di Excel.'
      );
    }
  };

  const handleRemoveItem = (index: number) => {
    setVerifiedResults((prev) => prev.filter((_, idx) => idx !== index));
  };

  const startStepperExecution = (items: MatchResult[]) => {
    const basePile = mode === 'baru' ? [] : currentDeskPile;
    const { steps } = simulateHandInsertion(basePile, items, selectedSurveyor);

    setCalculatedSteps(steps);
    setCurrentStepIdx(0);
    setShowFullTable(false);
    setStage('stepper');
  };

  const handleProceedToStepper = () => {
    if (verifiedResults.length === 0) {
      onShowToast('warning', 'Daftar Kosong', 'Tidak ada berkas yang valid untuk disusun.');
      return;
    }
    if (pendingWarnings.length > 0) {
      setIsProblemConfirmModalOpen(true);
      return;
    }
    startStepperExecution(verifiedResults);
  };

  const handleConfirmModalAndProceed = () => {
    const resolvedItems = assignWarningsToSurveyor(verifiedResults, selectedSurveyor);
    setVerifiedResults(resolvedItems);
    setIsProblemConfirmModalOpen(false);
    startStepperExecution(resolvedItems);
    onShowToast('info', 'Penataan Fisik Meja', `${resolvedItems.length} berkas siap ditata ke Ordner ${selectedSurveyor}.`);
  };

  const handleSaveToDesk = () => {
    if (!calculatedSteps) return;

    const basePile = mode === 'baru' ? [] : currentDeskPile;
    const matchedItems: MatchResult[] = calculatedSteps.map((s) => ({
      query: s.debitur,
      found_excel: true,
      score: 1.0,
      excel: {
        debitur: s.item_data.debitur,
        no: s.item_data.no,
        id_klaim: s.item_data.id_klaim,
        kota: s.item_data.kota,
        wilayah: s.item_data.wilayah,
        jenis_case: s.item_data.jenis_case,
        surveyor: selectedSurveyor,
        visit: s.item_data.visit,
        status_laporan: s.item_data.status_laporan,
        hasil_visit: s.item_data.hasil_visit,
      },
      folders: [],
      candidates: [],
      hasAmbiguity: false,
      surveyorMismatch: false,
      isUnassigned: false,
    }));

    const { deskPile } = simulateHandInsertion(basePile, matchedItems, selectedSurveyor);

    onSaveNewMaster(selectedSurveyor, deskPile, calculatedSteps);
    onShowToast(
      'success',
      'Tersimpan ke Meja!',
      `${calculatedSteps.length} berkas berhasil ditambahkan ke Ordner ${selectedSurveyor}.`
    );

    setRawInputText('');
    setVerifiedResults([]);
    setCalculatedSteps(null);
    setCurrentStepIdx(0);
    setStage('input');
  };

  const handleReset = () => {
    setVerifiedResults([]);
    setCalculatedSteps(null);
    setCurrentStepIdx(0);
    setFailedQueries([]);
    setStage('input');
  };

  const handleInsertSample = () => {
    setRawInputText(`A SUMARDI\nACAH\nADE SUKANDA\nCARNA`);
  };

  return {
    stage,
    setStage,
    mode,
    setMode,
    rawInputText,
    setRawInputText,
    verifiedResults,
    failedQueries,
    calculatedSteps,
    currentStepIdx,
    setCurrentStepIdx,
    showFullTable,
    setShowFullTable,
    isProblemConfirmModalOpen,
    setIsProblemConfirmModalOpen,
    currentDeskPile,
    pendingWarnings,
    handleSurveyorChange,
    handleVerify,
    handleSelectCandidate,
    handleAssignItemToCurrentOrdner,
    handleAssignAllWarnings,
    handleSendToTransit,
    handleSendAllMismatchesToTransit,
    handleRemoveItem,
    handleProceedToStepper,
    handleConfirmModalAndProceed,
    handleSaveToDesk,
    handleReset,
    handleInsertSample,
  };
}
