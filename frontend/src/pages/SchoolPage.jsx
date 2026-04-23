// ============================================================
//  SchoolPage.jsx — Strona Szkoła
//  Zakładki: Wiadomości | Płatności | Moje wydarzenia
// ============================================================

import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../App";
import AppLayout from "../components/AppLayout";
import {
  getSchoolMessages, refreshSchoolMessages,
  getSchoolPayments, refreshSchoolPayments,
} from "../api";
import "../styles/school.css";

const PAGE_SIZE              = 10;
const PAY_PAGE_SIZE          = 6;
const EVENTS_STORAGE_KEY     = "tz_school_events";
const PAID_STORAGE_KEY       = "tz_paid_payments";
const MANUAL_PAYMENTS_KEY    = "tz_school_manual_payments"; // ręczne płatności

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

// ── Pomocnik: parsuje kwotę "151,05 zł" → liczba 151.05 ──────
function parseAmount(kwotaStr) {
  if (!kwotaStr || kwotaStr === "—") return 0;
  const clean = kwotaStr
    .replace(/\s/g, "")      // usuń spacje
    .replace("zł", "")       // usuń "zł"
    .replace(",", ".");       // zamień przecinek na kropkę
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

// ── Pomocnik: wyciągnij rok szkolny z miesiąca płatności ─────
// "kwiecień 2026" → rok szkolny 2025/2026 (wrz 2025 – sie 2026)
// Zwraca string "2025/2026" lub null jeśli nie da się określić
function getSchoolYear(miesiac) {
  if (!miesiac || miesiac === "—") return null;
  const months = {
    "stycze": 1, "styczeń": 1, "stycznia": 1,
    "luty": 2, "lutego": 2,
    "marzec": 3, "marca": 3,
    "kwiecie": 4, "kwiecień": 4, "kwietnia": 4,
    "maj": 5, "maja": 5,
    "czerwiec": 6, "czerwca": 6,
    "lipiec": 7, "lipca": 7,
    "sierpie": 8, "sierpień": 8, "sierpnia": 8,
    "wrzesie": 9, "wrzesień": 9, "września": 9,
    "pa": 10, "październik": 10, "października": 10,
    "listopad": 11, "listopada": 11,
    "grudzie": 12, "grudzień": 12, "grudnia": 12,
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

  // Wrzesień–Grudzień → rok szkolny year/year+1
  // Styczeń–Sierpień  → rok szkolny year-1/year
  if (monthNum >= 9) {
    return `${year}/${year + 1}`;
  } else {
    return `${year - 1}/${year}`;
  }
}

// ── Modal ręcznego dodawania płatności ───────────────────────
function AddPaymentModal({ onClose, onSave }) {
  const [miesiac, setMiesiac]   = useState("");
  const [kwota, setKwota]       = useState("");
  const [termin, setTermin]     = useState(todayIso());
  const [komentarz, setKomentarz] = useState("");
  const [error, setError]       = useState("");

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
      <div className="modal-box">
        <div className="modal-header">
          <h3 className="modal-title">💳 Dodaj płatność</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label htmlFor="pay-miesiac">Miesiąc</label>
            <input id="pay-miesiac" type="text" placeholder="np. maj 2026"
              value={miesiac} onChange={(e) => setMiesiac(e.target.value)} autoFocus />
          </div>
          <div className="modal-field">
            <label htmlFor="pay-kwota">Kwota (zł)</label>
            <input id="pay-kwota" type="text" placeholder="np. 151,05"
              value={kwota} onChange={(e) => setKwota(e.target.value)} />
          </div>
          <div className="modal-field">
            <label htmlFor="pay-termin">Termin płatności</label>
            <input id="pay-termin" type="date" value={termin}
              onChange={(e) => setTermin(e.target.value)} min="2020-01-01" max="2030-12-31" />
          </div>
          <div className="modal-field">
            <label htmlFor="pay-komentarz">
              Komentarz <span className="char-count">{komentarz.length}/200</span>
            </label>
            <textarea id="pay-komentarz" rows={2} maxLength={200}
              placeholder="Opcjonalny opis płatności"
              value={komentarz} onChange={(e) => setKomentarz(e.target.value)} />
          </div>
          {error && <p className="modal-error">⚠️ {error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Anuluj</button>
          <button className="btn-save" onClick={handleSave}>Zapisz</button>
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
      <div className="modal-box">
        <div className="modal-header">
          <h3 className="modal-title">📅 Dodaj wydarzenie</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label htmlFor="ev-date">Data</label>
            <input id="ev-date" type="date" value={date}
              onChange={(e) => setDate(e.target.value)} min="2020-01-01" max="2030-12-31" />
          </div>
          <div className="modal-field">
            <label htmlFor="ev-note">
              Notatka <span className="char-count">{note.length}/200</span>
            </label>
            <textarea id="ev-note" rows={3} maxLength={200}
              placeholder="Np. Zebranie rodziców o 17:00, sala 12"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="modal-error">⚠️ {error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Anuluj</button>
          <button className="btn-save" onClick={handleSave}>Zapisz</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Główny komponent
// ============================================================
export default function SchoolPage() {
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState("messages");

  // ── Wiadomości ────────────────────────────────────────────
  const [messages, setMessages]           = useState([]);
  const [msgLoading, setMsgLoading]       = useState(true);
  const [msgRefreshing, setMsgRefreshing] = useState(false);
  const [msgError, setMsgError]           = useState("");
  const [currentPage, setCurrentPage]     = useState(1);
  const [sortDir, setSortDir]             = useState("desc");

  // ── Płatności ─────────────────────────────────────────────
  const [payments, setPayments]             = useState([]);
  const [payLoading, setPayLoading]         = useState(true);
  const [payRefreshing, setPayRefreshing]   = useState(false);
  const [payError, setPayError]             = useState("");
  const [payPage, setPayPage]               = useState(1);

  // Zapłacone ID — trwałe w localStorage
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

  // ── Ręczne płatności — trwałe w localStorage ─────────────
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
    // Automatycznie oznacz jako zapłacona
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
    async function loadAll() {
      setMsgLoading(true);
      setPayLoading(true);
      try { setMessages(await getSchoolMessages(token)); }
      catch (err) { setMsgError(err.message); }
      finally { setMsgLoading(false); }
      try { setPayments(await getSchoolPayments(token)); }
      catch (err) { setPayError(err.message); }
      finally { setPayLoading(false); }
    }
    loadAll();
  }, [token]);

  async function handleRefreshMessages() {
    setMsgRefreshing(true); setMsgError("");
    try { const d = await refreshSchoolMessages(token); setMessages(d); setCurrentPage(1); }
    catch (err) { setMsgError(err.message); }
    finally { setMsgRefreshing(false); }
  }

  async function handleRefreshPayments() {
    setPayRefreshing(true); setPayError("");
    try { setPayments(await refreshSchoolPayments(token)); setPayPage(1); }
    catch (err) { setPayError(err.message); }
    finally { setPayRefreshing(false); }
  }

  // ── Wiadomości: sortowanie i stronicowanie ────────────────
  const sortedMessages = useMemo(() => [...messages].sort((a, b) => {
    const dA = parseDate(a.data), dB = parseDate(b.data);
    return sortDir === "desc" ? dB - dA : dA - dB;
  }), [messages, sortDir]);

  const totalMsgPages   = Math.ceil(sortedMessages.length / PAGE_SIZE);
  const currentMessages = sortedMessages.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function goToPage(page) {
    if (page < 1 || page > totalMsgPages) return;
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function getMsgPageNumbers() {
    const pages = [];
    let start = Math.max(1, currentPage - 2);
    let end   = Math.min(totalMsgPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  // ── Płatności: połącz z ręcznymi i sortuj ───────────────────
  const sortedPayments = useMemo(() => {
    const all = [...payments, ...manualPayments];
    return all.sort((a, b) => parseDate(b.termin) - parseDate(a.termin));
  }, [payments, manualPayments]);

  // Stronicowanie płatności (6 na stronę = 6 ostatnich miesięcy)
  const totalPayPages   = Math.ceil(sortedPayments.length / PAY_PAGE_SIZE);
  const payStartIndex   = (payPage - 1) * PAY_PAGE_SIZE;
  const currentPayments = sortedPayments.slice(payStartIndex, payStartIndex + PAY_PAGE_SIZE);

  function goToPayPage(page) {
    if (page < 1 || page > totalPayPages) return;
    setPayPage(page);
  }

  // ── Suma płatności per rok szkolny ────────────────────────
  // Grupuje wszystkie płatności według roku szkolnego i liczy sumę
  const schoolYearTotals = useMemo(() => {
    const totals = {};
    for (const pay of sortedPayments) {
      const sy = getSchoolYear(pay.miesiac);
      if (!sy) continue;
      if (!totals[sy]) totals[sy] = 0;
      totals[sy] += parseAmount(pay.kwota);
    }
    return totals; // np. { "2025/2026": 905.73, "2024/2025": 1200.00 }
  }, [sortedPayments]);

  // Aktualny rok szkolny widocznych płatności (pierwsza strona = najnowszy)
  const currentSchoolYear = useMemo(() => {
    if (currentPayments.length === 0) return null;
    return getSchoolYear(currentPayments[0].miesiac);
  }, [currentPayments]);

  const currentYearTotal = currentSchoolYear ? schoolYearTotals[currentSchoolYear] : null;

  // ── Pomocniki statusu płatności ───────────────────────────
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
      <section className="subpage-hero subpage-hero--school">
        <div className="dash-hero-badge">Sekcja</div>
        <h1 className="subpage-title">🎒 Szkoła</h1>
        <p className="dash-tagline">Wiadomości, płatności i organizacja spraw szkolnych.</p>
      </section>

      <div className="info-banner">
        ℹ️ Dane z e-dziennika niedostępne — Twoja szkoła używa nowego systemu eduVULCAN, który nie jest jeszcze obsługiwany.
      </div>

      {/* ── Zakładki ── */}
      <div className="school-tabs">
        <button className={`school-tab ${activeTab === "messages" ? "school-tab--active" : ""}`}
          onClick={() => setActiveTab("messages")}>
          📬 Wiadomości
          {messages.length > 0 && <span className="tab-badge">{messages.length}</span>}
        </button>
        <button className={`school-tab ${activeTab === "payments" ? "school-tab--active" : ""}`}
          onClick={() => setActiveTab("payments")}>
          💳 Płatności
          {payments.length > 0 && <span className="tab-badge">{payments.length}</span>}
        </button>
        <button className={`school-tab ${activeTab === "events" ? "school-tab--active" : ""}`}
          onClick={() => setActiveTab("events")}>
          📌 Moje wydarzenia
          {events.length > 0 && <span className="tab-badge">{events.length}</span>}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════
          ZAKŁADKA: WIADOMOŚCI
      ═══════════════════════════════════════════════════════ */}
      {activeTab === "messages" && (
        <section className="dash-section">
          <div className="messages-header">
            <h2 className="dash-section-title">📬 Wiadomości z e-dziennika</h2>
            <button className="btn-refresh" onClick={handleRefreshMessages} disabled={msgRefreshing}>
              {msgRefreshing ? "⏳ Sprawdzam..." : "🔄 Odśwież"}
            </button>
          </div>

          {msgError && <div className="vulcan-error-banner">⚠️ {msgError}</div>}
          {msgLoading && <div className="vulcan-loading"><span className="vulcan-spinner">⏳</span> Ładowanie…</div>}

          {!msgLoading && (messages.length === 0 ? (
            <div className="messages-empty">
              <span>📭</span><p>Brak wiadomości.</p>
              <p className="messages-empty-hint">Kliknij „Odśwież" aby sprawdzić skrzynkę.</p>
            </div>
          ) : (
            <>
              <div className="messages-table-wrap">
                <table className="messages-table">
                  <thead>
                    <tr>
                      <th>
                        <button className="sort-btn" onClick={() => { setSortDir(d => d === "desc" ? "asc" : "desc"); setCurrentPage(1); }}>
                          Data <span className="sort-arrow">{sortDir === "desc" ? "↓" : "↑"}</span>
                        </button>
                      </th>
                      <th>Użytkownik</th><th>Temat</th><th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMessages.map((msg) => (
                      <tr key={msg.id}>
                        <td className="msg-date">{msg.data}</td>
                        <td className="msg-user">{msg.uzytkownik}</td>
                        <td className="msg-topic">{msg.temat}</td>
                        <td className="msg-link">
                          <a href={msg.link} target="_blank" rel="noopener noreferrer"
                            className="btn-login-link">Zaloguj się →</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalMsgPages > 1 && (
                <div className="pagination">
                  <span className="pagination-info">
                    {(currentPage-1)*PAGE_SIZE+1}–{Math.min(currentPage*PAGE_SIZE, sortedMessages.length)} z {sortedMessages.length}
                  </span>
                  <div className="pagination-controls">
                    <button className="page-btn" onClick={() => goToPage(1)} disabled={currentPage===1}>«</button>
                    <button className="page-btn" onClick={() => goToPage(currentPage-1)} disabled={currentPage===1}>‹</button>
                    {getMsgPageNumbers().map(p => (
                      <button key={p} className={`page-btn ${p===currentPage?"page-btn--active":""}`} onClick={() => goToPage(p)}>{p}</button>
                    ))}
                    <button className="page-btn" onClick={() => goToPage(currentPage+1)} disabled={currentPage===totalMsgPages}>›</button>
                    <button className="page-btn" onClick={() => goToPage(totalMsgPages)} disabled={currentPage===totalMsgPages}>»</button>
                  </div>
                </div>
              )}
            </>
          ))}
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          ZAKŁADKA: PŁATNOŚCI
      ═══════════════════════════════════════════════════════ */}
      {activeTab === "payments" && (
        <section className="dash-section">
          <div className="messages-header">
            <h2 className="dash-section-title" style={{display:"flex", alignItems:"center", gap:"10px", flexWrap:"wrap"}}>
              💳 Płatności — Marcelina
              {/* Suma roku szkolnego w nawiasie przy nagłówku */}
              {currentSchoolYear && currentYearTotal !== null && (
                <span className="pay-year-total">
                  rok {currentSchoolYear}: {currentYearTotal.toFixed(2).replace(".", ",")} zł
                </span>
              )}
            </h2>
            <div style={{display:"flex", gap:"8px"}}>
              <button className="btn-add" onClick={() => setShowPaymentModal(true)}>+ Dodaj</button>
              <button className="btn-refresh" onClick={handleRefreshPayments} disabled={payRefreshing}>
                {payRefreshing ? "⏳ Sprawdzam..." : "🔄 Odśwież"}
              </button>
            </div>
          </div>

          {payError && <div className="vulcan-error-banner">⚠️ {payError}</div>}
          {payLoading && <div className="vulcan-loading"><span className="vulcan-spinner">⏳</span> Ładowanie płatności…</div>}

          {!payLoading && (payments.length === 0 ? (
            <div className="messages-empty">
              <span>💳</span><p>Brak płatności.</p>
              <p className="messages-empty-hint">Kliknij „Odśwież" aby pobrać dane z maili od oplaty@cui.wroclaw.pl</p>
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
                                className={`btn-mark-paid ${status === "paid" ? "btn-mark-paid--undo" : ""}`}
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

              {/* Stronicowanie płatności */}
              {totalPayPages > 1 && (
                <div className="pagination">
                  <span className="pagination-info">
                    Miesiące {payStartIndex + 1}–{Math.min(payStartIndex + PAY_PAGE_SIZE, sortedPayments.length)} z {sortedPayments.length}
                  </span>
                  <div className="pagination-controls">
                    <button className="page-btn" onClick={() => goToPayPage(1)} disabled={payPage === 1}>«</button>
                    <button className="page-btn" onClick={() => goToPayPage(payPage - 1)} disabled={payPage === 1}>‹</button>
                    {Array.from({ length: totalPayPages }, (_, i) => i + 1).map(p => (
                      <button key={p} className={`page-btn ${p === payPage ? "page-btn--active" : ""}`}
                        onClick={() => goToPayPage(p)}>{p}</button>
                    ))}
                    <button className="page-btn" onClick={() => goToPayPage(payPage + 1)} disabled={payPage === totalPayPages}>›</button>
                    <button className="page-btn" onClick={() => goToPayPage(totalPayPages)} disabled={payPage === totalPayPages}>»</button>
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
              {events.length > 0 && <span className="messages-count">{events.length}</span>}
            </h2>
            <button className="btn-add" onClick={() => setShowModal(true)}>+ Dodaj</button>
          </div>

          {sortedEvents.length === 0 ? (
            <div className="messages-empty">
              <span>📋</span><p>Brak wydarzeń.</p>
              <p className="messages-empty-hint">Kliknij „+ Dodaj" aby dodać zebranie lub notatkę.</p>
            </div>
          ) : (
            <div className="events-user-list">
              {sortedEvents.map((ev) => (
                <div key={ev.id} className="event-user-card">
                  <div className="event-user-date">{ev.date}</div>
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
