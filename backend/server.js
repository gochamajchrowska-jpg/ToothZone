// ============================================================
//  Tooth Zone — Backend Express
// ============================================================

const express  = require("express");
const bcrypt   = require("bcrypt");
const jwt      = require("jsonwebtoken");
const cors     = require("cors");
const fs       = require("fs");
const path     = require("path");
const { exec } = require("child_process");

const app        = express();
const PORT       = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "tooth-zone-super-secret-key-change-in-prod";

const users = [];

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── Cache w pamięci ───────────────────────────────────────────
// Dane żyją w pamięci serwera — po restarcie Railway ładowane automatycznie
let messagesCache       = [];  // wiadomości e-dziennik
let paymentsCache       = [];  // płatności szkoła (Marcelina)
let preschoolCache      = [];  // płatności przedszkole (Iga)
let dataLoaded          = false; // czy pierwsze ładowanie się skończyło

// ── Helpers ───────────────────────────────────────────────────

function authenticateToken(req, res, next) {
  const token = (req.headers["authorization"] || "").split(" ")[1];
  if (!token) return res.status(401).json({ message: "Brak dostępu. Nie podano tokenu." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ message: "Nieprawidłowy lub wygasły token." });
  }
}

function runPythonScript(scriptName, timeoutMs = 120000, sinceDays = null) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    const sinceArg   = sinceDays ? ` "${sinceDays}"` : "";
    const emailAddr  = process.env.EMAIL_ADDRESS  || "";
    const emailPass  = process.env.EMAIL_PASSWORD || "";
    const imapServer = process.env.IMAP_SERVER    || "imap.wp.pl";
    const imapPort   = process.env.IMAP_PORT      || "993";
    const cmd = `python3 "${scriptPath}" "${emailAddr}" "${emailPass}" "${imapServer}" "${imapPort}"${sinceArg}`;

    exec(cmd, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (stderr) console.error(`[${scriptName}] stderr:\n${stderr}`);
      if (error)  return reject(new Error(`Błąd skryptu: ${error.message}`));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error("Skrypt zwrócił niepoprawny JSON.")); }
    });
  });
}

function deduplicatePayments(payments) {
  const toKey = (s) => (s || "").toLowerCase()
    .replace(/ą/g,"a").replace(/ć/g,"c").replace(/ę/g,"e").replace(/ł/g,"l")
    .replace(/ń/g,"n").replace(/ó/g,"o").replace(/ś/g,"s")
    .replace(/ź/g,"z").replace(/ż/g,"z").trim();
  const seen = new Map();
  for (const p of payments) {
    const key = toKey(p.miesiac);
    if (key && !seen.has(key)) seen.set(key, p);
  }
  return Array.from(seen.values());
}

// Scalaj nowe wiadomości z cache (deduplikuj po id)
function mergeMessages(cache, newItems) {
  const existingIds = new Set(cache.map(m => m.id));
  const added = newItems.filter(m => !existingIds.has(m.id));
  return added.length > 0 ? [...added, ...cache] : cache;
}

// Scalaj nowe płatności z cache (deduplikuj po miesiac)
function mergePayments(cache, newItems) {
  const all = [...newItems, ...cache];
  return deduplicatePayments(all);
}

// ── Auth ──────────────────────────────────────────────────────

app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Adres e-mail i hasło są wymagane." });
  if (password.length < 6) return res.status(400).json({ message: "Hasło musi mieć co najmniej 6 znaków." });
  if (users.find((u) => u.email === email)) return res.status(409).json({ message: "Użytkownik z tym adresem e-mail już istnieje." });
  const hashed = await bcrypt.hash(password, 10);
  users.push({ id: users.length + 1, email, password: hashed });
  console.log(`✅ Nowy użytkownik: ${email}`);
  res.status(201).json({ message: "Rejestracja udana! Możesz się teraz zalogować." });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Adres e-mail i hasło są wymagane." });
  const user = users.find((u) => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: "Nieprawidłowy adres e-mail lub hasło." });
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "2h" });
  console.log(`🔑 Zalogowano: ${email}`);
  res.json({ token, email: user.email });
});

app.get("/dashboard", authenticateToken, (req, res) => {
  res.json({ message: `Witaj w Tooth Zone, ${req.user.email}!` });
});

// ── Wiadomości szkoła ─────────────────────────────────────────

app.get("/api/school/messages", authenticateToken, (req, res) => {
  res.json(messagesCache);
});

app.post("/api/school/messages/refresh", authenticateToken, (req, res) => {
  // Pełne pobranie na żądanie (ostatnie 150)
  runPythonScript("email_checker.py", 120000)
    .then((data) => {
      if (Array.isArray(data)) messagesCache = data;
      res.json(messagesCache);
    })
    .catch((err) => res.status(500).json({ error: err.message }));
});

// ── Płatności szkoła (Marcelina) ──────────────────────────────

app.get("/api/school/payments", authenticateToken, (req, res) => {
  res.json(paymentsCache);
});

app.post("/api/school/payments/refresh", authenticateToken, (req, res) => {
  // Przyrostowe pobranie — sprawdź maile z ostatnich 35 dni (cały miesiąc)
  runPythonScript("payment_checker.py", 120000, 35)
    .then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        paymentsCache = mergePayments(paymentsCache, data);
      }
      res.json(paymentsCache);
    })
    .catch((err) => res.status(500).json({ error: err.message }));
});

// ── Płatności przedszkole (Iga) ───────────────────────────────

app.get("/api/preschool/payments", authenticateToken, (req, res) => {
  res.json(preschoolCache);
});

app.post("/api/preschool/payments/refresh", authenticateToken, (req, res) => {
  runPythonScript("payment_checker_preschool.py", 120000, 35)
    .then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        preschoolCache = mergePayments(preschoolCache, data);
      }
      res.json(preschoolCache);
    })
    .catch((err) => res.status(500).json({ error: err.message }));
});

// ── Harmonogram co godzinę ────────────────────────────────────

function hourlyRefresh() {
  console.log("[Scheduler] Odświeżam dane...");

  // Nowe wiadomości z ostatnich 2 dni
  runPythonScript("email_checker.py", 120000, 2)
    .then((data) => {
      if (!Array.isArray(data) || data.length === 0) return;
      const before = messagesCache.length;
      messagesCache = mergeMessages(messagesCache, data);
      const added = messagesCache.length - before;
      if (added > 0) console.log(`[Scheduler] +${added} nowych wiadomości.`);
    })
    .catch((err) => console.error(`[Scheduler] Wiadomości błąd: ${err.message}`));

  // Nowe płatności szkoła z ostatnich 35 dni
  runPythonScript("payment_checker.py", 120000, 35)
    .then((data) => {
      if (!Array.isArray(data) || data.length === 0) return;
      const before = paymentsCache.length;
      paymentsCache = mergePayments(paymentsCache, data);
      const added = paymentsCache.length - before;
      if (added > 0) console.log(`[Scheduler] +${added} nowych płatności (szkoła).`);
    })
    .catch((err) => console.error(`[Scheduler] Płatności szkoła błąd: ${err.message}`));

  // Nowe płatności przedszkole z ostatnich 35 dni
  runPythonScript("payment_checker_preschool.py", 120000, 35)
    .then((data) => {
      if (!Array.isArray(data) || data.length === 0) return;
      const before = preschoolCache.length;
      preschoolCache = mergePayments(preschoolCache, data);
      const added = preschoolCache.length - before;
      if (added > 0) console.log(`[Scheduler] +${added} nowych płatności (przedszkole).`);
    })
    .catch((err) => console.error(`[Scheduler] Płatności przedszkole błąd: ${err.message}`));
}

// ── Start ─────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🦷 Tooth Zone backend działa na http://localhost:${PORT}`);

  // Pierwsze ładowanie przy starcie — wszystkie dane (sekwencyjnie żeby nie przeciążyć IMAP)
  console.log("[Startup] Ładuję wiadomości...");
  runPythonScript("email_checker.py", 120000)
    .then((data) => {
      if (Array.isArray(data)) {
        messagesCache = data;
        console.log(`[Startup] Wiadomości: ${data.length}`);
      }
      // Dopiero po wiadomościach ładuj płatności (żeby nie przeciążyć serwera IMAP)
      console.log("[Startup] Ładuję płatności szkoła...");
      return runPythonScript("payment_checker.py", 120000);
    })
    .then((data) => {
      if (Array.isArray(data)) {
        paymentsCache = data;
        console.log(`[Startup] Płatności szkoła: ${data.length}`);
      }
      console.log("[Startup] Ładuję płatności przedszkole...");
      return runPythonScript("payment_checker_preschool.py", 120000);
    })
    .then((data) => {
      if (Array.isArray(data)) {
        preschoolCache = data;
        console.log(`[Startup] Płatności przedszkole: ${data.length}`);
      }
      dataLoaded = true;
      console.log("[Startup] Wszystkie dane załadowane ✅");
    })
    .catch((err) => console.error(`[Startup] Błąd: ${err.message}`));

  // Co godzinę sprawdzaj nowe dane
  setInterval(hourlyRefresh, 60 * 60 * 1000);
});
