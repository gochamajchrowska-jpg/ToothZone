// ── Pomocniki dat ────────────────────────────────────────────

/** Parsuje "dd.mm.yyyy HH:MM" lub "dd.mm.yyyy" → Date */
export function parseDate(dateStr) {
  if (!dateStr || dateStr === "—") return new Date(0);
  const [datePart, timePart = "00:00"] = dateStr.split(" ");
  const [day, month, year] = datePart.split(".");
  if (!day || !month || !year) return new Date(0);
  return new Date(`${year}-${month}-${day}T${timePart}`);
}

/** Formatuje "yyyy-mm-dd" → "dd.mm.yyyy" */
export function formatDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

/** Konwertuje "dd.mm.yyyy" → "yyyy-mm-dd" (dla input[type=date]) */
export function toIsoDate(dateStr) {
  if (!dateStr || dateStr === "—") return todayIso();
  const parts = dateStr.split(".");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return todayIso();
}

/** Dzisiejsza data w formacie "yyyy-mm-dd" */
export function todayIso() {
  return new Date().toISOString().split("T")[0];
}

/** Czy termin płatności minął? */
export function isOverdue(terminStr) {
  if (!terminStr || terminStr === "—") return false;
  return parseDate(terminStr) < new Date();
}
