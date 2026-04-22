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

const users = [];

// CORS — zezwól na połączenia z dowolnego origin
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

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

function runPythonScript(scriptName, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    exec(`python "${scriptPath}"`, { timeout: timeoutMs }, (error, stdout, stderr) => {
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
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

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

app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Adres e-mail i hasło są wymagane." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Hasło musi mieć co najmniej 6 znaków." });
  }
  if (users.find((u) => u.email === email)) {
    return res.s