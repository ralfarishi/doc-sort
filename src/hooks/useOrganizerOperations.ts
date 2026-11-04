import { useCallback, useRef, useEffect, type Dispatch, type SetStateAction } from 'react';
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
  returnAllHandoverToMaster,
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
  // Synchronous state refs prevent rapid-click stale closure race conditions
  const masterRef = useRef(masterState);
  const handoverRef = useRef(handoverState);
  const historyRef = useRef(historyState);

  useEffect(() => {
    masterRef.current = masterState;
  }, [masterState]);
  useEffect(() => {
    handoverRef.current = handoverState;
  }, [handoverState]);
  useEffect(() => {
    historyRef.current = historyState;
  }, [historyState]);

  const takeForHandover = useCallback(
    (surveyor: string, itemKeys: Set<string>): { takenItems: HandoverItem[] } => {
      const cleanSurv = getCleanInvestigatorName(surveyor);
      const { nextMaster, nextHandover, takenItems } = takeItemsForHandover(
        masterRef.current,
        handoverRef.current,
        cleanSurv,
        itemKeys
      );
      masterRef.current = nextMaster;
      handoverRef.current = nextHandover;
      setMasterState(nextMaster);
      setHandoverState(nextHandover);
      return { takenItems };
    },
    [setMasterState, setHandoverState]
  );

  const returnFromHandover = useCallback(
    (surveyor: string, handoverId: string): { returnedItem?: MasterItem } => {
      const cleanSurv = getCleanInvestigatorName(surveyor);
      const { nextMaster, nextHandover, returnedItem } = returnHandoverItemToMaster(
        masterRef.current,
        handoverRef.current,
        cleanSurv,
        handoverId
      );
      masterRef.current = nextMaster;
      handoverRef.current = nextHandover;
      setMasterState(nextMaster);
      setHandoverState(nextHandover);
      return { returnedItem };
    },
    [setMasterState, setHandoverState]
  );

  const clearHandover = useCallback(
    (surveyor?: string): { returnedCount: number } => {
      const cleanSurv = surveyor ? getCleanInvestigatorName(surveyor) : undefined;
      const { nextMaster, nextHandover, returnedCount } = returnAllHandoverToMaster(
        masterRef.current,
        handoverRef.current,
        cleanSurv
      );
      masterRef.current = nextMaster;
      handoverRef.current = nextHandover;
      setMasterState(nextMaster);
      setHandoverState(nextHandover);
      return { returnedCount };
    },
    [setMasterState, setHandoverState]
  );

  const archiveHandover = useCallback(
    (surveyor?: string, notes?: string): { archivedCount: number } => {
      const cleanSurv = surveyor && surveyor !== 'ALL' ? getCleanInvestigatorName(surveyor) : undefined;
      const { nextHandover, nextHistory, archivedCount } = archiveHandoverToHistory(
        handoverRef.current,
        historyRef.current,
        cleanSurv,
        notes
      );
      handoverRef.current = nextHandover;
      historyRef.current = nextHistory;
      setHandoverState(nextHandover);
      setHistoryState(nextHistory);
      return { archivedCount };
    },
    [setHandoverState, setHistoryState]
  );

  const restoreHistoryItem = useCallback(
    (surveyor: string, historyId: string): { restoredItem?: HandoverItem } => {
      const cleanSurv = getCleanInvestigatorName(surveyor);
      const { nextHistory, nextHandover, restoredItem } = restoreHistoryItemToHandover(
        historyRef.current,
        handoverRef.current,
        cleanSurv,
        historyId
      );
      historyRef.current = nextHistory;
      handoverRef.current = nextHandover;
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
    [setHistoryState, setHandoverState, onShowToast]
  );

  const restoreAllHistory = useCallback(
    (surveyor: string): { restoredCount: number } => {
      const cleanSurv = getCleanInvestigatorName(surveyor);
      const { nextHistory, nextHandover, restoredCount } = restoreAllHistoryToHandover(
        historyRef.current,
        handoverRef.current,
        cleanSurv
      );
      historyRef.current = nextHistory;
      handoverRef.current = nextHandover;
      setHistoryState(nextHistory);
      setHandoverState(nextHandover);
      onShowToast(
        'success',
        'Batch Dikembalikan ke Antrean',
        `${restoredCount} berkas ${cleanSurv} ditarik kembali ke Antrean Cetak.`
      );
      return { restoredCount };
    },
    [setHistoryState, setHandoverState, onShowToast]
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
