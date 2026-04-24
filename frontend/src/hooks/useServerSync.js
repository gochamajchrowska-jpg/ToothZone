import { useState, useEffect, useCallback, useRef } from "react";
import { getUserData, patchUserData } from "../api";

const EMPTY_DATA = {
  schoolManual:    [],
  preschoolManual: [],
  schoolPaid:      [],
  preschoolPaid:   [],
  schoolEvents:    [],
  preschoolEvents: [],
  dashEvents:      [],
  oblManual:       [],
  oblSchedules:    [],
  oblPaid:         [],
};

export function useServerSync(token) {
  const [data, setData]       = useState({ ...EMPTY_DATA });
  const [loading, setLoading] = useState(true);
  const tokenRef              = useRef(token);
  tokenRef.current = token;

  // Załaduj z serwera przy starcie
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getUserData(token)
      .then((serverData) => {
        if (!cancelled) {
          setData({ ...EMPTY_DATA, ...serverData });
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  // Optimistic update + natychmiastowy zapis na serwer
  const update = useCallback((patch) => {
    // 1. Zaktualizuj UI natychmiast
    setData((prev) => ({ ...prev, ...patch }));

    // 2. Zapisz na serwer (fire and forget — ale loguj błędy)
    patchUserData(tokenRef.current, patch)
      .catch((err) => console.error("[Sync] Błąd zapisu:", err.message));
  }, []);

  return { data, update, loading };
}
