import { useState, useEffect, useMemo, useCallback } from 'react';
import { Navbar, type ActiveTab } from './components/Navbar';
import { SearchView } from './components/SearchView';
import { InsertWizardView } from './components/InsertWizardView';
import { StatusView } from './components/StatusView';
import { CatalogView } from './components/CatalogView';
import { Toast, type ToastMessage } from './components/Toast';
import { ConfirmModal } from './components/ConfirmModal';

import type { ExcelRecord, FolderRecord, MasterState, MasterItem } from './types';
import {
  loadStoredMasterState,
  saveStoredMasterState,
  simulateHandInsertion,
  getCleanInvestigatorName,
} from './utils/logic';

// Import raw JSON data
import rawData from './data/indexed_visit_data.json';
import initialTumpukanRaw from './data/tumpukan_master.json';

const initialTumpukan = initialTumpukanRaw as unknown as MasterState;
const excelRecords = (rawData as any).excel as ExcelRecord[];
const folderRecords = (rawData as any).folders as FolderRecord[];

export function App() {
  const [masterState, setMasterState] = useState<MasterState>(() =>
    loadStoredMasterState(initialTumpukan)
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>('search');
  const [activeSurveyor, setActiveSurveyor] = useState<string>('CANDRA MAULANA');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Sync to localStorage on update
  useEffect(() => {
    saveStoredMasterState(masterState);
  }, [masterState]);

  // Toast Helper
  const showToast = useCallback(
    (type: 'success' | 'warning' | 'error' | 'info', message: string, description?: string) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, type, message, description }]);

      // Auto dismiss after 4 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // List of surveyors known across master state & excel
  const surveyorsList = useMemo(() => {
    const set = new Set<string>(Object.keys(masterState));
    excelRecords.forEach((ex) => {
      const s = getCleanInvestigatorName(ex.surveyor);
      if (s && s !== 'TIDAK TERIDENTIFIKASI' && s !== 'BELUM DITUGASKAN') {
        set.add(s);
      }
    });
    return Array.from(set).sort();
  }, [masterState]);

  // Total physical documents across all piles
  const totalPhysicalDocs = useMemo(() => {
    return Object.values(masterState).reduce((acc, pile) => acc + pile.length, 0);
  }, [masterState]);

  // Quick insertion of a single document (from Search or Status)
  const handleQuickInsertItem = (
    surveyor: string,
    excelItem: ExcelRecord,
    folderItem?: FolderRecord
  ) => {
    const cleanSurv = getCleanInvestigatorName(surveyor);
    const currentPile = masterState[cleanSurv] || [];

    const pseudoResult = {
      query: excelItem.debitur,
      found_excel: true,
      score: 1.0,
      excel: excelItem,
      folders: folderItem ? [folderItem] : [],
    };

    const { deskPile } = simulateHandInsertion(currentPile, [pseudoResult]);

    setMasterState((prev) => ({
      ...prev,
      [cleanSurv]: deskPile,
    }));

    showToast(
      'success',
      'Diselipkan ke Meja!',
      `${excelItem.debitur} berhasil dimasukkan ke Ordner ${cleanSurv}.`
    );
  };

  // Save new master state from Wizard
  const handleSaveNewMaster = (surveyor: string, newPile: MasterItem[]) => {
    setMasterState((prev) => ({
      ...prev,
      [surveyor]: newPile,
    }));
  };

  // Import JSON state
  const handleImportState = (newState: MasterState) => {
    setMasterState(newState);
  };

  // Reset to initial JSON data
  const handleConfirmReset = () => {
    setMasterState(initialTumpukan);
    saveStoredMasterState(initialTumpukan);
    setIsResetModalOpen(false);
    showToast('info', 'Data Direset', 'Tumpukan master dikembalikan ke data awal.');
  };

  // Navigate to insert wizard with prefilled names (from Status view missing list)
  const [wizardPrefill, setWizardPrefill] = useState<{ surveyor: string; names: string[] } | null>(
    null
  );

  const handleNavigateToInsertWithDebtors = (surveyor: string, names: string[]) => {
    setActiveSurveyor(surveyor);
    setWizardPrefill({ surveyor, names });
    setActiveTab('insert');
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#2D2824] flex flex-col font-sans">
      {/* Navigation Header & Mobile Bottom Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeSurveyor={activeSurveyor}
        surveyorsList={surveyorsList}
        onSelectSurveyor={setActiveSurveyor}
        totalPhysicalDocs={totalPhysicalDocs}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-6 pb-24 md:pb-10">
        {activeTab === 'search' && (
          <SearchView
            masterState={masterState}
            excelList={excelRecords}
            folderList={folderRecords}
            activeSurveyor={activeSurveyor}
            onQuickInsertItem={handleQuickInsertItem}
          />
        )}

        {activeTab === 'insert' && (
          <InsertWizardView
            masterState={masterState}
            excelList={excelRecords}
            folderList={folderRecords}
            activeSurveyor={wizardPrefill?.surveyor || activeSurveyor}
            surveyorsList={surveyorsList}
            onSaveNewMaster={handleSaveNewMaster}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'status' && (
          <StatusView
            masterState={masterState}
            excelList={excelRecords}
            onSelectSurveyor={setActiveSurveyor}
            onNavigateToInsert={handleNavigateToInsertWithDebtors}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'catalog' && (
          <CatalogView
            masterState={masterState}
            activeSurveyor={activeSurveyor}
            onImportState={handleImportState}
            onRequestReset={() => setIsResetModalOpen(true)}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Toast Notification Container */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* Reset Confirmation Modal */}
      <ConfirmModal
        isOpen={isResetModalOpen}
        title="Reset Data Tumpukan Fisik?"
        message="Tindakan ini akan mengembalikan data tumpukan meja ke kondisi awal bawaan (initial seed). Perubahan yang belum diekspor akan hilang."
        confirmLabel="Ya, Reset Data"
        cancelLabel="Batal"
        isDestructive={true}
        onConfirm={handleConfirmReset}
        onCancel={() => setIsResetModalOpen(false)}
      />
    </div>
  );
}

export default App;
