import { useState, useMemo } from 'react';
import {
  DotsThreeVertical,
  DownloadSimple,
  UploadSimple,
  Copy,
  ArrowsClockwise,
  MagnifyingGlass,
  XCircle,
} from '@phosphor-icons/react';
import type { MasterState } from '../types';
import { exportStateToJson, generateSyncCode, parseSyncCode } from '../utils/logic';
import { BottomSheet } from './BottomSheet';

interface CatalogViewProps {
  masterState: MasterState;
  activeSurveyor: string;
  onImportState: (newState: MasterState) => void;
  onRequestReset: () => void;
  onShowToast: (type: 'success' | 'warning' | 'error' | 'info', message: string, desc?: string) => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  masterState,
  activeSurveyor,
  onImportState,
  onRequestReset,
  onShowToast,
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [caseFilter, setCaseFilter] = useState('ALL');
  const [wilayahFilter, setWilayahFilter] = useState('ALL');
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  const currentItems = masterState[activeSurveyor] || [];

  // Available filters
  const availableCases = useMemo(() => {
    const set = new Set<string>();
    currentItems.forEach((it) => {
      if (it.jenis_case) set.add(it.jenis_case);
    });
    return Array.from(set).sort();
  }, [currentItems]);

  const availableWilayah = useMemo(() => {
    const set = new Set<string>();
    currentItems.forEach((it) => {
      if (it.wilayah) set.add(it.wilayah);
    });
    return Array.from(set).sort();
  }, [currentItems]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return currentItems.filter((it) => {
      const q = searchFilter.toLowerCase();
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

  // Handle JSON Import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (typeof parsed === 'object' && parsed !== null) {
          onImportState(parsed);
          setIsActionSheetOpen(false);
          onShowToast('success', 'Impor Berhasil', 'Data tumpukan master diperbarui dari file JSON.');
        } else {
          onShowToast('error', 'Format Tidak Sesuai', 'File JSON tidak valid.');
        }
      } catch (err) {
        onShowToast('error', 'Gagal Membaca File', 'Terjadi kesalahan saat parsing JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Copy Markdown
  const handleCopyMarkdown = () => {
    if (currentItems.length === 0) {
      onShowToast('warning', 'Data Kosong', 'Tidak ada data untuk disalin.');
      return;
    }

    let md = `# KATALOG MASTER FISIK: ORDNER ${activeSurveyor}\n\n`;
    md += `Total Berkas: ${currentItems.length} Dokumen (A–Z)\n\n`;
    md += `| No. Fisik | Nama Debitur | Case | No. Excel | Wilayah | ID Klaim | Foto | Label Stiker |\n`;
    md += `|:---:|---|:---:|:---:|---|:---:|:---:|---|\n`;

    currentItems.forEach((it, idx) => {
      const label = `[${activeSurveyor.slice(0, 6)}] ${it.jenis_case} No.${it.no} - ${it.debitur}`;
      md += `| #${idx + 1} | **${it.debitur}** | ${it.jenis_case} | #${it.no} | ${it.wilayah} | ${it.id_klaim} | ✅ ${it.files_count} | \`${label}\` |\n`;
    });

    navigator.clipboard.writeText(md);
    setIsActionSheetOpen(false);
    onShowToast('success', 'Markdown Disalin!', 'Katalog markdown telah disalin ke clipboard.');
  };

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncInputText, setSyncInputText] = useState('');

  const handleCopySyncCode = () => {
    const code = generateSyncCode(masterState);
    navigator.clipboard.writeText(code);
    onShowToast('success', 'Kode Sinkronisasi Disalin!', 'Kirim/tempel kode ini di PC atau HP untuk memindahkan data.');
  };

  const handleApplySyncCode = () => {
    const parsed = parseSyncCode(syncInputText);
    if (!parsed) {
      onShowToast('error', 'Kode Tidak Valid', 'Pastikan kode sinkronisasi atau JSON yang ditempel lengkap.');
      return;
    }
    onImportState(parsed);
    setIsSyncModalOpen(false);
    setSyncInputText('');
    onShowToast('success', 'Sinkronisasi Berhasil!', 'Data tumpukan master diperbarui dari perangkat lain.');
  };

  return (
    <div className="space-y-3">
      {/* Streamlined Top Bar (Title + Ordner Picker + Single Action Sheet Button) */}
      <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-[#2D2824] leading-tight truncate">
              Katalog Fisik (A–Z)
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-[#79716B] mt-0.5">
              <span>ORDNER {activeSurveyor}</span>
              <span>•</span>
              <span className="font-semibold text-[#548A70]">{currentItems.length} Berkas</span>
            </div>
          </div>

          {/* Single Action Sheet Menu Button */}
          <button
            onClick={() => setIsActionSheetOpen(true)}
            className="w-9 h-9 rounded-xl bg-[#F6F2EB] hover:bg-[#EAE4DC] text-[#2D2824] flex items-center justify-center transition-colors shrink-0"
            title="Menu Aksi & Ekspor"
          >
            <DotsThreeVertical size={18} weight="bold" />
          </button>
        </div>

        {/* Compact Search Bar */}
        <div className="relative flex items-center">
          <MagnifyingGlass size={16} className="absolute left-3 text-[#79716B]" weight="bold" />
          <input
            type="text"
            placeholder="Saring nama debitur di ordner ini..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-[#F6F2EB] border border-[#EAE4DC] rounded-xl text-[#2D2824] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#D97757] focus:bg-[#FFFFFF]"
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

        {/* HORIZONTAL SCROLLING FILTER CHIPS (CLEAN & COMPACT) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
          <button
            onClick={() => setCaseFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors ${
              caseFilter === 'ALL'
                ? 'bg-[#2D2824] text-white'
                : 'bg-[#F6F2EB] text-[#79716B] hover:text-[#2D2824]'
            }`}
          >
            Semua Case
          </button>
          {availableCases.map((c) => (
            <button
              key={c}
              onClick={() => setCaseFilter(c)}
              className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors ${
                caseFilter === c
                  ? 'bg-[#D97757] text-white'
                  : 'bg-[#F6F2EB] text-[#79716B] hover:text-[#2D2824]'
              }`}
            >
              Case {c}
            </button>
          ))}

          <span className="w-px h-4 bg-[#EAE4DC] shrink-0 mx-0.5" />

          <button
            onClick={() => setWilayahFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors ${
              wilayahFilter === 'ALL'
                ? 'bg-[#2D2824] text-white'
                : 'bg-[#F6F2EB] text-[#79716B] hover:text-[#2D2824]'
            }`}
          >
            Semua Wilayah
          </button>
          {availableWilayah.map((w) => (
            <button
              key={w}
              onClick={() => setWilayahFilter(w)}
              className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors ${
                wilayahFilter === w
                  ? 'bg-[#5D7CB0] text-white'
                  : 'bg-[#F6F2EB] text-[#79716B] hover:text-[#2D2824]'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Catalog List (Starts immediately on the first screen!) */}
      <div className="space-y-2">
        {filteredItems.length > 0 ? (
          <div className="grid gap-2">
            {filteredItems.map((it, idx) => {
              const sticker = `[${activeSurveyor.slice(0, 6)}] ${it.jenis_case} No.${it.no} - ${it.debitur}`;

              return (
                <div
                  key={idx}
                  className="bg-[#FFFFFF] border border-[#EAE4DC] hover:border-[#D97757] rounded-2xl p-3 shadow-xs transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Index Badge */}
                    <div className="w-8 h-8 rounded-xl bg-[#F6F2EB] text-[#2D2824] font-extrabold flex items-center justify-center shrink-0 text-xs">
                      #{idx + 1}
                    </div>

                    {/* Main Details */}
                    <div className="min-w-0">
                      <h3 className="font-bold text-xs sm:text-sm text-[#2D2824] truncate leading-tight">
                        {it.debitur}
                      </h3>
                      <div className="flex items-center gap-1.5 text-[11px] text-[#79716B] mt-0.5">
                        <span className="font-semibold text-[#D97757]">
                          Case {it.jenis_case} #{it.no}
                        </span>
                        <span>•</span>
                        <span className="truncate">{it.wilayah}</span>
                        <span>•</span>
                        <span className="text-[#548A70] font-semibold shrink-0">
                          {it.files_count > 0 ? `${it.files_count} foto` : '0 foto'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Copy Sticker Label Action */}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(sticker);
                      onShowToast('info', 'Label Stiker Disalin', sticker);
                    }}
                    className="p-2 rounded-xl bg-[#F6F2EB] hover:bg-[#EAE4DC] text-[#2D2824] transition-colors shrink-0"
                    title={`Salin Stiker: ${sticker}`}
                  >
                    <Copy size={16} />
                  </button>
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
          {/* Quick Sync HP <-> PC */}
          <button
            onClick={() => {
              setIsActionSheetOpen(false);
              setIsSyncModalOpen(true);
            }}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#FDF1ED] hover:bg-[#FBE2DA] border border-[#F7D0C4] flex items-center gap-3 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-xl bg-[#D97757] text-white flex items-center justify-center shrink-0">
              <ArrowsClockwise size={18} weight="bold" />
            </div>
            <div>
              <span className="font-bold text-sm text-[#D97757] block leading-tight">
                Sinkronisasi HP ⇄ PC (Salin/Tempel Kode)
              </span>
              <span className="text-xs text-[#79716B]">
                Pindahkan data tumpukan antar perangkat tanpa ribet
              </span>
            </div>
          </button>

          {/* Export JSON */}
          <button
            onClick={() => {
              exportStateToJson(masterState);
              setIsActionSheetOpen(false);
            }}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#FAF8F5] hover:bg-[#F6F2EB] border border-[#EAE4DC] flex items-center gap-3 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-xl bg-[#EEF6F1] text-[#548A70] flex items-center justify-center shrink-0">
              <DownloadSimple size={18} weight="bold" />
            </div>
            <div>
              <span className="font-bold text-sm text-[#2D2824] block leading-tight">
                Ekspor Backup JSON
              </span>
              <span className="text-xs text-[#79716B]">
                Simpan file backup data ke HP/Laptop Anda
              </span>
            </div>
          </button>

          {/* Import JSON */}
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

          {/* Copy Markdown */}
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

          {/* Reset State */}
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

      {/* SYNC MODAL (COPY & PASTE SYNC TEXT) */}
      <BottomSheet
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        title="Sinkronisasi HP ⇄ PC"
        subtitle="Pindahkan seluruh bundle tumpukan master antar perangkat dengan instan"
      >
        <div className="space-y-4">
          {/* Section 1: Export / Copy from this device */}
          <div className="bg-[#FAF8F5] border border-[#EAE4DC] rounded-2xl p-4 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#D97757] block">
              1. Dari Perangkat Ini (Pengirim)
            </span>
            <p className="text-xs text-[#79716B]">
              Klik tombol di bawah untuk menyalin seluruh data tumpukan saat ini, lalu kirimkan lewat WhatsApp / Catatan ke perangkat lain.
            </p>
            <button
              onClick={handleCopySyncCode}
              className="w-full py-2.5 rounded-xl bg-[#D97757] hover:bg-[#C86243] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <Copy size={16} weight="bold" />
              Salin Kode Sinkronisasi Data
            </button>
          </div>

          {/* Section 2: Paste / Import to this device */}
          <div className="bg-[#FAF8F5] border border-[#EAE4DC] rounded-2xl p-4 space-y-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#548A70] block">
              2. Ke Perangkat Ini (Penerima)
            </span>
            <p className="text-xs text-[#79716B]">
              Tempel kode sinkronisasi atau teks JSON yang Anda salin dari perangkat lain di bawah ini:
            </p>
            <textarea
              value={syncInputText}
              onChange={(e) => setSyncInputText(e.target.value)}
              placeholder="Tempel kode sinkronisasi di sini..."
              rows={3}
              className="w-full p-2.5 text-xs bg-white border border-[#EAE4DC] rounded-xl text-[#2D2824] placeholder:text-[#A8A29E] font-mono focus:outline-none focus:border-[#548A70]"
            />
            <button
              onClick={handleApplySyncCode}
              disabled={!syncInputText.trim()}
              className="w-full py-2.5 rounded-xl bg-[#548A70] hover:bg-[#43725b] text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs"
            >
              <ArrowsClockwise size={16} weight="bold" />
              Terapkan & Sinkronkan Data
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};
