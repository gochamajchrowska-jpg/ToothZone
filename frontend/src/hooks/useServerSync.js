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

  const pendingRef = useRef({});   // niezapisane zmiany
  const timerRef   = useRef(null);
  const tokenRef   = useRef(token);
  tokenRef.current = token;

  // ── Zapis na serwer ─────────────────────────────────────────
  async function flushToServer(patch) {
    if (!patch || Object.keys(patch).length === 0) return;
    try {
      await patchUserData(tokenRef.current, patch);
    } catch (err) {
      console.error("[Sync] Błąd zapisu:", err.message);
    }
  }

  // ── Załaduj z serwera przy starcie ───────────────────────────
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getUserData(token)
      .then((serverData) => {
        if (cancelled) return;
        setData((prev) => {
          // pending wygrywa nad serwerem — nie cofaj lokalnych zmian
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

  // ── Zapisz przed zamknięciem/odświeżeniem strony ─────────────
  useEffect(() => {
    function handleBeforeUnload() {
      const toSend = { ...pendingRef.current };
      if (Object.keys(toSend).length === 0) return;
      // keepalive: true pozwala fetchowi działać po zamknięciu strony
      const url = `${import.meta.env.VITE_API_URL || ""}/api/userdata`;
      fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify(toSend),
        keepalive: true,  // kluczowe — działa przy odświeżeniu strony
      }).catch(() => {});
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ── Aktualizuj dane ──────────────────────────────────────────
  const update = useCallback((patch) => {
    // 1. Zapisz lokalnie natychmiast
    setData((prev) => {
      const next = { ...prev, ...patch };
      saveToLocal(next);
      return next;
    });

    // 2. Dodaj do pending
    pendingRef.current = { ...pendingRef.current, ...patch };

    // 3. Wyślij na serwer po 100ms (krótki debounce dla grupowania wielu kliknięć)
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const toSend = { ...pendingRef.current };
      pendingRef.current = {};
      flushToServer(toSend);
    }, 100);
  }, []);

  return { data, update, loading };
}
