# 🦷 Tooth Zone

Rodzinna aplikacja do zarządzania płatnościami szkolnymi, wiadomościami z e-dziennika i organizacji wydarzeń domowych.

**Produkcja:**
- Frontend: https://project-q0tjz.vercel.app
- Backend: https://toothzone-production.up.railway.app

---

## Stos technologiczny

| Warstwa      | Technologia                                            |
|--------------|--------------------------------------------------------|
| Frontend     | React 18, Vite, React Router v6, plain CSS (mobile-first) |
| Backend      | Node.js 20, Express 4                                  |
| Autentykacja | JWT (30 dni), bcrypt                                   |
| Skrypty      | Python 3.12 + imapclient (pobieranie danych IMAP)      |
| Deploy       | Vercel (frontend) + Railway (backend + Python)         |

---

## Struktura projektu

```
tooth-zone/
├── .gitignore
├── vercel.json                          ← SPA rewrite dla Vercel
├── README.md
│
├── backend/
│   ├── server.js                        ← Express API + cache + harmonogram
│   ├── email_checker.py                 ← Wiadomości z e-dziennika (IMAP)
│   ├── payment_checker.py               ← Płatności Marceliny (IMAP)
│   ├── payment_checker_preschool.py     ← Płatności Igi (IMAP)
│   ├── vulcan_script.py                 ← Nieaktywny (eduVULCAN nie obsługiwany)
│   ├── nixpacks.toml                    ← Build Railway (Node + Python)
│   ├── railway.json                     ← Start Railway
│   ├── requirements.txt                 ← Python: imapclient
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── index.html                       ← Meta PWA / iOS viewport
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx                      ← Router + AuthContext
        ├── api.js                       ← Wywołania HTTP do backendu
        │
        ├── utils/
        │   ├── dates.js                 ← parseDate, formatDate, isOverdue…
        │   ├── payments.js              ← parseAmount, getSchoolYear, getPaymentStatus…
        │   └── storage.js              ← loadJson/saveJson, STORAGE_KEYS
        │
        ├── hooks/
        │   ├── useLocalStorage.js       ← useState + auto-sync localStorage
        │   └── usePaidSet.js            ← Zbiór zapłaconych ID z localStorage
        │
        ├── components/
        │   ├── AppLayout.jsx            ← Header + nawigacja (desktop/mobile)
        │   └── payments/
        │       ├── PaymentModal.jsx     ← Modal dodaj/edytuj płatność (wspólny)
        │       ├── PaymentTable.jsx     ← Tabela płatności z paginacją (wspólna)
        │       └── EventModal.jsx       ← Modal dodaj wydarzenie (wspólny)
        │
        ├── pages/
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   ├── Dashboard.jsx            ← Panel + zakładka Zobowiązania
        │   ├── ObligationsPage.jsx      ← Zobowiązania (ręczne, cykliczne, harmonogramy)
        │   ├── SchoolPage.jsx           ← Szkoła: wiadomości, płatności, wydarzenia
        │   └── PreschoolPage.jsx        ← Przedszkole: płatności, wydarzenia
        │
        └── styles/
            ├── global.css               ← Zmienne, reset, iOS fixes
            ├── auth.css
            ├── dashboard.css            ← Layout + nawigacja + mobile tab bar
            ├── school.css               ← Tabele, modalne, płatności
            ├── preschool.css            ← Motyw pomarańczowy
            └── obligations.css          ← Zobowiązania
```

---

## Uruchomienie lokalne

### Wymagania
- Node.js v18+ → https://nodejs.org
- Python 3.8+ → https://python.org
- Włączone IMAP w ustawieniach poczty WP.pl

### Instalacja

```cmd
cd backend && npm install
cd ../frontend && npm install
pip install imapclient
```

### Start

**Terminal 1 — backend (port 5000):**
```cmd
cd backend
set EMAIL_ADDRESS=majchrowska1@wp.pl
set EMAIL_PASSWORD=haslo_do_poczty
set IMAP_SERVER=imap.wp.pl
set IMAP_PORT=993
set JWT_SECRET=dowolny-sekret
set APP_EMAIL=twoj@email.pl
set APP_PASSWORD=haslo_do_aplikacji
npm run dev
```

**Terminal 2 — frontend (port 3000):**
```cmd
cd frontend && npm run dev
```

Frontend automatycznie łączy się z `localhost:5000` (brak `VITE_API_URL`).

---

## Deploy

```cmd
cd C:\Users\PC\Desktop\tooth-zone\tooth-zone
git add .
git commit -m "Opis zmian"
git push
```

Railway i Vercel wdrażają automatycznie po każdym pushu.

### Vercel (frontend)
- Root Directory: `frontend`
- Zmienna: `VITE_API_URL=https://toothzone-production.up.railway.app`

### Railway (backend)
- Root Directory: `backend`
- Build: Nixpacks (Node 20 + Python 3.12)

**Zmienne Railway:**

| Zmienna          | Opis                              |
|------------------|-----------------------------------|
| `APP_EMAIL`      | Email do logowania w aplikacji    |
| `APP_PASSWORD`   | Hasło do logowania w aplikacji    |
| `JWT_SECRET`     | Sekret JWT (min. 32 znaki)        |
| `EMAIL_ADDRESS`  | Skrzynka WP.pl (IMAP)             |
| `EMAIL_PASSWORD` | Hasło do skrzynki WP.pl           |
| `IMAP_SERVER`    | `imap.wp.pl`                      |
| `IMAP_PORT`      | `993`                             |
| `FRONTEND_URL`   | URL frontendu na Vercel           |

---

## API

| Metoda | Ścieżka                          | Auth | Opis                                       |
|--------|----------------------------------|------|--------------------------------------------|
| POST   | /register                        | —    | Wyłączone — jedno konto z env vars         |
| POST   | /login                           | —    | Logowanie → JWT (30 dni)                  |
| GET    | /dashboard                       | ✓    | Dane panelu                                |
| GET    | /api/school/messages             | ✓    | Wiadomości z cache                         |
| POST   | /api/school/messages/refresh     | ✓    | Pobierz nowe wiadomości (ostatnie 150)     |
| GET    | /api/school/payments             | ✓    | Płatności Marceliny z cache               |
| POST   | /api/school/payments/refresh     | ✓    | Odśwież płatności (ostatnie 35 dni)        |
| GET    | /api/preschool/payments          | ✓    | Płatności Igi z cache                      |
| POST   | /api/preschool/payments/refresh  | ✓    | Odśwież płatności przedszkole              |

---

## Funkcje aplikacji

### 🏠 Panel główny (`/dashboard`)

**📅 Nadchodzące wydarzenia** — hardcoded lista. Edytuj `UPCOMING_EVENTS` w `Dashboard.jsx`.

**📋 Zobowiązania** — agreguje niezapłacone płatności ze wszystkich źródeł:
- Płatności szkolne i przedszkolne z ostatnich 3 miesięcy
- Ręczne zobowiązania jednorazowe i cykliczne
- Harmonogramy miesięczne (wpisy wchodzą 1. dnia miesiąca)
- Suma niezapłaconych w nagłówku
- Przycisk "Zapłać" synchronizuje status z zakładkami Szkoła/Przedszkole

### 🎒 Szkoła (`/school`)

**📬 Wiadomości** — z e-dziennika Vulcan/eduVULCAN przez IMAP
- Sortowanie i paginacja (10/strona)
- Cache w pamięci serwera, odświeżanie przyrostowe co godzinę

**💳 Płatności — Marcelina** — z maili `oplaty@cui.wroclaw.pl`
- 6 miesięcy na stronę, suma roku szkolnego w nagłówku
- Status: ✅ Zapłacona / 🟢 W terminie / 🔴 Po terminie
- Ręczne dodawanie i edycja płatności
- Przycisk Zapłać/Cofnij zapisywany w localStorage

**📌 Moje wydarzenia** — własne notatki z datą

### 🧸 Przedszkole (`/preschool`)
Identyczna funkcjonalność jak Szkoła (motyw pomarańczowy), filtr: Majchrowska-Ząb Iga.

---

## Architektura cache (backend)

```
Przy starcie Railway:
  1. email_checker.py     → messagesCache   (ostatnie 150 wiadomości)
  2. payment_checker.py   → paymentsCache   (wszystkie płatności Marceliny)
  3. payment_checker_preschool.py → preschoolCache

Co godzinę (setInterval):
  email_checker.py   --since 2 dni  → merge do messagesCache
  payment_checker.py --since 35 dni → merge do paymentsCache
  payment_checker_preschool.py      → merge do preschoolCache

GET /api/*/... → zwraca cache (natychmiastowo)
POST /api/*/refresh → pełne pobranie → nadpisuje cache
```

> Cache znika po restarcie Railway i ładuje się automatycznie (~60–120 sek).

---

## localStorage — klucze

| Klucz                          | Zawartość                              |
|--------------------------------|----------------------------------------|
| `tz_token`                     | Token JWT                              |
| `tz_email`                     | Email zalogowanego użytkownika         |
| `tz_paid_payments`             | Zapłacone płatności Marceliny (Set)    |
| `tz_preschool_paid_payments`   | Zapłacone płatności Igi (Set)          |
| `tz_obl_paid`                  | Zapłacone zobowiązania ręczne          |
| `tz_school_events`             | Własne wydarzenia szkolne              |
| `tz_preschool_events`          | Własne wydarzenia przedszkolne         |
| `tz_school_manual_payments`    | Ręczne płatności w zakładce Szkoła     |
| `tz_preschool_manual_payments` | Ręczne płatności w zakładce Przedszkole|
| `tz_obligations_manual`        | Ręczne zobowiązania                    |
| `tz_obligations_schedule`      | Harmonogramy płatności                 |

> localStorage jest per-urządzenie. Status zapłacenia oznaczony na komputerze nie jest widoczny na telefonie i odwrotnie.

---

## Mobile (iOS)

Aplikacja jest dostosowana do iPhone:
- **Dolna nawigacja** zamiast górnego paska (iOS tab bar pattern)
- **Modalne** wysuwają się od dołu jak natywne iOS sheets, ze scrollowalnym body
- **`viewport-fit=cover`** + `env(safe-area-inset-*)` dla notch i home indicator
- **Font-size: 16px** w inputach (brak auto-zoom Safari)
- **Min 44px** dla wszystkich tap targets (Apple HIG)
- **`touch-action: manipulation`** eliminuje 300ms opóźnienie

---

## Znane ograniczenia

- **Jedno konto** — aplikacja obsługuje jednego użytkownika (dane w env vars Railway)
- **Cache ulotny** — po restarcie Railway dane ładują się od nowa (~2 min)
- **localStorage per-urządzenie** — status zapłacenia nie synchronizuje się między urządzeniami
- **eduVULCAN** — nowy system szkoły nie ma publicznego API; wiadomości pobierane przez IMAP z powiadomień email
- **Railway trial** — darmowy plan wygasa po 30 dniach lub po zużyciu $5 kredytu
