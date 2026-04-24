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

const LOCAL_KEY      = "tz_userdata_cache";
const LOCAL_TS_KEY   = "tz_userdata_saved_at";   // kiedy lokalnie zapisano
const SERVER_TS_KEY  = "tz_userdata_server_at";  // kiedy serwer potwierdził zapis

function loadFromLocal() {
  try {
    const cached = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
    return { ...EMPTY_DATA, ...cached };
  } catch { return { ...EMPTY_DATA }; }
}

function saveToLocal(data) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    localStorage.setItem(LOCAL_TS_KEY, Date.now().toString());
  } catch { /* quota */ }
}

function getLocalTs()  { return parseInt(localStorage.getItem(LOCAL_TS_KEY)  || "0"); }
function getServerTs() { return parseInt(localStorage.getItem(SERVER_TS_KEY) || "0"); }
function setServerTs() { localStorage.setItem(SERVER_TS_KEY, Date.now().toString()); }

export function useServerSync(token) {
  const [data, setData]       = useState(() => loadFromLocal());
  const [loading, setLoading] = useState(true);
  const tokenRef              = useRef(token);
  tokenRef.current = token;

  // ── Załaduj z serwera przy starcie ───────────────────────────
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getUserData(token)
      .then((serverData) => {
        if (cancelled) return;

        const localTs  = getLocalTs();
        const serverTs = getServerTs();

        // Użyj serwera TYLKO jeśli:
        // - serwer potwierdził zapis po ostatniej lokalnej zmianie, LUB
        // - nie ma lokalnych zmian (świeża sesja)
        if (serverTs >= localTs || localTs === 0) {
          const merged = { ...EMPTY_DATA, ...serverData };
          setData(merged);
          saveToLocal(merged);
          setServerTs();
        }
        // W przeciwnym razie: zostań przy lokalnych danych (są nowsze)

        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token]);

  // ── Aktualizuj dane i zapisz natychmiast na serwer ───────────
  const update = useCallback(async (patch) => {
    // 1. Zaktualizuj lokalnie natychmiast
    setData((prev) => {
      const next = { ...prev, ...patch };
      saveToLocal(next);  // zapisz z nowym timestampem
      return next;
    });

    // 2. Zapisz na serwer i potwierdź timestampem
    try {
      await patchUserData(tokenRef.current, patch);
      setServerTs();  // serwer ma aktualne dane
    } catch (err) {
      console.error("[Sync] Błąd zapisu:", err.message);
      // Dane są w localStorage — przy następnym starcie lokalny timestamp
      // jest nowszy niż serverTs, więc lokalne dane wygrają
    }
  }, []);

  return { data, update, loading };
}
