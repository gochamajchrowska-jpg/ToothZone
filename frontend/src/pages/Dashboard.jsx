// ============================================================
//  Dashboard.jsx — Panel główny
//  Zakładki: Nadchodzące wydarzenia | Zobowiązania
// ============================================================

import React, { useState, useMemo } from "react";
import AppLayout from "../components/AppLayout";
import ObligationsPage from "./ObligationsPage";
import { useAuth } from "../App";
import { useServerSync } from "../hooks/useServerSync";
import { parseDate, formatDate, toIsoDate, todayIso } from "../utils/dates";

const CATEGORY_LABELS = { school: "Szkoła", preschool: "Przedszkole", other: "Inne" };
const CATEGORY_ICONS  = { school: "🎒", preschool: "🧸", other: "📌" };

// ── Modal dodaj/edytuj wydarzenie ────────────────────────────
function EventModal({ onClose, onSave, existing }) {
  const [title,    setTitle]    = useState(existing?.title    || "");
  const [date,     setDate]     = useState(existing ? toIsoDate(existing.date) : todayIso());
  const [category, setCategory] = useState(existing?.category || "other");
  const [note,     setNote]     = useState(existing?.note     || "");
  const [error,    setError]    = useState("");

  function handleSave() {
    if (!title.trim()) return setError("Wpisz tytuł wydarzenia.");
    if (!date)         return setError("Wybierz datę.");
    onSave({
      id:       existing?.id || `dev_${Date.now()}`,
      title:    title.trim(),
      date:     formatDate(date),
      category,
      note:     note.trim(),
      source:   "dashboard",
    });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h3 className="modal-title">
            {existing ? "✏️ Edytuj wydarzenie" : "📅 Dodaj wydarzenie"}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label>Tytuł</label>
            <input type="text" placeholder="np. Zebranie rodziców"
              value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="modal-field">
            <label>Data</label>
            <input type="date" value={date}
              onChange={(e) => setDate(e.target.value)}
              min="2020-01-01" max="2035-12-31" />
          </div>
          <div className="modal-field">
            <label>Kategoria</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="school">🎒 Szkoła</option>
              <option value="preschool">🧸 Przedszkole</option>
              <option value="other">📌 Inne</option>
            </select>
          </div>
          <div className="modal-field">
            <label>Notatka (opcjonalnie) <span className="char-count">{note.length}/200</span></label>
            <textarea rows={2} maxLength={200} placeholder="Dodatkowe informacje"
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

// ── Karta wydarzenia ──────────────────────────────────────────
function EventCard({ event, onEdit, onDelete }) {
  const isPast = parseDate(event.date) < new Date();
  return (
    <div className={`event-card event-card--${event.category} ${isPast ? "event-card--past" : ""}`}>
      <span className="event-icon">
        {event.source === "school"     ? "🎒" :
         event.source === "preschool"  ? "🧸" :
         CATEGORY_ICONS[event.category] || "📌"}
      </span>
      <div className="event-info">
        <div className="event-title">{event.title}</div>
        <div className="event-date">{event.date}</div>
        {event.note && <div className="event-note">{event.note}</div>}
      </div>
      <div className="event-card-actions">
        <span className={`event-badge event-badge--${event.category}`}>
          {CATEGORY_LABELS[event.category] || "Inne"}
        </span>
        {event.source === "dashboard" && (
          <>
            <button className="btn-view-schedule" onClick={() => onEdit(event)} title="Edytuj">✏️</button>
            <button className="btn-delete" onClick={() => onDelete(event.id)} title="Usuń">🗑</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Główny komponent ──────────────────────────────────────────
export default function Dashboard() {
  const { token } = useAuth();
  const { data: syncData, update: syncUpdate } = useServerSync(token);

  const [activeTab,  setActiveTab]  = useState("events");
  const [showModal,  setShowModal]  = useState(false);
  const [editEvent,  setEditEvent]  = useState(null);

  // Własne wydarzenia z dashboardu
  const dashEvents = syncData?.dashEvents || [];

  // Wydarzenia ze szkoły i przedszkola
  const schoolEvents    = (syncData?.schoolEvents    || []).map((e) => ({
    ...e, category: "school", source: "school",
    title: e.note || "Wydarzenie szkolne",
  }));
  const preschoolEvents = (syncData?.preschoolEvents || []).map((e) => ({
    ...e, category: "preschool", source: "preschool",
    title: e.note || "Wydarzenie przedszkolne",
  }));

  // Połącz i posortuj od najbliższego
  const allEvents = useMemo(() => {
    const all = [...dashEvents, ...schoolEvents, ...preschoolEvents];
    return all.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  }, [syncData]);

  // Podziel na nadchodzące i minione
  const upcoming = allEvents.filter((e) => parseDate(e.date) >= new Date(new Date().setHours(0,0,0,0)));
  const past     = allEvents.filter((e) => parseDate(e.date) <  new Date(new Date().setHours(0,0,0,0)));

  function handleSaveEvent(event) {
    const next = dashEvents.findIndex((e) => e.id === event.id) >= 0
      ? dashEvents.map((e) => e.id === event.id ? event : e)
      : [event, ...dashEvents];
    syncUpdate({ dashEvents: next });
    setEditEvent(null);
  }

  function handleDeleteEvent(id) {
    if (!window.confirm("Usunąć to wydarzenie?")) return;
    syncUpdate({ dashEvents: dashEvents.filter((e) => e.id !== id) });
  }

  return (
    <AppLayout>
      {showModal && (
        <EventModal
          onClose={() => setShowModal(false)}
          onSave={handleSaveEvent}
        />
      )}
      {editEvent && (
        <EventModal
          existing={editEvent}
          onClose={() => setEditEvent(null)}
          onSave={handleSaveEvent}
        />
      )}

      <section className="dash-hero">
        <div className="dash-hero-badge">Panel główny</div>
        <h1 className="dash-welcome">Witaj w Tooth Zone 👋</h1>
        <p className="dash-tagline">Domowy budżet i organizacja rodziny.</p>
      </section>

      {/* ── Zakładki ── */}
      <div className="school-tabs" style={{ marginBottom: "24px" }}>
        <button
          className={`school-tab ${activeTab === "events" ? "school-tab--active" : ""}`}
          onClick={() => setActiveTab("events")}>
          📅 Nadchodzące wydarzenia
          {upcoming.length > 0 && <span className="tab-badge">{upcoming.length}</span>}
        </button>
        <button
          className={`school-tab ${activeTab === "obligations" ? "school-tab--active" : ""}`}
          onClick={() => setActiveTab("obligations")}>
          📋 Zobowiązania
        </button>
      </div>

      {/* ── Zakładka: Wydarzenia ── */}
      {activeTab === "events" && (
        <section className="dash-section">
          <div className="messages-header">
            <h2 className="dash-section-title">📅 Nadchodzące wydarzenia</h2>
            <button className="btn-add" onClick={() => setShowModal(true)}>+ Dodaj</button>
          </div>

          {upcoming.length === 0 && past.length === 0 ? (
            <div className="messages-empty">
              <span>📅</span>
              <p>Brak wydarzeń.</p>
              <p className="messages-empty-hint">Kliknij „+ Dodaj" aby dodać wydarzenie lub dodaj je w zakładce Szkoła / Przedszkole.</p>
            </div>
          ) : (
            <>
              {upcoming.length > 0 && (
                <div className="events-list">
                  {upcoming.map((event) => (
                    <EventCard key={event.id}
                      event={event}
                      onEdit={setEditEvent}
                      onDelete={handleDeleteEvent}
                    />
                  ))}
                </div>
              )}

              {past.length > 0 && (
                <>
                  <h3 className="dash-section-subtitle">Minione</h3>
                  <div className="events-list events-list--past">
                    {past.slice(0, 5).map((event) => (
                      <EventCard key={event.id}
                        event={event}
                        onEdit={setEditEvent}
                        onDelete={handleDeleteEvent}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}

      {/* ── Zakładka: Zobowiązania ── */}
      {activeTab === "obligations" && (
        <section className="dash-section">
          <ObligationsPage />
        </section>
      )}
    </AppLayout>
  );
}
