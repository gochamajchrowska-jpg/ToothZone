import React, { useState } from "react";
import { formatDate, todayIso } from "../../utils/dates";

/** Modal dodawania własnego wydarzenia (szkoła / przedszkole). */
export default function EventModal({ onClose, onSave, theme = "" }) {
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

  const boxClass  = `modal-box${theme ? ` modal-box--${theme}` : ""}`;
  const saveClass = `btn-save${theme ? ` btn-save--${theme}` : ""}`;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={boxClass}>
        <div className="modal-header">
          <h3 className="modal-title">📅 Dodaj wydarzenie</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label htmlFor="ev-date">Data</label>
            <input id="ev-date" type="date" value={date}
              onChange={(e) => setDate(e.target.value)}
              min="2020-01-01" max="2030-12-31" />
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
          <button className={saveClass} onClick={handleSave}>Zapisz</button>
        </div>
      </div>
    </div>
  );
}
