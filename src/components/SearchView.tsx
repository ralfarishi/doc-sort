import { useState, useMemo } from 'react';
import {
  MagnifyingGlass,
  XCircle,
  FolderSimple,
  ArrowUp,
  ArrowDown,
  Camera,
  MapPin,
  CheckCircle,
  Clock,
  PlusCircle,
  Sparkle,
  ArrowSquareOut,
  ClockCounterClockwise,
  FileText,
} from '@phosphor-icons/react';
import type { ExcelRecord, FolderRecord, MasterState, HandoverState, HandoverHistoryState } from '../types';
import {
  searchPhysicalLocation,
  searchHandoverLocation,
  searchHistoryLocation,
  collectHandledDebtorKeys,
  matchQuery,
  normalize,
  getCleanInvestigatorName,
} from '../utils/logic';

interface SearchViewProps {
  masterState: MasterState;
  handoverState?: HandoverState;
  historyState?: HandoverHistoryState;
  excelList: ExcelRecord[];
  folderList: FolderRecord[];
  activeSurveyor: string;
  onQuickInsertItem: (surveyor: string, excelItem: ExcelRecord, folderItem?: FolderRecord) => void;
  onTakeForHandover?: (surveyor: string, itemKeys: Set<string>) => void;
  onShowToast?: (type: 'success' | 'warning' | 'error' | 'info', message: string, desc?: string) => void;
}

type FilterMode = 'all' | 'desk' | 'handover' | 'history' | 'excel';

export const SearchView: React.FC<SearchViewProps> = ({
  masterState,
  handoverState,
  historyState,
  excelList,
  folderList,
  activeSurveyor,
  onQuickInsertItem,
  onTakeForHandover,
  onShowToast,
}) => {
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  // Search Results per Scope
  const physicalResults = useMemo(
    () => (query.trim() ? searchPhysicalLocation(query, masterState) : []),
    [query, masterState]
  );

  const handoverResults = useMemo(
    () => (query.trim() && handoverState ? searchHandoverLocation(query, handoverState) : []),
    [query, handoverState]
  );

  const historyResults = useMemo(
    () => (query.trim() && historyState ? searchHistoryLocation(query, historyState) : []),
    [query, historyState]
  );

  const excelResults = useMemo(() => {
    if (!query.trim()) return [];
    const qNorm = normalize(query);
    const handledKeys = collectHandledDebtorKeys(masterState, handoverState, historyState);

    return excelList
      .filter((ex) => {
        const exNorm = normalize(ex.debitur);
        const match =
          exNorm.includes(qNorm) ||
          qNorm.includes(exNorm) ||
          String(ex.id_klaim) === query.trim() ||
          `#${ex.no}` === query.trim();
        return match && !handledKeys.has(exNorm) && !handledKeys.has(`${ex.jenis_case}#${ex.no}`);
      })
      .slice(0, 15);
  }, [query, masterState, handoverState, historyState, excelList]);

  const totalResultsCount =
    physicalResults.length + handoverResults.length + historyResults.length + excelResults.length;

  const activePile = masterState[activeSurveyor] ?? [];

  // Filter Bar Data Configuration (DRY)
  const filterTabs = useMemo(() => [
    { id: 'all' as const, label: 'Semua', count: totalResultsCount, active: 'bg-[#2D2824] text-white', inactive: 'bg-[#F6F2EB] text-[#79716B] hover:text-[#2D2824]' },
    { id: 'desk' as const, label: 'Di Meja', count: physicalResults.length, active: 'bg-[#548A70] text-white', inactive: 'bg-[#EEF6F1] text-[#548A70] hover:bg-[#E2EFE7]' },
    ...(handoverResults.length > 0
      ? [{ id: 'handover' as const, label: 'Antrean Ambil', count: handoverResults.length, active: 'bg-[#D97757] text-white', inactive: 'bg-[#FDF1ED] text-[#D97757] hover:bg-[#F7D0C4]' }]
      : []),
    ...(historyResults.length > 0
      ? [{ id: 'history' as const, label: 'Sudah Diserahkan', count: historyResults.length, active: 'bg-[#5D7CB0] text-white', inactive: 'bg-[#EEF3FA] text-[#5D7CB0] hover:bg-[#DEE7F5]' }]
      : []),
    { id: 'excel' as const, label: 'Belum di Meja', count: excelResults.length, active: 'bg-[#C48A3F] text-white', inactive: 'bg-[#FCF7ED] text-[#C48A3F] hover:bg-[#F8EED8]' },
  ], [totalResultsCount, physicalResults.length, handoverResults.length, historyResults.length, excelResults.length]);

  return (
    <div className="space-y-3.5">
      {/* Search Input Bar */}
      <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-3 sm:p-4 shadow-xs">
        <div className="relative flex items-center">
          <MagnifyingGlass size={18} className="absolute left-3.5 text-[#79716B] pointer-events-none" weight="bold" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama debitur, nomor urut (#12), atau ID klaim..."
            className="w-full pl-10 pr-9 py-2.5 text-sm sm:text-base font-medium bg-[#F6F2EB] border border-[#EAE4DC] rounded-xl text-[#2D2824] placeholder:text-[#A8A29E] focus:outline-hidden focus:border-[#D97757] focus:bg-[#FFFFFF] transition-all"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 text-[#A8A29E] hover:text-[#2D2824] p-1 rounded-md"
              title="Hapus pencarian"
            >
              <XCircle size={18} weight="fill" />
            </button>
          )}
        </div>

        {/* DRY Filter Badges */}
        {query.trim() && (
          <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-[#F6F2EB] overflow-x-auto text-xs">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterMode(tab.id)}
                className={`px-3 py-1 rounded-lg font-semibold transition-all shrink-0 ${
                  filterMode === tab.id ? tab.active : tab.inactive
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Query Results */}
      {query.trim() ? (
        <div className="space-y-3.5">
          {/* Section 1: Physical Desk Results */}
          {(filterMode === 'all' || filterMode === 'desk') && physicalResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#548A70]">
                <CheckCircle size={15} weight="bold" />
                <span>Ditemukan di Tumpukan Meja ({physicalResults.length})</span>
              </div>

              <div className="grid gap-3">
                {physicalResults.map((res, i) => {
                  const it = res.item;
                  return (
                    <div
                      key={`phys-${i}-${it.debitur}`}
                      className="bg-[#FFFFFF] border border-[#EAE4DC] hover:border-[#D97757] rounded-2xl p-4 shadow-xs transition-all space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EEF3FA] text-[#5D7CB0] text-xs font-bold">
                          <FolderSimple size={14} weight="fill" />
                          ORDNER {res.surveyor}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-[#79716B]">
                          <span>Case {it.jenis_case} #{it.no}</span>
                          <span>•</span>
                          <span className="text-[#548A70] font-semibold flex items-center gap-1">
                            <Camera size={13} />
                            {it.files_count > 0 ? `${it.files_count} foto` : '0 foto'}
                          </span>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-bold text-[#2D2824] leading-snug">{it.debitur}</h3>
                        <p className="text-xs text-[#79716B] mt-0.5 flex items-center gap-1">
                          <MapPin size={13} />
                          {it.kota} ({it.wilayah}) • ID Klaim: {it.id_klaim}
                        </p>
                      </div>

                      {/* Stack Position Timeline */}
                      <div className="pt-2 border-t border-[#F6F2EB]">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-[#A8A29E] block mb-2">
                          Posisi Fisik di Meja (Urutan #{res.position} dari {res.totalInPile}):
                        </span>
                        <div className="relative pl-6 space-y-2 text-xs before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#EAE4DC]">
                          <div className="relative flex items-center gap-2 text-[#79716B]">
                            <div className="absolute -left-6 w-5 h-5 rounded-full bg-[#FAF8F5] border border-[#DCD3C7] text-[#79716B] flex items-center justify-center">
                              <ArrowUp size={11} weight="bold" />
                            </div>
                            <span className="font-semibold text-[11px] text-[#A8A29E] w-6 shrink-0">
                              #{res.position > 1 ? res.position - 1 : '-'}
                            </span>
                            <span className="truncate">{res.prevNeighbor ? res.prevNeighbor.debitur : '(Paling Atas Tumpukan)'}</span>
                            <span className="text-[10px] text-[#A8A29E] shrink-0">▲ di atas</span>
                          </div>

                          <div className="relative flex items-center gap-2 p-2 rounded-xl bg-[#FDF1ED] border border-[#F7D0C4] text-[#D97757] font-bold">
                            <div className="absolute -left-6 w-5 h-5 rounded-full bg-[#D97757] text-white flex items-center justify-center">
                              <span className="text-[10px] leading-none">●</span>
                            </div>
                            <span className="text-xs font-extrabold w-6 shrink-0">#{res.position}</span>
                            <span className="text-sm truncate font-extrabold text-[#2D2824]">{it.debitur}</span>
                            <span className="ml-auto text-[10px] uppercase font-extrabold bg-[#D97757] text-white px-2 py-0.5 rounded-md shrink-0">
                              Target
                            </span>
                          </div>

                          <div className="relative flex items-center gap-2 text-[#79716B]">
                            <div className="absolute -left-6 w-5 h-5 rounded-full bg-[#FAF8F5] border border-[#DCD3C7] text-[#79716B] flex items-center justify-center">
                              <ArrowDown size={11} weight="bold" />
                            </div>
                            <span className="font-semibold text-[11px] text-[#A8A29E] w-6 shrink-0">
                              #{res.position < res.totalInPile ? res.position + 1 : '-'}
                            </span>
                            <span className="truncate">{res.nextNeighbor ? res.nextNeighbor.debitur : '(Paling Bawah Tumpukan)'}</span>
                            <span className="text-[10px] text-[#A8A29E] shrink-0">▼ di bawah</span>
                          </div>
                        </div>
                      </div>

                      {onTakeForHandover && (
                        <div className="pt-2 border-t border-[#F6F2EB] flex justify-end">
                          <button
                            onClick={() => {
                              onTakeForHandover(res.surveyor, new Set([`${it.jenis_case}#${it.no}`]));
                              onShowToast?.('success', 'Berkas Diambil', `${it.debitur} masuk ke daftar pengambilan.`);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F6F2EB] hover:bg-[#FDF1ED] text-xs font-bold text-[#D97757] border border-[#F7D0C4] transition-colors"
                          >
                            <ArrowSquareOut size={15} weight="bold" />
                            <span>Ambil untuk Diserahkan</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 2: Handover Queue Results */}
          {(filterMode === 'all' || filterMode === 'handover') && handoverResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#D97757]">
                <ArrowSquareOut size={15} weight="bold" />
                <span>Sedang Diambil / Antrean Penyerahan ({handoverResults.length})</span>
              </div>

              <div className="grid gap-2.5">
                {handoverResults.map((res, i) => {
                  const it = res.item;
                  return (
                    <div key={`handover-${i}-${it.debitur}`} className="bg-[#FFFFFF] border border-[#F7D0C4] rounded-2xl p-4 shadow-xs space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FDF1ED] text-[#D97757] text-xs font-bold">
                            <FolderSimple size={14} weight="fill" />
                            ORDNER {res.surveyor}
                          </span>
                          <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-[#FDF1ED] text-[#D97757] border border-[#F7D0C4]">
                            Sedang Diambil
                          </span>
                        </div>
                        <span className="text-xs text-[#79716B]">Case {it.jenis_case} #{it.no}</span>
                      </div>

                      <h3 className="text-base font-bold text-[#2D2824]">{it.debitur}</h3>
                      <p className="text-xs text-[#79716B] flex items-center gap-1">
                        <MapPin size={13} />
                        {it.kota} ({it.wilayah}) • ID Klaim: {it.id_klaim}
                      </p>

                      <div className="pt-2 border-t border-[#F6F2EB] flex items-center justify-between gap-2 text-xs text-[#79716B] flex-wrap">
                        <span className="flex items-center gap-1.5">
                          <FileText size={14} className="text-[#D97757]" />
                          Posisi awal di meja: <strong className="text-[#2D2824]">Urutan #{it.originalPosition}</strong>
                        </span>
                        <span className="text-[11px] text-[#A8A29E]">
                          {it.timestamp ? new Date(it.timestamp).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 3: History Archive Results */}
          {(filterMode === 'all' || filterMode === 'history') && historyResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#5D7CB0]">
                <ClockCounterClockwise size={15} weight="bold" />
                <span>Riwayat Arsip (Sudah Selesai Diserahkan) ({historyResults.length})</span>
              </div>

              <div className="grid gap-2.5">
                {historyResults.map((res, i) => {
                  const it = res.item;
                  return (
                    <div key={`hist-${i}-${it.debitur}`} className="bg-[#FFFFFF] border border-[#DEE7F5] rounded-2xl p-4 shadow-xs space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EEF3FA] text-[#5D7CB0] text-xs font-bold">
                            <FolderSimple size={14} weight="fill" />
                            ORDNER {res.surveyor}
                          </span>
                          <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-[#EEF6F1] text-[#548A70] border border-[#C8E2D4]">
                            Sudah Diserahkan
                          </span>
                        </div>
                        <span className="text-xs text-[#79716B]">Case {it.jenis_case} #{it.no}</span>
                      </div>

                      <h3 className="text-base font-bold text-[#2D2824]">{it.debitur}</h3>
                      <p className="text-xs text-[#79716B] flex items-center gap-1">
                        <MapPin size={13} />
                        {it.kota} ({it.wilayah}) • ID Klaim: {it.id_klaim}
                      </p>

                      <div className="pt-2 border-t border-[#F6F2EB] flex items-center justify-between gap-2 text-xs text-[#79716B] flex-wrap">
                        <span className="flex items-center gap-1.5 text-[#548A70] font-semibold">
                          <CheckCircle size={14} weight="bold" />
                          Diserahkan: {it.handedOverAt || '-'}
                        </span>
                        {it.notes && <span className="text-[11px] text-[#79716B]">Catatan: {it.notes}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 4: Master Excel Results (Not Yet in Pile) */}
          {(filterMode === 'all' || filterMode === 'excel') && excelResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#C48A3F]">
                <Clock size={15} weight="bold" />
                <span>Terdata di Excel (Belum Ada Berkas Fisik di Meja) ({excelResults.length})</span>
              </div>

              <div className="grid gap-2.5">
                {excelResults.map((ex, i) => {
                  const cleanSurv = getCleanInvestigatorName(ex.surveyor);
                  return (
                    <div
                      key={`ex-${i}-${ex.debitur}`}
                      className="bg-[#FFFFFF] border border-[#F3E0BD] rounded-2xl p-3.5 shadow-xs flex items-center justify-between gap-3 flex-wrap"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[11px] text-[#79716B] mb-0.5">
                          <span className="px-2 py-0.5 rounded bg-[#FCF7ED] text-[#C48A3F] font-bold">
                            Belum Ada di Meja
                          </span>
                          <span>Case {ex.jenis_case} #{ex.no}</span>
                          <span>•</span>
                          <span>Target: {cleanSurv}</span>
                        </div>
                        <h3 className="text-sm font-bold text-[#2D2824] truncate">{ex.debitur}</h3>
                        <p className="text-[11px] text-[#79716B] mt-0.5">{ex.kota} • Visit: {ex.visit}</p>
                      </div>

                      <button
                        onClick={() => {
                          const match = matchQuery(ex.debitur, [ex], folderList);
                          const matchedFolder = match && match.folders.length > 0 ? match.folders[0] : undefined;
                          onQuickInsertItem(cleanSurv, ex, matchedFolder);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FDF1ED] hover:bg-[#F7D0C4] text-[#D97757] text-xs font-semibold transition-colors shrink-0"
                      >
                        <PlusCircle size={15} weight="bold" />
                        <span>Sisipkan ke {cleanSurv}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty Search Result */}
          {totalResultsCount === 0 && (
            <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-[#F6F2EB] text-[#79716B] mx-auto flex items-center justify-center">
                <MagnifyingGlass size={20} />
              </div>
              <h3 className="font-bold text-sm text-[#2D2824]">Tidak Ditemukan</h3>
              <p className="text-xs text-[#79716B] max-w-xs mx-auto">
                Berkas dengan kata kunci &quot;{query}&quot; tidak ditemukan di tumpukan meja, antrean serah, arsip riwayat, maupun di Master Excel.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Empty Query State: Quick Chips & Active Ordner Peek */
        <div className="space-y-3.5">
          {activePile.length > 0 && (
            <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-3.5 space-y-2">
              <span className="text-[11px] uppercase font-bold tracking-wider text-[#A8A29E] block">
                Cari Cepat di Ordner {activeSurveyor}:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {activePile.slice(0, 6).map((it, idx) => (
                  <button
                    key={idx}
                    onClick={() => setQuery(it.debitur)}
                    className="px-2.5 py-1 rounded-lg bg-[#F6F2EB] hover:bg-[#EAE4DC] text-xs font-medium text-[#2D2824] transition-colors"
                  >
                    #{idx + 1} {it.debitur}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-[#FAF8F5] border border-[#EAE4DC] rounded-2xl p-3.5 flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-[#FCF7ED] text-[#C48A3F] shrink-0 mt-0.5">
              <Sparkle size={18} weight="fill" />
            </div>
            <div className="text-xs text-[#79716B] leading-relaxed">
              <strong className="text-[#2D2824] font-semibold">
                Panduan Pelacakan Berkas Fisik:
              </strong>{' '}
              Cari nama nasabah untuk melihat status berkas (di meja ordner, sedang dalam antrean pengambilan, sudah diserahkan, atau belum ada berkas fisiknya).
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
