// ============================================================
//  Dashboard.jsx — Panel główny
// ============================================================

import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import ObligationsPage from "./ObligationsPage";
import LeapmotorPage from "./LeapmotorPage";
import { useAuth } from "../App";
import { useServerSync } from "../hooks/useServerSync";
import { parseDate, formatDate, toIsoDate, todayIso } from "../utils/dates";

const CATEGORY_LABELS = { school: "Szkoła", preschool: "Przedszkole", other: "Inne" };
const CATEGORY_ICONS  = { school: "🎒", preschool: "🧸", other: "📌" };

function EventModal({ onClose, onSave, existing }) {
  const [title,    setTitle]    = useState(existing?.title    || "");
  const [date,     setDate]     = useState(existing ? toIsoDate(existing.date) : todayIso());
  const [category, setCategory] = useState(existing?.category || "other");
  const [note,     setNote]     = useState(existing?.note     || "");
  const [error,    setError]    = useState("");

  function handleSave() {
    if (!title.trim()) return setError("Wpisz tytuł.");
    if (!date)         return setError("Wybierz datę.");
    onSave({ id: existing?.id || `dev_${Date.now()}`, title: title.trim(), date: formatDate(date), category, note: note.trim(), source: "dashboard" });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h3 className="modal-title">{existing ? "✏️ Edytuj" : "📅 Dodaj wydarzenie"}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field"><label>Tytuł</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="np. Zebranie rodziców" />
          </div>
          <div className="modal-field"><label>Data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min="2020-01-01" max="2035-12-31" />
          </div>
          <div className="modal-field"><label>Kategoria</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="school">🎒 Szkoła</option>
              <option value="preschool">🧸 Przedszkole</option>
              <option value="other">📌 Inne</option>
            </select>
          </div>
          <div className="modal-field">
            <label>Notatka <span className="char-count">{note.length}/200</span></label>
            <textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
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

function EventCard({ event, onEdit, onDelete }) {
  const isPast = parseDate(event.date) < new Date();
  return (
    <div className={`event-card event-card--${event.category} ${isPast ? "event-card--past" : ""}`}>
      <span className="event-icon">{event.source === "school" ? "🎒" : event.source === "preschool" ? "🧸" : CATEGORY_ICONS[event.category] || "📌"}</span>
      <div className="event-info">
        <div className="event-title">{event.title}</div>
        <div className="event-date">{event.date}</div>
        {event.note && <div className="event-note">{event.note}</div>}
      </div>
      <div className="event-card-actions">
        <span className={`event-badge event-badge--${event.category}`}>{CATEGORY_LABELS[event.category] || "Inne"}</span>
        {event.source === "dashboard" && (
          <>
            <button className="btn-view-schedule" onClick={() => onEdit(event)}>✏️</button>
            <button className="btn-delete" onClick={() => onDelete(event.id)}>🗑</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Karty nawigacji na dashboardzie ──────────────────────────
const NAV_CARDS = [
  { id: "events",      icon: "📅", label: "Nadchodzące\nwydarzenia",  color: "#4a90c4", bg: "#dceef8" },
  { id: "obligations", icon: "📋", label: "Zobowiązania",             color: "#e89c3a", bg: "#fef3e2" },
  { id: "leapmotor",   icon: "⚡", label: "Leapmotor",                color: "#2c5364", bg: "#e8f4f8" },
];

export default function Dashboard() {
  const { token } = useAuth();
  const { data: syncData, update: syncUpdate } = useServerSync(token);

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(null); // null = pokaż karty
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState(null);

  const dashEvents     = syncData?.dashEvents     || [];
  const schoolEvents   = (syncData?.schoolEvents   || []).map((e) => ({ ...e, category: "school",    source: "school",    title: e.note || "Wydarzenie szkolne" }));
  const preschoolEvents= (syncData?.preschoolEvents|| []).map((e) => ({ ...e, category: "preschool", source: "preschool", title: e.note || "Wydarzenie przedszkolne" }));

  const allEvents = useMemo(() => {
    return [...dashEvents, ...schoolEvents, ...preschoolEvents].sort((a, b) => parseDate(a.date) - parseDate(b.date));
  }, [syncData]);

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
      {showModal && <EventModal onClose={() => setShowModal(false)} onSave={handleSaveEvent} />}
      {editEvent && <EventModal existing={editEvent} onClose={() => setEditEvent(null)} onSave={handleSaveEvent} />}

      {/* ── Strona główna: karty nawigacji ── */}
      {!activeTab && (
        <div className="dash-nav-cards">
          {NAV_CARDS.map((card) => (
            <button
              key={card.id}
              className="dash-nav-card"
              style={{"--card-color": card.color, "--card-bg": card.bg}}
              onClick={() => {
                if (card.id === "school") navigate("/school");
                else if (card.id === "preschool") navigate("/preschool");
                else setActiveTab(card.id);
              }}
            >
              <span className="dash-nav-card-icon">{card.icon}</span>
              <span className="dash-nav-card-label">{card.label}</span>
              {card.id === "events" && upcoming.length > 0 && (
                <span className="dash-nav-card-badge">{upcoming.length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Widok aktywnej zakładki ── */}
      {activeTab && (
        <>
          {/* Przycisk powrotu */}
          <button className="dash-back-btn" onClick={() => setActiveTab(null)}>
            ← Powrót
          </button>

          {activeTab === "events" && (
            <section className="dash-section">
              <div className="messages-header">
                <h2 className="dash-section-title">📅 Nadchodzące wydarzenia</h2>
                <button className="btn-add" onClick={() => setShowModal(true)}>+ Dodaj</button>
              </div>
              {upcoming.length === 0 && past.length === 0 ? (
                <div className="messages-empty">
                  <span>📅</span><p>Brak wydarzeń.</p>
                  <p className="messages-empty-hint">Kliknij „+ Dodaj" aby dodać wydarzenie.</p>
                </div>
              ) : (
                <>
                  {upcoming.length > 0 && (
                    <div className="events-list">
                      {upcoming.map((event) => (
                        <EventCard key={event.id} event={event} onEdit={setEditEvent} onDelete={handleDeleteEvent} />
                      ))}
                    </div>
                  )}
                  {past.length > 0 && (
                    <>
                      <h3 className="dash-section-subtitle">Minione</h3>
                      <div className="events-list events-list--past">
                        {past.slice(0, 5).map((event) => (
                          <EventCard key={event.id} event={event} onEdit={setEditEvent} onDelete={handleDeleteEvent} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          )}

          {activeTab === "obligations" && (
            <section className="dash-section"><ObligationsPage /></section>
          )}

          {activeTab === "leapmotor" && (
            <section className="dash-section"><LeapmotorPage /></section>
          )}
        </>
      )}
    </AppLayout>
  );
}
