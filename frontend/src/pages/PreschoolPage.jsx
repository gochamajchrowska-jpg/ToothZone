// ============================================================
//  PreschoolPage.jsx — Strona Przedszkole
//  Zakładki: Płatności (Iga) | Moje wydarzenia
// ============================================================

import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../App";
import AppLayout from "../components/AppLayout";
import { getPreschoolPayments, refreshPreschoolPayments } from "../api";
import "../styles/preschool.css";

const PAY_PAGE_SIZE           = 6;
const EVENTS_STORAGE_KEY      = "tz_preschool_events";
const PAID_STORAGE_KEY        = "tz_preschool_paid_payments";
const MANUAL_PAYMENTS_KEY     = "tz_preschool_manual_payments";

// ── Pomocniki dat ────────────────────────────────────────────
function parseDate(dateStr) {
  if (!dateStr) return new Date(0);
  const [datePart, timePart = "00:00"] = dateStr.split(" ");
  const [day, month, year] = datePart.split(".");
  return new Date(`${year}-${month}-${day}T${timePart}`);
}
function formatDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}
function todayIso() {
  return new Date().toISOString().split("T")[0];
}

// ── Parsuje "151,05 zł" → 151.05 ────────────────────────────
function parseAmount(kwotaStr) {
  if (!kwotaStr || kwotaStr === "—") return 0;
  const num = parseFloat(
    kwotaStr.replace(/\s/g,"").replace("zł","").replace(",",".")
  );
  return isNaN(num) ? 0 : num;
}

// ── Wyznacz rok szkolny z miesiąca ───────────────────────────
function getSchoolYear(miesiac) {
  if (!miesiac || miesiac === "—") return null;
  const months = {
    "stycze":1,"styczeń":1,"luty":2,"lutego":2,"marzec":3,"marca":3,
    "kwiecie":4,"kwiecień":4,"maja":5,"maj":5,"czerwiec":6,"czerwca":6,
    "lipiec":7,"lipca":7,"sierpie":8,"sierpień":8,"sierpnia":8,
    "wrzesie":9,"wrzesień":9,"września":9,"pa":10,"październik":10,
    "listopada":11,"listopad":11,"grudzie":12,"grudzień":12,"grudnia":12,
  };
  const lower = miesiac.toLowerCase();
  const yearMatch = lower.match(/(\d{4})/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1]);
  let monthNum = null;
  for (const [key, num] of Object.entries(months)) {
    if (lower.includes(key)) { monthNum = num; break; }
  }
  if (!monthNum) return null;
  return monthNum >= 9 ? `${year}/${year+1}` : `${year-1}/${year}`;
}

// ── Modal ręcznego dodawania płatności ───────────────────────
function AddPaymentModal({ onClose, onSave }) {
  const [miesiac, setMiesiac]     = useState("");
  const [kwota, setKwota]         = useState("");
  const [termin, setTermin]       = useState(todayIso());
  const [komentarz, setKomentarz] = useState("");
  const [error, setError]         = useState("");

  function handleSave() {
    if (!miesiac.trim()) return setError("Wpisz nazwę miesiąca (np. maj 2026).");
    if (!kwota.trim())   return setError("Wpisz kwotę.");
    const kwotaNum = parseFloat(kwota.replace(",", "."));
    if (isNaN(kwotaNum) || kwotaNum <= 0) return setError("Podaj prawidłową kwotę.");
    onSave({
      id:        `manual_${Date.now()}`,
      miesiac:   miesiac.trim(),
      kwota:     kwotaNum.toFixed(2).replace(".", ",") + " zł",
      termin:    termin ? formatDate(termin) : "—",
      komentarz: komentarz.trim(),
      manual:    true,
    });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-box--preschool">
        <div className="modal-header">
          <h3 className="modal-title">💳 Dodaj płatność</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label htmlFor="ps-pay-miesiac">Miesiąc</label>
            <input id="ps-pay-miesiac" type="text" placeholder="np. maj 2026"
              value={miesiac} onChange={(e) => setMiesiac(e.target.value)} autoFocus />
          </div>
          <div className="modal-field">
            <label htmlFor="ps-pay-kwota">Kwota (zł)</label>
            <input id="ps-pay-kwota" type="text" placeholder="np. 463,68"
              value={kwota} onChange={(e) => setKwota(e.target.value)} />
          </div>
          <div className="modal-field">
            <label htmlFor="ps-pay-termin">Termin płatności</label>
            <input id="ps-pay-termin" type="date" value={termin}
              onChange={(e) => setTermin(e.target.value)} min="2020-01-01" max="2030-12-31" />
          </div>
          <div className="modal-field">
            <label htmlFor="ps-pay-komentarz">
              Komentarz <span className="char-count">{komentarz.length}/200</span>
            </label>
            <textarea id="ps-pay-komentarz" rows={2} maxLength={200}
              placeholder="Opcjonalny opis płatności"
              value={komentarz} onChange={(e) => setKomentarz(e.target.value)} />
          </div>
          {error && <p className="modal-error">⚠️ {error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Anuluj</button>
          <button className="btn-save btn-save--preschool" onClick={handleSave}>Zapisz</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal dodawania wydarzenia ────────────────────────────────
function AddEventModal({ onClose, onSave }) {
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  function handleSave() {
    if (!date)             return setError("Wybierz datę.");
    if (!note.trim())      return setError("Wpisz notatkę.");
    if (note.length > 200) return setError("Max 200 znaków.");
    onSave({ date: formatDate(date), note: note.trim() });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-box--preschool">
        <div className="modal-header">
          <h3 className="modal-title">📅 Dodaj wydarzenie</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label htmlFor="ps-date">Data</label>
            <input id="ps-date" type="date" value={date}
              onChange={(e) => setDate(e.target.value)} min="2020-01-01" max="2030-12-31" />
          </div>
          <div className="modal-field">
            <label htmlFor="ps-note">
              Notatka <span className="char-count">{note.length}/200</span>
            </label>
            <textarea id="ps-note" rows={3} maxLength={200}
              placeholder="Np. Bal karnawałowy o 10:00, strój wymagany"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="modal-error">⚠️ {error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Anuluj</button>
          <button className="btn-save btn-save--preschool" onClick={handleSave}>Zapisz</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Główny komponent
// ============================================================
export default function PreschoolPage() {
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState("payments");

  // ── Płatności ─────────────────────────────────────────────
  const [payments, setPayments]             = useState([]);
  const [payLoading, setPayLoading]         = useState(true);
  const [payRefreshing, setPayRefreshing]   = useState(false);
  const [payError, setPayError]             = useState("");
  const [payPage, setPayPage]               = useState(1);

  const [paidIds, setPaidIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(PAID_STORAGE_KEY) || "[]")); }
    catch { return new Set(); }
  });

  useEffect(() => {
    localStorage.setItem(PAID_STORAGE_KEY, JSON.stringify([...paidIds]));
  }, [paidIds]);

  function togglePaid(payId) {
    setPaidIds((prev) => {
      const next = new Set(prev);
      next.has(payId) ? next.delete(payId) : next.add(payId);
      return next;
    });
  }

  // ── Ręczne płatności ─────────────────────────────────────
  const [manualPayments, setManualPayments] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MANUAL_PAYMENTS_KEY) || "[]"); }
    catch { return []; }
  });
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    localStorage.setItem(MANUAL_PAYMENTS_KEY, JSON.stringify(manualPayments));
  }, [manualPayments]);

  function handleSaveManualPayment(payment) {
    setManualPayments((prev) => [payment, ...prev]);
    setPaidIds((prev) => { const next = new Set(prev); next.add(payment.id); return next; });
  }

  function handleDeleteManualPayment(id) {
    if (!window.confirm("Usunąć tę płatność?")) return;
    setManualPayments((prev) => prev.filter((p) => p.id !== id));
    setPaidIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  // ── Własne wydarzenia ─────────────────────────────────────
  const [events, setEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(EVENTS_STORAGE_KEY) || "[]"); }
    catch { return []; }
  });
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  // ── Ładowanie ─────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setPayLoading(true);
      try { setPayments(await getPreschoolPayments(token)); }
      catch (err) { setPayError(err.message); }
      finally { setPayLoading(false); }
    }
    load();
  }, [token]);

  async function handleRefreshPayments() {
    setPayRefreshing(true); setPayError("");
    try { setPayments(await refreshPreschoolPayments(token)); setPayPage(1); }
    catch (err) { setPayError(err.message); }
    finally { setPayRefreshing(false); }
  }

  // ── Sortowanie i stronicowanie płatności ──────────────────
  const sortedPayments = useMemo(() => {
    const all = [...payments, ...manualPayments];
    return all.sort((a, b) => parseDate(b.termin) - parseDate(a.termin));
  }, [payments, manualPayments]);

  const totalPayPages   = Math.ceil(sortedPayments.length / PAY_PAGE_SIZE);
  const payStartIndex   = (payPage - 1) * PAY_PAGE_SIZE;
  const currentPayments = sortedPayments.slice(payStartIndex, payStartIndex + PAY_PAGE_SIZE);

  function goToPayPage(page) {
    if (page < 1 || page > totalPayPages) return;
    setPayPage(page);
  }

  // ── Suma roku szkolnego ───────────────────────────────────
  const schoolYearTotals = useMemo(() => {
    const totals = {};
    for (const pay of sortedPayments) {
      const sy = getSchoolYear(pay.miesiac);
      if (!sy) continue;
      totals[sy] = (totals[sy] || 0) + parseAmount(pay.kwota);
    }
    return totals;
  }, [sortedPayments]);

  const currentSchoolYear = useMemo(() =>
    currentPayments.length > 0 ? getSchoolYear(currentPayments[0].miesiac) : null
  , [currentPayments]);

  const currentYearTotal = currentSchoolYear ? schoolYearTotals[currentSchoolYear] : null;

  // ── Status płatności ──────────────────────────────────────
  function isOverdue(terminStr) {
    if (!terminStr || terminStr === "—") return false;
    return parseDate(terminStr) < new Date();
  }
  function getPaymentStatus(pay) {
    if (paidIds.has(pay.id))    return "paid";
    if (pay.termin === "—")     return "unknown";
    if (isOverdue(pay.termin))  return "overdue";
    return "ok";
  }

  // ── Własne wydarzenia ─────────────────────────────────────
  function handleSaveEvent({ date, note }) {
    setEvents((prev) => [{ id: Date.now(), date, note }, ...prev]);
  }
  function handleDeleteEvent(id) {
    if (!window.confirm("Usunąć to wydarzenie?")) return;
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }
  const sortedEvents = useMemo(() =>
    [...events].sort((a, b) => parseDate(b.date) - parseDate(a.date))
  , [events]);

  return (
    <AppLayout>

      {showModal && (
        <AddEventModal onClose={() => setShowModal(false)} onSave={handleSaveEvent} />
      )}
      {showPaymentModal && (
        <AddPaymentModal onClose={() => setShowPaymentModal(false)} onSave={handleSaveManualPayment} />
      )}

      {/* ── Baner nagłówkowy ── */}
      <section className="subpage-hero subpage-hero--preschool">
        <div className="dash-hero-badge">Sekcja</div>
        <h1 className="subpage-title">🧸 Przedszkole</h1>
        <p className="dash-tagline">Płatności i organizacja spraw przedszkolnych.</p>
      </section>

      {/* ── Zakładki ── */}
      <div className="school-tabs preschool-tabs">
        <button
          className={`school-tab preschool-tab ${activeTab === "payments" ? "preschool-tab--active" : ""}`}
          onClick={() => setActiveTab("payments")}
        >
          💳 Płatności
          {payments.length > 0 && <span className="tab-badge tab-badge--preschool">{payments.length}</span>}
        </button>
        <button
          className={`school-tab preschool-tab ${activeTab === "events" ? "preschool-tab--active" : ""}`}
          onClick={() => setActiveTab("events")}
        >
          📌 Moje wydarzenia
          {events.length > 0 && <span className="tab-badge tab-badge--preschool">{events.length}</span>}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════
          ZAKŁADKA: PŁATNOŚCI
      ═══════════════════════════════════════════════════════ */}
      {activeTab === "payments" && (
        <section className="dash-section">
          <div className="messages-header">
            <h2 className="dash-section-title">
              💳 Płatności — Iga
              {currentSchoolYear && currentYearTotal !== null && (
                <span className="pay-year-total pay-year-total--preschool">
                  rok {currentSchoolYear}: {currentYearTotal.toFixed(2).replace(".", ",")} zł
                </span>
              )}
            </h2>
            <div style={{display:"flex", gap:"8px"}}>
              <button className="btn-add btn-add--preschool" onClick={() => setShowPaymentModal(true)}>+ Dodaj</button>
              <button className="btn-refresh btn-refresh--preschool"
                onClick={handleRefreshPayments} disabled={payRefreshing}>
                {payRefreshing ? "⏳ Sprawdzam..." : "🔄 Odśwież"}
              </button>
            </div>
          </div>

          {payError && <div className="vulcan-error-banner">⚠️ {payError}</div>}
          {payLoading && <div className="vulcan-loading"><span className="vulcan-spinner">⏳</span> Ładowanie płatności…</div>}

          {!payLoading && (payments.length === 0 ? (
            <div className="messages-empty">
              <span>💳</span><p>Brak płatności.</p>
              <p className="messages-empty-hint">
                Kliknij „Odśwież" aby pobrać dane z maili od oplaty@cui.wroclaw.pl
              </p>
            </div>
          ) : (
            <>
              <div className="messages-table-wrap">
                <table className="messages-table payments-table">
                  <thead>
                    <tr>
                      <th>Miesiąc</th>
                      <th>Kwota do zapłaty</th>
                      <th>Termin płatności</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPayments.map((pay) => {
                      const status = getPaymentStatus(pay);
                      return (
                        <tr key={pay.id} className={
                          status === "paid"    ? "row-paid" :
                          status === "overdue" ? "row-overdue" : ""
                        }>
                          <td className="pay-month">
                            {pay.miesiac}
                            {pay.manual && <span className="pay-manual-badge">ręczna</span>}
                            {pay.komentarz && <div className="pay-komentarz">{pay.komentarz}</div>}
                          </td>
                          <td className="pay-amount">{pay.kwota}</td>
                          <td className="pay-deadline">{pay.termin}</td>
                          <td className="pay-status-cell">
                            <span className={`pay-badge pay-badge--${status}`}>
                              {status === "paid"    ? "✓ Zapłacona" :
                               status === "overdue" ? "Po terminie" :
                               status === "ok"      ? "W terminie"  : "—"}
                            </span>
                            {pay.manual ? (
                              <button className="btn-delete" onClick={() => handleDeleteManualPayment(pay.id)} title="Usuń">🗑</button>
                            ) : (
                              <button
                                className={`btn-mark-paid btn-mark-paid--preschool ${status === "paid" ? "btn-mark-paid--undo" : ""}`}
                                onClick={() => togglePaid(pay.id)}
                                title={status === "paid" ? "Cofnij oznaczenie" : "Oznacz jako zapłaconą"}
                              >
                                {status === "paid" ? "Cofnij" : "Zapłać"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPayPages > 1 && (
                <div className="pagination">
                  <span className="pagination-info">
                    Miesiące {payStartIndex+1}–{Math.min(payStartIndex+PAY_PAGE_SIZE, sortedPayments.length)} z {sortedPayments.length}
                  </span>
                  <div className="pagination-controls">
                    <button className="page-btn" onClick={() => goToPayPage(1)} disabled={payPage===1}>«</button>
                    <button className="page-btn" onClick={() => goToPayPage(payPage-1)} disabled={payPage===1}>‹</button>
                    {Array.from({length: totalPayPages},(_,i)=>i+1).map(p => (
                      <button key={p} className={`page-btn ${p===payPage?"page-btn--active":""}`}
                        onClick={() => goToPayPage(p)}>{p}</button>
                    ))}
                    <button className="page-btn" onClick={() => goToPayPage(payPage+1)} disabled={payPage===totalPayPages}>›</button>
                    <button className="page-btn" onClick={() => goToPayPage(totalPayPages)} disabled={payPage===totalPayPages}>»</button>
                  </div>
                </div>
              )}
            </>
          ))}
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          ZAKŁADKA: MOJE WYDARZENIA
      ═══════════════════════════════════════════════════════ */}
      {activeTab === "events" && (
        <section className="dash-section">
          <div className="messages-header">
            <h2 className="dash-section-title">
              📌 Moje wydarzenia
              {events.length > 0 && (
                <span className="messages-count messages-count--preschool">{events.length}</span>
              )}
            </h2>
            <button className="btn-add btn-add--preschool" onClick={() => setShowModal(true)}>
              + Dodaj
            </button>
          </div>

          {sortedEvents.length === 0 ? (
            <div className="messages-empty">
              <span>📋</span><p>Brak wydarzeń.</p>
              <p className="messages-empty-hint">Kliknij „+ Dodaj" aby zapisać zajęcia lub notatkę.</p>
            </div>
          ) : (
            <div className="events-user-list">
              {sortedEvents.map((ev) => (
                <div key={ev.id} className="event-user-card event-user-card--preschool">
                  <div className="event-user-date event-user-date--preschool">{ev.date}</div>
                  <div className="event-user-note">{ev.note}</div>
                  <button className="btn-delete" onClick={() => handleDeleteEvent(ev.id)} title="Usuń">🗑</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

    </AppLayout>
  );
}
