import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export interface CloudSyncOptions<T> {
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
 * State that is persisted locally and mirrored to the cloud.
 *  - Pushes are blocked until the first server fetch settles (prevents a stale
 *    local state from overwriting the cloud on mount).
 *  - Pushes are skipped when the state equals the last known server state
 *    (prevents echo pushes).
 *  - All side effects live in effects, never inside state updaters.
 *
 * `options` is read once on mount; pass a module-level constant.
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

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    const { fetchRemote, adoptEmptyRemote, normalize } = optionsRef.current;

    fetchRemote().then((remote) => {
      if (cancelled) return;
      if (remote === null) {
        // Offline / not configured: treat local as in sync, stay local-only.
        lastSyncedRef.current = JSON.stringify(stateRef.current);
      } else if (adoptEmptyRemote || Object.keys(remote).length > 0) {
        // Remember the RAW server state: if normalisation changes it, the
        // persist effect pushes the healed version back to the cloud.
        lastSyncedRef.current = JSON.stringify(remote);
        setState(normalize ? normalize(remote) : remote);
      }
      // else: reachable but empty -> keep local; the persist effect seeds the cloud.
      setIsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const { save, pushRemote } = optionsRef.current;
    save(state);
    const serialized = JSON.stringify(state);
    if (serialized === lastSyncedRef.current) return;
    lastSyncedRef.current = serialized;
    void pushRemote(state);
  }, [state, isHydrated]);

  return [state, setState];
}
