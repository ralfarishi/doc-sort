import {
  Printer,
  Trash,
  ArrowUUpLeft,
  Plus,
  MagnifyingGlass,
  CheckSquare,
  Square,
  FileText,
  X,
  CheckCircle,
  ClockCounterClockwise,
  ListDashes,
} from '@phosphor-icons/react';
import type { HandoverState, MasterState, HandoverHistoryState } from '../types';
import { BottomSheet } from './BottomSheet';
import { ConfirmModal } from './ConfirmModal';
import { useHandoverView } from '../hooks/useHandoverView';

interface HandoverViewProps {
  handoverState: HandoverState;
  historyState: HandoverHistoryState;
  masterState: MasterState;
  activeSurveyor: string;
  onTakeItems: (surveyor: string, itemKeys: Set<string>) => void;
  onReturnItem: (surveyor: string, handoverId: string) => void;
  onClearHandover: (surveyor?: string) => void;
  onArchiveHandover: (surveyor?: string, notes?: string) => void;
  onRestoreHistoryItem?: (surveyor: string, historyId: string) => void;
  onRestoreAllHistory?: (surveyor: string) => void;
  onShowToast: (type: 'success' | 'warning' | 'error' | 'info', message: string, desc?: string) => void;
}

interface HandoverTableRow {
  id: string;
  debitur: string;
  surveyor: string;
  wilayah: string;
  kota: string;
  jenis_case: string;
  notes?: string;
}

interface HandoverRecordTableProps {
  items: HandoverTableRow[];
  mode: 'pending' | 'history';
  showSurveyor: boolean;
  onAction?: (surveyor: string, id: string, debitur: string) => void;
}

const PRINT_DATE_STRING = new Date().toLocaleDateString('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/**
 * DRY Unified Table for both Pending Handover and History Archive (Default & Alphabetical modes).
 * Preserves laser-aligned colgroup widths for print and responsive web display.
 */
const HandoverRecordTable: React.FC<HandoverRecordTableProps> = ({
  items,
  mode,
  showSurveyor,
  onAction,
}) => {
  const isPending = mode === 'pending';

  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${isPending ? 'table-fixed' : ''} text-left text-xs border-collapse print-table`}>
        {isPending ? (
          showSurveyor ? (
            <colgroup>
              <col className="w-12 print:w-10" style={{ width: '42px' }} />
              <col style={{ width: '38%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '16%' }} />
              <col className="w-20 print:hidden" style={{ width: '80px' }} />
            </colgroup>
          ) : (
            <colgroup>
              <col className="w-12 print:w-10" style={{ width: '42px' }} />
              <col style={{ width: '46%' }} />
              <col style={{ width: '32%' }} />
              <col style={{ width: '22%' }} />
              <col className="w-20 print:hidden" style={{ width: '80px' }} />
            </colgroup>
          )
        ) : showSurveyor ? (
          <colgroup>
            <col className="w-12 print:w-10" style={{ width: '42px' }} />
            <col style={{ width: '32%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col className="w-20 print:hidden" style={{ width: '70px' }} />
          </colgroup>
        ) : null}

        <thead>
          <tr className="border-b border-[#EAE4DC] print:border-black text-[11px] text-[#79716B] print:text-black uppercase bg-[#FFFFFF] print:bg-white font-bold">
            <th className="py-2.5 px-3 w-12 text-center">No</th>
            <th className="py-2.5 px-3 text-left">Nama Nasabah (Debitur)</th>
            {showSurveyor && <th className="py-2.5 px-3 text-left">Investigator</th>}
            <th className="py-2.5 px-3 text-left">Wilayah</th>
            <th className="py-2.5 px-3 text-center">Jenis Case</th>
            {!isPending && <th className="py-2.5 px-3 text-left">Keterangan / Verifikasi</th>}
            <th className="py-2.5 px-3 text-center print:hidden">Aksi</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-[#EAE4DC] print:divide-black">
          {items.map((it, idx) => (
            <tr
              key={it.id}
              className="hover:bg-[#FAF8F5] print:hover:bg-white text-[#2D2824] print:text-black transition-colors"
            >
              <td className="py-2 px-3 text-center font-bold text-xs text-[#79716B] print:text-black">
                {idx + 1}
              </td>
              <td className={`py-2 px-3 font-semibold text-xs sm:text-sm print:text-[11px] ${isPending ? 'truncate' : ''}`}>
                {it.debitur}
              </td>
              {showSurveyor && (
                <td className={`py-2 px-3 font-medium text-xs text-[#2D2824] print:text-black print:text-[11px] ${isPending ? 'truncate' : ''}`}>
                  {it.surveyor}
                </td>
              )}
              <td className={`py-2 px-3 text-xs text-[#79716B] print:text-black print:text-[11px] ${isPending ? 'truncate' : ''}`}>
                {it.wilayah || it.kota || '-'}
              </td>
              <td className="py-2 px-3 text-center">
                <span
                  className={`inline-block px-2 py-0.5 rounded-md font-bold text-[11px] print:bg-transparent print:text-black border print:border-0 print-badge ${
                    isPending
                      ? 'bg-[#F6F2EB] text-[#D97757] border-[#EAE4DC]'
                      : 'bg-[#EEF6F1] text-[#548A70] border-[#C8E2D4]'
                  }`}
                >
                  Case {it.jenis_case}
                </span>
              </td>
              {!isPending && (
                <td className="py-2 px-3 text-xs text-[#79716B] print:text-black print:text-[11px]">
                  <span className="truncate block max-w-xs" title={it.notes || ''}>
                    {it.notes || 'Diserahkan via web'}
                  </span>
                </td>
              )}
              <td className="py-2 px-3 text-center print:hidden">
                {onAction && (
                  isPending ? (
                    <button
                      onClick={() => onAction(it.surveyor, it.id, it.debitur)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-[#79716B] hover:text-[#2D2824] bg-[#F6F2EB] hover:bg-[#EAE4DC] transition-colors"
                      title="Kembalikan ke tumpukan meja"
                    >
                      <ArrowUUpLeft size={13} weight="bold" />
                      <span>Batal</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onAction(it.surveyor, it.id, it.debitur)}
                      className="px-2 py-1 rounded-lg text-xs font-semibold text-[#79716B] hover:text-[#D97757] hover:bg-[#FDF1ED] border border-transparent hover:border-[#F7D0C4] inline-flex items-center gap-1 transition-all"
                      title="Kembalikan berkas ini ke Antrean Cetak"
                    >
                      <ArrowUUpLeft size={13} weight="bold" />
                      <span className="text-[11px]">Tarik</span>
                    </button>
                  )
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const HandoverView: React.FC<HandoverViewProps> = ({
  handoverState,
  historyState,
  masterState,
  activeSurveyor,
  onTakeItems,
  onReturnItem,
  onClearHandover,
  onArchiveHandover,
  onRestoreHistoryItem,
  onRestoreAllHistory,
  onShowToast,
}) => {
  const {
    activeSubTab,
    setActiveSubTab,
    selectedSurveyorFilter,
    setSelectedSurveyorFilter,
    historySearch,
    setHistorySearch,
    printSortMode,
    setPrintSortMode,
    isPickerOpen,
    setIsPickerOpen,
    pickerSearch,
    setPickerSearch,
    selectedPickerKeys,
    isClearModalOpen,
    setIsClearModalOpen,
    isArchiveModalOpen,
    setIsArchiveModalOpen,
    activeHandoverSurveyors,
    historySurveyors,
    displayPendingGroups,
    displayHistoryGroups,
    alphabeticalPendingItems,
    alphabeticalHistoryItems,
    totalHandoverCount,
    totalHistoryCount,
    availableToTake,
    handleOpenPicker,
    handleTogglePickerKey,
    handleSelectAllPicker,
    handleConfirmTake,
    handlePrint,
    handleConfirmClear,
    handleConfirmArchive,
  } = useHandoverView({
    masterState,
    handoverState,
    historyState,
    activeSurveyor,
    onTakeItems,
    onClearHandover,
    onArchiveHandover,
    onShowToast,
  });

  const handleReturnPending = (surveyor: string, id: string, debitur: string) => {
    onReturnItem(surveyor, id);
    onShowToast('info', 'Berkas Dikembalikan', `${debitur} dimasukkan kembali ke tumpukan meja.`);
  };

  const handleRestoreHistory = onRestoreHistoryItem
    ? (surveyor: string, id: string) => onRestoreHistoryItem(surveyor, id)
    : undefined;

  return (
    <div className="space-y-4">
      {/* SCREEN HEADER (Hidden in print) */}
      <div className="print:hidden bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D97757]" />
              <h2 className="text-base sm:text-lg font-bold text-[#2D2824]">
                Daftar Dokumen Diambil & Riwayat
              </h2>
            </div>
            <p className="text-xs text-[#79716B] mt-1">
              Kelola dokumen yang ditarik dari meja untuk diserahkan, dicetak, serta arsip yang telah diserahkan.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleOpenPicker}
              className="min-h-[38px] px-3 sm:px-3.5 py-1.5 rounded-xl bg-[#F6F2EB] hover:bg-[#EAE4DC] text-[#2D2824] font-semibold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Plus size={16} weight="bold" />
              <span className="hidden sm:inline">Ambil dari Tumpukan</span>
              <span className="sm:hidden">Ambil</span>
            </button>

            {activeSubTab === 'pending' && (
              <>
                <button
                  onClick={handlePrint}
                  disabled={totalHandoverCount === 0}
                  className={`min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 sm:gap-2 transition-all ${
                    totalHandoverCount > 0
                      ? 'bg-[#D97757] hover:bg-[#C26344] text-white shadow-xs'
                      : 'bg-[#EAE4DC] text-[#79716B] cursor-not-allowed'
                  }`}
                >
                  <Printer size={16} weight="bold" />
                  <span>Cetak / Print</span>
                </button>

                {totalHandoverCount > 0 && (
                  <button
                    onClick={() => setIsArchiveModalOpen(true)}
                    className="min-h-[38px] px-3 sm:px-3.5 py-1.5 rounded-xl bg-[#EEF6F1] hover:bg-[#D5EBDD] text-[#548A70] font-bold text-xs flex items-center gap-1.5 transition-colors border border-[#C8E2D4]"
                    title="Tandai selesai diserahkan dan simpan ke riwayat arsip"
                  >
                    <CheckCircle size={16} weight="bold" />
                    <span className="hidden sm:inline">Selesai & Arsipkan</span>
                    <span className="sm:hidden">Arsipkan</span>
                  </button>
                )}

                {totalHandoverCount > 0 && (
                  <button
                    onClick={() => setIsClearModalOpen(true)}
                    className="w-[38px] h-[38px] rounded-xl bg-[#F6F2EB] hover:bg-[#FBEBEB] text-[#79716B] hover:text-[#C84C4C] flex items-center justify-center transition-colors shrink-0"
                    title="Kosongkan Antrean"
                  >
                    <Trash size={16} />
                  </button>
                )}
              </>
            )}

            {activeSubTab === 'history' && (
              <button
                onClick={handlePrint}
                disabled={totalHistoryCount === 0}
                className={`min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 sm:gap-2 transition-all ${
                  totalHistoryCount > 0
                    ? 'bg-[#548A70] hover:bg-[#43725C] text-white shadow-xs'
                    : 'bg-[#EAE4DC] text-[#79716B] cursor-not-allowed'
                }`}
              >
                <Printer size={16} weight="bold" />
                <span>Cetak Riwayat</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-Tab Navigation */}
        <div className="bg-[#F6F2EB] p-1 rounded-2xl border border-[#EAE4DC] flex items-center gap-1">
          <button
            onClick={() => setActiveSubTab('pending')}
            className={`flex-1 min-h-[38px] flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'pending'
                ? 'bg-[#FFFFFF] text-[#D97757] shadow-xs border border-[#EAE4DC]'
                : 'text-[#79716B] hover:text-[#2D2824] border border-transparent'
            }`}
          >
            <ListDashes size={16} weight={activeSubTab === 'pending' ? 'bold' : 'regular'} className="shrink-0" />
            <span className="truncate">Antrean Cetak</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
              activeSubTab === 'pending' ? 'bg-[#FDF1ED] text-[#D97757]' : 'bg-[#EAE4DC] text-[#79716B]'
            }`}>
              {totalHandoverCount}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex-1 min-h-[38px] flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'history'
                ? 'bg-[#FFFFFF] text-[#548A70] shadow-xs border border-[#EAE4DC]'
                : 'text-[#79716B] hover:text-[#2D2824] border border-transparent'
            }`}
          >
            <ClockCounterClockwise size={16} weight={activeSubTab === 'history' ? 'bold' : 'regular'} className="shrink-0" />
            <span className="truncate">Riwayat Diserahkan</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
              activeSubTab === 'history' ? 'bg-[#EEF6F1] text-[#548A70]' : 'bg-[#EAE4DC] text-[#79716B]'
            }`}>
              {totalHistoryCount}
            </span>
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setSelectedSurveyorFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                selectedSurveyorFilter === 'ALL'
                  ? 'bg-[#2D2824] text-white'
                  : 'bg-[#F6F2EB] text-[#79716B] hover:text-[#2D2824]'
              }`}
            >
              Semua Investigator ({activeSubTab === 'pending' ? totalHandoverCount : totalHistoryCount})
            </button>
            {(activeSubTab === 'pending' ? activeHandoverSurveyors : historySurveyors).map((s) => {
              const count = activeSubTab === 'pending'
                ? (handoverState[s] ?? []).length
                : (historyState[s] ?? []).length;
              return (
                <button
                  key={s}
                  onClick={() => setSelectedSurveyorFilter(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                    selectedSurveyorFilter === s
                      ? activeSubTab === 'pending'
                        ? 'bg-[#D97757] text-white'
                        : 'bg-[#548A70] text-white'
                      : 'bg-[#F6F2EB] text-[#79716B] hover:text-[#2D2824]'
                  }`}
                >
                  {s} ({count})
                </button>
              );
            })}
          </div>

          {activeSubTab === 'history' && (
            <div className="relative w-full sm:w-64 shrink-0">
              <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#79716B]" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Cari di riwayat..."
                className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-[#FAF8F5] border border-[#EAE4DC] text-xs text-[#2D2824] placeholder-[#79716B] focus:outline-hidden focus:border-[#548A70]"
              />
              {historySearch && (
                <button
                  onClick={() => setHistorySearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#79716B] hover:text-[#2D2824]"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Print Layout & Sorting Options */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-[#F6F2EB] text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[#79716B] font-medium shrink-0">Opsi Urutan Cetak:</span>
            <div className="bg-[#F6F2EB] p-0.5 rounded-xl border border-[#EAE4DC] flex items-center">
              <button
                type="button"
                onClick={() => setPrintSortMode('default')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                  printSortMode === 'default'
                    ? 'bg-[#FFFFFF] text-[#2D2824] shadow-xs border border-[#EAE4DC]'
                    : 'text-[#79716B] hover:text-[#2D2824] border border-transparent'
                }`}
              >
                Default (Per Investigator)
              </button>
              <button
                type="button"
                onClick={() => setPrintSortMode('alphabetical')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                  printSortMode === 'alphabetical'
                    ? activeSubTab === 'pending'
                      ? 'bg-[#FFFFFF] text-[#D97757] shadow-xs border border-[#F7D0C4]'
                      : 'bg-[#FFFFFF] text-[#548A70] shadow-xs border border-[#C8E2D4]'
                    : 'text-[#79716B] hover:text-[#2D2824] border border-transparent'
                }`}
              >
                Abjad Nasabah (A–Z)
              </button>
            </div>
          </div>

          <span className="text-[#79716B] text-[11px] font-semibold">
            {activeSubTab === 'pending' ? totalHandoverCount : totalHistoryCount} Berkas Terdata
          </span>
        </div>
      </div>

      {/* PRINT-ONLY HEADER */}
      <div className="hidden print:block mb-2 pb-1.5 border-b-2 border-black">
        <div className="flex justify-between items-baseline">
          <h1 className="text-base font-black tracking-tight text-black uppercase">
            {activeSubTab === 'pending'
              ? printSortMode === 'alphabetical'
                ? 'DAFTAR URUTAN DOKUMEN FISIK (URUT ABJAD NASABAH)'
                : 'DAFTAR URUTAN DOKUMEN FISIK'
              : printSortMode === 'alphabetical'
                ? 'DAFTAR DOKUMEN FISIK - ARSIP RIWAYAT (URUT ABJAD NASABAH)'
                : 'DAFTAR DOKUMEN FISIK (ARSIP RIWAYAT)'}
          </h1>
          <span className="text-[10px] text-black">Dicetak: {PRINT_DATE_STRING}</span>
        </div>
        <p className="text-[10px] text-black mt-0.5">
          {printSortMode === 'alphabetical'
            ? '* Diurutkan berdasarkan abjad nama nasabah (A–Z).'
            : '* Urutan nomor atas adalah dokumen tumpukan paling atas.'}
        </p>
      </div>

      {/* CONTENT LIST / TABLES (DRY) */}
      {activeSubTab === 'pending' ? (
        displayPendingGroups.length > 0 ? (
          printSortMode === 'alphabetical' ? (
            <div className="bg-[#FFFFFF] border border-[#EAE4DC] print:border-black rounded-2xl print:rounded-none overflow-hidden shadow-xs print:shadow-none">
              <div className="bg-[#FAF8F5] print:bg-gray-100 border-b border-[#EAE4DC] print:border-black px-4 py-2.5 print:py-1.5 print:px-2 flex items-center justify-between">
                <span className="font-extrabold text-xs sm:text-sm print:text-xs text-[#2D2824] print:text-black uppercase tracking-wide">
                  DAFTAR BERKAS DIURUTKAN BERDASARKAN ABJAD NASABAH (A–Z)
                </span>
                <span className="text-[11px] print:text-[10px] font-semibold text-[#79716B] print:text-black">
                  Total: {alphabeticalPendingItems.length} Berkas
                </span>
              </div>
              <HandoverRecordTable
                items={alphabeticalPendingItems}
                mode="pending"
                showSurveyor={true}
                onAction={handleReturnPending}
              />
            </div>
          ) : (
            <div className="space-y-6 print:space-y-4">
              {displayPendingGroups.map((group) => (
                <div
                  key={group.surveyor}
                  className="bg-[#FFFFFF] border border-[#EAE4DC] print:border-black rounded-2xl print:rounded-none overflow-hidden shadow-xs print:shadow-none"
                >
                  <div className="bg-[#FAF8F5] print:bg-gray-100 border-b border-[#EAE4DC] print:border-black px-4 py-2.5 print:py-1.5 print:px-2 flex items-center justify-between">
                    <span className="font-extrabold text-xs sm:text-sm print:text-xs text-[#2D2824] print:text-black uppercase tracking-wide">
                      INVESTIGATOR: {group.surveyor}
                    </span>
                    <span className="text-[11px] print:text-[10px] font-semibold text-[#79716B] print:text-black">
                      Total: {group.items.length} Berkas
                    </span>
                  </div>
                  <HandoverRecordTable
                    items={group.items}
                    mode="pending"
                    showSurveyor={false}
                    onAction={handleReturnPending}
                  />
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-8 sm:p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-[#F6F2EB] text-[#79716B] flex items-center justify-center mx-auto mb-3">
              <FileText size={24} />
            </div>
            <h3 className="text-sm font-bold text-[#2D2824]">
              Tidak Ada Dokumen di Antrean Pengambilan
            </h3>
            <p className="text-xs text-[#79716B] max-w-md mx-auto mt-1 mb-4">
              Pilih berkas dari tumpukan meja untuk disiapkan dan dicetak lembar urutannya sebelum diserahkan.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={handleOpenPicker}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D97757] hover:bg-[#C26344] text-white text-xs font-bold shadow-xs transition-colors"
              >
                <Plus size={16} weight="bold" />
                <span>Pilih Berkas dari Tumpukan Meja</span>
              </button>
            </div>
          </div>
        )
      ) : displayHistoryGroups.length > 0 ? (
        printSortMode === 'alphabetical' ? (
          <div className="bg-[#FFFFFF] border border-[#EAE4DC] print:border-black rounded-2xl print:rounded-none overflow-hidden shadow-xs print:shadow-none">
            <div className="bg-[#FAF8F5] print:bg-gray-100 border-b border-[#EAE4DC] print:border-black px-4 py-2.5 print:py-1.5 print:px-2 flex items-center justify-between">
              <span className="font-extrabold text-xs sm:text-sm print:text-xs text-[#2D2824] print:text-black uppercase tracking-wide">
                ARSIP RIWAYAT DIURUTKAN BERDASARKAN ABJAD NASABAH (A–Z)
              </span>
              <span className="text-[11px] print:text-[10px] font-semibold text-[#548A70] print:text-black bg-[#EEF6F1] print:bg-transparent border border-[#C8E2D4] print:border-0 px-2 py-0.5 rounded-full">
                Total: {alphabeticalHistoryItems.length} Berkas
              </span>
            </div>
            <HandoverRecordTable
              items={alphabeticalHistoryItems}
              mode="history"
              showSurveyor={true}
              onAction={handleRestoreHistory}
            />
          </div>
        ) : (
          <div className="space-y-6 print:space-y-4">
            {displayHistoryGroups.map((group) => (
              <div
                key={group.surveyor}
                className="bg-[#FFFFFF] border border-[#EAE4DC] print:border-black rounded-2xl print:rounded-none overflow-hidden shadow-xs print:shadow-none"
              >
                <div className="bg-[#FAF8F5] print:bg-gray-100 border-b border-[#EAE4DC] print:border-black px-4 py-2.5 print:py-1.5 print:px-2 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs sm:text-sm print:text-xs text-[#2D2824] print:text-black uppercase tracking-wide">
                      INVESTIGATOR: {group.surveyor}
                    </span>
                    <span className="text-[11px] print:text-[10px] font-semibold text-[#548A70] print:text-black bg-[#EEF6F1] print:bg-transparent border border-[#C8E2D4] print:border-0 px-2 py-0.5 rounded-full">
                      {group.items.length} Berkas
                    </span>
                  </div>

                  {onRestoreAllHistory && (
                    <button
                      onClick={() => onRestoreAllHistory(group.surveyor)}
                      className="print:hidden min-h-[30px] px-2.5 py-1 text-xs rounded-xl bg-[#FFFFFF] border border-[#EAE4DC] hover:border-[#D97757] hover:text-[#D97757] text-[#2D2824] flex items-center gap-1.5 font-semibold transition-colors shadow-xs"
                      title="Kembalikan semua berkas investigator ini ke Antrean Cetak untuk digabung dengan berkas baru"
                    >
                      <ArrowUUpLeft size={14} weight="bold" />
                      <span>Tarik Semua ke Antrean</span>
                    </button>
                  )}
                </div>
                <HandoverRecordTable
                  items={group.items}
                  mode="history"
                  showSurveyor={false}
                  onAction={handleRestoreHistory}
                />
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-8 sm:p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-[#F6F2EB] text-[#79716B] flex items-center justify-center mx-auto mb-3">
            <ClockCounterClockwise size={24} />
          </div>
          <h3 className="text-sm font-bold text-[#2D2824]">
            Belum Ada Riwayat Dokumen Diserahkan
          </h3>
          <p className="text-xs text-[#79716B] max-w-md mx-auto mt-1">
            {historySearch
              ? `Tidak ditemukan dokumen di riwayat yang cocok dengan "${historySearch}".`
              : 'Dokumen yang telah ditandai selesai dan diserahkan akan tercatat rapi di sini.'}
          </p>
        </div>
      )}

      {/* QUICK PICKER BOTTOM SHEET */}
      <BottomSheet
        isOpen={isPickerOpen}
        onClose={() => {
          setIsPickerOpen(false);
          setPickerSearch('');
        }}
        title={`Ambil Berkas dari Tumpukan: ${activeSurveyor}`}
        subtitle="Pilih dokumen yang ingin diambil untuk diserahkan. Urutan tumpukan sisa di meja akan otomatis dirapatkan."
      >
        <div className="space-y-3">
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#79716B]"
            />
            <input
              type="text"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Cari nama nasabah atau no case di tumpukan ini..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#FAF8F5] border border-[#EAE4DC] text-xs text-[#2D2824] placeholder-[#79716B] focus:outline-hidden focus:border-[#D97757]"
            />
            {pickerSearch && (
              <button
                onClick={() => setPickerSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#79716B] hover:text-[#2D2824]"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-xs px-1">
            <button
              onClick={handleSelectAllPicker}
              className="text-[#D97757] font-semibold hover:underline"
            >
              {selectedPickerKeys.size === availableToTake.length && availableToTake.length > 0
                ? 'Batal Pilih Semua'
                : 'Pilih Semua'}
            </button>
            <span className="text-[#79716B] text-[11px]">
              {selectedPickerKeys.size} dari {availableToTake.length} dipilih
            </span>
          </div>

          <div className="max-h-[320px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-[#EAE4DC]">
            {availableToTake.length > 0 ? (
              availableToTake.map((it, idx) => {
                const key = `${it.jenis_case}#${it.no}`;
                const isSelected = selectedPickerKeys.has(key);
                return (
                  <div
                    key={key}
                    onClick={() => handleTogglePickerKey(key)}
                    className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#FDF1ED] border border-[#F7D0C4]'
                        : 'hover:bg-[#FAF8F5]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="text-[#D97757] shrink-0">
                        {isSelected ? (
                          <CheckSquare size={18} weight="fill" />
                        ) : (
                          <Square size={18} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-[#79716B] bg-[#F6F2EB] px-1.5 py-0.5 rounded">
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-bold text-[#2D2824] truncate">
                            {it.debitur}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#79716B] flex items-center gap-1.5 mt-0.5">
                          <span>Case {it.jenis_case}</span>
                          <span>•</span>
                          <span>{it.wilayah || it.kota}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-[#79716B]">
                Tidak ada dokumen di tumpukan meja ini yang cocok.
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={handleConfirmTake}
              disabled={selectedPickerKeys.size === 0}
              className={`w-full py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 ${
                selectedPickerKeys.size > 0
                  ? 'bg-[#D97757] hover:bg-[#C26344] text-white shadow-xs'
                  : 'bg-[#EAE4DC] text-[#79716B] cursor-not-allowed'
              }`}
            >
              <span>Ambil {selectedPickerKeys.size} Berkas Terpilih</span>
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* CONFIRM CLEAR MODAL */}
      <ConfirmModal
        isOpen={isClearModalOpen}
        title="Kosongkan Antrean Pengambilan"
        message="Apakah Anda yakin ingin membatalkan antrean ini? Berkas tidak akan tercatat sebagai sudah diserahkan."
        confirmLabel="Ya, Kosongkan"
        cancelLabel="Batal"
        isDestructive={true}
        onConfirm={handleConfirmClear}
        onCancel={() => setIsClearModalOpen(false)}
      />

      {/* CONFIRM ARCHIVE MODAL */}
      <ConfirmModal
        isOpen={isArchiveModalOpen}
        title="Konfirmasi Selesai & Serahkan Berkas"
        message={
          selectedSurveyorFilter === 'ALL'
            ? `Apakah seluruh ${totalHandoverCount} berkas pada antrean pengambilan ini sudah resmi diserahkan? Seluruhnya akan dipindahkan ke Riwayat Sudah Diserahkan.`
            : `Apakah ${(handoverState[selectedSurveyorFilter] ?? []).length} berkas milik ${selectedSurveyorFilter} ini sudah resmi diserahkan? Berkas akan dipindahkan ke Riwayat Sudah Diserahkan.`
        }
        confirmLabel="Ya, Resmi Diserahkan"
        cancelLabel="Batal"
        isDestructive={false}
        onConfirm={handleConfirmArchive}
        onCancel={() => setIsArchiveModalOpen(false)}
      />
    </div>
  );
};
