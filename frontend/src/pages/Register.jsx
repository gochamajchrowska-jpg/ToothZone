// ============================================================
//  Register.jsx — Strona rejestracji
// ============================================================

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../api";
import "../styles/auth.css";

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await registerUser(email, password);
      setSuccess("Rejestracja udana! Przekierowywanie do logowania…");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-tooth">🦷</span>
          <h1 className="auth-title">Tooth Zone</h1>
          <p className="auth-subtitle">Utwórz konto</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Adres e-mail</label>
            <input id="email" type="email" placeholder="ty@przyklad.pl"
              value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="form-group">
            <label htmlFor="password">Hasło</label>
            <input id="password" type="password" placeholder="Min. 6 znaków"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error   && <p className="msg msg--error">{error}</p>}
          {success && <p className="msg msg--success">{success}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Tworzenie konta…" : "Utwórz konto"}
          </button>
        </form>

        <p className="auth-switch">
          Masz już konto? <Link to="/login">Zaloguj się</Link>
        </p>
      </div>
    </div>
  );
}
