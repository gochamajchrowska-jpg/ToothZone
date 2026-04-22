# 🦷 Tooth Zone

Aplikacja do zarządzania domowym budżetem i organizacji spraw rodzinnych.  
Umożliwia śledzenie wiadomości z e-dziennika, płatności szkolnych i własnych wydarzeń.

---

## Stos technologiczny

| Warstwa      | Technologia                              |
|--------------|------------------------------------------|
| Frontend     | React 18, Vite, React Router v6          |
| Backend      | Node.js, Express                         |
| Autentykacja | JWT (JSON Web Tokens), bcrypt            |
| Skrypty      | Python 3.8+ (pobieranie danych z poczty) |
| Style        | Plain CSS z zmiennymi                    |
| Dane         | Pliki JSON (bez bazy danych)             |

---

## Struktura projektu

```
tooth-zone/
├── backend/
│   ├── server.js              ← Serwer Express (API)
│   ├── email_checker.py       ← Pobiera wiadomości Vulcan z poczty
│   ├── payment_checker.py     ← Pobiera płatności szkolne z poczty
│   ├── vulcan_script.py       ← Pobiera dane z e-dziennika UONET+
│   ├── vulcan_messages.json   ← Generowany automatycznie
│   ├── payment_messages.json  ← Generowany automatycznie
│   └── package.json
│
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx                    ← Router + AuthContext
        ├── api.js                     ← Wszystkie wywołania HTTP
        ├── components/
        │   └── AppLayout.jsx          ← Header + nawigacja
        ├── pages/
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   ├── Dashboard.jsx          ← Panel główny
        │   ├── SchoolPage.jsx         ← Szkoła (wiadomości, płatności, wydarzenia)
        │   └── PreschoolPage.jsx      ← Przedszkole (wydarzenia)
        └── styles/
            ├── global.css
            ├── auth.css
            ├── dashboard.css
            ├── school.css
            └── preschool.css
```

---

## Wymagania

- **Node.js** v18 lub nowszy → https://nodejs.org
- **Python** 3.8 lub nowszy → https://python.org
- Dostęp do skrzynki pocztowej przez **IMAP** (WP.pl: włącz w ustawieniach poczty)

---

## Instalacja i uruchomienie

### 1. Zależności Node.js

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Zależności Python

```bash
pip install vulcan-api imapclient
```

### 3. Uruchomienie

**Terminal 1 — backend** (port 5000):

```cmd
cd backend
set EMAIL_ADDRESS=twoj@email.pl
set EMAIL_PASSWORD=haslo_do_poczty
set IMAP_SERVER=imap.wp.pl
npm run dev
```

**Terminal 2 — frontend** (port 3000):

```cmd
cd frontend
npm run dev
```

Otwórz przeglądarkę: **http://localhost:3000**

---

## Endpointy API

| Metoda | Ścieżka                           | Auth | Opis                                      |
|--------|-----------------------------------|------|-------------------------------------------|
| POST   | /register                         | —    | Rejestracja nowego użytkownika            |
| POST   | /login                            | —    | Logowanie, zwraca token JWT               |
| GET    | /dashboard                        | ✓    | Dane panelu głównego                      |
| GET    | /api/vulcan                       | ✓    | Surowe dane z e-dziennika UONET+          |
| GET    | /api/school/messages              | ✓    | Wiadomości z e-dziennika (z pliku)        |
| POST   | /api/school/messages/refresh      | ✓    | Pobiera nowe wiadomości ze skrzynki       |
| GET    | /api/school/payments              | ✓    | Płatności szkolne (z pliku, deduplikowane)|
| POST   | /api/school/payments/refresh      | ✓    | Pobiera płatności ze skrzynki pocztowej   |

---

## Funkcje aplikacji

### Panel główny (`/dashboard`)
- Lista nadchodzących wydarzeń rodzinnych (hardcoded, do edycji w `Dashboard.jsx`)

### Szkoła (`/school`)
Trzy zakładki:

**📬 Wiadomości** — automatycznie pobierane z poczty (nadawca: `noreply@vulcan.net.pl`)
- Tabela: Data, Użytkownik, Temat, Link do eduvulcan.pl
- Sortowanie po dacie (↑↓), stronicowanie po 10 wiadomości
- Przycisk Odśwież pobiera nowe wiadomości ze skrzynki

**💳 Płatności** — automatycznie pobierane z poczty (nadawca: `oplaty@cui.wroclaw.pl`)
- Filtrowane tylko do: Majchrowska-Ząb Marcelina
- Tabela: Miesiąc, Kwota do zapłaty, Termin, Status
- Deduplikacja: jeden rekord na miesiąc
- Status: "W terminie" (zielony) / "Po terminie" (czerwony)

**📌 Moje wydarzenia** — ręcznie dodawane przez użytkownika
- Formularz: wybór daty z kalendarza + notatka (max 200 znaków)
- Dane zapisywane w `localStorage` (trwałe między sesjami)
- Możliwość usunięcia każdego wydarzenia

### Przedszkole (`/preschool`)
- Własne wydarzenia (identyczne z zakładką w Szkole, motyw pomarańczowy)

---

## Skrypty Python

### `email_checker.py`
Pobiera wiadomości z e-dziennika Vulcan ze skrzynki pocztowej.
- Filtruje maile od: `noreply@vulcan.net.pl`
- Wyciąga: datę, nadawcę, temat wiadomości
- Zapisuje do: `vulcan_messages.json`

### `payment_checker.py`
Pobiera informacje o płatnościach szkolnych ze skrzynki pocztowej.
- Filtruje maile od: `oplaty@cui.wroclaw.pl`
- Warunek: mail musi zawierać wzmiankę o "Majchrowska-Ząb Marcelina"
- Wyciąga: miesiąc, kwotę do zapłaty, termin płatności
- Deduplikuje: jeden rekord na miesiąc
- Zapisuje do: `payment_messages.json`

### `vulcan_script.py`
Łączy się z e-dziennikiem UONET+ przez nieoficjalne API.
- **Uwaga:** Działa tylko ze starym systemem UONET+ (`uonetplus.vulcan.net.pl`)
- Nowy system eduVULCAN (`eduvulcan.pl`) nie jest obsługiwany
- Wymaga: `VULCAN_SYMBOL`, `VULCAN_USERNAME`, `VULCAN_PASSWORD`
- Przy pierwszym uruchomieniu tworzy `keystore.json` i `account.json`

---

## Zmienne środowiskowe

| Zmienna            | Opis                              | Wymagana do            |
|--------------------|-----------------------------------|------------------------|
| `EMAIL_ADDRESS`    | Adres e-mail skrzynki pocztowej   | email_checker, payment |
| `EMAIL_PASSWORD`   | Hasło do skrzynki pocztowej       | email_checker, payment |
| `IMAP_SERVER`      | Serwer IMAP (domyślnie imap.wp.pl)| email_checker, payment |
| `VULCAN_SYMBOL`    | Symbol szkoły w URL e-dziennika   | vulcan_script          |
| `VULCAN_USERNAME`  | Email do e-dziennika              | vulcan_script          |
| `VULCAN_PASSWORD`  | Hasło do e-dziennika              | vulcan_script          |

---

## Uwagi dla produkcji

Przed wdrożeniem produkcyjnym należy:

- [ ] Przenieść `JWT_SECRET` do zmiennej środowiskowej
- [ ] Zastąpić tablicę `users` prawdziwą bazą danych (np. SQLite, PostgreSQL)
- [ ] Dodać HTTPS
- [ ] Skonfigurować CORS dla konkretnej domeny
- [ ] Dodać limit częstotliwości zapytań (rate limiting)
- [ ] Uruchomić skrypty email/payment jako zadania cron (np. co godzinę)
