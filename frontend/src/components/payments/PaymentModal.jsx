import React, { useState } from "react";
import { formatDate, toIsoDate, todayIso } from "../../utils/dates";

/**
 * Modal dodawania / edycji płatności.
 * Używany w SchoolPage, PreschoolPage i ObligationsPage.
 */
export default function PaymentModal({ onClose, onSave, existing, theme = "" }) {
  const [miesiac,   setMiesiac]   = useState(existing?.miesiac   || "");
  const [kwota,     setKwota]     = useState(
    existing ? (existing.kwota || "").replace(" zł", "") : ""
  );
  const [termin,    setTermin]    = useState(existing ? toIsoDate(existing.termin) : todayIso());
  const [komentarz, setKomentarz] = useState(existing?.komentarz || "");
  const [error,     setError]     = useState("");

  function handleSave() {
    if (!miesiac.trim()) return setError("Wpisz nazwę miesiąca (np. maj 2026).");
    const amount = parseFloat(kwota.replace(",", "."));
    if (!kwota.trim() || isNaN(amount) || amount <= 0)
      return setError("Podaj prawidłową kwotę.");

    onSave({
      id:        existing?.id || `manual_${Date.now()}`,
      miesiac:   miesiac.trim(),
      kwota:     amount.toFixed(2).replace(".", ",") + " zł",
      termin:    termin ? formatDate(termin) : "—",
      komentarz: komentarz.trim(),
      manual:    true,
    });
    onClose();
  }

  const saveClass = `btn-save${theme ? ` btn-save--${theme}` : ""}`;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h3 className="modal-title">
            {existing ? "✏️ Edytuj płatność" : "💳 Dodaj płatność"}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label htmlFor="pm-miesiac">Miesiąc</label>
            <input id="pm-miesiac" type="text" placeholder="np. maj 2026"
              value={miesiac} onChange={(e) => setMiesiac(e.target.value)} autoFocus />
          </div>
          <div className="modal-field">
            <label htmlFor="pm-kwota">Kwota (zł)</label>
            <input id="pm-kwota" type="text" placeholder="np. 151,05"
              value={kwota} onChange={(e) => setKwota(e.target.value)} />
          </div>
          <div className="modal-field">
            <label htmlFor="pm-termin">Termin płatności</label>
            <input id="pm-termin" type="date" value={termin}
              onChange={(e) => setTermin(e.target.value)}
              min="2020-01-01" max="2035-12-31" />
          </div>
          <div className="modal-field">
            <label htmlFor="pm-komentarz">
              Komentarz <span className="char-count">{komentarz.length}/200</span>
            </label>
            <textarea id="pm-komentarz" rows={2} maxLength={200}
              placeholder="Opcjonalny opis płatności"
              value={komentarz} onChange={(e) => setKomentarz(e.target.value)} />
          </div>
          {error && <p className="modal-error">⚠️ {error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Anuluj</button>
          <button className={saveClass} onClick={handleSave}>Zapisz</button>
        </div>
      </div>
    </div>
  );
}
