// ── Pomocniki płatności ──────────────────────────────────────

/** Parsuje "151,05 zł" → 151.05 */
export function parseAmount(kwotaStr) {
  if (!kwotaStr || kwotaStr === "—") return 0;
  const num = parseFloat(
    kwotaStr.replace(/\s/g, "").replace("zł", "").replace(",", ".")
  );
  return isNaN(num) ? 0 : num;
}

const MONTH_NUMBERS = {
  stycze: 1, luty: 2, marzec: 3, kwiecie: 4, maj: 5, czerwiec: 6,
  lipiec: 7, sierpie: 8, wrzesie: 9, pa: 10, listopad: 11, grudzie: 12,
};

/**
 * Zwraca rok szkolny dla miesiąca płatności.
 * "kwiecień 2026" → "2025/2026"
 * Wrzesień–Grudzień: year/year+1, Styczeń–Sierpień: year-1/year
 */
export function getSchoolYear(miesiac) {
  if (!miesiac || miesiac === "—") return null;
  const lower = miesiac.toLowerCase();
  const yearMatch = lower.match(/(\d{4})/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1]);

  const monthNum = Object.entries(MONTH_NUMBERS).find(([key]) =>
    lower.includes(key)
  )?.[1];
  if (!monthNum) return null;

  return monthNum >= 9 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

/** Status płatności: "paid" | "overdue" | "ok" | "unknown" */
export function getPaymentStatus(pay, paidIds, isOverdueFn) {
  if (paidIds.has(pay.id)) return "paid";
  if (!pay.termin || pay.termin === "—") return "unknown";
  if (isOverdueFn(pay.termin)) return "overdue";
  return "ok";
}

/** Etykieta statusu po polsku */
export const STATUS_LABELS = {
  paid:    "✓ Zapłacona",
  overdue: "Po terminie",
  ok:      "W terminie",
  unknown: "—",
};
