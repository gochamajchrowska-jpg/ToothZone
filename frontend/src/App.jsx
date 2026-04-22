// ============================================================
//  App.jsx — Router i kontekst autoryzacji
// ============================================================

import React, { createContext, useContext, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Register      from "./pages/Register";
import Login         from "./pages/Login";
import Dashboard     from "./pages/Dashboard";
import SchoolPage    from "./pages/SchoolPage";
import PreschoolPage from "./pages/PreschoolPage";

// Kontekst — dostarcza token i funkcje login/logout całej aplikacji
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Przekieruj niezalogowanych użytkowników na /login
function PrivateRoute({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const [token, setToken]       = useState(() => localStorage.getItem("tz_token"));
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("tz_email"));

  function login(newToken, email) {
    localStorage.setItem("tz_token", newToken);
    localStorage.setItem("tz_email", email);
    setToken(newToken);
    setUserEmail(email);
  }

  function logout() {
    localStorage.removeItem("tz_token");
    localStorage.removeItem("tz_email");
    setToken(null);
    setUserEmail(null);
  }

  return (
    <AuthContext.Provider value={{ token, userEmail, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/login"    element={<Login />} />

          <Route path="/dashboard" element={
            <PrivateRoute><Dashboard /></PrivateRoute>
          } />
          <Route path="/school" element={
            <PrivateRoute><SchoolPage /></PrivateRoute>
          } />
          <Route path="/preschool" element={
            <PrivateRoute><PreschoolPage /></PrivateRoute>
          } />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
