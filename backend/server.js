// ============================================================
//  Tooth Zone — Backend Express
//  Port: 5000
// ============================================================

const express    = require("express");
const bcrypt     = require("bcrypt");
const jwt        = require("jsonwebtoken");
const cors       = require("cors");
const fs         = require("fs");
const path       = require("path");
const { exec }   = require("child_process");

const app        = express();
const PORT       = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "tooth-zone-super-secret-key-change-in-prod";

// Użytkownicy przechowywani w pamięci (zastąp bazą danych w produkcji)
const users = [];

// CORS — zezwól na połączenia z dowolnego origin
// (możesz zawęzić do konkretnych adresów po uruchomieniu)
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// ── Pomocniki ────────────────────────────────────────────────

// Weryfikacja tokenu JWT — używana jako middleware dla chronionych tras
function authenticateToken(req, res, next) {
  const token = (req.headers["authorization"] || "").split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Brak dostępu. Nie podano tokenu." });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ message: "Nieprawidłowy lub wygasły token." });
  }
}

// Uruchom skrypt Python i zwróć sparsowany JSON ze stdout
function runPythonScript(scriptName, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    // Przekaż zmienne środowiskowe do procesu Python
    const env = {
      ...process.env,
      EMAIL_ADDRESS:  process.env.EMAIL_ADDRESS  || "",
      EMAIL_PASSWORD: process.env.EMAIL_PASSWORD || "",
      IMAP_SERVER:    process.env.IMAP_SERVER    || "imap.wp.pl",
      IMAP_PORT:      process.env.IMAP_PORT      || "993",
    };
    // Przekaż dane jako argumenty wiersza poleceń — niezawodne na Railway
    const emailAddr = process.env.EMAIL_ADDRESS  || "";
    const emailPass = process.env.EMAIL_PASSWORD || "";
    const imapServer = process.env.IMAP_SERVER   || "imap.wp.pl";
    const imapPort   = process.env.IMAP_PORT     || "993";
    console.log(`[DEBUG] EMAIL_ADDRESS=${emailAddr ? "SET" : "EMPTY"}, IMAP=${imapServer}`);
    exec(`python3 "${scriptPath}"`, { timeout: timeoutMs, env: {
      ...process.env,
      EMAIL_ADDRESS: emailAddr,
      EMAIL_PASSWORD: emailPass,
      IMAP_SERVER: imapServer,
      IMAP_PORT: imapPort,
      PATH: process.env.PATH,
      HOME: process.env.HOME || "/root",
    }}, (error, stdout, stderr) => {
      if (stderr) console.error(`[${scriptName}] stderr:\n${stderr}`);
      if (error)  return reject(new Error(`Błąd skryptu: ${error.message}`));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Skrypt zwrócił niepoprawny JSON.`));
      }
    });
  });
}

// Odczytaj plik JSON z dysku — zwróć pustą tablicę jeśli nie istnieje
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

// Deduplikacja płatności — jeden rekord na miesiąc
// Klucz: miesiąc zamieniony na ASCII (obsługa polskich liter)
function deduplicatePayments(payments) {
  const toKey = (s) => (s || "")
    .toLowerCase()
    .replace(/ą/g,"a").replace(/ć/g,"c").replace(/ę/g,"e").replace(/ł/g,"l")
    .replace(/ń/g,"n").replace(/ó/g,"o").replace(/ś/g,"s")
    .replace(/ź/g,"z").replace(/ż/g,"z")
    .trim();

  const seen = new Map();
  for (const p of payments) {
    const key = toKey(p.miesiac);
    if (key && !seen.has(key)) seen.set(key, p);
  }
  return Array.from(seen.values());
}

// ── POST /register ───────────────────────────────────────────
app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Adres e-mail i hasło są wymagane." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Hasło musi mieć co najmniej 6 znaków." });
  }
  if (users.find((u) => u.email === email)) {
    return res.status(409).json({ message: "Użytkownik z tym adresem e-mail już istnieje." });
  }

  const hashed = await bcrypt.hash(password, 10);
  users.push({ id: users.length + 1, email, password: hashed });
  console.log(`✅ Nowy użytkownik: ${email}`);
  res.status(201).json({ message: "Rejestracja udana! Możesz się teraz zalogować." });
});

// ── POST /login ──────────────────────────────────────────────
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Adres e-mail i hasło są wymagane." });
  }

  const user = users.find((u) => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Nieprawidłowy adres e-mail lub hasło." });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "2h" });
  console.log(`🔑 Zalogowano: ${email}`);
  res.json({ token, email: user.email });
});

// ── GET /dashboard ───────────────────────────────────────────
app.get("/dashboard", authenticateToken, (req, res) => {
  res.json({
    message: `Witaj w Tooth Zone, ${req.user.email}!`,
    expenses: { summary: "Śledzenie wydatków wkrótce dostępne.", total: null, recent: [] },
  });
});

// ── GET /api/vulcan ──────────────────────────────────────────
// Uruchamia vulcan_script.py i zwraca surowe dane e-dziennika
app.get("/api/vulcan", authenticateToken, async (req, res) => {
  try {
    res.json(await runPythonScript("vulcan_script.py"));
  } catch (err) {
    console.error(`[Vulcan] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/school/messages ─────────────────────────────────
// Zwraca wiadomości z e-dziennika zapisane przez email_checker.py
app.get("/api/school/messages", authenticateToken, (req, res) => {
  res.json(readJsonFile(path.join(__dirname, "vulcan_messages.json")));
});

// ── POST /api/school/messages/refresh ────────────────────────
// Usuwa stary plik, uruchamia email_checker.py, zwraca wynik
app.post("/api/school/messages/refresh", authenticateToken, (req, res) => {
  const filePath = path.join(__dirname, "vulcan_messages.json");

  // Usuń stary plik przed pobraniem — gwarantuje świeże dane
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log("[Messages] Usunięto stary vulcan_messages.json");
  }

  runPythonScript("email_checker.py")
    .then(() => res.json(readJsonFile(filePath)))
    .catch((err) => res.status(500).json({ error: err.message }));
});

// ── GET /api/school/payments ─────────────────────────────────
// Zwraca płatności z payment_messages.json (deduplikowane)
app.get("/api/school/payments", authenticateToken, (req, res) => {
  const payments = readJsonFile(path.join(__dirname, "payment_messages.json"));
  res.json(deduplicatePayments(payments));
});

// ── POST /api/school/payments/refresh ────────────────────────
// Usuwa stary plik, uruchamia payment_checker.py, zwraca wynik
app.post("/api/school/payments/refresh", authenticateToken, (req, res) => {
  const filePath = path.join(__dirname, "payment_messages.json");

  // Usuń stary plik — gwarantuje brak duplikatów z poprzednich pobrań
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log("[Payments] Usunięto stary payment_messages.json");
  }

  runPythonScript("payment_checker.py")
    .then(() => res.json(deduplicatePayments(readJsonFile(filePath))))
    .catch((err) => res.status(500).json({ error: err.message }));
});

// ── Start ────────────────────────────────────────────────────
// ── Diagnostyka (tymczasowa) ─────────────────────────────────
app.get("/debug-env", (req, res) => {
  res.json({
    EMAIL_ADDRESS:  process.env.EMAIL_ADDRESS  ? "SET" : "MISSING",
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? "SET" : "MISSING",
    IMAP_SERVER:    process.env.IMAP_SERVER    || "MISSING",
    IMAP_PORT:      process.env.IMAP_PORT      || "MISSING",
    PORT:           process.env.PORT           || "MISSING",
  });
});

app.listen(PORT, () => {
  console.log(`🦷 Tooth Zone backend działa na http://localhost:${PORT}`);
});

// ── GET /api/preschool/payments ──────────────────────────────
app.get("/api/preschool/payments", authenticateToken, (req, res) => {
  const payments = readJsonFile(path.join(__dirname, "preschool_payment_messages.json"));
  res.json(deduplicatePayments(payments));
});

// ── POST /api/preschool/payments/refresh ─────────────────────
app.post("/api/preschool/payments/refresh", authenticateToken, (req, res) => {
  const filePath   = path.join(__dirname, "preschool_payment_messages.json");
  const scriptPath = path.join(__dirname, "payment_checker_preschool.py");

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log("[Preschool/Payments] Usunięto stary plik");
  }

  runPythonScript("payment_checker_preschool.py")
    .then(() => res.json(deduplicatePayments(readJsonFile(filePath))))
    .catch((err) => res.status(500).json({ error: err.message }));
});
