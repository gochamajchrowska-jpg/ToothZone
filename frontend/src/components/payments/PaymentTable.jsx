import React from "react";
import { STATUS_LABELS } from "../../utils/payments";

const PAY_PAGE_SIZE = 6;

/**
 * Tabela płatności z paginacją, statusem i przyciskami akcji.
 * Używana w SchoolPage i PreschoolPage.
 */
export default function PaymentTable({
  payments,       // wszystkie posortowane płatności
  page,
  onPageChange,
  paidIds,
  onTogglePaid,
  onEdit,
  onDelete,
  getStatus,      // fn(pay) → "paid"|"overdue"|"ok"|"unknown"
  theme = "",     // "" | "preschool"
}) {
  const total      = payments.length;
  const totalPages = Math.ceil(total / PAY_PAGE_SIZE);
  const startIdx   = (page - 1) * PAY_PAGE_SIZE;
  const current    = payments.slice(startIdx, startIdx + PAY_PAGE_SIZE);

  const paidClass  = theme ? `btn-mark-paid btn-mark-paid--${theme}` : "btn-mark-paid";

  if (total === 0) return null;

  return (
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
            {current.map((pay) => {
              const status = getStatus(pay);
              return (
                <tr key={pay.id} className={
                  status === "paid" ? "row-paid" :
                  status === "overdue" ? "row-overdue" : ""
                }>
                  <td className="pay-month">
                    {pay.miesiac}
                    {pay.komentarz && <div className="pay-komentarz">{pay.komentarz}</div>}
                  </td>
                  <td className="pay-amount">{pay.kwota}</td>
                  <td className="pay-deadline">{pay.termin}</td>
                  <td className="pay-status-cell">
                    <span className={`pay-badge pay-badge--${status}`}>
                      {STATUS_LABELS[status] ?? "—"}
                    </span>
                    <button
                      className={`${paidClass} ${status === "paid" ? "btn-mark-paid--undo" : ""}`}
                      onClick={() => onTogglePaid(pay.id)}
                      title={status === "paid" ? "Cofnij" : "Oznacz jako zapłaconą"}
                    >
                      {status === "paid" ? "Cofnij" : "Zapłać"}
                    </button>
                    {pay.manual && (
                      <button className="btn-view-schedule"
                        onClick={() => onEdit(pay)} title="Edytuj">✏️</button>
                    )}
                    {pay.manual && (
                      <button className="btn-delete"
                        onClick={() => onDelete(pay.id)} title="Usuń">🗑</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <span className="pagination-info">
            Miesiące {startIdx + 1}–{Math.min(startIdx + PAY_PAGE_SIZE, total)} z {total}
          </span>
          <div className="pagination-controls">
            <button className="page-btn" onClick={() => onPageChange(1)} disabled={page === 1}>«</button>
            <button className="page-btn" onClick={() => onPageChange(page - 1)} disabled={page === 1}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p}
                className={`page-btn ${p === page ? "page-btn--active" : ""}`}
                onClick={() => onPageChange(p)}>{p}</button>
            ))}
            <button className="page-btn" onClick={() => onPageChange(page + 1)} disabled={page === totalPages}>›</button>
            <button className="page-btn" onClick={() => onPageChange(totalPages)} disabled={page === totalPages}>»</button>
          </div>
        </div>
      )}
    </>
  );
}
