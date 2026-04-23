// ============================================================
//  Dashboard.jsx — Panel główny
//  Zakładki: Nadchodzące wydarzenia | Zobowiązania
// ============================================================

import React, { useState } from "react";
import AppLayout from "../components/AppLayout";
import ObligationsPage from "./ObligationsPage";

const UPCOMING_EVENTS = [
  { id: 1, title: "Zebranie rodziców",           date: "25 kwietnia 2026", category: "school",    icon: "📚" },
  { id: 2, title: "Bal przedszkolny",            date: "28 kwietnia 2026", category: "preschool", icon: "🎉" },
  { id: 3, title: "Wizyta u lekarza — Zosia",    date: "2 maja 2026",      category: "other",     icon: "🏥" },
  { id: 4, title: "Wycieczka szkolna do muzeum", date: "10 maja 2026",     category: "school",    icon: "🏛️" },
  { id: 5, title: "Opłata za przedszkole — maj", date: "5 maja 2026",      category: "preschool", icon: "💰" },
];

const CATEGORY_LABELS = { school: "Szkoła", preschool: "Przedszkole", other: "Inne" };

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("events");

  return (
    <AppLayout>
      <section className="dash-hero">
        <div className="dash-hero-badge">Panel główny</div>
        <h1 className="dash-welcome">Witaj w Tooth Zone 👋</h1>
        <p className="dash-tagline">
          Domowy budżet i organizacja rodziny — wszystko w jednym miejscu.
        </p>
      </section>

      {/* ── Zakładki ── */}
      <div className="school-tabs" style={{marginBottom: "24px"}}>
        <button
          className={`school-tab ${activeTab === "events" ? "school-tab--active" : ""}`}
          onClick={() => setActiveTab("events")}
        >
          📅 Nadchodzące wydarzenia
        </button>
        <button
          className={`school-tab ${activeTab === "obligations" ? "school-tab--active" : ""}`}
          onClick={() => setActiveTab("obligations")}
        >
          📋 Zobowiązania
        </button>
      </div>

      {/* ── Zakładka: Wydarzenia ── */}
      {activeTab === "events" && (
        <section className="dash-section">
          <h2 className="dash-section-title">📅 Nadchodzące wydarzenia</h2>
          <div className="events-list">
            {UPCOMING_EVENTS.map((event) => (
              <div key={event.id} className={`event-card event-card--${event.category}`}>
                <span className="event-icon">{event.icon}</span>
                <div className="event-info">
                  <div className="event-title">{event.title}</div>
                  <div className="event-date">{event.date}</div>
                </div>
                <span className={`event-badge event-badge--${event.category}`}>
                  {CATEGORY_LABELS[event.category]}
                </span>
              </div>
            ))}
          </div>
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
