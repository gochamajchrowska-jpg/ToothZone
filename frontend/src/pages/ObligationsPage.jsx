// ============================================================
//  ObligationsPage.jsx — Zobowiązania
//  Agreguje niezapłacone płatności ze wszystkich źródeł
//  + ręczne jednorazowe i cykliczne zobowiązania
// ============================================================

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "../App";
import { getSchoolPayments, getPreschoolPayments } from "../api";
import "../styles/obligations.css";

// ── localStorage keys ────────────────────────────────────────
const OBL_MANUAL_KEY   = "tz_obligations_manual";    // ręczne zobowiązania
const OBL_SCHEDULE_KEY = "tz_obligations_schedule";  // harmonogramy
const OBL_PAID_KEY     = "tz_paid_payments";          // zapłacone (wspólne)
const OBL_PRE_PAID_KEY = "tz_preschool_paid_payments";

// ── Pomocniki dat ─────────────────────────────────────────────
function todayIso() {
  return new Date().toISOString().split("T")[0];
}
function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
function parseDate(str) {
  if (!str || str === "—") return new Date(0);
  const [d, m, y] = str.split(".");
  return new Date(`${y}-${m}-${d}T00:00`);
}
function isOverdue(terminStr) {
  if (!terminStr || terminStr === "—") return false;
  return parseDate(terminStr) < new Date();
}
function firstDayThisMonth() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}
function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
function monthLabel(date) {
  return date.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}
function isoDate(date) {
  return date.toISOString().split("T")[0];
}

const MONTHS_PL = [
  "Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
  "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"
];

// ── Modal: dodaj zobowiązanie ─────────────────────────────────
function AddObligationModal({ onClose, onSave }) {
  const [name, setName]         = useState("");
  const [kwota, setKwota]       = useState("");
  const [termin, setTermin]     = useState(todayIso());
  const [komentarz, setKomentarz] = useState("");
  const [cyclic, setCyclic]     = useState(false);
  const [cyclicUntil, setCyclicUntil] = useState("");
  const [error, setError]       = useState("");

  function handleSave() {
    if (!name.trim()) return setError("Wpisz nazwę zobowiązania.");
    const amount = parseFloat(kwota.replace(",", "."));
    if (isNaN(amount) || amount <= 0) return setError("Podaj prawidłową kwotę.");
    onSave({
      id:          `obl_${Date.now()}`,
      name:        name.trim(),
      kwota:       amount.toFixed(2).replace(".", ",") + " zł",
      termin:      termin ? formatDate(termin) : "—",
      komentarz:   komentarz.trim(),
      cyclic,
      cyclicUntil: cyclic ? cyclicUntil : null,
      source:      "manual",
      addedAt:     todayIso(),
    });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h3 className="modal-title">➕ Dodaj zobowiązanie</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label>Nazwa</label>
            <input type="text" placeholder="np. Czynsz, Internet, Ubezpieczenie"
              value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="modal-field">
            <label>Kwota (zł)</label>
            <input type="text" placeholder="np. 350,00"
              value={kwota} onChange={(e) => setKwota(e.target.value)} />
          </div>
          <div className="modal-field">
            <label>Termin płatności</label>
            <input type="date" value={termin}
              onChange={(e) => setTermin(e.target.value)} min="2020-01-01" max="2035-12-31" />
          </div>
          <div className="modal-field">
            <label>Komentarz <span className="char-count">{komentarz.length}/200</span></label>
            <textarea rows={2} maxLength={200} placeholder="Opcjonalny opis"
              value={komentarz} onChange={(e) => setKomentarz(e.target.value)} />
          </div>
          <div className="modal-field modal-field--checkbox">
            <label className="checkbox-label">
              <input type="checkbox" checked={cyclic} onChange={(e) => setCyclic(e.target.checked)} />
              <span>Zobowiązanie cykliczne (powtarza się co miesiąc)</span>
            </label>
          </div>
          {cyclic && (
            <div className="modal-field">
              <label>Obowiązuje do (opcjonalnie)</label>
              <input type="date" value={cyclicUntil}
                onChange={(e) => setCyclicUntil(e.target.value)} min={todayIso()} max="2035-12-31" />
            </div>
          )}
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

// ── Modal: harmonogram płatności ──────────────────────────────
function ScheduleModal({ existing, onClose, onSave }) {
  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-based

  // Inicjuj 12 miesięcy od bieżącego
  const initRows = () => Array.from({ length: 12 }, (_, i) => {
    const d   = addMonths(new Date(currentYear, currentMonth, 1), i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const ex  = existing?.entries?.[key];
    return {
      key,
      label:  MONTHS_PL[d.getMonth()] + " " + d.getFullYear(),
      kwota:  ex?.kwota  || "",
      termin: ex?.termin || "",
    };
  });

  const [name, setName]   = useState(existing?.name || "");
  const [rows, setRows]   = useState(initRows);
  const [error, setError] = useState("");

  function updateRow(i, field, val) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  function handleSave() {
    if (!name.trim()) return setError("Wpisz nazwę harmonogramu.");
    const entries = {};
    rows.forEach((r) => {
      if (r.kwota.trim()) {
        const amount = parseFloat(r.kwota.replace(",", "."));
        if (!isNaN(amount) && amount > 0) {
          entries[r.key] = {
            kwota:  amount.toFixed(2).replace(".", ",") + " zł",
            termin: r.termin ? formatDate(r.termin) : "—",
          };
        }
      }
    });
    onSave({
      id:      existing?.id || `sched_${Date.now()}`,
      name:    name.trim(),
      entries,
    });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-box--wide">
        <div className="modal-header">
          <h3 className="modal-title">📅 Harmonogram płatności</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label>Nazwa harmonogramu</label>
            <input type="text" placeholder="np. Rata kredytu, Składka OC"
              value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <p className="schedule-hint">Wpisz kwoty dla miesięcy w których obowiązuje płatność. Puste miesiące zostaną pominięte.</p>
          <div className="schedule-grid">
            <div className="schedule-grid-header">
              <span>Miesiąc</span><span>Kwota (zł)</span><span>Termin</span>
            </div>
            {rows.map((row, i) => (
              <div key={row.key} className="schedule-grid-row">
                <span className="schedule-month">{row.label}</span>
                <input type="text" placeholder="np. 350,00" value={row.kwota}
                  onChange={(e) => updateRow(i, "kwota", e.target.value)} />
                <input type="date" value={row.termin}
                  onChange={(e) => updateRow(i, "termin", e.target.value)}
                  min="2024-01-01" max="2035-12-31" />
              </div>
            ))}
          </div>
          {error && <p className="modal-error">⚠️ {error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Anuluj</button>
          <button className="btn-save" onClick={handleSave}>Zapisz harmonogram</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: podgląd harmonogramu ───────────────────────────────
function ViewScheduleModal({ schedule, onClose, onEdit }) {
  const entries = Object.entries(schedule.entries || {})
    .sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-box--wide">
        <div className="modal-header">
          <h3 className="modal-title">📅 {schedule.name}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {entries.length === 0 ? (
            <p className="schedule-hint">Harmonogram nie zawiera żadnych wpisów.</p>
          ) : (
            <div className="schedule-grid">
              <div className="schedule-grid-header">
                <span>Miesiąc</span><span>Kwota</span><span>Termin</span>
              </div>
              {entries.map(([key, val]) => {
                const [y, m] = key.split("-");
                const label = MONTHS_PL[parseInt(m) - 1] + " " + y;
                return (
                  <div key={key} className="schedule-grid-row schedule-grid-row--view">
                    <span className="schedule-month">{label}</span>
                    <span>{val.kwota}</span>
                    <span>{val.termin}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Zamknij</button>
          <button className="btn-save" onClick={onEdit}>✏️ Edytuj</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Główny komponent
// ============================================================
export default function ObligationsPage() {
  const { token } = useAuth();

  // ── Płatności z innych zakładek ───────────────────────────
  const [schoolPay,   setSchoolPay]   = useState([]);
  const [preschoolPay, setPreschoolPay] = useState([]);

  // ── Ręczne zobowiązania ───────────────────────────────────
  const [manuals, setManuals] = useState(() => {
    try { return JSON.parse(localStorage.getItem(OBL_MANUAL_KEY) || "[]"); }
    catch { return []; }
  });

  // ── Harmonogramy ──────────────────────────────────────────
  const [schedules, setSchedules] = useState(() => {
    try { return JSON.parse(localStorage.getItem(OBL_SCHEDULE_KEY) || "[]"); }
    catch { return []; }
  });

  // ── Zapłacone IDs — osobno dla szkoły i przedszkola ─────────
  // WAŻNE: nie łączymy w jeden zbiór bo ID są takie same (np. "marzec 2026")
  const [schoolPaidIds, setSchoolPaidIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(OBL_PAID_KEY) || "[]")); }
    catch { return new Set(); }
  });
  const [preschoolPaidIds, setPreschoolPaidIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(OBL_PRE_PAID_KEY) || "[]")); }
    catch { return new Set(); }
  });
  const [oblPaidIds, setOblPaidIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("tz_obl_paid") || "[]")); }
    catch { return new Set(); }
  });

  useEffect(() => {
    localStorage.setItem(OBL_MANUAL_KEY,   JSON.stringify(manuals));
  }, [manuals]);
  useEffect(() => {
    localStorage.setItem(OBL_SCHEDULE_KEY, JSON.stringify(schedules));
  }, [schedules]);
  useEffect(() => {
    localStorage.setItem("tz_obl_paid", JSON.stringify([...oblPaidIds]));
  }, [oblPaidIds]);

  // ── Modals ────────────────────────────────────────────────
  const [showAddModal,      setShowAddModal]      = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editSchedule,      setEditSchedule]      = useState(null);
  const [viewSchedule,      setViewSchedule]      = useState(null);

  // ── Ładowanie płatności ───────────────────────────────────
  useEffect(() => {
    getSchoolPayments(token).then(setSchoolPay).catch(() => {});
    getPreschoolPayments(token).then(setPreschoolPay).catch(() => {});
  }, [token]);

  // ── Generuj wpisy z cyklicznych i harmonogramów ───────────
  const generatedEntries = useMemo(() => {
    const result = [];
    const today  = new Date();
    const thisMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    // Cykliczne — dodaj wpis na bieżący miesiąc jeśli jeszcze aktywne
    manuals.forEach((m) => {
      if (!m.cyclic) return;
      if (m.cyclicUntil && m.cyclicUntil < thisMonthKey) return;
      const id = `${m.id}_${thisMonthKey}`;
      if (!result.find((r) => r.id === id)) {
        result.push({
          id,
          name:      m.name,
          miesiac:   monthLabel(today),
          kwota:     m.kwota,
          termin:    m.termin,
          komentarz: m.komentarz,
          source:    "cyclic",
          baseId:    m.id,
        });
      }
    });

    // Harmonogramy — wejście 1 dnia bieżącego miesiąca
    schedules.forEach((sched) => {
      const entry = sched.entries?.[thisMonthKey];
      if (!entry) return;
      const id = `${sched.id}_${thisMonthKey}`;
      result.push({
        id,
        name:    sched.name,
        miesiac: monthLabel(today),
        kwota:   entry.kwota,
        termin:  entry.termin,
        source:  "schedule",
        schedId: sched.id,
      });
    });

    return result;
  }, [manuals, schedules]);

  // ── Połącz wszystkie płatności ────────────────────────────
  // Ręczne płatności z zakładek szkoła i przedszkole (localStorage)
  const schoolManual    = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("tz_school_manual_payments") || "[]"); }
    catch { return []; }
  }, []);
  const preschoolManual = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("tz_preschool_manual_payments") || "[]"); }
    catch { return []; }
  }, []);

  const allPayments = useMemo(() => {
    const fromSchool = schoolPay.map((p) => ({
      ...p, source: "school", name: `Szkoła — ${p.miesiac}`,
    }));
    const fromPreschool = preschoolPay.map((p) => ({
      ...p, source: "preschool", name: `Przedszkole — ${p.miesiac}`,
    }));
    // Ręczne z zakładki Szkoła
    const fromSchoolManual = schoolManual.map((p) => ({
      ...p, source: "school", name: p.miesiac || p.name || "Szkoła",
    }));
    // Ręczne z zakładki Przedszkole
    const fromPreschoolManual = preschoolManual.map((p) => ({
      ...p, source: "preschool", name: p.miesiac || p.name || "Przedszkole",
    }));
    // Ręczne z tej zakładki
    const fromManual = manuals.filter((m) => !m.cyclic).map((m) => ({
      id: m.id, name: m.name, kwota: m.kwota, termin: m.termin,
      komentarz: m.komentarz, source: "manual",
    }));

    return [
      ...fromSchool, ...fromSchoolManual,
      ...fromPreschool, ...fromPreschoolManual,
      ...fromManual, ...generatedEntries
    ];
  }, [schoolPay, preschoolPay, schoolManual, preschoolManual, manuals, generatedEntries]);

  // ── Filtruj tylko niezapłacone / po terminie ──────────────
  const unpaid = useMemo(() => {
    return allPayments.filter((p) => {
      // Sprawdź właściwy zbiór zapłaconych zależnie od źródła
      if (p.source === "school")    return !schoolPaidIds.has(p.id) && !oblPaidIds.has(p.id);
      if (p.source === "preschool") return !preschoolPaidIds.has(p.id) && !oblPaidIds.has(p.id);
      return !oblPaidIds.has(p.id);
    }).sort((a, b) => parseDate(a.termin) - parseDate(b.termin));
  }, [allPayments, schoolPaidIds, preschoolPaidIds, oblPaidIds]);

  function togglePaid(id, source) {
    if (source === "school") {
      setSchoolPaidIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        localStorage.setItem(OBL_PAID_KEY, JSON.stringify([...next]));
        return next;
      });
    } else if (source === "preschool") {
      setPreschoolPaidIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        localStorage.setItem(OBL_PRE_PAID_KEY, JSON.stringify([...next]));
        return next;
      });
    } else {
      setOblPaidIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        localStorage.setItem("tz_obl_paid", JSON.stringify([...next]));
        return next;
      });
    }
  }

  function handleSaveManual(obl) {
    setManuals((prev) => [obl, ...prev]);
  }

  function handleDeleteManual(id) {
    if (!window.confirm("Usunąć to zobowiązanie?")) return;
    setManuals((prev) => prev.filter((m) => m.id !== id));
  }

  function handleSaveSchedule(sched) {
    setSchedules((prev) => {
      const exists = prev.findIndex((s) => s.id === sched.id);
      if (exists >= 0) {
        const next = [...prev];
        next[exists] = sched;
        return next;
      }
      return [sched, ...prev];
    });
    setEditSchedule(null);
  }

  function handleDeleteSchedule(id) {
    if (!window.confirm("Usunąć ten harmonogram?")) return;
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  // ── Suma niezapłaconych ───────────────────────────────────
  const totalUnpaid = useMemo(() => {
    return unpaid.reduce((sum, p) => {
      const v = parseFloat((p.kwota || "0").replace(/\s/g, "").replace("zł","").replace(",","."));
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [unpaid]);

  // ── źródło → etykieta ─────────────────────────────────────
  function sourceLabel(src) {
    if (src === "school")    return "Szkoła";
    if (src === "preschool") return "Przedszkole";
    if (src === "cyclic")    return "Cykliczne";
    if (src === "schedule")  return "Harmonogram";
    return "Ręczne";
  }
  function sourceBadgeClass(src) {
    if (src === "school")    return "obl-badge--school";
    if (src === "preschool") return "obl-badge--preschool";
    if (src === "cyclic")    return "obl-badge--cyclic";
    if (src === "schedule")  return "obl-badge--schedule";
    return "obl-badge--manual";
  }

  return (
    <>
      {showAddModal && (
        <AddObligationModal
          onClose={() => setShowAddModal(false)}
          onSave={handleSaveManual}
        />
      )}
      {showScheduleModal && (
        <ScheduleModal
          existing={editSchedule}
          onClose={() => { setShowScheduleModal(false); setEditSchedule(null); }}
          onSave={handleSaveSchedule}
        />
      )}
      {viewSchedule && (
        <ViewScheduleModal
          schedule={viewSchedule}
          onClose={() => setViewSchedule(null)}
          onEdit={() => {
            setEditSchedule(viewSchedule);
            setViewSchedule(null);
            setShowScheduleModal(true);
          }}
        />
      )}

      {/* ── Nagłówek i przyciski ── */}
      <div className="obl-header">
        <div className="obl-header-left">
          <h2 className="obl-title">📋 Zobowiązania do zapłaty</h2>
          {unpaid.length > 0 && (
            <span className="obl-total">
              Łącznie: {totalUnpaid.toFixed(2).replace(".", ",")} zł
            </span>
          )}
        </div>
        <div className="obl-header-actions">
          <button className="btn-add" onClick={() => setShowAddModal(true)}>
            + Dodaj
          </button>
          <button className="btn-schedule" onClick={() => { setEditSchedule(null); setShowScheduleModal(true); }}>
            📅 Dodaj harmonogram
          </button>
        </div>
      </div>

      {/* ── Lista niezapłaconych ── */}
      {unpaid.length === 0 ? (
        <div className="messages-empty">
          <span>✅</span>
          <p>Brak zaległych płatności.</p>
          <p className="messages-empty-hint">Wszystkie zobowiązania są opłacone lub nie masz jeszcze żadnych wpisów.</p>
        </div>
      ) : (
        <div className="messages-table-wrap">
          <table className="messages-table obl-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Kwota</th>
                <th>Termin</th>
                <th>Status</th>
                <th>Akcja</th>
              </tr>
            </thead>
            <tbody>
              {unpaid.map((pay) => {
                const overdue = isOverdue(pay.termin);
                return (
                  <tr key={pay.id} className={overdue ? "row-overdue" : ""}>
                    <td>
                      <div className="obl-name">{pay.name}</div>
                      {pay.komentarz && <div className="pay-komentarz">{pay.komentarz}</div>}
                      <span className={`obl-badge ${sourceBadgeClass(pay.source)}`}>
                        {sourceLabel(pay.source)}
                      </span>
                    </td>
                    <td className="pay-amount">{pay.kwota}</td>
                    <td className="pay-deadline">{pay.termin}</td>
                    <td>
                      <span className={`pay-badge pay-badge--${overdue ? "overdue" : "ok"}`}>
                        {overdue ? "Po terminie" : "W terminie"}
                      </span>
                    </td>
                    <td className="obl-actions">
                      <button
                        className="btn-mark-paid"
                        onClick={() => togglePaid(pay.id, pay.source)}
                      >
                        Zapłać
                      </button>
                      {(pay.source === "manual") && (
                        <button className="btn-delete" onClick={() => handleDeleteManual(pay.id)} title="Usuń">🗑</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Harmonogramy ── */}
      {schedules.length > 0 && (
        <div className="obl-schedules">
          <h3 className="obl-schedules-title">📅 Harmonogramy</h3>
          <div className="obl-schedules-list">
            {schedules.map((s) => {
              const count = Object.keys(s.entries || {}).length;
              return (
                <div key={s.id} className="obl-schedule-card">
                  <div className="obl-schedule-info">
                    <span className="obl-schedule-name">{s.name}</span>
                    <span className="obl-schedule-count">{count} miesięcy</span>
                  </div>
                  <div className="obl-schedule-btns">
                    <button className="btn-view-schedule" onClick={() => setViewSchedule(s)}>
                      Podgląd
                    </button>
                    <button className="btn-view-schedule" onClick={() => {
                      setEditSchedule(s); setShowScheduleModal(true);
                    }}>
                      Edytuj
                    </button>
                    <button className="btn-delete" onClick={() => handleDeleteSchedule(s.id)} title="Usuń">🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
