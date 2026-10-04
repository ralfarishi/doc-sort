import { useState, useMemo } from 'react';
import {
  CheckCircle,
  Clock,
  User,
  Copy,
  MagnifyingGlass,
  PlusCircle,
  CaretRight,
} from '@phosphor-icons/react';
import type { ExcelRecord, MasterState } from '../types';
import { getCleanInvestigatorName, normalize } from '../utils/logic';
import { BottomSheet } from './BottomSheet';

interface StatusViewProps {
  masterState: MasterState;
  excelList: ExcelRecord[];
  onSelectSurveyor: (surveyor: string) => void;
  onNavigateToInsert: (surveyor: string, prefillDebtors: string[]) => void;
  onShowToast: (type: 'success' | 'warning' | 'error' | 'info', message: string, desc?: string) => void;
}

export const StatusView: React.FC<StatusViewProps> = ({
  masterState,
  excelList,
  onSelectSurveyor,
  onNavigateToInsert,
  onShowToast,
}) => {
  const [selectedSurveyorDetail, setSelectedSurveyorDetail] = useState<string | null>(null);
  const [sheetSearchQuery, setSheetSearchQuery] = useState('');

  // Target count per investigator from Excel
  const surveyorTargets = useMemo(() => {
    const targets: Record<string, { total: number; visited: number; records: ExcelRecord[] }> = {};

    for (const ex of excelList) {
      const cleanName = getCleanInvestigatorName(ex.surveyor);
      if (!cleanName || cleanName === 'TIDAK TERIDENTIFIKASI') continue;

      if (!targets[cleanName]) {
        targets[cleanName] = { total: 0, visited: 0, records: [] };
      }
      targets[cleanName].total++;
      if (String(ex.visit).toUpperCase() === 'YES') {
        targets[cleanName].visited++;
      }
      targets[cleanName].records.push(ex);
    }

    return targets;
  }, [excelList]);

  // Combined list of all known investigators
  const allInvestigators = useMemo(() => {
    const set = new Set<string>([...Object.keys(masterState), ...Object.keys(surveyorTargets)]);
    return Array.from(set).filter(
      (s) => s && s !== 'BELUM DITUGASKAN' && s !== 'TIDAK TERIDENTIFIKASI'
    ).sort();
  }, [masterState, surveyorTargets]);

  // Global counts
  const totalFisik = Object.values(masterState).reduce((acc, pile) => acc + pile.length, 0);
  const totalVisited = excelList.filter((x) => String(x.visit).toUpperCase() === 'YES').length;

  // Selected surveyor's missing documents for Bottom Sheet
  const activeDetailData = useMemo(() => {
    if (!selectedSurveyorDetail) return null;
    const inv = selectedSurveyorDetail;
    const currentPile = masterState[inv] || [];
    const targetData = surveyorTargets[inv] || { total: 0, visited: 0, records: [] };

    const currentDebSet = new Set(currentPile.map((p) => normalize(p.debitur)));
    const missingRecords = targetData.records.filter(
      (r) => !currentDebSet.has(normalize(r.debitur))
    );

    const filteredMissing = missingRecords.filter(
      (m) =>
        !sheetSearchQuery ||
        normalize(m.debitur).includes(normalize(sheetSearchQuery)) ||
        String(m.no).includes(sheetSearchQuery)
    );

    return {
      inv,
      curCount: currentPile.length,
      tarCount: targetData.visited > 0 ? targetData.visited : targetData.total,
      missingRecords,
      filteredMissing,
    };
  }, [selectedSurveyorDetail, masterState, surveyorTargets, sheetSearchQuery]);

  return (
    <div className="space-y-4">
      {/* Global Stat Cards (Compact Mobile Grid) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-3 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#A8A29E]">
            Target Excel
          </span>
          <p className="text-xl font-extrabold text-[#2D2824] mt-0.5">
            {excelList.length}
          </p>
          <span className="text-[10px] text-[#79716B]">Semua Kasus</span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-3 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#548A70]">
            Sudah Divisit
          </span>
          <p className="text-xl font-extrabold text-[#548A70] mt-0.5">
            {totalVisited}
          </p>
          <span className="text-[10px] text-[#79716B]">
            {((totalVisited / excelList.length) * 100).toFixed(0)}% Progress
          </span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-3 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#D97757]">
            Fisik di Meja
          </span>
          <p className="text-xl font-extrabold text-[#D97757] mt-0.5">
            {totalFisik}
          </p>
          <span className="text-[10px] text-[#79716B]">Terdata di Ordner</span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#EAE4DC] rounded-2xl p-3 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#5D7CB0]">
            Investigator
          </span>
          <p className="text-xl font-extrabold text-[#5D7CB0] mt-0.5">
            {allInvestigators.length}
          </p>
          <span className="text-[10px] text-[#79716B]">Tim Lapangan</span>
        </div>
      </div>

      {/* Investigator Cards List */}
      <div className="space-y-2.5">
        <h2 className="text-xs font-bold text-[#79716B] uppercase tracking-wider px-1">
          Kelengkapan Fisik per Investigator
        </h2>

        <div className="grid gap-2.5">
          {allInvestigators.map((inv) => {
            const currentPile = masterState[inv] || [];
            const targetData = surveyorTargets[inv] || { total: 0, visited: 0, records: [] };
            const curCount = currentPile.length;
            const tarCount = targetData.visited > 0 ? targetData.visited : targetData.total;
            const pct = tarCount > 0 ? Math.min(100, (curCount / tarCount) * 100) : 0;

            let statusBadge = (
              <span className="px-2 py-0.5 rounded-lg bg-[#F6F2EB] text-[#79716B] text-[11px] font-bold">
                BELUM ADA
              </span>
            );
            let barColor = 'bg-[#DCD3C7]';

            if (curCount >= tarCount && tarCount > 0) {
              statusBadge = (
                <span className="px-2 py-0.5 rounded-lg bg-[#EEF6F1] text-[#548A70] text-[11px] font-bold flex items-center gap-1">
                  <CheckCircle size={13} weight="bold" />
                  LENGKAP
                </span>
              );
              barColor = 'bg-[#548A70]';
            } else if (curCount > 0) {
              statusBadge = (
                <span className="px-2 py-0.5 rounded-lg bg-[#FCF7ED] text-[#C48A3F] text-[11px] font-bold flex items-center gap-1">
                  <Clock size={13} weight="bold" />
                  PROGRES
                </span>
              );
              barColor = 'bg-[#C48A3F]';
            }

            return (
              <div
                key={inv}
                onClick={() => {
                  setSelectedSurveyorDetail(inv);
                  onSelectSurveyor(inv);
                  setSheetSearchQuery('');
                }}
                className="bg-[#FFFFFF] border border-[#EAE4DC] hover:border-[#D97757] rounded-2xl p-3.5 shadow-xs cursor-pointer transition-all space-y-2.5 active:bg-[#FAF8F5]"
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#FDF1ED] text-[#D97757] flex items-center justify-center shrink-0">
                      <User size={18} weight="bold" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-[#2D2824] leading-tight truncate">
                        {inv}
                      </h3>
                      <p className="text-[11px] text-[#79716B] mt-0.5">
                        {curCount} fisik / target {tarCount} ({pct.toFixed(0)}%)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {statusBadge}
                    <CaretRight size={16} className="text-[#A8A29E]" />
                  </div>
                </div>

                {/* Flat Progress Bar (No Gradient) */}
                <div className="w-full bg-[#F6F2EB] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor} transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MISSING DOCUMENTS BOTTOM SHEET DRAWER */}
      {activeDetailData && (
        <BottomSheet
          isOpen={!!selectedSurveyorDetail}
          onClose={() => setSelectedSurveyorDetail(null)}
          title={`Sisa Berkas: ${activeDetailData.inv}`}
          subtitle={`${activeDetailData.missingRecords.length} berkas belum masuk tumpukan meja (dari total target ${activeDetailData.tarCount})`}
          footer={
            activeDetailData.missingRecords.length > 0 ? (
              <button
                onClick={() => {
                  const inv = activeDetailData.inv;
                  const names = activeDetailData.missingRecords.map((m) => m.debitur);
                  setSelectedSurveyorDetail(null);
                  onNavigateToInsert(inv, names);
                }}
                className="w-full min-h-[48px] rounded-2xl bg-[#D97757] hover:bg-[#C86243] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <PlusCircle size={18} weight="bold" />
                <span>Masukkan {activeDetailData.missingRecords.length} Berkas ke Wizard Sisip</span>
              </button>
            ) : undefined
          }
        >
          <div className="space-y-3">
            {/* Search filter inside sheet */}
            {activeDetailData.missingRecords.length > 5 && (
              <div className="relative flex items-center">
                <MagnifyingGlass size={16} className="absolute left-3 text-[#79716B]" weight="bold" />
                <input
                  type="text"
                  placeholder="Cari nama debitur sisa..."
                  value={sheetSearchQuery}
                  onChange={(e) => setSheetSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#F6F2EB] border border-[#EAE4DC] rounded-xl text-[#2D2824] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#D97757]"
                />
              </div>
            )}

            {/* List */}
            {activeDetailData.filteredMissing.length > 0 ? (
              <div className="divide-y divide-[#F6F2EB]">
                {activeDetailData.filteredMissing.map((m, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-xs sm:text-sm text-[#2D2824] truncate">
                        {m.debitur}
                      </p>
                      <p className="text-[11px] text-[#79716B]">
                        Case {m.jenis_case} #{m.no} • {m.kota} • Visit: {m.visit}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(m.debitur);
                        onShowToast('info', 'Nama Disalin', m.debitur);
                      }}
                      className="p-2 rounded-xl bg-[#F6F2EB] hover:bg-[#EAE4DC] text-[#2D2824] transition-colors shrink-0"
                      title="Salin Nama Debitur"
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : activeDetailData.missingRecords.length === 0 ? (
              <div className="p-6 bg-[#EEF6F1] border border-[#C8E2D4] rounded-2xl text-center text-[#548A70] space-y-1">
                <CheckCircle size={28} className="mx-auto" weight="fill" />
                <p className="font-bold text-sm">Semua Berkas Sudah Lengkap!</p>
                <p className="text-xs text-[#79716B]">
                  Seluruh berkas survei investigator ini sudah tersusun di tumpukan meja.
                </p>
              </div>
            ) : (
              <p className="text-xs text-center text-[#79716B] py-4">
                Tidak ada nama debitur sisa yang cocok dengan pencarian.
              </p>
            )}
          </div>
        </BottomSheet>
      )}
    </div>
  );
};
