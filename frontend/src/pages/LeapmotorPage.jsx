// ============================================================
//  LeapmotorPage.jsx — Ładowania samochodu Leapmotor C10
// ============================================================

import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../App";
import { getLeapmotorSessions, refreshLeapmotorSessions, getGreenwaySessions, refreshGreenwaySessions } from "../api";
import { useServerSync } from "../hooks/useServerSync";
import { todayIso, formatDate, toIsoDate } from "../utils/dates";
import "../styles/leapmotor.css";

// ── Modal edycji sesji ────────────────────────────────────────
function EditSessionModal({ session, onClose, onSave }) {
  const [date,        setDate]        = useState(session.date ? toIsoDate(session.date) : todayIso());
  const [timeStart,   setTimeStart]   = useState(session.time_start  || "");
  const [levelStart,  setLevelStart]  = useState(session.level_start != null ? String(session.level_start) : "");
  const [timeEnd,     setTimeEnd]     = useState(session.time_end    || "");
  const [levelEnd,    setLevelEnd]    = useState(session.level_end   != null ? String(session.level_end)   : "");
  const [error,       setError]       = useState("");

  function handleSave() {
    const ls = levelStart !== "" ? parseInt(levelStart) : null;
    const le = levelEnd   !== "" ? parseInt(levelEnd)   : null;
    if (ls !== null && (isNaN(ls) || ls < 0 || ls > 100)) return setError("Poziom start: 0–100.");
    if (le !== null && (isNaN(le) || le < 0 || le > 100)) return setError("Poziom koniec: 0–100.");
    onSave({
      ...session,
      date:        formatDate(date),
      time_start:  timeStart  || null,
      level_start: ls,
      time_end:    timeEnd    || null,
      level_end:   le,
    });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h3 className="modal-title">⚡ Edytuj sesję ładowania</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label>Data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              min="2024-01-01" max="2035-12-31" />
          </div>
          <div className="lp-row">
            <div className="modal-field">
              <label>Czas rozpoczęcia</label>
              <input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Poziom start (%)</label>
              <input type="number" min="0" max="100" placeholder="np. 15"
                value={levelStart} onChange={(e) => setLevelStart(e.target.value)} />
            </div>
          </div>
          <div className="lp-row">
            <div className="modal-field">
              <label>Czas zakończenia</label>
              <input type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Poziom koniec (%)</label>
              <input type="number" min="0" max="100" placeholder="np. 99"
                value={levelEnd} onChange={(e) => setLevelEnd(e.target.value)} />
            </div>
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

// ── Oblicz koszt ──────────────────────────────────────────────
const COST_PER_PERCENT = 0.284; // zł za każdy % naładowania

function calcCost(session) {
  if (session.level_start == null || session.level_end == null) return null;
  const diff = session.level_end - session.level_start;
  return diff > 0 ? +(diff * COST_PER_PERCENT).toFixed(2) : null;
}

// ── Główny komponent ──────────────────────────────────────────
export default function LeapmotorPage() {
  const { token } = useAuth();

  const [sessions,    setSessions]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState("");
  const [editSession, setEditSession] = useState(null);
  const [page,        setPage]        = useState(1);
  const [gwPage,      setGwPage]      = useState(1);
  const PAGE_SIZE = 5;

  // GreenWay sessions
  const [gwSessions,   setGwSessions]   = useState([]);
  const [gwLoading,    setGwLoading]    = useState(true);
  const [gwRefreshing, setGwRefreshing] = useState(false);
  const [gwError,      setGwError]      = useState("");

  // Overrides (edycje/usunięcia) — synchronizowane z serwerem
  const { data: syncData, update: syncUpdate } = useServerSync(token);
  const overrides = syncData?.leapmotorOverrides || {};

  function setOverrides(updater) {
    const next = typeof updater === "function" ? updater(overrides) : updater;
    syncUpdate({ leapmotorOverrides: next });
  }

  useEffect(() => {
    setLoading(true);
    getLeapmotorSessions(token)
      .then((data) => { setSessions(Array.isArray(data) ? data : []); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    setGwLoading(true);
    getGreenwaySessions(token)
      .then((data) => { setGwSessions(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setGwLoading(false));
  }, [token]);

  async function handleRefreshGw() {
    setGwRefreshing(true); setGwError("");
    try { setGwSessions(await refreshGreenwaySessions(token)); }
    catch (err) { setGwError(err.message); }
    finally { setGwRefreshing(false); }
  }

  async function handleRefresh() {
    setRefreshing(true); setError("");
    try {
      const data = await refreshLeapmotorSessions(token);
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) { setError(err.message); }
    finally { setRefreshing(false); }
  }

  // Scal dane z serwera z ręcznymi poprawkami
  const mergedSessions = useMemo(() => {
    const base = sessions.map((s) => overrides[s.id] ? { ...s, ...overrides[s.id] } : s);
    // Dodaj ręcznie dodane sesje (nie ma ich na serwerze)
    const manual = Object.values(overrides).filter((o) => o._manual);
    return [...base, ...manual].sort((a, b) => {
      // Sortuj od najnowszych
      const da = a.date.split(".").reverse().join("-");
      const db = b.date.split(".").reverse().join("-");
      return db.localeCompare(da);
    });
  }, [sessions, overrides]);

  function handleSaveEdit(updated) {
    if (updated._manual) {
      setOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    } else {
      setOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    }
    setEditSession(null);
  }

  function handleAddSession() {
    const newId = `manual_${Date.now()}`;
    setEditSession({
      id:          newId,
      date:        formatDate(todayIso()),
      time_start:  null,
      level_start: null,
      time_end:    null,
      level_end:   null,
      _manual:     true,
    });
  }

  function handleDelete(id) {
    if (!window.confirm("Usunąć tę sesję?")) return;
    setOverrides((prev) => {
      const next = { ...prev };
      // Ręczne — usuń całkowicie; automatyczne — oznacz jako usunięte
      if (next[id]?._manual) {
        delete next[id];
      } else {
        next[id] = { ...(next[id] || {}), _deleted: true };
      }
      return next;
    });
    // Wróć na poprzednią stronę jeśli bieżąca jest pusta
    setPage((p) => Math.max(1, p));
  }

  // Statystyki
  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
    const currentYear  = String(now.getFullYear());
    const isThisMonth  = (dateStr) => {
      if (!dateStr || dateStr === "—") return false;
      const [d, m, y] = dateStr.split(".");
      return m === currentMonth && y === currentYear;
    };

    const visible = mergedSessions.filter((s) => !overrides[s.id]?._deleted);

    // Leapmotor — sumaryczne
    const totalCost     = visible.reduce((sum, s) => sum + (calcCost(s) || 0), 0);
    const totalSessions = visible.length;
    const completedSessions = visible.filter((s) => s.level_end != null).length;

    // Leapmotor — bieżący miesiąc
    const monthSessions = visible.filter((s) => isThisMonth(s.date));
    const monthCost     = monthSessions.reduce((sum, s) => sum + (calcCost(s) || 0), 0);
    const monthCount    = monthSessions.length;

    // GreenWay — sumaryczne
    const gwTotalKwh  = gwSessions.reduce((sum, s) => sum + (s.energia_kwh || 0), 0);
    const gwTotalCost = gwSessions.reduce((sum, s) => {
      if (s.koszt != null) return sum + s.koszt;
      if (s.energia_kwh) return sum + s.energia_kwh * 1.5;
      return sum;
    }, 0);

    // GreenWay — bieżący miesiąc
    const gwMonthSessions = gwSessions.filter((s) => isThisMonth(s.date));
    const gwMonthKwh  = gwMonthSessions.reduce((sum, s) => sum + (s.energia_kwh || 0), 0);
    const gwMonthCost = gwMonthSessions.reduce((sum, s) => {
      if (s.koszt != null) return sum + s.koszt;
      if (s.energia_kwh) return sum + s.energia_kwh * 1.5;
      return sum;
    }, 0);
    const gwMonthCount = gwMonthSessions.length;

    return {
      totalCost, totalSessions, completedSessions,
      monthCost, monthCount,
      gwTotalKwh, gwTotalCost,
      gwMonthKwh, gwMonthCost, gwMonthCount,
    };
  }, [mergedSessions, overrides, gwSessions]);

  const visibleSessions = mergedSessions.filter((s) => !overrides[s.id]?._deleted);
  const gwTotalPages   = Math.ceil(gwSessions.length / PAGE_SIZE);
  const gwPagedSessions = gwSessions.slice((gwPage - 1) * PAGE_SIZE, gwPage * PAGE_SIZE);
  const totalPages     = Math.ceil(visibleSessions.length / PAGE_SIZE);
  const pagedSessions  = visibleSessions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      {editSession && (
        <EditSessionModal
          session={editSession}
          onClose={() => setEditSession(null)}
          onSave={handleSaveEdit}
        />
      )}

      <section className="subpage-hero subpage-hero--leapmotor">
        <div className="dash-hero-badge">Samochód</div>
        <h1 className="subpage-title">⚡ Leapmotor C10</h1>
        <p className="dash-tagline">Historia i koszty ładowania pojazdu.</p>
      </section>

      {/* ── Statystyki — Leapmotor ── */}
      <div className="lp-stats-section">
        <div className="lp-stats-title">⚡ Leapmotor C10</div>
        <div className="lp-stats">
          <div className="lp-stat-card">
            <div className="lp-stat-value">{stats.totalSessions}</div>
            <div className="lp-stat-label">Sesji łącznie</div>
          </div>
          <div className="lp-stat-card lp-stat-card--accent">
            <div className="lp-stat-value">{stats.totalCost.toFixed(2).replace(".", ",")} zł</div>
            <div className="lp-stat-label">Koszt łączny</div>
          </div>
          <div className="lp-stat-card lp-stat-card--month">
            <div className="lp-stat-value">{stats.monthCount}</div>
            <div className="lp-stat-label">Ten miesiąc (sesji)</div>
          </div>
          <div className="lp-stat-card lp-stat-card--month">
            <div className="lp-stat-value">{stats.monthCost.toFixed(2).replace(".", ",")} zł</div>
            <div className="lp-stat-label">Ten miesiąc (koszt)</div>
          </div>
        </div>
      </div>

      {/* ── Statystyki — GreenWay ── */}
      <div className="lp-stats-section">
        <div className="lp-stats-title">🟢 GreenWay</div>
        <div className="lp-stats">
          <div className="lp-stat-card">
            <div className="lp-stat-value">{gwSessions.length}</div>
            <div className="lp-stat-label">Sesji łącznie</div>
          </div>
          <div className="lp-stat-card lp-stat-card--accent lp-stat-card--gw">
            <div className="lp-stat-value">{stats.gwTotalCost.toFixed(2).replace(".", ",")} zł</div>
            <div className="lp-stat-label">Koszt łączny</div>
          </div>
          <div className="lp-stat-card lp-stat-card--month">
            <div className="lp-stat-value">{stats.gwMonthCount}</div>
            <div className="lp-stat-label">Ten miesiąc (sesji)</div>
          </div>
          <div className="lp-stat-card lp-stat-card--month">
            <div className="lp-stat-value">{stats.gwMonthCost.toFixed(2).replace(".", ",")} zł</div>
            <div className="lp-stat-label">Ten miesiąc (koszt)</div>
          </div>
        </div>
      </div>

      {/* ── Nagłówek ── */}
      <div className="messages-header" style={{ marginTop: "20px" }}>
        <h2 className="dash-section-title">📋 Sesje ładowania</h2>
        <div className="header-actions">
          <button className="btn-add" onClick={handleAddSession}>+ Dodaj</button>
          <button className="btn-refresh" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "⏳ Sprawdzam..." : "🔄 Odśwież"}
          </button>
        </div>
      </div>

      {error   && <div className="vulcan-error-banner">⚠️ {error}</div>}
      {loading && <div className="vulcan-loading"><span className="vulcan-spinner">⏳</span> Ładowanie…</div>}

      {!loading && visibleSessions.length === 0 ? (
        <div className="messages-empty">
          <span>⚡</span><p>Brak sesji ładowania.</p>
          <p className="messages-empty-hint">Kliknij „Odśwież" aby pobrać dane z maili Leapmotor.</p>
        </div>
      ) : !loading && (
        <div className="messages-table-wrap">
          <table className="messages-table lp-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Czas</th>
                <th>Poziom start</th>
                <th>Poziom koniec</th>
                <th>Zużycie</th>
                <th>Koszt</th>
                <th>Akcja</th>
              </tr>
            </thead>
            <tbody>
              {pagedSessions.map((s) => {
                const cost = calcCost(s);
                const diff = s.level_start != null && s.level_end != null
                  ? s.level_end - s.level_start : null;
                const incomplete = s.level_end == null || s.level_start == null;
                return (
                  <tr key={s.id} className={incomplete ? "lp-row--incomplete" : ""}>
                    <td className="lp-date">{s.date}</td>
                    <td className="lp-time">
                      {s.time_start || "—"}
                      {s.time_end && <> → {s.time_end}</>}
                    </td>
                    <td className="lp-level">
                      {s.level_start != null
                        ? <span className="lp-badge lp-badge--start">{s.level_start}%</span>
                        : <span className="lp-missing">—</span>}
                    </td>
                    <td className="lp-level">
                      {s.level_end != null
                        ? <span className="lp-badge lp-badge--end">{s.level_end}%</span>
                        : <span className="lp-missing">brak danych</span>}
                    </td>
                    <td className="lp-diff">
                      {diff != null
                        ? <span className="lp-diff-val">+{diff}%</span>
                        : "—"}
                    </td>
                    <td className="lp-cost">
                      {cost != null
                        ? <strong>{typeof cost === "number" ? cost.toFixed(2).replace(".", ",") : cost} zł</strong>
                        : <span className="lp-missing">—</span>}
                    </td>
                    <td style={{whiteSpace:"nowrap"}}>
                      <button className="btn-view-schedule"
                        onClick={() => setEditSession(s)} title="Edytuj">✏️</button>
                      <button className="btn-delete"
                        onClick={() => handleDelete(s.id)} title="Usuń">🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stronicowanie */}
      {!loading && totalPages > 1 && (
        <div className="pagination" style={{marginTop:"12px"}}>
          <span className="pagination-info">
            {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, visibleSessions.length)} z {visibleSessions.length}
          </span>
          <div className="pagination-controls">
            <button className="page-btn" onClick={() => setPage(1)} disabled={page===1}>«</button>
            <button className="page-btn" onClick={() => setPage(p=>p-1)} disabled={page===1}>‹</button>
            {Array.from({length: totalPages}, (_,i) => i+1).map(p => (
              <button key={p} className={`page-btn ${p===page?"page-btn--active":""}`}
                onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="page-btn" onClick={() => setPage(p=>p+1)} disabled={page===totalPages}>›</button>
            <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page===totalPages}>»</button>
          </div>
        </div>
      )}
      {/* ── GreenWay ── */}
      <div className="messages-header" style={{marginTop:"32px"}}>
        <h2 className="dash-section-title">🟢 GreenWay — ładowania na stacjach</h2>
        <div className="header-actions">
          <button className="btn-refresh" onClick={handleRefreshGw} disabled={gwRefreshing}>
            {gwRefreshing ? "⏳ Sprawdzam..." : "🔄 Odśwież"}
          </button>
        </div>
      </div>



      {gwError   && <div className="vulcan-error-banner">⚠️ {gwError}</div>}
      {gwLoading && <div className="vulcan-loading"><span className="vulcan-spinner">⏳</span> Ładowanie GreenWay…</div>}

      {!gwLoading && gwSessions.length === 0 ? (
        <div className="messages-empty">
          <span>🟢</span><p>Brak sesji GreenWay.</p>
          <p className="messages-empty-hint">Kliknij „Odśwież" aby pobrać dane z Gmaila.</p>
        </div>
      ) : !gwLoading && (
        <div className="messages-table-wrap">
          <table className="messages-table lp-table lp-table-gw">
            <thead>
              <tr>
                <th>Data</th>
                <th>Stacja</th>
                <th>Złącze</th>
                <th>Czas</th>
                <th>Energia</th>
                <th>Koszt</th>
              </tr>
            </thead>
            <tbody>
              {gwPagedSessions.map((s) => {
                const koszt = s.koszt != null
                  ? s.koszt.toFixed(2).replace(".", ",") + " zł"
                  : s.energia_kwh ? (s.energia_kwh * 1.5).toFixed(2).replace(".", ",") + " zł" : null;
                return (
                  <tr key={s.id}>
                    <td className="lp-date">{s.date}</td>
                    <td style={{fontSize:"0.82rem"}}>{s.stacja}</td>
                    <td style={{fontSize:"0.78rem",color:"var(--clr-text-muted)"}}>{s.zlacze}</td>
                    <td className="lp-time">{s.czas}</td>
                    <td><span className="lp-badge lp-badge--end">{s.energia_str}</span></td>
                    <td className="lp-cost">{koszt ? <strong>{koszt}</strong> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!gwLoading && gwTotalPages > 1 && (
        <div className="pagination" style={{marginTop:"12px"}}>
          <span className="pagination-info">
            {(gwPage-1)*PAGE_SIZE+1}–{Math.min(gwPage*PAGE_SIZE, gwSessions.length)} z {gwSessions.length}
          </span>
          <div className="pagination-controls">
            <button className="page-btn" onClick={() => setGwPage(1)} disabled={gwPage===1}>«</button>
            <button className="page-btn" onClick={() => setGwPage(p=>p-1)} disabled={gwPage===1}>‹</button>
            {Array.from({length: gwTotalPages}, (_,i) => i+1).map(p => (
              <button key={p} className={`page-btn ${p===gwPage?"page-btn--active":""}`}
                onClick={() => setGwPage(p)}>{p}</button>
            ))}
            <button className="page-btn" onClick={() => setGwPage(p=>p+1)} disabled={gwPage===gwTotalPages}>›</button>
            <button className="page-btn" onClick={() => setGwPage(gwTotalPages)} disabled={gwPage===gwTotalPages}>»</button>
          </div>
        </div>
      )}
    </>
  );
}
