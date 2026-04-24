// ============================================================
//  Tooth Zone — Backend Express
//  Dane użytkownika persystowane w MongoDB Atlas
// ============================================================

const express        = require("express");
const bcrypt         = require("bcrypt");
const jwt            = require("jsonwebtoken");
const cors           = require("cors");
const { exec }       = require("child_process");
const path           = require("path");
const { MongoClient } = require("mongodb");

const app        = express();
const PORT       = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "tooth-zone-secret";

// ── MongoDB ───────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || "";
const DB_NAME   = "toothzone";
const COL_NAME  = "userdata";

let db  = null;
let col = null;

async function connectMongo() {
  if (!MONGO_URI) {
    console.warn("[MongoDB] Brak MONGO_URI — dane nie będą persystowane!");
    return;
  }
  try {
    const client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      ssl: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
    });
    await client.connect();
    db  = client.db(DB_NAME);
    col = db.collection(COL_NAME);
    // Utwórz dokument jeśli nie istnieje
    await col.updateOne(
      { _id: "userdata" },
      { $setOnInsert: EMPTY_USERDATA() },
      { upsert: true }
    );
    console.log("[MongoDB] Połączono z Atlas ✅");
  } catch (err) {
    console.error("[MongoDB] Błąd połączenia:", err.message);
  }
}

function EMPTY_USERDATA() {
  return {
    _id:             "userdata",
    schoolManual:    [],
    preschoolManual: [],
    schoolPaid:      [],
    preschoolPaid:   [],
    schoolEvents:    [],
    preschoolEvents: [],
    oblManual:       [],
    oblSchedules:    [],
    oblPaid:         [],
  };
}

async function loadUserData() {
  if (!col) return EMPTY_USERDATA();
  try {
    const doc = await col.findOne({ _id: "userdata" });
    return doc || EMPTY_USERDATA();
  } catch (err) {
    console.error("[MongoDB] Błąd odczytu:", err.message);
    return EMPTY_USERDATA();
  }
}

async function saveUserData(patch) {
  if (!col) return;
  try {
    await col.updateOne(
      { _id: "userdata" },
      { $set: patch },
      { upsert: true }
    );
  } catch (err) {
    console.error("[MongoDB] Błąd zapisu:", err.message);
  }
}

// ── Auth ──────────────────────────────────────────────────────
const APP_EMAIL    = process.env.APP_EMAIL    || "";
const APP_PASSWORD = process.env.APP_PASSWORD || "";
let   APP_PASSWORD_HASH = null;

if (APP_EMAIL && APP_PASSWORD) {
  bcrypt.hash(APP_PASSWORD, 10).then(hash => {
    APP_PASSWORD_HASH = hash;
    console.log(`[Auth] Użytkownik skonfigurowany: ${APP_EMAIL}`);
  });
} else {
  console.warn("[Auth] Brak APP_EMAIL lub APP_PASSWORD!");
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

function authenticateToken(req, res, next) {
  const token = (req.headers["authorization"] || "").split(" ")[1];
  if (!token) return res.status(401).json({ message: "Brak tokenu." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ message: "Nieprawidłowy token." });
  }
}

// ── Python helper ─────────────────────────────────────────────
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

// ── Cache e-mail ──────────────────────────────────────────────
let messagesCache  = [];
let paymentsCache  = [];
let preschoolCache = [];

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

function mergeMessages(cache, newItems) {
  const existingIds = new Set(cache.map(m => m.id));
  const added = newItems.filter(m => !existingIds.has(m.id));
  return added.length > 0 ? [...added, ...cache] : cache;
}

function mergePayments(cache, newItems) {
  return deduplicatePayments([...newItems, ...cache]);
}

// ── Endpointy auth ────────────────────────────────────────────
app.post("/register", (req, res) => {
  res.status(403).json({ message: "Rejestracja wyłączona." });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email i hasło są wymagane." });
  if (email !== APP_EMAIL)
    return res.status(401).json({ message: "Nieprawidłowy email lub hasło." });
  if (!APP_PASSWORD_HASH)
    return res.status(503).json({ message: "Serwer nie gotowy. Spróbuj za chwilę." });
  const match = await bcrypt.compare(password, APP_PASSWORD_HASH);
  if (!match)
    return res.status(401).json({ message: "Nieprawidłowy email lub hasło." });
  const token = jwt.sign({ id: 1, email: APP_EMAIL }, JWT_SECRET, { expiresIn: "30d" });
  console.log(`🔑 Zalogowano: ${email}`);
  res.json({ token, email: APP_EMAIL });
});

app.get("/dashboard", authenticateToken, (req, res) => {
  res.json({ message: `Witaj w Tooth Zone, ${req.user.email}!` });
});

// ── Wiadomości szkoła ─────────────────────────────────────────
app.get("/api/school/messages", authenticateToken, (req, res) => {
  res.json(messagesCache);
});

app.post("/api/school/messages/refresh", authenticateToken, (req, res) => {
  runPythonScript("email_checker.py", 120000)
    .then((data) => {
      if (Array.isArray(data)) messagesCache = data;
      res.json(messagesCache);
    })
    .catch((err) => res.status(500).json({ error: err.message }));
});

// ── Płatności szkoła ──────────────────────────────────────────
app.get("/api/school/payments", authenticateToken, (req, res) => {
  res.json(paymentsCache);
});

app.post("/api/school/payments/refresh", authenticateToken, (req, res) => {
  runPythonScript("payment_checker.py", 120000, 35)
    .then((data) => {
      if (Array.isArray(data) && data.length > 0)
        paymentsCache = mergePayments(paymentsCache, data);
      res.json(paymentsCache);
    })
    .catch((err) => res.status(500).json({ error: err.message }));
});

// ── Płatności przedszkole ─────────────────────────────────────
app.get("/api/preschool/payments", authenticateToken, (req, res) => {
  res.json(preschoolCache);
});

app.post("/api/preschool/payments/refresh", authenticateToken, (req, res) => {
  runPythonScript("payment_checker_preschool.py", 120000, 35)
    .then((data) => {
      if (Array.isArray(data) && data.length > 0)
        preschoolCache = mergePayments(preschoolCache, data);
      res.json(preschoolCache);
    })
    .catch((err) => res.status(500).json({ error: err.message }));
});

// ── Dane użytkownika (MongoDB) ────────────────────────────────
const ALLOWED_KEYS = [
  "schoolManual","preschoolManual",
  "schoolPaid","preschoolPaid",
  "schoolEvents","preschoolEvents",
  "oblManual","oblSchedules","oblPaid",
];

app.get("/api/userdata", authenticateToken, async (req, res) => {
  const data = await loadUserData();
  res.json(data);
});

app.patch("/api/userdata", authenticateToken, async (req, res) => {
  const patch = {};
  for (const key of ALLOWED_KEYS) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  if (Object.keys(patch).length === 0)
    return res.status(400).json({ message: "Brak danych do zapisu." });
  await saveUserData(patch);
  res.json({ ok: true });
});

// ── Scheduler ─────────────────────────────────────────────────
function hourlyRefresh() {
  console.log("[Scheduler] Odświeżam dane...");

  runPythonScript("email_checker.py", 120000, 2)
    .then((data) => {
      if (!Array.isArray(data) || data.length === 0) return;
      const before = messagesCache.length;
      messagesCache = mergeMessages(messagesCache, data);
      const added = messagesCache.length - before;
      if (added > 0) console.log(`[Scheduler] +${added} nowych wiadomości.`);
    })
    .catch((err) => console.error(`[Scheduler] Wiadomości błąd: ${err.message}`));

  runPythonScript("payment_checker.py", 120000, 35)
    .then((data) => {
      if (!Array.isArray(data) || data.length === 0) return;
      const before = paymentsCache.length;
      paymentsCache = mergePayments(paymentsCache, data);
      const added = paymentsCache.length - before;
      if (added > 0) console.log(`[Scheduler] +${added} nowych płatności (szkoła).`);
    })
    .catch((err) => console.error(`[Scheduler] Płatności szkoła błąd: ${err.message}`));

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
async function start() {
  await connectMongo();

  app.listen(PORT, () => {
    console.log(`🦷 Tooth Zone backend na http://localhost:${PORT}`);

    console.log("[Startup] Ładuję wiadomości...");
    runPythonScript("email_checker.py", 120000)
      .then((data) => {
        if (Array.isArray(data)) {
          messagesCache = data;
          console.log(`[Startup] Wiadomości: ${data.length}`);
        }
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
        console.log("[Startup] Wszystkie dane załadowane ✅");
      })
      .catch((err) => console.error(`[Startup] Błąd: ${err.message}`));

    setInterval(hourlyRefresh, 60 * 60 * 1000);
  });
}

start();
