import { useState, useEffect, useCallback, useRef } from "react";
import { getUserData, patchUserData } from "../api";

// Domyślna pusta struktura — zapobiega null na starcie
const EMPTY_DATA = {
  schoolManual:    [],
  preschoolManual: [],
  schoolPaid:      [],
  preschoolPaid:   [],
  schoolEvents:    [],
  preschoolEvents: [],
  oblManual:       [],
  oblSchedules:    [],
  oblPaid:         [],
};

const LOCAL_KEY = "tz_userdata_cache";

function loadFromLocal() {
  try {
    const cached = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
    return { ...EMPTY_DATA, ...cached };
  } catch { return { ...EMPTY_DATA }; }
}

function saveToLocal(data) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); }
  catch { /* quota */ }
}

/**
 * Synchronizuje dane użytkownika z serwerem Railway.
 * - Przy starcie: ładuje z serwera (fallback: localStorage cache)
 * - Po każdej zmianie: PATCH na serwer (debounced 800ms)
 * - Dane dostępne natychmiast z cache, aktualizowane po odpowiedzi serwera
 */
export function useServerSync(token) {
  // Zacznij od cache z localStorage — brak opóźnienia przy renderze
  const [data, setData]       = useState(() => loadFromLocal());
  const [loading, setLoading] = useState(true);
  const saveTimerRef          = useRef(null);
  const pendingPatch          = useRef({});

  // Załaduj dane z serwera przy starcie
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getUserData(token)
      .then((serverData) => {
        if (cancelled) return;
        // Serwer jest źródłem prawdy — nadpisz cache
        const merged = { ...EMPTY_DATA, ...serverData };
        setData(merged);
        saveToLocal(merged);
        setLoading(false);
      })
      .catch(() => {
        // Serwer niedostępny — zostań przy cache
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token]);

  // Aktualizuj dane lokalnie i synchronizuj z serwerem
  const update = useCallback((patch) => {
    setData((prev) => {
      const next = { ...prev, ...patch };
      saveToLocal(next);

      // Zbieraj zmiany i wysyłaj razem (debounced)
      pendingPatch.current = { ...pendingPatch.current, ...patch };
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const toSend = { ...pendingPatch.current };
        pendingPatch.current = {};
        patchUserData(token, toSend).catch((err) =>
          console.error("[Sync] Błąd zapisu:", err.message)
        );
      }, 800);

      return next;
    });
  }, [token]);

  return { data, update, loading };
}
