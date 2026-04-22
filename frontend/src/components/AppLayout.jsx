// ============================================================
//  AppLayout.jsx — Wspólny układ dla chronionych stron
//  Zawiera: header z logo, nawigacja zakładkowa, slot na treść
// ============================================================

import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import "../styles/dashboard.css";

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const { userEmail, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-page">

      <header className="app-header">
        <div className="app-logo">
          <span className="app-logo-main">Tooth Zone</span>
          <span className="app-logo-sub">Domowy budżet i organizacja rodziny</span>
        </div>
        <div className="app-header-right">
          <span className="app-user-email">{userEmail}</span>
          <button className="btn-logout" onClick={handleLogout}>Wyloguj się</button>
        </div>
      </header>

      <nav className="app-nav">
        <NavLink to="/dashboard"  className="app-nav-link">🏠 Panel główny</NavLink>
        <NavLink to="/school"     className="app-nav-link">🎒 Szkoła</NavLink>
        <NavLink to="/preschool"  className="app-nav-link">🧸 Przedszkole</NavLink>
      </nav>

      <main className="app-main">
        {children}
      </main>

    </div>
  );
}
