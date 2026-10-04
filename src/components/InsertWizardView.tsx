import { useState, useEffect } from 'react';
import {
  Tray,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  ArrowsLeftRight,
  WarningCircle,
  Table as TableIcon,
  Cards,
  Trash,
  Check,
  Funnel,
} from '@phosphor-icons/react';
import type { ExcelRecord, FolderRecord, MasterState, InsertionStep, MatchResult, MatchCandidate } from '../types';
import { matchQuery, simulateHandInsertion, getCleanInvestigatorName } from '../utils/logic';
import { ConfirmModal } from './ConfirmModal';

interface InsertWizardViewProps {
  masterState: MasterState;
  excelList: ExcelRecord[];
  folderList: FolderRecord[];
  activeSurveyor: string;
  surveyorsList: string[];
  onSelectSurveyor?: (surveyor: string) => void;
  onSaveNewMaster: (surveyor: string, newPile: any[], steps: InsertionStep[]) => void;
  onShowToast: (type: 'success' | 'warning' | 'error' | 'info', message: string, desc?: string) => void;
}

export const InsertWizardView: React.FC<InsertWizardViewProps> = ({
  masterState,
  excelList,
  folderList,
  activeSurveyor,
  surveyorsList,
  onSelectSurveyor,
  onSaveNewMaster,
  onShowToast,
}) => {
  const [stage, setStage] = useState<'input' | 'review' | 'stepper'>('input');
  const [mode, setMode] = useState<'sisip' | 'baru'>('sisip');
  const [selectedSurveyor, setSelectedSurveyor] = useState(activeSurveyor);
  const [rawInputText, setRawInputText] = useState('');

  // Processing state
  const [verifiedResults, setVerifiedResults] = useState<MatchResult[]>([]);
  const [failedQueries, setFailedQueries] = useState<string[]>([]);
  const [calculatedSteps, setCalculatedSteps] = useState<InsertionStep[] | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [showFullTable, setShowFullTable] = useState(false);
  const [isProblemConfirmModalOpen, setIsProblemConfirmModalOpen] = useState(false);

  // Sync selectedSurveyor when parent activeSurveyor prop changes
  useEffect(() => {
    setSelectedSurveyor(activeSurveyor);
  }, [activeSurveyor]);

  const handleSurveyorChange = (newSurv: string) => {
    setSelectedSurveyor(newSurv);
    if (onSelectSurveyor) {
      onSelectSurveyor(newSurv);
    }
    // If results already exist, re-evaluate them immediately with the newly selected surveyor
    if (verifiedResults.length > 0) {
      const updated = verifiedResults.map((r) => {
        const re = matchQuery(r.query, excelList, folderList, newSurv);
        return re && re.found_excel ? re : r;
      });
      setVerifiedResults(updated);
    }
  };

  const currentDeskPile = masterState[selectedSurveyor] || [];

  const pendingWarnings = verifiedResults.filter(
    (m) => m.isUnassigned || m.surveyorMismatch
  );

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
      // Pass selectedSurveyor for priority & validation!
      const res = matchQuery(line, excelList, folderList, selectedSurveyor);
      if (res && res.found_excel && res.excel) {
        matched.push(res);
      } else {
        failed.push(line);
      }
    }

    if (matched.length === 0) {
      onShowToast(
        'error',
        'Tidak Ada Berkas Valid',
        'Semua nama yang dimasukkan tidak ditemukan di Master Excel.'
      );
      setVerifiedResults([]);
      setFailedQueries(failed);
      return;
    }

    setVerifiedResults(matched);
    setFailedQueries(failed);
    setStage('review');

    const warningCount = matched.filter(
      (m) => m.hasAmbiguity || m.surveyorMismatch || m.isUnassigned
    ).length;

    if (warningCount > 0) {
      onShowToast(
        'warning',
        'Verifikasi Memerlukan Review',
        `Ditemukan ${warningCount} berkas dengan nama identik atau status belum ditugaskan.`
      );
    } else {
      onShowToast(
        'success',
        'Verifikasi Selesai',
        `${matched.length} berkas valid dan cocok dengan Ordner ${selectedSurveyor}.`
      );
    }
  };

  // Change selected candidate for ambiguous / multi-match items
  const handleSelectCandidate = (resultIndex: number, candidate: MatchCandidate) => {
    setVerifiedResults((prev) => {
      const updated = [...prev];
      const cur = updated[resultIndex];
      const cleanTarget = getCleanInvestigatorName(selectedSurveyor);
      const candSurveyor = getCleanInvestigatorName(candidate.excel.surveyor);
      const isUnassigned = candidate.isUnassigned;
      const surveyorMismatch = Boolean(cleanTarget && !isUnassigned && candSurveyor !== cleanTarget);

      let warningMessage: string | undefined = undefined;
      if (isUnassigned) {
        warningMessage = 'Nasabah ini tercatat "Belum Ditugaskan" di Master Excel.';
      } else if (surveyorMismatch) {
        warningMessage = `Tercatat untuk surveyor ${candidate.excel.surveyor}, bukan ${selectedSurveyor}.`;
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

  // Assign individual unassigned/mismatched item to current ordner
  const handleAssignItemToCurrentOrdner = (index: number) => {
    setVerifiedResults((prev) => {
      const updated = [...prev];
      const cur = updated[index];
      if (!cur.excel) return prev;
      updated[index] = {
        ...cur,
        excel: {
          ...cur.excel,
          surveyor: selectedSurveyor,
        },
        isUnassigned: false,
        surveyorMismatch: false,
        warningMessage: undefined,
      };
      return updated;
    });
    onShowToast(
      'success',
      'Ditetapkan ke Ordner Ini',
      `${verifiedResults[index].excel?.debitur} resmi dialihkan ke ${selectedSurveyor}.`
    );
  };

  // Assign all pending warnings to current ordner at once
  const handleAssignAllWarnings = () => {
    setVerifiedResults((prev) =>
      prev.map((m) => {
        if ((m.isUnassigned || m.surveyorMismatch) && m.excel) {
          return {
            ...m,
            excel: {
              ...m.excel,
              surveyor: selectedSurveyor,
            },
            isUnassigned: false,
            surveyorMismatch: false,
            warningMessage: undefined,
          };
        }
        return m;
      })
    );
    onShowToast(
      'success',
      'Semua Berkas Ditetapkan',
      `${pendingWarnings.length} berkas ditetapkan ke Ordner ${selectedSurveyor}.`
    );
  };

  // Remove an item from verified list
  const handleRemoveItem = (index: number) => {
    setVerifiedResults((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Stage 2 -> Stage 3: Calculate Physical Insertion Steps
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

  const startStepperExecution = (items: MatchResult[]) => {
    const basePile = mode === 'baru' ? [] : currentDeskPile;
    const { steps } = simulateHandInsertion(basePile, items, selectedSurveyor);

    setCalculatedSteps(steps);
    setCurrentStepIdx(0);
    setShowFullTable(false);
    setStage('stepper');
  };

  const handleConfirmModalAndProceed = () => {
    const resolvedItems = verifiedResults.map((m) => {
      if ((m.isUnassigned || m.surveyorMismatch) && m.excel) {
        return {
          ...m,
          excel: {
            ...m.excel,
            surveyor: selectedSurveyor,
          },
          isUnassigned: false,
          surveyorMismatch: false,
          warningMessage: undefined,
        };
      }
      return m;
    });

    setVerifiedResults(resolvedItems);
    setIsProblemConfirmModalOpen(false);
    startStepperExecution(resolvedItems);
    onShowToast('info', 'Penataan Fisik Meja', `${resolvedItems.length} berkas siap ditata ke Ordner ${selectedSurveyor}.`);
  };

  // Stage 3 -> Save to master state
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

    // Reset wizard
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
    const sample = `A SUMARDI\nACAH\nADE SUKANDA\nCARNA`;
    setRawInputText(sample);
  };

  return (
    <div className="space-y-4">
      {/* ============================================================ */}
      {/* TAHAP 1: INPUT NAMA DEBITUR                                 */}
      {/* ============================================================ */}
      {stage === 'input' && (
        <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
          {/* Header & Mode Switch */}
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-[#F6F2EB]">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#FDF1ED] text-[#D97757]">
                <Tray size={18} weight="bold" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#2D2824]">
                  {mode === 'sisip' ? 'Sisip Berkas Susulan' : 'Buat Bundle Baru (A–Z)'}
                </h2>
                <p className="text-[11px] sm:text-xs text-[#79716B]">
                  {mode === 'sisip'
                    ? 'Menyelipkan lembar ke tumpukan meja yang ada.'
                    : 'Menata berkas tercecer dari tumpukan pertama.'}
                </p>
              </div>
            </div>

            {/* Segmented Mode Toggle */}
            <div className="flex items-center bg-[#F6F2EB] p-1 rounded-xl text-xs">
              <button
                onClick={() => setMode('sisip')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  mode === 'sisip'
                    ? 'bg-[#FFFFFF] text-[#D97757] shadow-xs'
                    : 'text-[#79716B] hover:text-[#2D2824]'
                }`}
              >
                Sisip
              </button>
              <button
                onClick={() => setMode('baru')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  mode === 'baru'
                    ? 'bg-[#FFFFFF] text-[#D97757] shadow-xs'
                    : 'text-[#79716B] hover:text-[#2D2824]'
                }`}
              >
                Bundle Baru
              </button>
            </div>
          </div>

          {/* Target Ordner Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="block font-bold text-[#79716B] uppercase tracking-wider mb-1">
                Target Ordner Investigator:
              </label>
              <select
                value={selectedSurveyor}
                onChange={(e) => handleSurveyorChange(e.target.value)}
                className="w-full bg-[#F6F2EB] border border-[#EAE4DC] text-[#2D2824] font-semibold rounded-xl p-2.5 focus:outline-none focus:border-[#D97757]"
              >
                {surveyorsList.map((s) => (
                  <option key={s} value={s}>
                    {s} ({masterState[s]?.length || 0} berkas di meja)
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-[#FAF8F5] border border-[#EAE4DC] rounded-xl p-2.5 flex flex-col justify-center">
              <span className="text-[#A8A29E] font-medium text-[11px]">Tumpukan Fisik Meja Saat Ini:</span>
              <p className="font-bold text-[#2D2824] text-sm mt-0.5">
                {currentDeskPile.length} Berkas Terdata
              </p>
            </div>
          </div>

          {/* Input Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-bold text-[#79716B] uppercase tracking-wider">
                Nama Debitur di Tangan:
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleInsertSample}
                  className="text-[#D97757] hover:underline font-semibold"
                >
                  Contoh Format
                </button>
                <span>•</span>
                <button
                  onClick={() => setRawInputText('')}
                  className="text-[#79716B] hover:text-[#C45E5E]"
                >
                  Hapus
                </button>
              </div>
            </div>

            <textarea
              value={rawInputText}
              onChange={(e) => setRawInputText(e.target.value)}
              placeholder="Tempel atau ketik nama debitur di sini (1 nama per baris)...&#10;A SUMARDI&#10;ACAH&#10;ADE SUKANDA"
              rows={6}
              className="w-full p-3 text-sm font-medium bg-[#F6F2EB] border border-[#EAE4DC] rounded-xl text-[#2D2824] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#D97757] focus:bg-[#FFFFFF] transition-all font-mono"
            />
            <p className="text-[11px] text-[#A8A29E]">
              💡 Tips: Sistem akan otomatis memprioritaskan debitur milik <strong>{selectedSurveyor}</strong> dan memvalidasi jika ada nama ganda.
            </p>
          </div>

          {/* Action Button */}
          <button
            onClick={handleVerify}
            className="w-full min-h-[48px] rounded-xl bg-[#D97757] hover:bg-[#C86243] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <ArrowsLeftRight size={18} weight="bold" />
            Verifikasi & Validasi Berkas
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAHAP 2: VERIFIKASI & RESOLUSI AMBIGUITAS (DISAMBIGUATION)   */}
      {/* ============================================================ */}
      {stage === 'review' && (
        <div className="space-y-3.5 pb-20 sm:pb-4">
          {/* Header Bar */}
          <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#548A70] block">
                  Verifikasi Berkas: ORDNER {selectedSurveyor}
                </span>
                <h2 className="text-base font-bold text-[#2D2824]">
                  Hasil Pengecekan ({verifiedResults.length} Berkas Valid)
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleReset}
                  className="px-2.5 py-1.5 rounded-xl border border-[#EAE4DC] text-[#79716B] hover:text-[#C45E5E] text-xs font-semibold transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={() => setStage('input')}
                  className="px-3 py-1.5 rounded-xl border border-[#EAE4DC] text-[#79716B] hover:text-[#2D2824] text-xs font-semibold transition-colors"
                >
                  ← Edit Input
                </button>
              </div>
            </div>

            {/* Verification Stats Summary */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#F6F2EB] text-center text-xs">
              <div className="p-2 rounded-xl bg-[#EEF6F1] text-[#548A70]">
                <span className="font-extrabold text-sm block">
                  {verifiedResults.filter((m) => !m.surveyorMismatch && !m.isUnassigned).length}
                </span>
                <span className="text-[10px]">Cocok Surveyor</span>
              </div>
              <div className="p-2 rounded-xl bg-[#FCF7ED] text-[#C48A3F]">
                <span className="font-extrabold text-sm block">
                  {pendingWarnings.length}
                </span>
                <span className="text-[10px]">Perlu Konfirmasi</span>
              </div>
              <div className="p-2 rounded-xl bg-[#FDF2F2] text-[#C45E5E]">
                <span className="font-extrabold text-sm block">{failedQueries.length}</span>
                <span className="text-[10px]">Tidak Ditemukan</span>
              </div>
            </div>

            {/* Quick bulk action if there are warnings */}
            {pendingWarnings.length > 0 && (
              <div className="bg-[#FCF7ED] border border-[#F3E0BD] rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs">
                <span className="text-[#C48A3F] font-semibold text-[11px]">
                  Ada {pendingWarnings.length} berkas belum sesuai/ditugaskan di Excel
                </span>
                <button
                  type="button"
                  onClick={handleAssignAllWarnings}
                  className="px-2.5 py-1 rounded-lg bg-[#C48A3F] hover:bg-[#a6712e] text-white text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
                >
                  Tetapkan Semua ke Ordner Ini
                </button>
              </div>
            )}
          </div>

          {/* Missing / Failed Queries alert */}
          {failedQueries.length > 0 && (
            <div className="bg-[#FDF2F2] border border-[#F7CDCD] rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-[#C45E5E]">
              <WarningCircle size={18} weight="bold" className="shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">
                  {failedQueries.length} nama tidak ditemukan di database Excel:
                </strong>
                <p className="mt-0.5 leading-snug">{failedQueries.join(', ')}</p>
              </div>
            </div>
          )}

          {/* Verified Items List with Candidate Switchers */}
          <div className="space-y-2.5">
            {verifiedResults.map((res, idx) => {
              const ex = res.excel!;
              const hasWarning = res.hasAmbiguity || res.surveyorMismatch || res.isUnassigned;

              return (
                <div
                  key={idx}
                  className={`bg-[#FFFFFF] border rounded-2xl p-3.5 shadow-xs transition-all space-y-2.5 ${
                    res.isUnassigned
                      ? 'border-[#F7CDCD] bg-[#FFFBFB]'
                      : hasWarning
                      ? 'border-[#F3E0BD] bg-[#FFFDF9]'
                      : 'border-[#EAE4DC]'
                  }`}
                >
                  {/* Top Bar: Input Query vs Matched Debitur */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px] mb-0.5">
                        <span className="font-mono bg-[#F6F2EB] text-[#79716B] px-1.5 py-0.5 rounded">
                          Input: &quot;{res.query}&quot;
                        </span>
                        <span>→</span>
                        <span className="font-bold text-[#2D2824]">
                          Case {ex.jenis_case} #{ex.no}
                        </span>
                        <span>•</span>
                        <span className="text-[#79716B]">{ex.kota}</span>
                      </div>
                      <h3 className="font-bold text-sm sm:text-base text-[#2D2824] leading-snug">
                        {ex.debitur}
                      </h3>
                    </div>

                    <button
                      onClick={() => handleRemoveItem(idx)}
                      className="p-1.5 rounded-lg text-[#A8A29E] hover:text-[#C45E5E] hover:bg-[#FDF2F2] transition-colors shrink-0"
                      title="Keluarkan dari daftar"
                    >
                      <Trash size={16} />
                    </button>
                  </div>

                  {/* Surveyor badge & warning notification */}
                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs pt-1 border-t border-[#F6F2EB]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[#79716B] text-[11px]">Surveyor di Excel:</span>
                      <span
                        className={`font-semibold px-2 py-0.5 rounded-md text-[11px] ${
                          res.isUnassigned
                            ? 'bg-[#FDF2F2] text-[#C45E5E] font-bold'
                            : res.surveyorMismatch
                            ? 'bg-[#FCF7ED] text-[#C48A3F] font-bold'
                            : 'bg-[#EEF6F1] text-[#548A70]'
                        }`}
                      >
                        {ex.surveyor || 'Belum Ditugaskan'}
                      </span>
                    </div>

                    {res.warningMessage && (
                      <span className="text-[11px] font-semibold text-[#C48A3F] flex items-center gap-1">
                        ⚠️ {res.warningMessage}
                      </span>
                    )}
                  </div>

                  {/* Quick Action Button for Warning / Unassigned */}
                  {res.isUnassigned && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#FFF5F5] border border-[#F7CDCD] text-xs">
                      <span className="text-[#C45E5E] font-medium text-[11px]">
                        Status Excel: <strong>Belum Ditugaskan</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAssignItemToCurrentOrdner(idx)}
                        className="px-2.5 py-1 rounded-lg bg-[#548A70] hover:bg-[#43725b] text-white text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
                      >
                        ✓ Tetapkan ke Ordner {selectedSurveyor}
                      </button>
                    </div>
                  )}

                  {res.surveyorMismatch && !res.isUnassigned && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#FFFDF7] border border-[#F3E0BD] text-xs">
                      <span className="text-[#C48A3F] font-medium text-[11px]">
                        Tercatat untuk: <strong>{ex.surveyor}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAssignItemToCurrentOrdner(idx)}
                        className="px-2.5 py-1 rounded-lg bg-[#C48A3F] hover:bg-[#a6712e] text-white text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
                      >
                        ✓ Alihkan ke Ordner {selectedSurveyor}
                      </button>
                    </div>
                  )}

                  {/* MULTI-CANDIDATE DISAMBIGUATION (NAMA IDENTIK / GANDA) */}
                  {res.candidates.length > 1 && (
                    <div className="bg-[#FAF8F5] border border-[#EAE4DC] rounded-xl p-2.5 space-y-2 text-xs">
                      <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#79716B]">
                        <Funnel size={13} />
                        <span>Pilihan Nasabah Lain dengan Nama Identik ({res.candidates.length} kandidat):</span>
                      </div>
                      <div className="grid gap-1.5">
                        {res.candidates.map((cand, cIdx) => {
                          const isSelected =
                            cand.excel.id_klaim === ex.id_klaim && cand.excel.no === ex.no;
                          return (
                            <button
                              key={cIdx}
                              onClick={() => handleSelectCandidate(idx, cand)}
                              className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between gap-2 transition-all ${
                                isSelected
                                  ? 'bg-[#FFFFFF] border-[#D97757] text-[#D97757] font-bold shadow-xs'
                                  : 'bg-[#FFFFFF]/70 hover:bg-[#FFFFFF] border-[#EAE4DC] text-[#79716B]'
                              }`}
                            >
                              <div className="min-w-0">
                                <span className="block truncate text-xs">
                                  {cand.excel.debitur} (Case {cand.excel.jenis_case} #{cand.excel.no} - {cand.excel.kota})
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap text-[10px] mt-0.5">
                                  <span className="text-[#79716B]">Surveyor:</span>
                                  <span className="font-semibold text-[#2D2824]">{cand.excel.surveyor || 'Belum Ditugaskan'}</span>
                                  {cand.isExactSurveyor ? (
                                    <span className="bg-[#EEF6F1] text-[#548A70] font-bold px-1.5 py-0.5 rounded text-[9.5px]">
                                      ✓ Cocok Ordner {selectedSurveyor}
                                    </span>
                                  ) : cand.isUnassigned ? (
                                    <span className="bg-[#FDF2F2] text-[#C45E5E] font-bold px-1.5 py-0.5 rounded text-[9.5px]">
                                      ❌ Belum Ditugaskan di Excel
                                    </span>
                                  ) : (
                                    <span className="bg-[#FCF7ED] text-[#C48A3F] font-bold px-1.5 py-0.5 rounded text-[9.5px]">
                                      ⚠️ Milik Ordner {cand.excel.surveyor}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <span className="w-5 h-5 rounded-full bg-[#D97757] text-white flex items-center justify-center shrink-0">
                                  <Check size={12} weight="bold" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* DOCKED THUMB BAR TO PROCEED TO PHYSICAL DESK STEPPER */}
          <div className="fixed bottom-[52px] sm:bottom-4 left-0 right-0 z-30 p-3 bg-[#FFFFFF]/95 backdrop-blur-[2px] border-t border-[#EAE4DC] shadow-lg flex items-center gap-2 max-w-5xl mx-auto px-4 sm:px-6">
            <button
              onClick={() => setStage('input')}
              className="px-4 h-12 rounded-2xl border border-[#EAE4DC] bg-[#F6F2EB] text-[#2D2824] font-semibold text-xs flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <ArrowLeft size={16} weight="bold" />
              Kembali
            </button>
            <button
              onClick={handleProceedToStepper}
              className="flex-1 h-12 rounded-2xl bg-[#548A70] hover:bg-[#43725b] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <span>Lanjut ke Panduan Meja ({verifiedResults.length} Berkas)</span>
              <ArrowRight size={18} weight="bold" />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAHAP 3: PANDUAN PENYISIPAN FISIK MEJA (STEPPER)             */}
      {/* ============================================================ */}
      {stage === 'stepper' && calculatedSteps && (
        <div className="space-y-3.5 pb-20 sm:pb-4">
          {/* Header Controls */}
          <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#548A70] block">
                ORDNER {selectedSurveyor}
              </span>
              <h2 className="text-sm sm:text-base font-bold text-[#2D2824]">
                {calculatedSteps.length} Berkas Siap Disusun
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowFullTable(!showFullTable)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#EAE4DC] bg-[#F6F2EB] text-[#2D2824] text-xs font-semibold hover:bg-[#EAE4DC] transition-colors"
              >
                {showFullTable ? (
                  <>
                    <Cards size={15} />
                    <span>Mode Kartu</span>
                  </>
                ) : (
                  <>
                    <TableIcon size={15} />
                    <span>Tabel</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setStage('review')}
                className="px-2.5 py-1.5 rounded-xl border border-[#EAE4DC] text-[#79716B] hover:text-[#2D2824] text-xs font-semibold transition-colors"
              >
                Review
              </button>
            </div>
          </div>

          {!showFullTable ? (
            /* CLEAN STEPPER CARD (NO BORDER OVERLOAD) */
            <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
              {/* Step indicator */}
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-xl bg-[#FDF1ED] text-[#D97757] font-extrabold text-xs">
                  Lembar #{calculatedSteps[currentStepIdx].step_no} dari {calculatedSteps.length}
                </span>
                <span className="text-xs font-extrabold text-[#548A70] bg-[#EEF6F1] px-2.5 py-1 rounded-xl">
                  Posisi Baru di Meja: #{calculatedSteps[currentStepIdx].new_pos}
                </span>
              </div>

              {/* Big Debtor Header */}
              <div className="text-center py-2">
                <p className="text-[11px] uppercase font-bold tracking-wider text-[#A8A29E] mb-1">
                  Ambil Lembar Paling Atas di Tangan:
                </p>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-[#2D2824] tracking-tight">
                  {calculatedSteps[currentStepIdx].debitur}
                </h3>
                <p className="text-xs text-[#79716B] mt-1">
                  Case {calculatedSteps[currentStepIdx].item_data.jenis_case} • #{calculatedSteps[currentStepIdx].item_data.no} • {calculatedSteps[currentStepIdx].item_data.wilayah}
                </p>
              </div>

              {/* Physical Desk Action Prompt */}
              <div className="bg-[#FAF8F5] border border-[#EAE4DC] rounded-2xl p-4 sm:p-5 text-center space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#D97757]">
                  Tindakan di Tumpukan Meja:
                </span>
                <p className="text-base sm:text-lg font-bold text-[#2D2824] leading-snug">
                  {calculatedSteps[currentStepIdx].instruksi}
                </p>
              </div>

              {/* Desktop Stepper Buttons */}
              <div className="hidden sm:flex items-center justify-between gap-3 pt-2">
                <button
                  disabled={currentStepIdx === 0}
                  onClick={() => setCurrentStepIdx((prev) => prev - 1)}
                  className="px-5 py-3 rounded-xl border border-[#EAE4DC] bg-[#F6F2EB] text-[#2D2824] font-semibold text-xs sm:text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowLeft size={16} weight="bold" />
                  Sebelumnya
                </button>

                {currentStepIdx < calculatedSteps.length - 1 ? (
                  <button
                    onClick={() => setCurrentStepIdx((prev) => prev + 1)}
                    className="flex-1 py-3 rounded-xl bg-[#2D2824] hover:bg-[#3E3834] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors"
                  >
                    Lanjut Lembar #{currentStepIdx + 2}
                    <ArrowRight size={16} weight="bold" />
                  </button>
                ) : (
                  <button
                    onClick={handleSaveToDesk}
                    className="flex-1 py-3 rounded-xl bg-[#548A70] hover:bg-[#43725b] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <CheckCircle size={18} weight="bold" />
                    Selesai & Simpan ke Meja
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* FULL TABLE VIEW (Quick Overview) */
            <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl overflow-hidden shadow-xs">
              <div className="p-3 bg-[#FAF8F5] border-b border-[#EAE4DC] font-bold text-xs text-[#2D2824]">
                Tabel Rangkuman Langkah Penyisipan
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F6F2EB] text-[#79716B] uppercase font-bold text-[10px]">
                    <tr>
                      <th className="p-3 text-center">Urutan Tangan</th>
                      <th className="p-3">Nama Debitur</th>
                      <th className="p-3">Instruksi di Tumpukan Meja</th>
                      <th className="p-3 text-center">Posisi Baru</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F6F2EB]">
                    {calculatedSteps.map((s, idx) => (
                      <tr key={idx} className="hover:bg-[#FAF8F5]">
                        <td className="p-3 text-center font-bold text-[#D97757]">
                          Lembar #{s.step_no}
                        </td>
                        <td className="p-3 font-bold text-[#2D2824]">{s.debitur}</td>
                        <td className="p-3 text-[#2D2824]">{s.instruksi}</td>
                        <td className="p-3 text-center font-bold text-[#548A70]">
                          #{s.new_pos}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DOCKED / STICKY THUMB-ZONE ACTION BAR (MOBILE ONLY) */}
          <div className="sm:hidden fixed bottom-[52px] left-0 right-0 z-30 p-2.5 bg-[#FFFFFF]/95 backdrop-blur-[2px] border-t border-[#EAE4DC] shadow-lg flex items-center gap-2">
            <button
              disabled={currentStepIdx === 0}
              onClick={() => setCurrentStepIdx((prev) => prev - 1)}
              className="w-12 h-12 rounded-2xl border border-[#EAE4DC] bg-[#F6F2EB] text-[#2D2824] flex items-center justify-center shrink-0 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Lembar Sebelumnya"
            >
              <ArrowLeft size={18} weight="bold" />
            </button>

            {currentStepIdx < calculatedSteps.length - 1 ? (
              <button
                onClick={() => setCurrentStepIdx((prev) => prev + 1)}
                className="flex-1 h-12 rounded-2xl bg-[#D97757] active:bg-[#C86243] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <span>Lanjut Lembar #{currentStepIdx + 2}</span>
                <ArrowRight size={18} weight="bold" />
              </button>
            ) : (
              <button
                onClick={handleSaveToDesk}
                className="flex-1 h-12 rounded-2xl bg-[#548A70] active:bg-[#43725b] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <CheckCircle size={20} weight="bold" />
                <span>Simpan ke Ordner Meja</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Problem Confirmation Modal before Stepper */}
      <ConfirmModal
        isOpen={isProblemConfirmModalOpen}
        title="Konfirmasi Penugasan Berkas"
        message={`Ditemukan ${pendingWarnings.length} berkas yang berstatus "Belum Ditugaskan" atau berbeda surveyor di Excel. Apakah Anda yakin ingin menetapkan seluruh berkas ini menjadi milik Ordner ${selectedSurveyor} dan melanjutkan penataan fisik meja?`}
        confirmLabel={`Ya, Tetapkan Semua ke Ordner ${selectedSurveyor}`}
        cancelLabel="Periksa Dulu"
        isDestructive={false}
        onConfirm={handleConfirmModalAndProceed}
        onCancel={() => setIsProblemConfirmModalOpen(false)}
      />
    </div>
  );
};
