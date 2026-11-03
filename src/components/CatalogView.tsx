import { useState, useMemo } from 'react';
import {
  DotsThreeVertical,
  DownloadSimple,
  UploadSimple,
  Copy,
  ArrowsClockwise,
  MagnifyingGlass,
  XCircle,
  ArrowSquareOut,
  CheckSquare,
  Square,
} from '@phosphor-icons/react';
import type { MasterState, MasterItem, HandoverHistoryState, TransitState, HandoverState } from '../types';
import {
  exportFullBackupToJson,
  formatCatalogMarkdown,
  isMasterState,
  isHandoverHistoryState,
  isTransitState,
  isHandoverState,
} from '../utils/logic';
import { BottomSheet } from './BottomSheet';

interface CatalogViewProps {
  masterState: MasterState;
  historyState?: HandoverHistoryState;
  transitState?: TransitState;
  handoverState?: HandoverState;
  activeSurveyor: string;
  onImportState: (newState: MasterState) => void;
  onImportHistoryState?: (newHistory: HandoverHistoryState) => void;
  onImportTransitState?: (newTransit: TransitState) => void;
  onImportHandoverState?: (newHandover: HandoverState) => void;
  onRequestReset: () => void;
  onShowToast: (type: 'success' | 'warning' | 'error' | 'info', message: string, desc?: string) => void;
  onTakeForHandover?: (surveyor: string, itemKeys: Set<string>) => void;
}

interface FilterChipRowProps {
  label: string;
  allLabel: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  format?: (value: string) => string;
}

/** One labeled, horizontally scrollable row of single-select filter chips. */
const FilterChipRow: React.FC<FilterChipRowProps> = ({ label, allLabel, options, value, onChange, format = (v) => v }) => {
  const chip = (id: string, text: string) => (
    <button
      key={id}
      onClick={() => onChange(id)}
      className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors ${
        value === id ? 'bg-[#2D2824] text-white' : 'bg-[#F6F2EB] text-[#79716B] hover:text-[#2D2824]'
      }`}
    >
      {text}
    </button>
  );
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#A8A29E]">{label}</span>
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {chip('ALL', allLabel)}
        {options.map((o) => chip(o, format(o)))}
      </div>
    </div>
  );
};

const getUniqueSorted = (items: MasterItem[], field: 'jenis_case' | 'wilayah'): string[] =>
  Array.from(new Set(items.map((it) => it[field]).filter(Boolean))).sort();

export const CatalogView: React.FC<CatalogViewProps> = ({
  masterState,
  historyState,
  transitState,
  handoverState,
  activeSurveyor,
  onImportState,
  onImportHistoryState,
  onImportTransitState,
  onImportHandoverState,
  onRequestReset,
  onShowToast,
  onTakeForHandover,
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [caseFilter, setCaseFilter] = useState('ALL');
  const [wilayahFilter, setWilayahFilter] = useState('ALL');
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const currentItems = useMemo(
    () => masterState[activeSurveyor] ?? [],
    [masterState, activeSurveyor]
  );

  const availableCases = useMemo(() => getUniqueSorted(currentItems, 'jenis_case'), [currentItems]);
  const availableWilayah = useMemo(() => getUniqueSorted(currentItems, 'wilayah'), [currentItems]);

  const filteredItems = useMemo(() => {
    const q = searchFilter.toLowerCase();
    return currentItems.filter((it) => {
      const matchSearch =
        !q ||
        it.debitur.toLowerCase().includes(q) ||
        String(it.no).includes(q) ||
        String(it.id_klaim).includes(q);
      const matchCase = caseFilter === 'ALL' || it.jenis_case === caseFilter;
      const matchWilayah = wilayahFilter === 'ALL' || it.wilayah === wilayahFilter;
      return matchSearch && matchCase && matchWilayah;
    });
  }, [currentItems, searchFilter, caseFilter, wilayahFilter]);

  // Handle JSON Import (supports both Legacy Master-only and Full Backup Bundle)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed: unknown = JSON.parse(String(event.target?.result ?? ''));

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const bundle = parsed as Record<string, unknown>;
          // Format A: Full Backup Bundle { version, master, history, transit, handover }
          if (bundle.master && isMasterState(bundle.master)) {
            onImportState(bundle.master);
            let extraMsg = 'Data tumpukan meja diperbarui.';
            if (bundle.history && isHandoverHistoryState(bundle.history) && onImportHistoryState) {
              onImportHistoryState(bundle.history);
              extraMsg = 'Data meja & riwayat diserahkan diperbarui.';
            }
            if (bundle.transit && isTransitState(bundle.transit) && onImportTransitState) {
              onImportTransitState(bundle.transit);
            }
            if (bundle.handover && isHandoverState(bundle.handover) && onImportHandoverState) {
              onImportHandoverState(bundle.handover);
            }
            setIsActionSheetOpen(false);
            onShowToast('success', 'Full Backup Berhasil Dipulihkan', extraMsg);
            return;
          }
        }

        // Format B: Legacy Master-only { [surveyor]: MasterItem[] }
        if (isMasterState(parsed) && Object.keys(parsed).length > 0) {
          onImportState(parsed);
          setIsActionSheetOpen(false);
          onShowToast('success', 'Impor Berhasil', 'Data tumpukan master diperbarui dari file JSON.');
        } else {
          onShowToast('error', 'Format Tidak Sesuai', 'File JSON bukan backup data yang valid.');
        }
      } catch {
        onShowToast('error', 'Gagal Membaca File', 'Terjadi kesalahan saat parsing JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCopyMarkdown = () => {
    if (currentItems.length === 0) {
      onShowToast('warning', 'Data Kosong', 'Tidak ada data untuk disalin.');
      return;
    }
    navigator.clipboard.writeText(formatCatalogMarkdown(activeSurveyor, currentItems));
    setIsActionSheetOpen(false);
    onShowToast('success', 'Markdown Disalin!', 'Katalog markdown telah disalin ke clipboard.');
  };

  return (
    <div className="space-y-3">
      {/* Streamlined Top Bar */}
      <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-[#2D2824] leading-tight truncate">
              Katalog Fisik (A–Z)
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-[#79716B] mt-0.5 min-w-0">
              <span className="truncate max-w-[130px] xs:max-w-[200px] sm:max-w-none">
                ORDNER {activeSurveyor}
              </span>
              <span className="shrink-0 text-[#DCD3C7]">•</span>
              <span className="font-semibold text-[#548A70] whitespace-nowrap shrink-0">
                {currentItems.length} Berkas
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onTakeForHandover && currentItems.length > 0 && !isSelectMode && (
              <button
                onClick={() => setIsSelectMode(true)}
                className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-[#F6F2EB] hover:bg-[#EAE4DC] text-xs font-semibold text-[#2D2824] flex items-center gap-1 sm:gap-1.5 transition-colors shrink-0"
                title="Pilih beberapa berkas untuk diserahkan"
              >
                <ArrowSquareOut size={15} />
                <span className="hidden sm:inline">Ambil Berkas</span>
                <span className="sm:hidden text-[11px]">Ambil</span>
              </button>
            )}

            <button
              onClick={() => setIsActionSheetOpen(true)}
              className="w-9 h-9 rounded-xl bg-[#F6F2EB] hover:bg-[#EAE4DC] text-[#2D2824] flex items-center justify-center transition-colors shrink-0"
              title="Menu Aksi & Ekspor"
            >
              <DotsThreeVertical size={18} weight="bold" />
            </button>
          </div>
        </div>

        {/* Multi-Select Action Bar */}
        {isSelectMode && (
          <div className="flex items-center justify-between bg-[#FDF1ED] border border-[#F7D0C4] rounded-xl px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (selectedKeys.size === filteredItems.length && filteredItems.length > 0) {
                    setSelectedKeys(new Set());
                  } else {
                    setSelectedKeys(new Set(filteredItems.map((it) => `${it.jenis_case}#${it.no}`)));
                  }
                }}
                className="text-[#D97757] font-bold hover:underline"
              >
                {selectedKeys.size === filteredItems.length && filteredItems.length > 0
                  ? 'Batal Semua'
                  : 'Pilih Semua'}
              </button>
              <span className="text-[#79716B]">({selectedKeys.size} dipilih)</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsSelectMode(false);
                  setSelectedKeys(new Set());
                }}
                className="px-2.5 py-1 rounded-lg text-[#79716B] hover:text-[#2D2824]"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  if (selectedKeys.size === 0) return;
                  const count = selectedKeys.size;
                  onTakeForHandover?.(activeSurveyor, selectedKeys);
                  setSelectedKeys(new Set());
                  setIsSelectMode(false);
                  onShowToast('success', 'Berkas Diambil', `${count} berkas dipindahkan ke Daftar Pengambilan.`);
                }}
                disabled={selectedKeys.size === 0}
                className={`px-3 py-1 rounded-lg font-bold text-white transition-colors ${
                  selectedKeys.size > 0
                    ? 'bg-[#D97757] hover:bg-[#C26344]'
                    : 'bg-[#EAE4DC] text-[#79716B] cursor-not-allowed'
                }`}
              >
                Ambil ({selectedKeys.size})
              </button>
            </div>
          </div>
        )}

        {/* Compact Search Bar */}
        <div className="relative flex items-center">
          <MagnifyingGlass size={16} className="absolute left-3 text-[#79716B]" weight="bold" />
          <input
            type="text"
            placeholder="Saring nama debitur di ordner ini..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-[#F6F2EB] border border-[#EAE4DC] rounded-xl text-[#2D2824] placeholder:text-[#A8A29E] focus:outline-hidden focus:border-[#D97757] focus:bg-[#FFFFFF]"
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="absolute right-2.5 text-[#A8A29E] hover:text-[#2D2824]"
            >
              <XCircle size={16} weight="fill" />
            </button>
          )}
        </div>

        {/* Filter Chips (one labeled row per dimension) */}
        <div className="space-y-1.5">
          <FilterChipRow label="Case" allLabel="Semua" options={availableCases} value={caseFilter} onChange={setCaseFilter} format={(v) => `Case ${v}`} />
          <FilterChipRow label="Wilayah" allLabel="Semua" options={availableWilayah} value={wilayahFilter} onChange={setWilayahFilter} />
        </div>
      </div>

      {/* Catalog List */}
      <div className="space-y-2">
        {filteredItems.length > 0 ? (
          <div className="grid gap-2">
            {filteredItems.map((it, idx) => {
              const sticker = `[${activeSurveyor.slice(0, 6)}] ${it.jenis_case} No.${it.no} - ${it.debitur}`;
              const itemKey = `${it.jenis_case}#${it.no}`;
              const isSelected = selectedKeys.has(itemKey);

              return (
                <div
                  key={itemKey}
                  className={`bg-[#FFFFFF] border rounded-2xl p-3 shadow-xs transition-all flex items-center justify-between gap-3 ${
                    isSelected ? 'border-[#D97757] bg-[#FDF1ED]' : 'border-[#EAE4DC] hover:border-[#D97757]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isSelectMode && (
                      <button
                        onClick={() => {
                          setSelectedKeys((prev) => {
                            const next = new Set(prev);
                            if (next.has(itemKey)) next.delete(itemKey);
                            else next.add(itemKey);
                            return next;
                          });
                        }}
                        className="text-[#D97757] p-1 shrink-0"
                      >
                        {isSelected ? <CheckSquare size={20} weight="fill" /> : <Square size={20} />}
                      </button>
                    )}

                    <div className="w-8 h-8 rounded-xl bg-[#F6F2EB] text-[#2D2824] font-extrabold flex items-center justify-center shrink-0 text-xs">
                      #{idx + 1}
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-bold text-xs sm:text-sm text-[#2D2824] truncate leading-tight">
                        {it.debitur}
                      </h3>
                      <p className="text-[11px] text-[#79716B] mt-0.5 truncate">
                        <span className="font-semibold text-[#D97757]">Case {it.jenis_case} #{it.no}</span>
                        {[it.wilayah, it.files_count > 0 ? `${it.files_count} foto` : '']
                          .filter(Boolean)
                          .map((part) => ` · ${part}`)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {onTakeForHandover && !isSelectMode && (
                      <button
                        onClick={() => {
                          onTakeForHandover(activeSurveyor, new Set([itemKey]));
                          onShowToast(
                            'success',
                            'Berkas Diambil',
                            `${it.debitur} dikeluarkan dari tumpukan meja dan masuk ke daftar pengambilan.`
                          );
                        }}
                        className="p-2 rounded-xl bg-[#F6F2EB] hover:bg-[#FDF1ED] text-[#79716B] hover:text-[#D97757] transition-colors"
                        title="Ambil berkas ini untuk diserahkan"
                        aria-label={`Ambil ${it.debitur} untuk diserahkan`}
                      >
                        <ArrowSquareOut size={16} />
                      </button>
                    )}

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(sticker);
                        onShowToast('info', 'Label Stiker Disalin', sticker);
                      }}
                      className="p-2 rounded-xl bg-[#F6F2EB] hover:bg-[#EAE4DC] text-[#2D2824] transition-colors"
                      title={`Salin Stiker: ${sticker}`}
                      aria-label={`Salin stiker ${it.debitur}`}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-6 text-center text-xs text-[#79716B]">
            Tidak ada dokumen yang cocok dengan filter yang dipilih.
          </div>
        )}
      </div>

      {/* ACTION SHEET BOTTOM DRAWER */}
      <BottomSheet
        isOpen={isActionSheetOpen}
        onClose={() => setIsActionSheetOpen(false)}
        title="Opsi & Ekspor Data"
        subtitle={`Manajemen data tumpukan fisik untuk ORDNER ${activeSurveyor}`}
      >
        <div className="space-y-2">
          <button
            onClick={() => {
              exportFullBackupToJson(masterState, historyState, transitState, handoverState);
              setIsActionSheetOpen(false);
            }}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#FAF8F5] hover:bg-[#F6F2EB] border border-[#EAE4DC] flex items-center gap-3 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-xl bg-[#EEF6F1] text-[#548A70] flex items-center justify-center shrink-0">
              <DownloadSimple size={18} weight="bold" />
            </div>
            <div>
              <span className="font-bold text-sm text-[#2D2824] block leading-tight">
                Ekspor Backup JSON Lengkap
              </span>
              <span className="text-xs text-[#79716B]">
                Simpan backup lengkap (Meja, Diserahkan, Transit) ke HP/Laptop
              </span>
            </div>
          </button>

          <label className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#FAF8F5] hover:bg-[#F6F2EB] border border-[#EAE4DC] flex items-center gap-3 text-left transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-xl bg-[#FCF7ED] text-[#C48A3F] flex items-center justify-center shrink-0">
              <UploadSimple size={18} weight="bold" />
            </div>
            <div>
              <span className="font-bold text-sm text-[#2D2824] block leading-tight">
                Impor / Pulihkan JSON
              </span>
              <span className="text-xs text-[#79716B]">
                Muat data tumpukan dari file backup JSON
              </span>
            </div>
            <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            onClick={handleCopyMarkdown}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#FAF8F5] hover:bg-[#F6F2EB] border border-[#EAE4DC] flex items-center gap-3 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-xl bg-[#EEF3FA] text-[#5D7CB0] flex items-center justify-center shrink-0">
              <Copy size={18} weight="bold" />
            </div>
            <div>
              <span className="font-bold text-sm text-[#2D2824] block leading-tight">
                Salin Format Markdown
              </span>
              <span className="text-xs text-[#79716B]">
                Salin seluruh tabel A–Z untuk dicetak/dikirim ke chat
              </span>
            </div>
          </button>

          <button
            onClick={() => {
              setIsActionSheetOpen(false);
              onRequestReset();
            }}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#FDF2F2] hover:bg-[#FCE6E6] border border-[#F7CDCD] flex items-center gap-3 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-xl bg-[#C45E5E] text-white flex items-center justify-center shrink-0">
              <ArrowsClockwise size={18} weight="bold" />
            </div>
            <div>
              <span className="font-bold text-sm text-[#C45E5E] block leading-tight">
                Reset ke Kondisi Awal
              </span>
              <span className="text-xs text-[#A34343]">
                Kembalikan data tumpukan meja ke bawaan semula
              </span>
            </div>
          </button>
        </div>
      </BottomSheet>
    </div>
  );
};
