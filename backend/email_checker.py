# -*- coding: utf-8 -*-
"""
email_checker.py
================
Pobiera powiadomienia mailowe od Vulcan (noreply@vulcan.net.pl)
i zapisuje je do vulcan_messages.json.
"""

import imaplib
import email
import json
import os
import sys
import re
from email.header import decode_header
from datetime import datetime, timedelta

# Wymuś UTF-8 na stdout i stderr (naprawia polskie znaki w terminalu Windows)
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ── Konfiguracja ─────────────────────────────────────────────
# argv: email password imap_server imap_port [since_days]
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

VULCAN_SENDER = "noreply@vulcan.net.pl"
OUTPUT_FILE   = os.path.join(os.path.dirname(__file__), "vulcan_messages.json")


# ── Dekoduj nagłówek MIME (Subject itp.) ────────────────────
def decode_mime_header(header_value):
    """
    Dekoduje zakodowane nagłówki emaila na zwykły tekst UTF-8.
    Np. =?utf-8?b?V2lhZG9tb...?= → "Wiadomość od..."
    """
    if not header_value:
        return ""
    parts = decode_header(header_value)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            # Użyj podanego kodowania lub spróbuj utf-8 i cp1250 (Windows PL)
            for enc in [charset, "utf-8", "cp1250", "iso-8859-2", "latin-1"]:
                if not enc:
                    continue
                try:
                    decoded.append(part.decode(enc))
                    break
                except Exception:
                    continue
            else:
                decoded.append(part.decode("utf-8", errors="replace"))
        else:
            decoded.append(str(part))
    return " ".join(decoded).strip()


# ── Dekoduj treść części emaila ──────────────────────────────
def decode_payload(part):
    """
    Pobiera i dekoduje treść części emaila do stringa UTF-8.
    Obsługuje różne kodowania używane przez Vulcan.
    """
    raw = part.get_payload(decode=True)
    if not raw:
        return ""
    # Pobierz kodowanie zadeklarowane w nagłówku Content-Type
    charset = part.get_content_charset() or "utf-8"
    for enc in [charset, "utf-8", "cp1250", "iso-8859-2", "latin-1"]:
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode("utf-8", errors="replace")


# ── Wyciągnij nadawcę z treści HTML ─────────────────────────
def extract_sender(body):
    """
    Z treści: "Użytkownik: Jan Kowalski przesłał..."
    Zwraca:   "Jan Kowalski"
    """
    # Usuń tagi HTML przed przeszukiwaniem
    body_clean = re.sub(r"<[^>]+>", " ", body)
    match = re.search(r"Użytkownik[:\s]+(.+?)\s+przesłał", body_clean)
    if match:
        return match.group(1).strip()
    return "—"


# ── Wyciągnij temat z treści HTML ───────────────────────────
def extract_topic(body):
    """
    Z treści: "Temat: Zbiórka dla schroniska Aby przeczytać..."
    Zwraca:   "Zbiórka dla schroniska"
    Zatrzymuje się przed słowami kluczowymi stopki Vulcan.
    """
    body_clean = re.sub(r"<[^>]+>", " ", body)
    body_clean = re.sub(r"\s+", " ", body_clean)  # normalizuj białe znaki
    # Zatrzymaj się przed "Aby", "Ta wiadomość", "---" lub końcem
    match = re.search(
        r"Temat[:\s]+(.+?)\s*(?=Aby |Ta wiadomo|-----|$)",
        body_clean
    )
    if match:
        return match.group(1).strip()
    return "—"


# ── Główna funkcja ───────────────────────────────────────────
def fetch_vulcan_emails():
    messages = []

    try:
        print(f"[INFO] Łączę z {IMAP_SERVER}:{IMAP_PORT}...", file=sys.stderr)
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        print("[INFO] Zalogowano pomyślnie.", file=sys.stderr)

        mail.select("INBOX")

        # Szukaj maili od Vulcan — opcjonalnie tylko z ostatnich N dni
        if SINCE_DAYS:
            since_date = (datetime.now() - timedelta(days=SINCE_DAYS)).strftime("%d-%b-%Y")
            search_criteria = f'FROM "{VULCAN_SENDER}" SINCE {since_date}'
            print(f"[INFO] Tryb przyrostowy — maile od {since_date}", file=sys.stderr)
        else:
            search_criteria = f'FROM "{VULCAN_SENDER}"'
            print("[INFO] Tryb pełny — wszystkie maile", file=sys.stderr)

        status, data = mail.search(None, search_criteria)
        if status != "OK":
            print("[WARN] Brak wyników.", file=sys.stderr)
            return []

        mail_ids = data[0].split()
        print(f"[INFO] Znaleziono {len(mail_ids)} wiadomości.", file=sys.stderr)

        # W trybie pełnym ogranicz do ostatnich 150
        if not SINCE_DAYS:
            mail_ids = mail_ids[-150:]

        for mail_id in mail_ids:
            status, msg_data = mail.fetch(mail_id, "(RFC822)")
            if status != "OK":
                continue

            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)

            # ── Data ──
            date_raw = msg.get("Date", "")
            try:
                parsed_date = email.utils.parsedate_to_datetime(date_raw)
                date_str = parsed_date.strftime("%d.%m.%Y %H:%M")
            except Exception:
                date_str = date_raw[:16] if date_raw else "—"

            # ── Treść HTML ──
            body_text = ""
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() == "text/html":
                        body_text = decode_payload(part)
                        break
            else:
                body_text = decode_payload(msg)

            # ── Wyciągnij dane ──
            sender_name    = extract_sender(body_text)
            message_topic  = extract_topic(body_text)

            # Jeśli nie udało się wyciągnąć z treści — użyj Subject emaila
            if sender_name == "—" or message_topic == "—":
                subject = decode_mime_header(msg.get("Subject", ""))
                if message_topic == "—":
                    message_topic = subject

            record = {
                "id":         mail_id.decode(),
                "data":       date_str,
                "uzytkownik": sender_name,
                "temat":      message_topic,
                "link":       "https://eduvulcan.pl/"
            }

            messages.append(record)
            print(f"[INFO] Dodano: {date_str} | {sender_name} | {message_topic}", file=sys.stderr)

        mail.logout()

    except imaplib.IMAP4.error as e:
        print(f"[BŁĄD] IMAP: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[BŁĄD] {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)

    return messages


def save_messages(messages):
    # Sortuj od najnowszych
    messages.sort(key=lambda x: x["data"], reverse=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(messages, f, ensure_ascii=False, indent=2)
    print(f"[INFO] Zapisano {len(messages)} wiadomości do {OUTPUT_FILE}", file=sys.stderr)


if __name__ == "__main__":
    if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
        print("[BŁĄD] Brak zmiennych EMAIL_ADDRESS i EMAIL_PASSWORD", file=sys.stderr)
        sys.exit(1)

    messages = fetch_vulcan_emails()
    save_messages(messages)
    print(json.dumps(messages, ensure_ascii=False, indent=2))
