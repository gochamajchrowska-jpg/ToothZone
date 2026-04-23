// ============================================================
//  PreschoolPage.jsx — Przedszkole
//  Zakładki: Płatności (Iga) | Moje wydarzenia
// ============================================================

import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../App";
import AppLayout from "../components/AppLayout";
import PaymentModal from "../components/payments/PaymentModal";
import PaymentTable from "../components/payments/PaymentTable";
import EventModal   from "../components/payments/EventModal";
import { getPreschoolPayments, refreshPreschoolPayments } from "../api";
import { parseDate, isOverdue } from "../utils/dates";
import { getSchoolYear, parseAmount, getPaymentStatus } from "../utils/payments";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { usePaidSet } from "../hooks/usePaidSet";
import { STORAGE_KEYS } from "../utils/storage";
import "../styles/preschool.css";

export default function PreschoolPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("payments");

  // Płatności z backendu
  const [payments,      setPayments]      = useState([]);
  const [payLoading,    setPayLoading]    = useState(true);
  const [payRefreshing, setPayRefreshing] = useState(false);
  const [payError,      setPayError]      = useState("");
  const [payPage,       setPayPage]       = useState(1);

  // Płatności ręczne
  const [manualPayments, setManualPayments] = useLocalStorage(STORAGE_KEYS.preschoolManual, []);
  const [showPayModal,   setShowPayModal]   = useState(false);
  const [editPayment,    setEditPayment]    = useState(null);

  // Zapłacone
  const { paidIds, toggle: togglePaid } = usePaidSet(STORAGE_KEYS.preschoolPaid);

  // Własne wydarzenia
  const [events,      setEvents]      = useLocalStorage(STORAGE_KEYS.preschoolEvents, []);
  const [showEvModal, setShowEvModal] = useState(false);

  // ── Ładowanie ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPayLoading(true);
      try {
        const pays = await getPreschoolPayments(token);
        if (!cancelled) setPayments(pays);
      } catch (err) {
        if (!cancelled) setPayError(err.message);
      } finally {
        if (!cancelled) setPayLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleRefreshPayments() {
    setPayRefreshing(true); setPayError("");
    try { setPayments(await refreshPreschoolPayments(token)); setPayPage(1); }
    catch (err) { setPayError(err.message); }
    finally { setPayRefreshing(false); }
  }

  // ── Płatności ────────────────────────────────────────────────
  const sortedPayments = useMemo(() =>
    [...payments, ...manualPayments]
      .sort((a, b) => parseDate(b.termin) - parseDate(a.termin)),
  [payments, manualPayments]);

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

  // ── Własne wydarzenia ────────────────────────────────────────
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
          theme="preschool"
          onClose={() => setShowPayModal(false)}
          onSave={handleSavePayment}
        />
      )}
      {editPayment && (
        <PaymentModal
          existing={editPayment}
          theme="preschool"
          onClose={() => setEditPayment(null)}
          onSave={handleSavePayment}
        />
      )}
      {showEvModal && (
        <EventModal
          theme="preschool"
          onClose={() => setShowEvModal(false)}
          onSave={handleSaveEvent}
        />
      )}

      <section className="subpage-hero subpage-hero--preschool">
        <div className="dash-hero-badge">Sekcja</div>
        <h1 className="subpage-title">🧸 Przedszkole</h1>
        <p className="dash-tagline">Płatności i organizacja spraw przedszkolnych.</p>
      </section>

      {/* ── Zakładki ── */}
      <div className="school-tabs preschool-tabs">
        {[
          { id: "payments", label: "💳 Płatności",  count: payments.length },
          { id: "events",   label: "📌 Wydarzenia", count: events.length   },
        ].map(({ id, label, count }) => (
          <button key={id}
            className={`school-tab preschool-tab ${activeTab === id ? "preschool-tab--active" : ""}`}
            onClick={() => setActiveTab(id)}>
            {label}
            {count > 0 && (
              <span className={`tab-badge ${activeTab === id ? "" : "tab-badge--preschool"}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Płatności ── */}
      {activeTab === "payments" && (
        <section className="dash-section">
          <div className="messages-header">
            <h2 className="dash-section-title">
              💳 Płatności — Iga
              {currentYear && currentTotal != null && (
                <span className="pay-year-total pay-year-total--preschool">
                  rok {currentYear}: {currentTotal.toFixed(2).replace(".", ",")} zł
                </span>
              )}
            </h2>
            <div className="header-actions">
              <button className="btn-add btn-add--preschool" onClick={() => setShowPayModal(true)}>+ Dodaj</button>
              <button className="btn-refresh btn-refresh--preschool" onClick={handleRefreshPayments} disabled={payRefreshing}>
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
              theme="preschool"
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
              {events.length > 0 && (
                <span className="messages-count messages-count--preschool">{events.length}</span>
              )}
            </h2>
            <button className="btn-add btn-add--preschool" onClick={() => setShowEvModal(true)}>+ Dodaj</button>
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
