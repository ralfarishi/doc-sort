import { useState, useMemo } from 'react';
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

interface HandoverViewProps {
  handoverState: HandoverState;
  historyState: HandoverHistoryState;
  masterState: MasterState;
  activeSurveyor: string;
  onTakeItems: (surveyor: string, itemKeys: Set<string>) => void;
  onReturnItem: (surveyor: string, handoverId: string) => void;
  onClearHandover: (surveyor?: string) => void;
  onArchiveHandover: (surveyor: string, notes?: string) => void;
  onShowToast: (type: 'success' | 'warning' | 'error' | 'info', message: string, desc?: string) => void;
}

const PRINT_DATE_STRING = new Date().toLocaleDateString('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export const HandoverView: React.FC<HandoverViewProps> = ({
  handoverState,
  historyState,
  masterState,
  activeSurveyor,
  onTakeItems,
  onReturnItem,
  onClearHandover,
  onArchiveHandover,
  onShowToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'pending' | 'history'>('pending');
  const [selectedSurveyorFilter, setSelectedSurveyorFilter] = useState<string>('ALL');
  const [historySearch, setHistorySearch] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedPickerKeys, setSelectedPickerKeys] = useState<Set<string>>(new Set());
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);

  // Investigators that currently have active taken items
  const activeHandoverSurveyors = useMemo(() => {
    return Object.keys(handoverState).filter(
      (s) => (handoverState[s] ?? []).length > 0
    );
  }, [handoverState]);

  // Investigators that have history entries
  const historySurveyors = useMemo(() => {
    return Object.keys(historyState).filter(
      (s) => (historyState[s] ?? []).length > 0 && s !== 'BELUM DITUGASKAN'
    );
  }, [historyState]);

  // Pending groups to display
  const displayPendingGroups = useMemo(() => {
    if (selectedSurveyorFilter === 'ALL') {
      return activeHandoverSurveyors.map((s) => ({
        surveyor: s,
        items: handoverState[s] ?? [],
      }));
    }
    const items = handoverState[selectedSurveyorFilter] ?? [];
    return items.length > 0 ? [{ surveyor: selectedSurveyorFilter, items }] : [];
  }, [handoverState, selectedSurveyorFilter, activeHandoverSurveyors]);

  // History groups to display
  const displayHistoryGroups = useMemo(() => {
    const listSurv = selectedSurveyorFilter === 'ALL' ? historySurveyors : [selectedSurveyorFilter];
    const q = historySearch.toLowerCase().trim();

    return listSurv.map((s) => {
      let items = historyState[s] ?? [];
      if (q) {
        items = items.filter(
          (it) =>
            it.debitur.toLowerCase().includes(q) ||
            String(it.no).includes(q) ||
            String(it.id_klaim).includes(q) ||
            it.wilayah.toLowerCase().includes(q) ||
            (it.notes && it.notes.toLowerCase().includes(q))
        );
      }
      return { surveyor: s, items };
    }).filter((g) => g.items.length > 0);
  }, [historyState, selectedSurveyorFilter, historySurveyors, historySearch]);

  const totalHandoverCount = useMemo(() => {
    return Object.values(handoverState).reduce((acc, list) => acc + list.length, 0);
  }, [handoverState]);

  const totalHistoryCount = useMemo(() => {
    return Object.values(historyState).reduce((acc, list) => acc + list.length, 0);
  }, [historyState]);

  // Desk pile items available to take in the active surveyor
  const availableToTake = useMemo(() => {
    const pile = masterState[activeSurveyor] ?? [];
    if (!pickerSearch.trim()) return pile;
    const q = pickerSearch.toLowerCase().trim();
    return pile.filter(
      (it) =>
        it.debitur.toLowerCase().includes(q) ||
        String(it.no).includes(q) ||
        String(it.id_klaim).includes(q) ||
        it.wilayah.toLowerCase().includes(q)
    );
  }, [masterState, activeSurveyor, pickerSearch]);

  const handleTogglePickerKey = (key: string) => {
    setSelectedPickerKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAllPicker = () => {
    if (selectedPickerKeys.size === availableToTake.length) {
      setSelectedPickerKeys(new Set());
    } else {
      const allKeys = new Set(availableToTake.map((it) => `${it.jenis_case}#${it.no}`));
      setSelectedPickerKeys(allKeys);
    }
  };

  const handleConfirmTake = () => {
    if (selectedPickerKeys.size === 0) return;
    const count = selectedPickerKeys.size;
    onTakeItems(activeSurveyor, selectedPickerKeys);
    setSelectedPickerKeys(new Set());
    setIsPickerOpen(false);
    setPickerSearch('');
    setActiveSubTab('pending');
    onShowToast(
      'success',
      'Berkas Berhasil Diambil',
      `${count} berkas dikeluarkan dari tumpukan meja dan masuk ke daftar pengambilan.`
    );
  };

  const handlePrint = () => {
    if (totalHandoverCount === 0) {
      onShowToast('warning', 'Daftar Kosong', 'Tidak ada dokumen dalam daftar pengambilan untuk dicetak.');
      return;
    }
    window.print();
  };

  const handleConfirmClear = () => {
    onClearHandover(selectedSurveyorFilter === 'ALL' ? undefined : selectedSurveyorFilter);
    setIsClearModalOpen(false);
    onShowToast('info', 'Daftar Dikosongkan', 'Semua berkas pada antrean pengambilan telah dibersihkan.');
  };

  const handleConfirmArchive = () => {
    const targetSurv = selectedSurveyorFilter === 'ALL'
      ? (activeHandoverSurveyors[0] || activeSurveyor)
      : selectedSurveyorFilter;

    if (!targetSurv) return;

    // If 'ALL' is selected, archive all active surveyors
    if (selectedSurveyorFilter === 'ALL') {
      activeHandoverSurveyors.forEach((s) => onArchiveHandover(s));
    } else {
      onArchiveHandover(targetSurv);
    }

    setIsArchiveModalOpen(false);
    setActiveSubTab('history');
    onShowToast(
      'success',
      'Penyerahan Selesai & Diarsipkan',
      'Berkas berhasil dipindahkan ke riwayat dokumen yang sudah diserahkan.'
    );
  };

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
              onClick={() => {
                setSelectedPickerKeys(new Set());
                setIsPickerOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-[#F6F2EB] hover:bg-[#EAE4DC] text-[#2D2824] font-semibold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Plus size={16} weight="bold" />
              <span>Ambil dari Tumpukan</span>
            </button>

            {activeSubTab === 'pending' && (
              <>
                <button
                  onClick={handlePrint}
                  disabled={totalHandoverCount === 0}
                  className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
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
                    className="px-3.5 py-2 rounded-xl bg-[#EEF6F1] hover:bg-[#D5EBDD] text-[#548A70] font-bold text-xs flex items-center gap-1.5 transition-colors border border-[#C8E2D4]"
                    title="Tandai selesai diserahkan dan simpan ke riwayat arsip"
                  >
                    <CheckCircle size={16} weight="bold" />
                    <span>Selesai & Arsipkan</span>
                  </button>
                )}

                {totalHandoverCount > 0 && (
                  <button
                    onClick={() => setIsClearModalOpen(true)}
                    className="p-2 rounded-xl bg-[#F6F2EB] hover:bg-[#FBEBEB] text-[#79716B] hover:text-[#C84C4C] transition-colors"
                    title="Kosongkan Antrean"
                  >
                    <Trash size={16} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Sub-Tab Navigation: Antrean Pengambilan vs Riwayat Arsip */}
        <div className="flex items-center gap-2 border-b border-[#EAE4DC] pt-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveSubTab('pending')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === 'pending'
                ? 'border-[#D97757] text-[#D97757]'
                : 'border-transparent text-[#79716B] hover:text-[#2D2824]'
            }`}
          >
            <ListDashes size={16} weight="bold" className="shrink-0" />
            <span>Antrean Siap Cetak</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#F6F2EB] text-[#2D2824] shrink-0">
              {totalHandoverCount}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === 'history'
                ? 'border-[#548A70] text-[#548A70]'
                : 'border-transparent text-[#79716B] hover:text-[#2D2824]'
            }`}
          >
            <ClockCounterClockwise size={16} weight="bold" className="shrink-0" />
            <span>Riwayat Sudah Diserahkan</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#EEF6F1] text-[#548A70] shrink-0">
              {totalHistoryCount}
            </span>
          </button>
        </div>

        {/* Filter Toolbar (Investigator Filter + Optional Search in History) */}
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
      </div>

      {/* PRINT-ONLY HEADER: Ringkas, tanpa page break, menyatu rapi */}
      <div className="hidden print:block mb-2 pb-1.5 border-b-2 border-black">
        <div className="flex justify-between items-baseline">
          <h1 className="text-base font-black tracking-tight text-black uppercase">
            DAFTAR URUTAN DOKUMEN FISIK
          </h1>
          <span className="text-[10px] text-black">Dicetak: {PRINT_DATE_STRING}</span>
        </div>
        <p className="text-[10px] text-black mt-0.5">
          * Urutan nomor atas adalah dokumen tumpukan paling atas.
        </p>
      </div>

      {/* CONTENT LIST / TABLES */}
      {activeSubTab === 'pending' ? (
        displayPendingGroups.length > 0 ? (
          <div className="space-y-6 print:space-y-4">
            {displayPendingGroups.map((group) => (
              <div
                key={group.surveyor}
                className="bg-[#FFFFFF] border border-[#EAE4DC] print:border-black rounded-2xl print:rounded-none overflow-hidden shadow-xs print:shadow-none"
              >
                {/* Group Investigator Header */}
                <div className="bg-[#FAF8F5] print:bg-gray-100 border-b border-[#EAE4DC] print:border-black px-4 py-2.5 print:py-1.5 print:px-2 flex items-center justify-between">
                  <span className="font-extrabold text-xs sm:text-sm print:text-xs text-[#2D2824] print:text-black uppercase tracking-wide">
                    INVESTIGATOR: {group.surveyor}
                  </span>
                  <span className="text-[11px] print:text-[10px] font-semibold text-[#79716B] print:text-black">
                    Total: {group.items.length} Berkas
                  </span>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed text-left text-xs border-collapse print-table">
                    <colgroup>
                      <col className="w-12 print:w-10" style={{ width: '42px' }} />
                      <col style={{ width: '46%' }} />
                      <col style={{ width: '32%' }} />
                      <col style={{ width: '22%' }} />
                      <col className="w-20 print:hidden" style={{ width: '80px' }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-[#EAE4DC] print:border-black text-[11px] text-[#79716B] print:text-black uppercase bg-[#FFFFFF] print:bg-white font-bold">
                        <th className="py-2.5 px-3 text-center">No</th>
                        <th className="py-2.5 px-3 text-left">Nama Nasabah (Debitur)</th>
                        <th className="py-2.5 px-3 text-left">Wilayah</th>
                        <th className="py-2.5 px-3 text-center">Jenis Case</th>
                        <th className="py-2.5 px-3 text-center print:hidden">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAE4DC] print:divide-black">
                      {group.items.map((it, idx) => (
                        <tr
                          key={it.id}
                          className="hover:bg-[#FAF8F5] print:hover:bg-white text-[#2D2824] print:text-black transition-colors"
                        >
                          <td className="py-2 px-3 text-center font-bold text-xs text-[#79716B] print:text-black">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 font-semibold text-xs sm:text-sm print:text-[11px] truncate">
                            {it.debitur}
                          </td>
                          <td className="py-2 px-3 text-xs text-[#79716B] print:text-black print:text-[11px] truncate">
                            {it.wilayah || it.kota || '-'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-md font-bold text-[11px] bg-[#F6F2EB] print:bg-transparent text-[#D97757] print:text-black border print:border-0 border-[#EAE4DC] print-badge">
                              Case {it.jenis_case}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center print:hidden">
                            <button
                              onClick={() => {
                                onReturnItem(group.surveyor, it.id);
                                onShowToast('info', 'Berkas Dikembalikan', `${it.debitur} dimasukkan kembali ke tumpukan meja.`);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-[#79716B] hover:text-[#2D2824] bg-[#F6F2EB] hover:bg-[#EAE4DC] transition-colors"
                              title="Kembalikan ke tumpukan meja"
                            >
                              <ArrowUUpLeft size={13} weight="bold" />
                              <span>Batal</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
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
                onClick={() => {
                  setSelectedPickerKeys(new Set());
                  setIsPickerOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D97757] hover:bg-[#C26344] text-white text-xs font-bold shadow-xs transition-colors"
              >
                <Plus size={16} weight="bold" />
                <span>Pilih Berkas dari Tumpukan Meja</span>
              </button>
            </div>
          </div>
        )
      ) : (
        /* HISTORY SUB-TAB */
        displayHistoryGroups.length > 0 ? (
          <div className="space-y-6">
            {displayHistoryGroups.map((group) => (
              <div
                key={group.surveyor}
                className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl overflow-hidden shadow-xs"
              >
                {/* Group Investigator Header */}
                <div className="bg-[#FAF8F5] border-b border-[#EAE4DC] px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs sm:text-sm text-[#2D2824] uppercase tracking-wide">
                      INVESTIGATOR: {group.surveyor}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-[#548A70] bg-[#EEF6F1] border border-[#C8E2D4] px-2 py-0.5 rounded-full">
                    {group.items.length} Berkas Sudah Diserahkan
                  </span>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#EAE4DC] text-[11px] text-[#79716B] uppercase bg-[#FFFFFF] font-bold">
                        <th className="py-2.5 px-3 w-12 text-center">No</th>
                        <th className="py-2.5 px-3">Nama Nasabah (Debitur)</th>
                        <th className="py-2.5 px-3">Wilayah</th>
                        <th className="py-2.5 px-3 w-28 text-center">Jenis Case</th>
                        <th className="py-2.5 px-3">Keterangan / Verifikasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAE4DC]">
                      {group.items.map((it, idx) => (
                        <tr
                          key={it.id}
                          className="hover:bg-[#FAF8F5] text-[#2D2824] transition-colors"
                        >
                          <td className="py-2 px-3 text-center font-bold text-xs text-[#79716B]">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 font-semibold text-xs sm:text-sm">
                            {it.debitur}
                          </td>
                          <td className="py-2 px-3 text-xs text-[#79716B]">
                            {it.wilayah || it.kota || '-'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-md font-bold text-[11px] bg-[#EEF6F1] text-[#548A70] border border-[#C8E2D4]">
                              Case {it.jenis_case}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-xs text-[#79716B]">
                            <span className="truncate block max-w-xs" title={it.notes || ''}>
                              {it.notes || 'Diserahkan via web'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
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
        )
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
        message="Apakah dokumen-dokumen ini sudah resmi diserahkan? Dokumen akan dipindahkan ke Riwayat Sudah Diserahkan secara permanen."
        confirmLabel="Ya, Resmi Diserahkan"
        cancelLabel="Batal"
        isDestructive={false}
        onConfirm={handleConfirmArchive}
        onCancel={() => setIsArchiveModalOpen(false)}
      />
    </div>
  );
};
