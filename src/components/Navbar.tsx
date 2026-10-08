import { useState } from 'react';
import {
  MagnifyingGlass,
  Tray,
  ChartBar,
  ListDashes,
  FolderSimple,
  CaretDown,
  Check,
  Printer,
} from '@phosphor-icons/react';
import { BottomSheet } from './BottomSheet';

export type ActiveTab = 'search' | 'insert' | 'status' | 'catalog' | 'handover';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  activeSurveyor: string;
  surveyorsList: string[];
  onSelectSurveyor: (surveyor: string) => void;
  totalPhysicalDocs: number;
  totalTransitDocs?: number;
  totalHandoverDocs?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  activeSurveyor,
  surveyorsList,
  onSelectSurveyor,
  totalPhysicalDocs,
  totalTransitDocs = 0,
  totalHandoverDocs = 0,
}) => {
  const [isOrdnerSheetOpen, setIsOrdnerSheetOpen] = useState(false);

  const tabs = [
    { id: 'search' as ActiveTab, label: 'Cari Berkas', icon: MagnifyingGlass },
    { id: 'insert' as ActiveTab, label: 'Sisip & Susun', icon: Tray, badge: totalTransitDocs },
    { id: 'status' as ActiveTab, label: 'Status Ordner', icon: ChartBar },
    { id: 'catalog' as ActiveTab, label: 'Katalog A-Z', icon: ListDashes },
    { id: 'handover' as ActiveTab, label: 'Berkas Diambil', icon: Printer, badge: totalHandoverDocs },
  ];

  return (
    <>
      {/* Top Header */}
      <header className="print:hidden sticky top-0 z-40 bg-[#FFFFFF] border-b border-[#EAE4DC] px-4 py-2.5 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          {/* Logo & Subtitle */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#FDF1ED] border border-[#F7D0C4] flex items-center justify-center text-[#D97757] shrink-0">
              <FolderSimple size={18} weight="fill" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-base font-bold tracking-tight text-[#2D2824] leading-tight truncate">
                Organizer Fisik
              </h1>
              <p className="text-[10px] sm:text-[11px] text-[#79716B] leading-none mt-0.5 truncate">
                {totalPhysicalDocs} Dokumen Terdata
              </p>
            </div>
          </div>

          {/* Desktop/Tablet Tab Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-[#F6F2EB] p-1 rounded-xl border border-[#EAE4DC]">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
                    isActive
                      ? 'bg-[#FFFFFF] text-[#D97757] shadow-xs border border-[#EAE4DC]'
                      : 'text-[#79716B] hover:text-[#2D2824]'
                  }`}
                >
                  <Icon size={16} weight={isActive ? 'bold' : 'regular'} />
                  <span>{tab.label}</span>
                  {Boolean(tab.badge && tab.badge > 0) && (
                    <span className="px-1.5 py-0.5 rounded-full bg-[#5D7CB0] text-white text-[10px] font-bold leading-none">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Ordner Selector Button (Thumb-Friendly Touch Target) */}
          <button
            onClick={() => setIsOrdnerSheetOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F6F2EB] hover:bg-[#EAE4DC] border border-[#EAE4DC] text-xs font-semibold text-[#2D2824] transition-colors shrink-0"
            title="Pilih Ordner Aktif"
          >
            <FolderSimple size={14} className="text-[#D97757]" weight="fill" />
            <span className="max-w-[110px] sm:max-w-[160px] truncate text-left">
              {activeSurveyor}
            </span>
            <CaretDown size={13} className="text-[#79716B]" weight="bold" />
          </button>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="print:hidden md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF] border-t border-[#EAE4DC] px-1 py-1 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-5 gap-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all relative ${
                  isActive
                    ? 'text-[#D97757] bg-[#FDF1ED]'
                    : 'text-[#79716B] hover:text-[#2D2824]'
                }`}
              >
                <div className="relative">
                  <Icon size={20} weight={isActive ? 'bold' : 'regular'} />
                  {Boolean(tab.badge && tab.badge > 0) && (
                    <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] rounded-full bg-[#5D7CB0] text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold mt-0.5">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Ordner Selector Bottom Sheet */}
      <BottomSheet
        isOpen={isOrdnerSheetOpen}
        onClose={() => setIsOrdnerSheetOpen(false)}
        title="Pilih Ordner Meja"
        subtitle="Pilih map ordner investigator yang sedang Anda tata di meja fisik"
      >
        <div className="space-y-1.5">
          {surveyorsList.map((surv) => {
            const isSelected = surv === activeSurveyor;
            return (
              <button
                key={surv}
                onClick={() => {
                  onSelectSurveyor(surv);
                  setIsOrdnerSheetOpen(false);
                }}
                className={`w-full min-h-[48px] px-4 py-3 rounded-2xl flex items-center justify-between gap-3 text-left transition-all ${
                  isSelected
                    ? 'bg-[#FDF1ED] border border-[#F7D0C4] text-[#D97757]'
                    : 'bg-[#FAF8F5] hover:bg-[#F6F2EB] border border-transparent text-[#2D2824]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isSelected ? 'bg-[#D97757] text-white' : 'bg-[#EAE4DC] text-[#79716B]'
                    }`}
                  >
                    <FolderSimple size={16} weight="fill" />
                  </div>
                  <div>
                    <span className="font-bold text-sm block leading-tight">{surv}</span>
                    <span className="text-[11px] text-[#79716B] leading-none">
                      Ordner Fisik Lapangan
                    </span>
                  </div>
                </div>

                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-[#D97757] text-white flex items-center justify-center shrink-0">
                    <Check size={14} weight="bold" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
};
