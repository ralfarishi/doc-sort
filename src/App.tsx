import { useState, useMemo, useCallback } from 'react';
import { Navbar, type ActiveTab } from './components/Navbar';
import { SearchView } from './components/SearchView';
import { InsertWizardView } from './components/InsertWizardView';
import { StatusView } from './components/StatusView';
import { CatalogView } from './components/CatalogView';
import { HandoverView } from './components/HandoverView';
import { Toast, type ToastMessage } from './components/Toast';
import { ConfirmModal } from './components/ConfirmModal';

import type { ExcelRecord, FolderRecord, MasterState, MasterItem, MatchResult, TransitState, TransitItem, HandoverState } from './types';
import {
  loadStored,
  saveStored,
  fetchServerSnapshot,
  pushServerSnapshot,
  isMasterState,
  isTransitState,
  isHandoverState,
  backfillFolderInfo,
  addToTransit,
  removeFiledFromTransit,
  takeItemsForHandover,
  returnHandoverItemToMaster,
  clearHandoverList,
  simulateHandInsertion,
  getCleanInvestigatorName,
} from './utils/logic';
import { useCloudSyncedState } from './hooks/useCloudSyncedState';

// Import raw JSON data
import rawData from './data/indexed_visit_data.json';
import initialTumpukanRaw from './data/tumpukan_master.json';

const initialTumpukan = initialTumpukanRaw as unknown as MasterState;
const excelRecords = (rawData as any).excel as ExcelRecord[];
const folderRecords = (rawData as any).folders as FolderRecord[];

export function App() {
  // Master Desk Piles (persisted locally & synced to Turso; automatically backfills missing photo info on load)
  const [masterState, setMasterState] = useCloudSyncedState<MasterState>({
    load: () => loadStored('master', isMasterState, initialTumpukan),
    save: (state) => saveStored('master', state),
    fetchRemote: () => fetchServerSnapshot('master', isMasterState),
    pushRemote: (state) => pushServerSnapshot('master', state),
    adoptEmptyRemote: false, // first-run seeds the cloud from initialTumpukan
    normalize: (state) => backfillFolderInfo(state, folderRecords),
  });

  // Transit Trays per Surveyor (persisted locally & synced to Turso; empty remote is authoritative)
  const [transitState, setTransitState] = useCloudSyncedState<TransitState>({
    load: () => loadStored('transit', isTransitState, {}),
    save: (state) => saveStored('transit', state),
    fetchRemote: () => fetchServerSnapshot('transit', isTransitState),
    pushRemote: (state) => pushServerSnapshot('transit', state),
    adoptEmptyRemote: true,
  });

  // Handover Lists per Surveyor (persisted locally & synced to Turso)
  const [handoverState, setHandoverState] = useCloudSyncedState<HandoverState>({
    load: () => loadStored('handover', isHandoverState, {}),
    save: (state) => saveStored('handover', state),
    fetchRemote: () => fetchServerSnapshot('handover', isHandoverState),
    pushRemote: (state) => pushServerSnapshot('handover', state),
    adoptEmptyRemote: true,
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('search');
  const [activeSurveyor, setActiveSurveyor] = useState<string>('CANDRA MAULANA');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

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

  // Total documents in handover list
  const totalHandoverDocs = useMemo(() => {
    return Object.values(handoverState).reduce((acc, list) => acc + list.length, 0);
  }, [handoverState]);

  // Handover Operations
  const handleTakeItemsForHandover = useCallback(
    (surveyor: string, itemKeys: Set<string>) => {
      const cleanSurv = getCleanInvestigatorName(surveyor);
      const { nextMaster, nextHandover } = takeItemsForHandover(
        masterState,
        handoverState,
        cleanSurv,
        itemKeys
      );
      setMasterState(nextMaster);
      setHandoverState(nextHandover);
    },
    [masterState, handoverState, setMasterState, setHandoverState]
  );

  const handleReturnHandoverItem = useCallback(
    (surveyor: string, handoverId: string) => {
      const cleanSurv = getCleanInvestigatorName(surveyor);
      const { nextMaster, nextHandover } = returnHandoverItemToMaster(
        masterState,
        handoverState,
        cleanSurv,
        handoverId
      );
      setMasterState(nextMaster);
      setHandoverState(nextHandover);
    },
    [masterState, handoverState, setMasterState, setHandoverState]
  );

  const handleClearHandover = useCallback(
    (surveyor?: string) => {
      const cleanSurv = surveyor ? getCleanInvestigatorName(surveyor) : undefined;
      setHandoverState((prev) => clearHandoverList(prev, cleanSurv));
    },
    [setHandoverState]
  );

  // Quick insertion of a single document (from Search or Status)
  const handleQuickInsertItem = (
    surveyor: string,
    excelItem: ExcelRecord,
    folderItem?: FolderRecord
  ) => {
    const cleanSurv = getCleanInvestigatorName(surveyor);
    const currentPile = masterState[cleanSurv] || [];

    const pseudoResult: MatchResult = {
      query: excelItem.debitur,
      found_excel: true,
      score: 1.0,
      excel: excelItem,
      folders: folderItem ? [folderItem] : [],
      candidates: [],
      hasAmbiguity: false,
      surveyorMismatch: false,
      isUnassigned: false,
    };

    const { deskPile } = simulateHandInsertion(currentPile, [pseudoResult], cleanSurv);

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

  // Save new master state from Wizard (also automatically removes any filed items from Transit Tray)
  const handleSaveNewMaster = (surveyor: string, newPile: MasterItem[]) => {
    setMasterState((prev) => ({
      ...prev,
      [surveyor]: newPile,
    }));
    setTransitState((prev) => removeFiledFromTransit(prev, surveyor, newPile));
  };

  // Add an item to Transit Tray (pure state update without in-updater side-effects)
  const handleAddToTransit = useCallback((item: TransitItem) => {
    setTransitState((prev) => addToTransit(prev, [item]));
  }, [setTransitState]);

  // Claim/pull all items from Transit Tray for a surveyor into active wizard
  const handleClaimTransit = useCallback((surveyor: string) => {
    setTransitState((prev) => {
      const next = { ...prev };
      delete next[surveyor];
      return next;
    });
    showToast(
      'success',
      'Berkas Transit Digabungkan',
      `Semua berkas dari stopmap transit ${surveyor} telah dimasukkan ke antrean.`
    );
  }, [setTransitState, showToast]);

  // Total transit documents across all trays
  const totalTransitDocs = useMemo(() => {
    return Object.values(transitState).reduce((acc, tray) => acc + tray.length, 0);
  }, [transitState]);

  // Import JSON state
  const handleImportState = (newState: MasterState) => {
    setMasterState(newState);
  };

  // Reset to initial JSON data
  const handleConfirmReset = () => {
    setMasterState(initialTumpukan);
    setTransitState({});
    setIsResetModalOpen(false);
    showToast('info', 'Data Direset', 'Tumpukan master dikembalikan ke data awal.');
  };

  // Names handed to the insert wizard from the Status "missing documents" list.
  const [prefillNames, setPrefillNames] = useState<string[]>([]);

  const handleTabChange = (tab: ActiveTab) => {
    setPrefillNames([]);
    setActiveTab(tab);
  };

  const handleNavigateToInsertWithDebtors = (surveyor: string, names: string[]) => {
    setActiveSurveyor(surveyor);
    setPrefillNames(names);
    setActiveTab('insert');
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#2D2824] flex flex-col font-sans">
      {/* Navigation Header & Mobile Bottom Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        activeSurveyor={activeSurveyor}
        surveyorsList={surveyorsList}
        onSelectSurveyor={setActiveSurveyor}
        totalPhysicalDocs={totalPhysicalDocs}
        totalTransitDocs={totalTransitDocs}
        totalHandoverDocs={totalHandoverDocs}
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
            onTakeForHandover={handleTakeItemsForHandover}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'insert' && (
          <InsertWizardView
            masterState={masterState}
            transitState={transitState}
            excelList={excelRecords}
            folderList={folderRecords}
            activeSurveyor={activeSurveyor}
            surveyorsList={surveyorsList}
            prefillNames={prefillNames}
            onSelectSurveyor={setActiveSurveyor}
            onSaveNewMaster={handleSaveNewMaster}
            onAddToTransit={handleAddToTransit}
            onClaimTransit={handleClaimTransit}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'status' && (
          <StatusView
            masterState={masterState}
            transitState={transitState}
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
            onTakeForHandover={handleTakeItemsForHandover}
          />
        )}

        {activeTab === 'handover' && (
          <HandoverView
            handoverState={handoverState}
            masterState={masterState}
            activeSurveyor={activeSurveyor}
            onTakeItems={handleTakeItemsForHandover}
            onReturnItem={handleReturnHandoverItem}
            onClearHandover={handleClearHandover}
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
