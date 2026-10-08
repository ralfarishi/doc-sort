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
} from '@phosphor-icons/react';
import type { HandoverState, MasterState } from '../types';
import { BottomSheet } from './BottomSheet';
import { ConfirmModal } from './ConfirmModal';

interface HandoverViewProps {
  handoverState: HandoverState;
  masterState: MasterState;
  activeSurveyor: string;
  onTakeItems: (surveyor: string, itemKeys: Set<string>) => void;
  onReturnItem: (surveyor: string, handoverId: string) => void;
  onClearHandover: (surveyor?: string) => void;
  onShowToast: (type: 'success' | 'warning' | 'error' | 'info', message: string, desc?: string) => void;
}

const PRINT_DATE_STRING = new Date().toLocaleDateString('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export const HandoverView: React.FC<HandoverViewProps> = ({
  handoverState,
  masterState,
  activeSurveyor,
  onTakeItems,
  onReturnItem,
  onClearHandover,
  onShowToast,
}) => {
  const [selectedSurveyorFilter, setSelectedSurveyorFilter] = useState<string>('ALL');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedPickerKeys, setSelectedPickerKeys] = useState<Set<string>>(new Set());
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  // Surveyors that currently have handover items
  const activeHandoverSurveyors = useMemo(() => {
    return Object.keys(handoverState).filter(
      (s) => (handoverState[s] ?? []).length > 0
    );
  }, [handoverState]);

  // Handover groups to display
  const displayGroups = useMemo(() => {
    if (selectedSurveyorFilter === 'ALL') {
      return activeHandoverSurveyors.map((s) => ({
        surveyor: s,
        items: handoverState[s] ?? [],
      }));
    }
    const items = handoverState[selectedSurveyorFilter] ?? [];
    return items.length > 0
      ? [{ surveyor: selectedSurveyorFilter, items }]
      : [];
  }, [handoverState, selectedSurveyorFilter, activeHandoverSurveyors]);

  const totalHandoverCount = useMemo(() => {
    return Object.values(handoverState).reduce((acc, list) => acc + list.length, 0);
  }, [handoverState]);

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
    onShowToast('info', 'Daftar Dikosongkan', 'Semua berkas pengambilan telah dibersihkan.');
  };

  return (
    <div className="space-y-4">
      {/* SCREEN HEADER (Hidden in print) */}
      <div className="print:hidden bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D97757]" />
              <h2 className="text-base sm:text-lg font-bold text-[#2D2824]">
                Daftar Dokumen Diambil
              </h2>
            </div>
            <p className="text-xs text-[#79716B] mt-1">
              Urutan atas adalah tumpukan atas meja. Daftar ini siap dicetak sebagai panduan berkas yang diambil.
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
                onClick={() => setIsClearModalOpen(true)}
                className="p-2 rounded-xl bg-[#F6F2EB] hover:bg-[#FBEBEB] text-[#79716B] hover:text-[#C84C4C] transition-colors"
                title="Kosongkan Daftar"
              >
                <Trash size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Filter per Surveyor */}
        {activeHandoverSurveyors.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mt-4 pt-3 border-t border-[#EAE4DC]">
            <button
              onClick={() => setSelectedSurveyorFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                selectedSurveyorFilter === 'ALL'
                  ? 'bg-[#2D2824] text-white'
                  : 'bg-[#F6F2EB] text-[#79716B] hover:text-[#2D2824]'
              }`}
            >
              Semua Surveyor ({totalHandoverCount})
            </button>
            {activeHandoverSurveyors.map((s) => {
              const count = (handoverState[s] ?? []).length;
              return (
                <button
                  key={s}
                  onClick={() => setSelectedSurveyorFilter(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                    selectedSurveyorFilter === s
                      ? 'bg-[#D97757] text-white'
                      : 'bg-[#F6F2EB] text-[#79716B] hover:text-[#2D2824]'
                  }`}
                >
                  {s} ({count})
                </button>
              );
            })}
          </div>
        )}
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
      {displayGroups.length > 0 ? (
        <div className="space-y-6 print:space-y-4">
          {displayGroups.map((group) => (
            <div
              key={group.surveyor}
              className="bg-[#FFFFFF] border border-[#EAE4DC] print:border-black rounded-2xl print:rounded-none overflow-hidden shadow-xs print:shadow-none"
            >
              {/* Group Surveyor Header */}
              <div className="bg-[#FAF8F5] print:bg-gray-100 border-b border-[#EAE4DC] print:border-black px-4 py-2.5 print:py-1.5 print:px-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xs sm:text-sm print:text-xs text-[#2D2824] print:text-black uppercase tracking-wide">
                    SURVEYOR: {group.surveyor}
                  </span>
                </div>
                <span className="text-[11px] print:text-[10px] font-semibold text-[#79716B] print:text-black">
                  Total: {group.items.length} Berkas
                </span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse print-table">
                  <thead>
                    <tr className="border-b border-[#EAE4DC] print:border-black text-[11px] text-[#79716B] print:text-black uppercase bg-[#FFFFFF] print:bg-white font-bold">
                      <th className="py-2.5 px-3 w-12 text-center">No</th>
                      <th className="py-2.5 px-3">Nama Nasabah (Debitur)</th>
                      <th className="py-2.5 px-3">Wilayah</th>
                      <th className="py-2.5 px-3 w-28 text-center">Jenis Case</th>
                      <th className="py-2.5 px-3 w-24 text-center print:hidden">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAE4DC] print:divide-black">
                    {group.items.map((it, idx) => (
                      <tr
                        key={it.id}
                        className="hover:bg-[#FAF8F5] print:hover:bg-white text-[#2D2824] print:text-black transition-colors"
                      >
                        {/* No: Top of pile is top of list */}
                        <td className="py-2 px-3 text-center font-bold text-xs text-[#79716B] print:text-black">
                          {idx + 1}
                        </td>

                        {/* Debitur */}
                        <td className="py-2 px-3 font-semibold text-xs sm:text-sm print:text-[11px]">
                          {it.debitur}
                        </td>

                        {/* Wilayah */}
                        <td className="py-2 px-3 text-xs text-[#79716B] print:text-black print:text-[11px]">
                          {it.wilayah || it.kota || '-'}
                        </td>

                        {/* Jenis Case */}
                        <td className="py-2 px-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-md font-bold text-[11px] bg-[#F6F2EB] print:bg-transparent text-[#D97757] print:text-black border print:border-0 border-[#EAE4DC] print-badge">
                            Case {it.jenis_case}
                          </span>
                        </td>

                        {/* Action: Return back to master (Screen only) */}
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
        /* Empty State */
        <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-8 sm:p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-[#F6F2EB] text-[#79716B] flex items-center justify-center mx-auto mb-3">
            <FileText size={24} />
          </div>
          <h3 className="text-sm font-bold text-[#2D2824]">
            Belum Ada Dokumen yang Diambil
          </h3>
          <p className="text-xs text-[#79716B] max-w-md mx-auto mt-1 mb-4">
            Dokumen yang Anda ambil dari tumpukan fisik meja untuk diserahkan akan muncul di sini, dengan urutan tumpukan atas tetap di posisi paling atas.
          </p>
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
          {/* Search in picker */}
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

          {/* Select all & Count */}
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

          {/* List items */}
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

          {/* Confirm Button */}
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

      {/* CONFIRM MODAL: Zero browser alert/confirm (Carmack rule) */}
      <ConfirmModal
        isOpen={isClearModalOpen}
        title="Kosongkan Daftar Dokumen"
        message="Apakah Anda yakin ingin mengosongkan semua berkas dari daftar ini? Dokumen yang belum diproses tidak akan hilang dari database."
        confirmLabel="Ya, Kosongkan"
        cancelLabel="Batal"
        isDestructive={true}
        onConfirm={handleConfirmClear}
        onCancel={() => setIsClearModalOpen(false)}
      />
    </div>
  );
};
