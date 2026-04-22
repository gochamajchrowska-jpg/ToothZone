// ============================================================
//  Tooth Zone — Backend Express
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

const users = [];

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── Zapisz config emaila do pliku żeby skrypty Python mogły go odczytać ──
// Railway przekazuje zmienne do Node.js ale nie zawsze do procesów potomnych
function writeEmailConfig() {
  const config = {
    EMAIL_ADDRESS:  process.env.EMAIL_ADDRESS  || "",
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD || "",
    IMAP_SERVER:    process.env.IMAP_SERVER    || "imap.wp.pl",
    IMAP_PORT:      process.env.IMAP_PORT      || "993",
  };
  const configPath = path.join(__dirname, "email_config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`[Config] EMAIL_ADDRESS: ${config.EMAIL_ADDRESS ? "SET" : "EMPTY"}`);
}
writeEmailConfig();

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

function runPythonScript(scriptName, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    exec(`python3 "${scriptPath}"`, { timeout: timeoutMs }, (error, stdout, stderr) => {
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

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch { return []; }
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
  res.json({ message: `Witaj w Tooth Zone, ${req.user.email}!`, expenses: { summary: "Wkrótce.", total: null, recent: [] } });
});

app.get("/api/vulcan", authenticateToken, async (req, res) => {
  try { res.json(await runPythonScript("vulcan_script.py")); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/school/messages", authenticateToken, (req, res) => {
  res.json(readJsonFile(path.join(__dirname, "vulcan_messages.json")));
});

app.post("/api/school/messages/refresh", authenticateToken, (req, res) => {
  const filePath = path.join(__dirname, "vulcan_messages.json");
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  runPythonScript("email_checker.py")
    .then(() => res.json(readJsonFile(filePath)))
    .catch((err) => res.status(500).json({ error: err.message }));
});

app.get("/api/school/payments", authenticateToken, (req, res) => {
  res.json(deduplicatePayments(readJsonFile(path.join(__dirname, "payment_messages.json"))));
});

app.post("/api/school/payments/refresh", authenticateToken, (req, res) => {
  const filePath = path.join(__dirname, "payment_messages.json");
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  runPythonScript("payment_checker.py")
    .then(() => res.json(deduplicatePayments(readJsonFile(filePath))))
    .catch((err) => res.status(500).json({ error: err.message }));
});

app.get("/api/preschool/payments", authenticateToken, (req, res) => {
  res.json(deduplicatePayments(readJsonFile(path.join(__dirname, "preschool_payment_messages.json"))));
});

app.post("/api/preschool/payments/refresh", authenticateToken, (req, res) => {
  const filePath = path.join(__dirname, "preschool_payment_messages.json");
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  runPythonScript("payment_checker_preschool.py")
    .then(() => res.json(deduplicatePayments(readJsonFile(filePath))))
    .catch((err) => res.status(500).json({ error: err.message }));
});

// Przy starcie zapisz konfigurację emaila do pliku
// (Railway nie przekazuje env vars do child_process exec)
const emailConfigPath = path.join(__dirname, "email_config.json");
const emailConfig = {
  EMAIL_ADDRESS:  process.env.EMAIL_ADDRESS  || "",
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD || "",
  IMAP_SERVER:    process.env.IMAP_SERVER    || "imap.wp.pl",
  IMAP_PORT:      process.env.IMAP_PORT      || "993",
};
fs.writeFileSync(emailConfigPath, JSON.stringify(emailConfig));
console.log(`[Config] email_config.json zapisany (EMAIL=${emailConfig.EMAIL_ADDRESS ? "SET" : "EMPTY"})`);

app.listen(PORT, () => {
  console.log(`🦷 Tooth Zone backend działa na http://localhost:${PORT}`);
});
