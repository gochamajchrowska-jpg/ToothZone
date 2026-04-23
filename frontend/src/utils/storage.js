// ── Helpers localStorage ─────────────────────────────────────

export function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

export function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* quota exceeded — ignoruj */ }
}

export function loadSet(key) {
  return new Set(loadJson(key, []));
}

export function saveSet(key, set) {
  saveJson(key, [...set]);
}

// ── Klucze localStorage ──────────────────────────────────────
export const STORAGE_KEYS = {
  token:               "tz_token",
  email:               "tz_email",
  schoolPaid:          "tz_paid_payments",
  preschoolPaid:       "tz_preschool_paid_payments",
  oblPaid:             "tz_obl_paid",
  schoolEvents:        "tz_school_events",
  preschoolEvents:     "tz_preschool_events",
  schoolManual:        "tz_school_manual_payments",
  preschoolManual:     "tz_preschool_manual_payments",
  oblManual:           "tz_obligations_manual",
  oblSchedule:         "tz_obligations_schedule",
};
