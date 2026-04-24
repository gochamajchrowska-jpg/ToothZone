import { useState, useEffect, useCallback, useRef } from "react";
import { getUserData, patchUserData } from "../api";

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

export function useServerSync(token) {
  const [data, setData]       = useState(() => loadFromLocal());
  const [loading, setLoading] = useState(true);

  // Śledzimy czy są niezapisane zmiany w trakcie ładowania
  const pendingRef  = useRef({});  // zmiany czekające na zapis
  const savingRef   = useRef(false); // czy zapis jest w toku
  const timerRef    = useRef(null);

  // Załaduj z serwera przy starcie — ale NIE nadpisuj jeśli są pending zmiany
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getUserData(token)
      .then((serverData) => {
        if (cancelled) return;
        setData((prev) => {
          // Jeśli są niezapisane zmiany — scal serwer + pending (pending wygrywa)
          const merged = { ...EMPTY_DATA, ...serverData, ...pendingRef.current };
          saveToLocal(merged);
          return merged;
        });
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token]);

  // Natychmiastowy zapis na serwer — bez debounce dla krytycznych danych
  const update = useCallback((patch) => {
    // 1. Zaktualizuj lokalnie natychmiast
    setData((prev) => {
      const next = { ...prev, ...patch };
      saveToLocal(next);
      return next;
    });

    // 2. Dodaj do pending
    pendingRef.current = { ...pendingRef.current, ...patch };

    // 3. Wyślij na serwer (debounce 300ms — krótszy niż poprzednie 800ms)
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (savingRef.current) {
        // Jeśli zapis w toku, spróbuj ponownie za chwilę
        timerRef.current = setTimeout(() => {
          const toSend = { ...pendingRef.current };
          if (Object.keys(toSend).length === 0) return;
          savingRef.current = true;
          patchUserData(token, toSend)
            .then(() => { pendingRef.current = {}; })
            .catch((err) => console.error("[Sync] Błąd zapisu:", err.message))
            .finally(() => { savingRef.current = false; });
        }, 500);
        return;
      }

      const toSend = { ...pendingRef.current };
      if (Object.keys(toSend).length === 0) return;

      savingRef.current = true;
      try {
        await patchUserData(token, toSend);
        pendingRef.current = {};
      } catch (err) {
        console.error("[Sync] Błąd zapisu:", err.message);
        // Zostaw w pending — spróbuje przy kolejnej zmianie
      } finally {
        savingRef.current = false;
      }
    }, 300);
  }, [token]);

  return { data, update, loading };
}
