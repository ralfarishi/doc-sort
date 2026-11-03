import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type {
  MasterState,
  HandoverState,
  HandoverHistoryState,
  HandoverItem,
  MasterItem,
} from '../types';
import {
  takeItemsForHandover,
  returnHandoverItemToMaster,
  clearHandoverList,
  archiveHandoverToHistory,
  restoreHistoryItemToHandover,
  restoreAllHistoryToHandover,
  getCleanInvestigatorName,
} from '../utils/logic';

interface UseOrganizerOperationsParams {
  masterState: MasterState;
  setMasterState: Dispatch<SetStateAction<MasterState>>;
  handoverState: HandoverState;
  setHandoverState: Dispatch<SetStateAction<HandoverState>>;
  historyState: HandoverHistoryState;
  setHistoryState: Dispatch<SetStateAction<HandoverHistoryState>>;
  onShowToast: (type: 'success' | 'warning' | 'error' | 'info', message: string, desc?: string) => void;
}

export function useOrganizerOperations({
  masterState,
  setMasterState,
  handoverState,
  setHandoverState,
  historyState,
  setHistoryState,
  onShowToast,
}: UseOrganizerOperationsParams) {
  const takeForHandover = useCallback(
    (surveyor: string, itemKeys: Set<string>): { takenItems: HandoverItem[] } => {
      const cleanSurv = getCleanInvestigatorName(surveyor);
      const { nextMaster, nextHandover, takenItems } = takeItemsForHandover(
        masterState,
        handoverState,
        cleanSurv,
        itemKeys
      );
      setMasterState(nextMaster);
      setHandoverState(nextHandover);
      return { takenItems };
    },
    [masterState, handoverState, setMasterState, setHandoverState]
  );

  const returnFromHandover = useCallback(
    (surveyor: string, handoverId: string): { returnedItem?: MasterItem } => {
      const cleanSurv = getCleanInvestigatorName(surveyor);
      const { nextMaster, nextHandover, returnedItem } = returnHandoverItemToMaster(
        masterState,
        handoverState,
        cleanSurv,
        handoverId
      );
      setMasterState(nextMaster);
      setHandoverState(nextHandover);
      return { returnedItem };
    },
    [masterState, handoverState, setMasterState, setHandoverState]
  );

  const clearHandover = useCallback(
    (surveyor?: string) => {
      const cleanSurv = surveyor ? getCleanInvestigatorName(surveyor) : undefined;
      setHandoverState((prev) => clearHandoverList(prev, cleanSurv));
    },
    [setHandoverState]
  );

  const archiveHandover = useCallback(
    (surveyor?: string, notes?: string): { archivedCount: number } => {
      const cleanSurv = surveyor && surveyor !== 'ALL' ? getCleanInvestigatorName(surveyor) : undefined;
      const { nextHandover, nextHistory, archivedCount } = archiveHandoverToHistory(
        handoverState,
        historyState,
        cleanSurv,
        notes
      );
      setHandoverState(nextHandover);
      setHistoryState(nextHistory);
      return { archivedCount };
    },
    [handoverState, historyState, setHandoverState, setHistoryState]
  );

  const restoreHistoryItem = useCallback(
    (surveyor: string, historyId: string): { restoredItem?: HandoverItem } => {
      const cleanSurv = getCleanInvestigatorName(surveyor);
      const { nextHistory, nextHandover, restoredItem } = restoreHistoryItemToHandover(
        historyState,
        handoverState,
        cleanSurv,
        historyId
      );
      setHistoryState(nextHistory);
      setHandoverState(nextHandover);
      if (restoredItem) {
        onShowToast(
          'success',
          'Ditarik ke Antrean Cetak',
          `${restoredItem.debitur} dikembalikan ke Antrean Cetak.`
        );
      }
      return { restoredItem };
    },
    [historyState, handoverState, setHistoryState, setHandoverState, onShowToast]
  );

  const restoreAllHistory = useCallback(
    (surveyor: string): { restoredCount: number } => {
      const cleanSurv = getCleanInvestigatorName(surveyor);
      const { nextHistory, nextHandover, restoredCount } = restoreAllHistoryToHandover(
        historyState,
        handoverState,
        cleanSurv
      );
      setHistoryState(nextHistory);
      setHandoverState(nextHandover);
      onShowToast(
        'success',
        'Batch Dikembalikan ke Antrean',
        `${restoredCount} berkas ${cleanSurv} ditarik kembali ke Antrean Cetak.`
      );
      return { restoredCount };
    },
    [historyState, handoverState, setHistoryState, setHandoverState, onShowToast]
  );

  return {
    takeForHandover,
    returnFromHandover,
    clearHandover,
    archiveHandover,
    restoreHistoryItem,
    restoreAllHistory,
  };
}
