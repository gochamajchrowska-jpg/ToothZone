// ============================================================
//  SchoolPage.jsx — Szkoła
//  Zakładki: Wiadomości | Płatności | Moje wydarzenia
// ============================================================

import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../App";
import AppLayout from "../components/AppLayout";
import PaymentModal from "../components/payments/PaymentModal";
import PaymentTable from "../components/payments/PaymentTable";
import EventModal   from "../components/payments/EventModal";
import { getSchoolMessages, refreshSchoolMessages, getSchoolPayments, refreshSchoolPayments } from "../api";
import { parseDate, isOverdue } from "../utils/dates";
import { getSchoolYear, parseAmount, getPaymentStatus } from "../utils/payments";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { usePaidSet } from "../hooks/usePaidSet";
import { STORAGE_KEYS } from "../utils/storage";
import "../styles/school.css";

const MSG_PAGE_SIZE = 10;

// ── Stronicowanie wiadomości ──────────────────────────────────
function getPageNumbers(current, total) {
  const pages = [];
  let start = Math.max(1, current - 2);
  let end   = Math.min(total, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);
  for (let i = start; i <= end; i++) pages.push(i);
  return pages;
}

// ── Główny komponent ──────────────────────────────────────────
export default function SchoolPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("messages");

  // Wiadomości
  const [messages,      setMessages]      = useState([]);
  const [msgLoading,    setMsgLoading]    = useState(true);
  const [msgRefreshing, setMsgRefreshing] = useState(false);
  const [msgError,      setMsgError]      = useState("");
  const [msgPage,       setMsgPage]       = useState(1);
  const [sortDir,       setSortDir]       = useState("desc");

  // Płatności z backendu
  const [payments,      setPayments]      = useState([]);
  const [payLoading,    setPayLoading]    = useState(true);
  const [payRefreshing, setPayRefreshing] = useState(false);
  const [payError,      setPayError]      = useState("");
  const [payPage,       setPayPage]       = useState(1);

  // Płatności ręczne
  const [manualPayments, setManualPayments] = useLocalStorage(STORAGE_KEYS.schoolManual, []);
  const [showPayModal,   setShowPayModal]   = useState(false);
  const [editPayment,    setEditPayment]    = useState(null);

  // Zapłacone
  const { paidIds, toggle: togglePaid } = usePaidSet(STORAGE_KEYS.schoolPaid);

  // Własne wydarzenia
  const [events,    setEvents]    = useLocalStorage(STORAGE_KEYS.schoolEvents, []);
  const [showEvModal, setShowEvModal] = useState(false);

  // ── Ładowanie danych ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMsgLoading(true);
      setPayLoading(true);
      try {
        const [msgs, pays] = await Promise.all([
          getSchoolMessages(token),
          getSchoolPayments(token),
        ]);
        if (!cancelled) { setMessages(msgs); setPayments(pays); }
      } catch (err) {
        if (!cancelled) setMsgError(err.message);
      } finally {
        if (!cancelled) { setMsgLoading(false); setPayLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // ── Odświeżanie ─────────────────────────────────────────────
  async function handleRefreshMessages() {
    setMsgRefreshing(true); setMsgError("");
    try { setMessages(await refreshSchoolMessages(token)); setMsgPage(1); }
    catch (err) { setMsgError(err.message); }
    finally { setMsgRefreshing(false); }
  }

  async function handleRefreshPayments() {
    setPayRefreshing(true); setPayError("");
    try { setPayments(await refreshSchoolPayments(token)); setPayPage(1); }
    catch (err) { setPayError(err.message); }
    finally { setPayRefreshing(false); }
  }

  // ── Wiadomości: sortowanie + stronicowanie ──────────────────
  const sortedMessages = useMemo(() =>
    [...messages].sort((a, b) => {
      const diff = parseDate(b.data) - parseDate(a.data);
      return sortDir === "desc" ? diff : -diff;
    }),
  [messages, sortDir]);

  const totalMsgPages   = Math.ceil(sortedMessages.length / MSG_PAGE_SIZE);
  const currentMessages = sortedMessages.slice(
    (msgPage - 1) * MSG_PAGE_SIZE,
    msgPage * MSG_PAGE_SIZE
  );

  // ── Płatności: połącz, sortuj ───────────────────────────────
  const sortedPayments = useMemo(() =>
    [...payments, ...manualPayments]
      .sort((a, b) => parseDate(b.termin) - parseDate(a.termin)),
  [payments, manualPayments]);

  // ── Suma roku szkolnego ─────────────────────────────────────
  const yearTotals = useMemo(() => {
    const totals = {};
    for (const p of sortedPayments) {
      const sy = getSchoolYear(p.miesiac);
      if (sy) totals[sy] = (totals[sy] || 0) + parseAmount(p.kwota);
    }
    return totals;
  }, [sortedPayments]);

  const currentYear  = sortedPayments[(payPage - 1) * 6]
    ? getSchoolYear(sortedPayments[(payPage - 1) * 6].miesiac)
    : null;
  const currentTotal = currentYear ? yearTotals[currentYear] : null;

  // ── Obsługa płatności ───────────────────────────────────────
  function handleSavePayment(payment) {
    setManualPayments((prev) => {
      const idx = prev.findIndex((p) => p.id === payment.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = payment; return next; }
      return [payment, ...prev];
    });
    setEditPayment(null);
  }

  function handleDeletePayment(id) {
    if (!window.confirm("Usunąć tę płatność?")) return;
    setManualPayments((prev) => prev.filter((p) => p.id !== id));
  }

  // ── Obsługa wydarzeń ────────────────────────────────────────
  const sortedEvents = useMemo(() =>
    [...events].sort((a, b) => parseDate(b.date) - parseDate(a.date)),
  [events]);

  function handleSaveEvent({ date, note }) {
    setEvents((prev) => [{ id: Date.now(), date, note }, ...prev]);
  }
  function handleDeleteEvent(id) {
    if (!window.confirm("Usunąć to wydarzenie?")) return;
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  const payStatus = (pay) => getPaymentStatus(pay, paidIds, isOverdue);

  return (
    <AppLayout>
      {showPayModal && (
        <PaymentModal
          onClose={() => setShowPayModal(false)}
          onSave={handleSavePayment}
        />
      )}
      {editPayment && (
        <PaymentModal
          existing={editPayment}
          onClose={() => setEditPayment(null)}
          onSave={handleSavePayment}
        />
      )}
      {showEvModal && (
        <EventModal
          onClose={() => setShowEvModal(false)}
          onSave={handleSaveEvent}
        />
      )}

      <section className="subpage-hero subpage-hero--school">
        <div className="dash-hero-badge">Sekcja</div>
        <h1 className="subpage-title">🎒 Szkoła</h1>
        <p className="dash-tagline">Wiadomości, płatności i organizacja spraw szkolnych.</p>
      </section>

      <div className="info-banner">
        ℹ️ Dane z e-dziennika niedostępne — szkoła używa nowego systemu eduVULCAN.
      </div>

      {/* ── Zakładki ── */}
      <div className="school-tabs">
        {[
          { id: "messages", label: "📬 Wiadomości", count: messages.length },
          { id: "payments", label: "💳 Płatności",  count: payments.length },
          { id: "events",   label: "📌 Wydarzenia", count: events.length   },
        ].map(({ id, label, count }) => (
          <button key={id}
            className={`school-tab ${activeTab === id ? "school-tab--active" : ""}`}
            onClick={() => setActiveTab(id)}>
            {label}
            {count > 0 && <span className="tab-badge">{count}</span>}
          </button>
        ))}
      </div>

      {/* ── Wiadomości ── */}
      {activeTab === "messages" && (
        <section className="dash-section">
          <div className="messages-header">
            <h2 className="dash-section-title">📬 Wiadomości z e-dziennika</h2>
            <button className="btn-refresh" onClick={handleRefreshMessages} disabled={msgRefreshing}>
              {msgRefreshing ? "⏳ Sprawdzam..." : "🔄 Odśwież"}
            </button>
          </div>

          {msgError   && <div className="vulcan-error-banner">⚠️ {msgError}</div>}
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
                        <button className="sort-btn" onClick={() => {
                          setSortDir((d) => d === "desc" ? "asc" : "desc");
                          setMsgPage(1);
                        }}>
                          Data <span className="sort-arrow">{sortDir === "desc" ? "↓" : "↑"}</span>
                        </button>
                      </th>
                      <th>Użytkownik</th>
                      <th>Temat</th>
                      <th>Link</th>
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
                    {(msgPage - 1) * MSG_PAGE_SIZE + 1}–{Math.min(msgPage * MSG_PAGE_SIZE, sortedMessages.length)} z {sortedMessages.length}
                  </span>
                  <div className="pagination-controls">
                    <button className="page-btn" onClick={() => setMsgPage(1)} disabled={msgPage === 1}>«</button>
                    <button className="page-btn" onClick={() => setMsgPage((p) => p - 1)} disabled={msgPage === 1}>‹</button>
                    {getPageNumbers(msgPage, totalMsgPages).map((p) => (
                      <button key={p}
                        className={`page-btn ${p === msgPage ? "page-btn--active" : ""}`}
                        onClick={() => setMsgPage(p)}>{p}</button>
                    ))}
                    <button className="page-btn" onClick={() => setMsgPage((p) => p + 1)} disabled={msgPage === totalMsgPages}>›</button>
                    <button className="page-btn" onClick={() => setMsgPage(totalMsgPages)} disabled={msgPage === totalMsgPages}>»</button>
                  </div>
                </div>
              )}
            </>
          ))}
        </section>
      )}

      {/* ── Płatności ── */}
      {activeTab === "payments" && (
        <section className="dash-section">
          <div className="messages-header">
            <h2 className="dash-section-title">
              💳 Płatności — Marcelina
              {currentYear && currentTotal != null && (
                <span className="pay-year-total">
                  rok {currentYear}: {currentTotal.toFixed(2).replace(".", ",")} zł
                </span>
              )}
            </h2>
            <div className="header-actions">
              <button className="btn-add" onClick={() => setShowPayModal(true)}>+ Dodaj</button>
              <button className="btn-refresh" onClick={handleRefreshPayments} disabled={payRefreshing}>
                {payRefreshing ? "⏳ Sprawdzam..." : "🔄 Odśwież"}
              </button>
            </div>
          </div>

          {payError   && <div className="vulcan-error-banner">⚠️ {payError}</div>}
          {payLoading && <div className="vulcan-loading"><span className="vulcan-spinner">⏳</span> Ładowanie płatności…</div>}

          {!payLoading && payments.length === 0 ? (
            <div className="messages-empty">
              <span>💳</span><p>Brak płatności.</p>
              <p className="messages-empty-hint">Kliknij „Odśwież" aby pobrać dane z maili.</p>
            </div>
          ) : !payLoading && (
            <PaymentTable
              payments={sortedPayments}
              page={payPage}
              onPageChange={setPayPage}
              paidIds={paidIds}
              onTogglePaid={togglePaid}
              onEdit={setEditPayment}
              onDelete={handleDeletePayment}
              getStatus={payStatus}
            />
          )}
        </section>
      )}

      {/* ── Własne wydarzenia ── */}
      {activeTab === "events" && (
        <section className="dash-section">
          <div className="messages-header">
            <h2 className="dash-section-title">
              📌 Moje wydarzenia
              {events.length > 0 && <span className="messages-count">{events.length}</span>}
            </h2>
            <button className="btn-add" onClick={() => setShowEvModal(true)}>+ Dodaj</button>
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
