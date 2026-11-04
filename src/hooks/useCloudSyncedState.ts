import { useEffect, useRef, useState, useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';

export type GlobalSyncStatus = 'synced' | 'syncing' | 'error' | 'offline';

const activeSyncingKeys = new Set<string>();
const syncErrorKeys = new Set<string>();
let isServerConfigured = true;
const statusListeners = new Set<(status: GlobalSyncStatus) => void>();

function notifyStatus() {
  let status: GlobalSyncStatus = 'synced';
  if (!isServerConfigured) {
    status = 'offline';
  } else if (activeSyncingKeys.size > 0) {
    status = 'syncing';
  } else if (syncErrorKeys.size > 0) {
    status = 'error';
  }
  statusListeners.forEach((fn) => fn(status));
}

export function subscribeSyncStatus(listener: (status: GlobalSyncStatus) => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function getSyncStatusSnapshot(): GlobalSyncStatus {
  if (!isServerConfigured) return 'offline';
  if (activeSyncingKeys.size > 0) return 'syncing';
  if (syncErrorKeys.size > 0) return 'error';
  return 'synced';
}

/**
 * React hook to observe global Turso cloud synchronization status.
 */
export function useGlobalSyncStatus(): GlobalSyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatusSnapshot);
}

export interface CloudSyncOptions<T> {
  /** Optional key in localStorage for cross-tab synchronization. */
  storageKey?: string;
  /** Initial state from localStorage (or seed data). */
  load: () => T;
  /** Persist to localStorage. */
  save: (state: T) => void;
  /** `null` = server unreachable/unconfigured; `{}` = reachable but empty. */
  fetchRemote: () => Promise<T | null>;
  pushRemote: (state: T) => Promise<boolean>;
  /**
   * When true, an empty remote snapshot is authoritative (adopted as-is). When false,
   * an empty remote is seeded from local state instead (first-run behaviour).
   */
  adoptEmptyRemote?: boolean;
  /** Pure normalisation applied to every state entering the app (local load & remote adopt). */
  normalize?: (state: T) => T;
}

/**
 * State that is persisted locally and mirrored to the cloud (Turso LibSQL).
 *  - Uncommitted local mutations are tracked with `isDirtyRef` to prevent
 *    stale remote snapshots from overwriting fresh local updates on reload.
 *  - Pushes are debounced and tracked globally for sync status indicators.
 *  - Warns on unexpected window close/refresh while push is actively in flight.
 */
export function useCloudSyncedState<T extends object>(
  options: CloudSyncOptions<T>
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    const { load, normalize } = options;
    const loaded = load();
    return normalize ? normalize(loaded) : loaded;
  });

  const optionsRef = useRef(options);
  const [isHydrated, setIsHydrated] = useState(false);
  const lastSyncedRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  const isDirtyRef = useRef(false);
  const syncKey = options.storageKey || 'unnamed-scope';

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setSyncedState: Dispatch<SetStateAction<T>> = useCallback((action) => {
    isDirtyRef.current = true;
    setState((prev) => {
      const next = typeof action === 'function' ? (action as (p: T) => T)(prev) : action;
      return next;
    });
  }, []);

  // Prevent accidental window close or reload while a cloud sync is actively pending
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current || activeSyncingKeys.has(syncKey)) {
        e.preventDefault();
        e.returnValue = 'Data sedang disimpan ke Cloud. Yakin ingin keluar?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [syncKey]);

  // Cross-tab synchronization: respond immediately when another open tab writes to localStorage
  useEffect(() => {
    const key = optionsRef.current.storageKey;
    if (!key || typeof window === 'undefined') return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key !== key || e.newValue === null) return;
      try {
        const { load, normalize } = optionsRef.current;
        const reloaded = load();
        const nextState = normalize ? normalize(reloaded) : reloaded;
        const serialized = JSON.stringify(nextState);
        if (serialized !== JSON.stringify(stateRef.current)) {
          lastSyncedRef.current = serialized;
          setState(nextState);
        }
      } catch (err) {
        console.error(`Cross-tab sync error for key ${key}:`, err);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Initial Fetch from Remote (Turso Cloud)
  useEffect(() => {
    let cancelled = false;
    const { fetchRemote, adoptEmptyRemote, normalize } = optionsRef.current;

    fetchRemote().then((remote) => {
      if (cancelled) return;
      if (remote === null) {
        // Offline / not configured: treat local as in sync, stay local-only.
        isServerConfigured = false;
        notifyStatus();
        lastSyncedRef.current = JSON.stringify(stateRef.current);
      } else if (adoptEmptyRemote || Object.keys(remote).length > 0) {
        // CRITICAL INVARIANT: If local state has pending uncommitted mutations that happened
        // before the fetch completed, DO NOT overwrite with stale remote!
        if (isDirtyRef.current) {
          console.warn(`[Sync] Scope ${syncKey} has pending local mutations; preserving local state.`);
        } else {
          lastSyncedRef.current = JSON.stringify(remote);
          setState(normalize ? normalize(remote) : remote);
        }
        isServerConfigured = true;
        notifyStatus();
      }
      setIsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [syncKey]);

  const inFlightRef = useRef(false);
  const pendingPushRef = useRef<T | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Push remote with concurrency queue & status management
  const triggerPush = useCallback(
    async (snapshot: T) => {
      if (inFlightRef.current) {
        pendingPushRef.current = snapshot;
        return;
      }

      inFlightRef.current = true;
      activeSyncingKeys.add(syncKey);
      notifyStatus();

      try {
        const { pushRemote } = optionsRef.current;
        const success = await pushRemote(snapshot);
        if (success) {
          syncErrorKeys.delete(syncKey);
          lastSyncedRef.current = JSON.stringify(snapshot);
        } else {
          syncErrorKeys.add(syncKey);
        }
      } catch {
        syncErrorKeys.add(syncKey);
      } finally {
        inFlightRef.current = false;
        const nextPending = pendingPushRef.current;
        if (nextPending && JSON.stringify(nextPending) !== lastSyncedRef.current) {
          pendingPushRef.current = null;
          void triggerPush(nextPending);
        } else {
          pendingPushRef.current = null;
          isDirtyRef.current = false;
          activeSyncingKeys.delete(syncKey);
          notifyStatus();
        }
      }
    },
    [syncKey]
  );

  // Persist to LocalStorage immediately, and Debounce Push to Cloud
  useEffect(() => {
    if (!isHydrated) return;
    const { save } = optionsRef.current;

    // Always immediately persist locally to localStorage
    save(state);

    const serialized = JSON.stringify(state);
    if (serialized === lastSyncedRef.current) {
      isDirtyRef.current = false;
      return;
    }

    isDirtyRef.current = true;
    activeSyncingKeys.add(syncKey);
    notifyStatus();

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void triggerPush(state);
    }, 350);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [state, isHydrated, syncKey, triggerPush]);

  // Clean up syncing keys if component unmounts
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      activeSyncingKeys.delete(syncKey);
      notifyStatus();
    };
  }, [syncKey]);

  return [state, setSyncedState];
}
