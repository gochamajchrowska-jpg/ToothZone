# -*- coding: utf-8 -*-
"""
payment_checker.py — pobiera maile o platnosci z oplaty@cui.wroclaw.pl
Filtruje tylko te dotyczace Majchrowska-Zab Marcelina.
Zapisuje JEDEN rekord na miesiac (bez duplikatow) do payment_messages.json.
"""

import imaplib
import email
import json
import os
import sys
import re
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Przyjmuj dane z argv (przekazywane przez Node.js) lub config file lub env vars
if len(sys.argv) >= 3:
    EMAIL_ADDRESS  = sys.argv[1]
    EMAIL_PASSWORD = sys.argv[2]
    IMAP_SERVER    = sys.argv[3] if len(sys.argv) > 3 else "imap.wp.pl"
    IMAP_PORT      = int(sys.argv[4]) if len(sys.argv) > 4 else 993
    SINCE_DAYS     = int(sys.argv[5]) if len(sys.argv) > 5 else None
else:
    _config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "email_config.json")
    if os.path.exists(_config_path):
        with open(_config_path) as _f:
            _cfg = json.load(_f)
        EMAIL_ADDRESS  = _cfg.get("EMAIL_ADDRESS",  os.getenv("EMAIL_ADDRESS",  ""))
        EMAIL_PASSWORD = _cfg.get("EMAIL_PASSWORD", os.getenv("EMAIL_PASSWORD", ""))
        IMAP_SERVER    = _cfg.get("IMAP_SERVER",    os.getenv("IMAP_SERVER",    "imap.wp.pl"))
        IMAP_PORT      = int(_cfg.get("IMAP_PORT",  os.getenv("IMAP_PORT",     "993")))
    else:
        EMAIL_ADDRESS  = os.getenv("EMAIL_ADDRESS",  "")
        EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
        IMAP_SERVER    = os.getenv("IMAP_SERVER",    "imap.wp.pl")
        IMAP_PORT      = int(os.getenv("IMAP_PORT",  "993"))
    SINCE_DAYS = None
PAYMENT_SENDER = "oplaty@cui.wroclaw.pl"
OUTPUT_FILE    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "payment_messages.json")


def decode_payload(part):
    raw = part.get_payload(decode=True)
    if not raw:
        return ""
    charset = part.get_content_charset() or "utf-8"
    for enc in [charset, "utf-8", "cp1250", "iso-8859-2", "latin-1"]:
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode("utf-8", errors="replace")


def get_body(msg):
    """Zwraca treść HTML lub tekstową maila jako string."""
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/html":
                return decode_payload(part)
            if ct == "text/plain":
                body = decode_payload(part)
    else:
        body = decode_payload(msg)
    return body


def strip_html(text):
    """Usuwa tagi HTML i normalizuje biale znaki."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def is_for_marcelina(body):
    """Czy mail dotyczy Majchrowska-Zab Marcelina?"""
    plain = strip_html(body).lower()
    # Szukamy obu wersji zapisu (z polskimi literami i bez)
    variants = [
        "majchrowska-z\u0105b marcelina",
        "majchrowska-zab marcelina",
        "marcelina majchrowska",
    ]
    return any(v in plain for v in variants)


def extract_month(body):
    """
    Wyciaga miesiac i rok z tresci maila.
    Uzywa szerokiego wzorca [A-Za-z\u00C0-\u017E]+ zamiast \w
    zeby obslugiwac polskie litery na Windows.
    Zwraca np. "kwiecien 2026" (bez polskich znakow dla klucza)
    i "kwiecień 2026" (oryginal do wyswietlenia).
    """
    plain = strip_html(body)

    # Wzorzec: dowolne slowo (z polskimi literami) + spacja + 4 cyfry
    # przed ktorym jest "żywienie" lub "miesiąc"
    pat = r"(?:ywienie|miesi[aą]c)\s+([A-Za-z\u00C0-\u017E]+\s+\d{4})"
    m = re.search(pat, plain, re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # Fallback: "Do zapłaty za miesiąc SLOWO YYYY"
    pat2 = r"Do zap[łl]aty za miesi[aą]c\s+([A-Za-z\u00C0-\u017E]+\s+\d{4})"
    m2 = re.search(pat2, plain, re.IGNORECASE)
    if m2:
        return m2.group(1).strip()

    # Fallback: znajdz rok i poprzedzajace slowo
    pat3 = r"([A-Za-z\u00C0-\u017E]{4,})\s+(20\d{2})\s+r\."
    m3 = re.search(pat3, plain, re.IGNORECASE)
    if m3:
        return f"{m3.group(1)} {m3.group(2)}".strip()

    return ""


def normalize_month(miesiac):
    """Klucz deduplikacji: male litery, bez polskich znakow, bez bialych znakow."""
    if not miesiac:
        return ""
    s = miesiac.lower().strip()
    # Zamien polskie litery na ASCII dla pewnosci porownania
    replacements = {
        "\u0105": "a", "\u0107": "c", "\u0119": "e", "\u0142": "l",
        "\u0144": "n", "\u00f3": "o", "\u015b": "s", "\u017a": "z", "\u017c": "z",
        "\u0104": "a", "\u0106": "c", "\u0118": "e", "\u0141": "l",
        "\u0143": "n", "\u00d3": "o", "\u015a": "s", "\u0179": "z", "\u017b": "z",
    }
    for pl, asc in replacements.items():
        s = s.replace(pl, asc)
    return re.sub(r"\s+", " ", s).strip()


def extract_amount(body):
    plain = strip_html(body)
    m = re.search(r"Do zap[łl]aty[^:]*:\s*([\d\s]+,\d{2}\s*z[łl])", plain, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    amounts = re.findall(r"(\d[\d\s]*,\d{2}\s*z[łl])", plain)
    return amounts[-1].strip() if amounts else "—"


def extract_deadline(body):
    plain = strip_html(body)
    m = re.search(r"do\s+dnia\s+(\d{4}-\d{2}-\d{2})", plain, re.IGNORECASE)
    if m:
        y, mo, d = m.group(1).split("-")
        return f"{d}.{mo}.{y}"
    m2 = re.search(r"do\s+dnia\s+(\d{1,2}\.\d{2}\.\d{4})", plain, re.IGNORECASE)
    if m2:
        return m2.group(1)
    return "—"


def fetch_and_deduplicate():
    """
    Glowna funkcja: pobiera maile, filtruje, deduplikuje PO KLUCZU MIESIACA.
    Zwraca slownik {klucz_miesiaca: rekord} — gwarantuje unikalnosc.
    """
    # Uzywamy slownika zamiast listy — klucz = znormalizowany miesiac
    # Automatycznie nadpisuje duplikaty
    unique = {}

    try:
        print(f"[INFO] Lacze z {IMAP_SERVER}:{IMAP_PORT}...", file=sys.stderr)
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        print("[INFO] Zalogowano.", file=sys.stderr)
        mail.select("INBOX")

        if SINCE_DAYS:
            from datetime import datetime, timedelta
            since_date = (datetime.now() - timedelta(days=SINCE_DAYS)).strftime("%d-%b-%Y")
            search_criteria = f'FROM "{PAYMENT_SENDER}" SINCE {since_date}'
            print(f"[INFO] Tryb przyrostowy — od {since_date}", file=sys.stderr)
        else:
            search_criteria = f'FROM "{PAYMENT_SENDER}"'

        status, data = mail.search(None, search_criteria)
        if status != "OK":
            return []

        mail_ids = data[0].split()
        print(f"[INFO] Znaleziono {len(mail_ids)} maili od {PAYMENT_SENDER}.", file=sys.stderr)

        for mail_id in mail_ids:
            status, msg_data = mail.fetch(mail_id, "(RFC822)")
            if status != "OK":
                continue

            msg  = email.message_from_bytes(msg_data[0][1])
            body = get_body(msg)

            if not is_for_marcelina(body):
                print(f"[SKIP] {mail_id.decode()} — nie dotyczy Marceliny", file=sys.stderr)
                continue

            miesiac = extract_month(body)
            key     = normalize_month(miesiac)

            if not key:
                print(f"[SKIP] {mail_id.decode()} — nie udalo sie wyciagnac miesiaca", file=sys.stderr)
                continue

            kwota  = extract_amount(body)
            termin = extract_deadline(body)

            date_raw = msg.get("Date", "")
            try:
                date_str = email.utils.parsedate_to_datetime(date_raw).strftime("%d.%m.%Y")
            except Exception:
                date_str = "—"

            if key in unique:
                print(f"[SKIP] Duplikat klucza '{key}' — pomijam.", file=sys.stderr)
            else:
                unique[key] = {
                    "id":          key,          # uzywamy klucza jako ID — unikalne!
                    "miesiac":     miesiac,
                    "kwota":       kwota,
                    "termin":      termin,
                    "data_emaila": date_str,
                }
                print(f"[INFO] Dodano: {miesiac} | {kwota} | {termin}", file=sys.stderr)

        mail.logout()

    except imaplib.IMAP4.error as e:
        print(f"[BLAD] IMAP: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[BLAD] {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)

    return list(unique.values())


def save(payments):
    # Sortuj: najnowsze pierwsze (wg daty emaila)
    def sort_key(p):
        parts = p.get("data_emaila", "01.01.2000").split(".")
        if len(parts) == 3:
            return f"{parts[2]}-{parts[1]}-{parts[0]}"
        return "0"

    payments.sort(key=sort_key, reverse=True)

    # Zawsze nadpisuj plik od zera
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payments, f, ensure_ascii=False, indent=2)

    print(f"[INFO] Zapisano {len(payments)} platnosci do {OUTPUT_FILE}", file=sys.stderr)


if __name__ == "__main__":
    if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
        print("[BLAD] Brak zmiennych EMAIL_ADDRESS i EMAIL_PASSWORD", file=sys.stderr)
        sys.exit(1)

    payments = fetch_and_deduplicate()
    save(payments)
    print(json.dumps(payments, ensure_ascii=False, indent=2))
