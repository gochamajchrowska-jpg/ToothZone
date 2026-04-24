import { useState, useEffect, useCallback, useRef } from "react";
import { getUserData, patchUserData } from "../api";

/**
 * Hook synchronizujący dane użytkownika z serwerem.
 * Dane ładowane przy starcie z serwera, zapisywane po każdej zmianie.
 * localStorage służy jako cache offline.
 *
 * @param {string} token - JWT token
 * @returns {{ data, update, loading }} 
 */
export function useServerSync(token) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const saveTimerRef          = useRef(null);

  // Załaduj przy starcie
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getUserData(token)
      .then((serverData) => {
        if (!cancelled) {
          setData(serverData);
          setLoading(false);
        }
      })
      .catch(() => {
        // Fallback: odczytaj z localStorage
        if (!cancelled) {
          const local = loadFromLocal();
          setData(local);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [token]);

  // Aktualizuj dane i zapisz na serwer (debounced 1s)
  const update = useCallback((patch) => {
    setData((prev) => {
      const next = { ...prev, ...patch };
      saveToLocal(next);

      // Debounced save to server
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        patchUserData(token, patch).catch((err) =>
          console.error("[Sync] Błąd zapisu na serwer:", err.message)
        );
      }, 1000);

      return next;
    });
  }, [token]);

  return { data, update, loading };
}

// ── Helpers localStorage (fallback offline) ───────────────────
const LOCAL_KEY = "tz_userdata_cache";

function loadFromLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); }
  catch { return {}; }
}

function saveToLocal(data) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); }
  catch { /* quota */ }
}
