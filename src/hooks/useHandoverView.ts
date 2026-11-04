import { useState, useMemo, useEffect } from 'react';
import type {
  HandoverState,
  MasterState,
  HandoverHistoryState,
  HandoverItem,
  HandoverHistoryItem,
} from '../types';
import { normalize } from '../utils/logic';

const PRINT_SORT_MODE_KEY = 'ORGANIZER_PRINT_SORT_MODE_V1';

export interface UseHandoverViewParams {
  masterState: MasterState;
  handoverState: HandoverState;
  historyState: HandoverHistoryState;
  activeSurveyor: string;
  onTakeItems: (surveyor: string, itemKeys: Set<string>) => void;
  onClearHandover: (surveyor?: string) => void;
  onArchiveHandover: (surveyor?: string, notes?: string) => void;
  onShowToast: (type: 'success' | 'warning' | 'error' | 'info', message: string, desc?: string) => void;
}

export function useHandoverView({
  masterState,
  handoverState,
  historyState,
  activeSurveyor,
  onTakeItems,
  onClearHandover,
  onArchiveHandover,
  onShowToast,
}: UseHandoverViewParams) {
  const [activeSubTab, setActiveSubTab] = useState<'pending' | 'history'>('pending');
  const [selectedSurveyorFilter, setSelectedSurveyorFilter] = useState<string>('ALL');
  const [historySearch, setHistorySearch] = useState('');
  const [printSortMode, setPrintSortMode] = useState<'default' | 'alphabetical'>(() => {
    try {
      const saved = localStorage.getItem(PRINT_SORT_MODE_KEY);
      if (saved === 'alphabetical' || saved === 'default') return saved;
    } catch {
      // ignore
    }
    return 'default';
  });

  useEffect(() => {
    try {
      localStorage.setItem(PRINT_SORT_MODE_KEY, printSortMode);
    } catch {
      // ignore
    }
  }, [printSortMode]);

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
      (s) => (historyState[s] ?? []).length > 0
    );
  }, [historyState]);

  // Derive a valid filter for the active sub-tab without triggering cascading effects
  const effectiveSurveyorFilter = useMemo(() => {
    if (selectedSurveyorFilter === 'ALL') return 'ALL';
    const validSurveyors = activeSubTab === 'pending' ? activeHandoverSurveyors : historySurveyors;
    return validSurveyors.includes(selectedSurveyorFilter) ? selectedSurveyorFilter : 'ALL';
  }, [activeSubTab, activeHandoverSurveyors, historySurveyors, selectedSurveyorFilter]);

  // Pending groups to display
  const displayPendingGroups = useMemo(() => {
    if (effectiveSurveyorFilter === 'ALL') {
      return activeHandoverSurveyors.map((s) => ({
        surveyor: s,
        items: handoverState[s] ?? [],
      }));
    }
    const items = handoverState[effectiveSurveyorFilter] ?? [];
    return items.length > 0 ? [{ surveyor: effectiveSurveyorFilter, items }] : [];
  }, [handoverState, effectiveSurveyorFilter, activeHandoverSurveyors]);

  // History groups to display
  const displayHistoryGroups = useMemo(() => {
    const listSurv = effectiveSurveyorFilter === 'ALL' ? historySurveyors : [effectiveSurveyorFilter];
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
  }, [historyState, effectiveSurveyorFilter, historySurveyors, historySearch]);

  // Alphabetical items across current filter (A–Z by debtor name)
  const alphabeticalPendingItems = useMemo(() => {
    const list: HandoverItem[] = [];
    displayPendingGroups.forEach((g) => {
      list.push(...g.items);
    });
    return list.sort((a, b) => normalize(a.debitur).localeCompare(normalize(b.debitur)));
  }, [displayPendingGroups]);

  const alphabeticalHistoryItems = useMemo(() => {
    const list: HandoverHistoryItem[] = [];
    displayHistoryGroups.forEach((g) => {
      list.push(...g.items);
    });
    return list.sort((a, b) => normalize(a.debitur).localeCompare(normalize(b.debitur)));
  }, [displayHistoryGroups]);

  const totalHandoverCount = useMemo(() => {
    return Object.values(handoverState).reduce((acc, list) => acc + list.length, 0);
  }, [handoverState]);

  const totalHistoryCount = useMemo(() => {
    return Object.values(historyState).reduce((acc, list) => acc + (list?.length ?? 0), 0);
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

  const handleOpenPicker = () => {
    setSelectedPickerKeys(new Set());
    setIsPickerOpen(true);
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
    const count = activeSubTab === 'pending' ? totalHandoverCount : totalHistoryCount;
    if (count === 0) {
      onShowToast(
        'warning',
        'Daftar Kosong',
        `Tidak ada dokumen dalam ${activeSubTab === 'pending' ? 'daftar pengambilan' : 'riwayat'} untuk dicetak.`
      );
      return;
    }
    window.print();
  };

  const handleConfirmClear = () => {
    onClearHandover(effectiveSurveyorFilter === 'ALL' ? undefined : effectiveSurveyorFilter);
    setIsClearModalOpen(false);
    onShowToast('info', 'Antrean Dibatalkan', 'Semua berkas pada antrean pengambilan telah dikembalikan ke tumpukan meja.');
  };

  const handleConfirmArchive = () => {
    const hasUnassigned = (handoverState['BELUM DITUGASKAN']?.length ?? 0) > 0;
    if (
      (effectiveSurveyorFilter === 'ALL' && hasUnassigned) ||
      effectiveSurveyorFilter === 'BELUM DITUGASKAN'
    ) {
      setIsArchiveModalOpen(false);
      onShowToast(
        'warning',
        'Investigator Belum Ditetapkan',
        'Tetapkan investigator terlebih dahulu pada kotak peringatan kuning di atas sebelum mengarsipkan.'
      );
      return;
    }

    const targetSurv =
      effectiveSurveyorFilter !== 'ALL' && (handoverState[effectiveSurveyorFilter]?.length ?? 0) > 0
        ? effectiveSurveyorFilter
        : undefined;
    onArchiveHandover(targetSurv);
    setIsArchiveModalOpen(false);
    setSelectedSurveyorFilter('ALL');
    setActiveSubTab('history');
    onShowToast(
      'success',
      'Penyerahan Selesai & Diarsipkan',
      'Berkas berhasil dipindahkan ke riwayat dokumen yang sudah diserahkan.'
    );
  };

  return {
    activeSubTab,
    setActiveSubTab,
    selectedSurveyorFilter: effectiveSurveyorFilter,
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
    setSelectedPickerKeys,
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
  };
}
