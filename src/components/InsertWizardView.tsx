import { useState } from 'react';
import {
  Tray,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  ArrowsLeftRight,
  WarningCircle,
  Table as TableIcon,
  Cards,
} from '@phosphor-icons/react';
import type { ExcelRecord, FolderRecord, MasterState, InsertionStep, MatchResult } from '../types';
import { matchQuery, simulateHandInsertion } from '../utils/logic';

interface InsertWizardViewProps {
  masterState: MasterState;
  excelList: ExcelRecord[];
  folderList: FolderRecord[];
  activeSurveyor: string;
  surveyorsList: string[];
  onSaveNewMaster: (surveyor: string, newPile: any[], steps: InsertionStep[]) => void;
  onShowToast: (type: 'success' | 'warning' | 'error' | 'info', message: string, desc?: string) => void;
}

export const InsertWizardView: React.FC<InsertWizardViewProps> = ({
  masterState,
  excelList,
  folderList,
  activeSurveyor,
  surveyorsList,
  onSaveNewMaster,
  onShowToast,
}) => {
  const [mode, setMode] = useState<'sisip' | 'baru'>('sisip');
  const [selectedSurveyor, setSelectedSurveyor] = useState(activeSurveyor);
  const [rawInputText, setRawInputText] = useState('');

  // Processing state
  const [, setVerifiedResults] = useState<MatchResult[] | null>(null);
  const [failedQueries, setFailedQueries] = useState<string[]>([]);
  const [calculatedSteps, setCalculatedSteps] = useState<InsertionStep[] | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [showFullTable, setShowFullTable] = useState(false);

  const currentDeskPile = masterState[selectedSurveyor] || [];

  // Parse lines from rawInputText
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
      const res = matchQuery(line, excelList, folderList);
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

    // Run simulation
    const basePile = mode === 'baru' ? [] : currentDeskPile;
    const { steps } = simulateHandInsertion(basePile, matched);

    setVerifiedResults(matched);
    setFailedQueries(failed);
    setCalculatedSteps(steps);
    setCurrentStepIdx(0);
    setShowFullTable(false);

    onShowToast(
      'success',
      'Verifikasi Selesai',
      `${matched.length} berkas valid diverifikasi. Panduan fisik siap!`
    );
  };

  const handleSaveToDesk = () => {
    if (!calculatedSteps) return;

    // Build final desk pile from the calculated items
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
        surveyor: s.item_data.surveyor,
        visit: s.item_data.visit,
        status_laporan: s.item_data.status_laporan,
        hasil_visit: s.item_data.hasil_visit,
      },
      folders: [],
    }));

    const { deskPile } = simulateHandInsertion(basePile, matchedItems);

    onSaveNewMaster(selectedSurveyor, deskPile, calculatedSteps);
    onShowToast(
      'success',
      'Tersimpan ke Meja!',
      `${calculatedSteps.length} berkas berhasil ditambahkan ke Ordner ${selectedSurveyor}.`
    );

    // Reset wizard
    setRawInputText('');
    setVerifiedResults(null);
    setCalculatedSteps(null);
    setCurrentStepIdx(0);
  };

  const handleReset = () => {
    setVerifiedResults(null);
    setCalculatedSteps(null);
    setCurrentStepIdx(0);
    setFailedQueries([]);
  };

  const handleInsertSample = () => {
    const sample = `A SUMARDI\nACAH\nADE SUKANDA\nCARNA`;
    setRawInputText(sample);
  };

  return (
    <div className="space-y-4">
      {/* Wizard Configuration Card */}
      {!calculatedSteps ? (
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
                onChange={(e) => setSelectedSurveyor(e.target.value)}
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
              💡 Tips: Susun urutan nama sesuai urutan kertas fisik di tangan Anda dari atas ke bawah.
            </p>
          </div>

          {/* Action Button */}
          <button
            onClick={handleVerify}
            className="w-full min-h-[48px] rounded-xl bg-[#D97757] hover:bg-[#C86243] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <ArrowsLeftRight size={18} weight="bold" />
            Hitung Panduan Fisik
          </button>
        </div>
      ) : (
        /* STEPPER GUIDANCE MODE (Optimized for One-Hand Mobile Ergonomics) */
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
                onClick={handleReset}
                className="px-2.5 py-1.5 rounded-xl border border-[#EAE4DC] text-[#79716B] hover:text-[#C45E5E] text-xs font-semibold transition-colors"
              >
                Ulangi
              </button>
            </div>
          </div>

          {/* Failed Queries Notice if any */}
          {failedQueries.length > 0 && (
            <div className="bg-[#FDF2F2] border border-[#F7CDCD] rounded-2xl p-3 flex items-start gap-2 text-xs text-[#C45E5E]">
              <WarningCircle size={16} weight="bold" className="shrink-0 mt-0.5" />
              <div>
                <strong>{failedQueries.length} nama tidak ditemukan:</strong>
                <p className="mt-0.5">{failedQueries.join(', ')}</p>
              </div>
            </div>
          )}

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

              {/* Desktop Stepper Buttons (Hidden on mobile, mobile uses docked thumb-bar below) */}
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
    </div>
  );
};
