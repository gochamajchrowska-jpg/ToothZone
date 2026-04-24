// ============================================================
//  api.js — Wszystkie wywołania do backendu Express
// ============================================================

// W produkcji ustaw VITE_API_URL w panelu Vercel → Settings → Environment Variables
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Pomocnik: buduje nagłówki z tokenem JWT
function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// Pomocnik: parsuje odpowiedź i rzuca błąd gdy !res.ok
async function handleResponse(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Błąd serwera.");
  return data;
}

// ── Rejestracja ──────────────────────────────────────────────
export async function registerUser(email, password) {
  const res = await fetch(`${BASE_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res);
}

// ── Logowanie ────────────────────────────────────────────────
export async function loginUser(email, password) {
  const res = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res); // { token, email }
}

// ── Wiadomości z e-dziennika ─────────────────────────────────
export async function getSchoolMessages(token) {
  const res = await fetch(`${BASE_URL}/api/school/messages`, {
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

export async function refreshSchoolMessages(token) {
  const res = await fetch(`${BASE_URL}/api/school/messages/refresh`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

// ── Płatności szkolne ────────────────────────────────────────
export async function getSchoolPayments(token) {
  const res = await fetch(`${BASE_URL}/api/school/payments`, {
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

export async function refreshSchoolPayments(token) {
  const res = await fetch(`${BASE_URL}/api/school/payments/refresh`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

// ── Płatności przedszkolne (Iga) ─────────────────────────────
export async function getPreschoolPayments(token) {
  const res = await fetch(`${BASE_URL}/api/preschool/payments`, {
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

export async function refreshPreschoolPayments(token) {
  const res = await fetch(`${BASE_URL}/api/preschool/payments/refresh`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

// ── Dane użytkownika (sync między urządzeniami) ───────────────
export async function getUserData(token) {
  const res = await fetch(`${BASE_URL}/api/userdata`, {
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

export async function patchUserData(token, patch) {
  const res = await fetch(`${BASE_URL}/api/userdata`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(patch),
  });
  return handleResponse(res);
}
