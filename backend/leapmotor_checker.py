# -*- coding: utf-8 -*-
"""
leapmotor_checker.py
====================
Pobiera maile od nonreply@app.leapmotor-international.com
i parsuje sesje ładowania samochodu Leapmotor C10.

Typy maili:
  - "Rozpoczęto ładowanie." → poziom startowy
  - "Ładowanie zakończone"  → poziom końcowy

argv: email password imap_server imap_port [since_days]
"""

import imaplib
import email
import json
import os
import re
import sys
from email.header import decode_header
from datetime import datetime, timedelta

import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ── Konfiguracja ─────────────────────────────────────────────
if len(sys.argv) >= 3:
    EMAIL_ADDRESS  = sys.argv[1]
    EMAIL_PASSWORD = sys.argv[2]
    IMAP_SERVER    = sys.argv[3] if len(sys.argv) > 3 else "imap.wp.pl"
    IMAP_PORT      = int(sys.argv[4]) if len(sys.argv) > 4 else 993
    SINCE_DAYS     = int(sys.argv[5]) if len(sys.argv) > 5 else None
else:
    EMAIL_ADDRESS  = os.getenv("EMAIL_ADDRESS", "")
    EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
    IMAP_SERVER    = os.getenv("IMAP_SERVER", "imap.wp.pl")
    IMAP_PORT      = int(os.getenv("IMAP_PORT", "993"))
    SINCE_DAYS     = None

LEAPMOTOR_SENDER = "nonreply@app.leapmotor-international.com"


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
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                return decode_payload(part)
    return decode_payload(msg)


def parse_start(body, date_str):
    """
    "Czas pojazdu  08:41, Aktualny poziom akumulatora w pojeździe C10 wynosi 15%. Rozpoczęto ładowanie."
    → { time: "08:41", level_start: 15 }
    """
    m_time  = re.search(r"Czas pojazdu\s+(\d{1,2}:\d{2})", body)
    m_level = re.search(r"wynosi\s+(\d+)%", body)
    if not m_time or not m_level:
        return None
    return {
        "time_start":  m_time.group(1),
        "level_start": int(m_level.group(1)),
        "date":        date_str,
    }


def parse_end(body, date_str):
    """
    "Czas pojazdu 16:44 Pojazd C10 został naładowany do poziomu 99% i ładowanie zostało zakończone."
    → { time: "16:44", level_end: 99 }
    """
    m_time  = re.search(r"Czas pojazdu\s+(\d{1,2}:\d{2})", body)
    m_level = re.search(r"do poziomu\s+(\d+)%", body)
    if not m_time or not m_level:
        return None
    return {
        "time_end":  m_time.group(1),
        "level_end": int(m_level.group(1)),
        "date":      date_str,
    }


def fetch_leapmotor_emails():
    sessions = {}  # key = "YYYY-MM-DD_HH:MM" (start time) → session dict

    try:
        print(f"[Leapmotor] Łączę z {IMAP_SERVER}:{IMAP_PORT}...", file=sys.stderr)
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        mail.select("INBOX")
        print("[Leapmotor] Zalogowano.", file=sys.stderr)

        # Zakres dat
        if SINCE_DAYS:
            since_date = (datetime.now() - timedelta(days=SINCE_DAYS)).strftime("%d-%b-%Y")
            criteria = f'FROM "{LEAPMOTOR_SENDER}" SINCE {since_date}'
        else:
            criteria = f'FROM "{LEAPMOTOR_SENDER}"'

        status, data = mail.search(None, criteria)
        if status != "OK":
            print("[Leapmotor] Brak wyników.", file=sys.stderr)
            return []

        mail_ids = data[0].split()
        print(f"[Leapmotor] Znaleziono {len(mail_ids)} maili.", file=sys.stderr)

        for mail_id in mail_ids:
            status, msg_data = mail.fetch(mail_id, "(RFC822)")
            if status != "OK":
                continue

            msg = email.message_from_bytes(msg_data[0][1])

            # Data emaila
            date_raw = msg.get("Date", "")
            try:
                parsed_date = email.utils.parsedate_to_datetime(date_raw)
                date_str = parsed_date.strftime("%d.%m.%Y")
            except Exception:
                date_str = "—"

            subject_raw = msg.get("Subject", "")
            parts = decode_header(subject_raw)
            subject = ""
            for part, charset in parts:
                if isinstance(part, bytes):
                    subject += part.decode(charset or "utf-8", errors="replace")
                else:
                    subject += str(part)

            body = get_body(msg)

            if "Rozpoczęto" in subject or "Rozpoczeto" in subject or "Rozpocz" in subject:
                parsed = parse_start(body, date_str)
                if parsed:
                    key = f"{date_str}_{parsed['time_start']}"
                    if key not in sessions:
                        sessions[key] = {
                            "id":          key,
                            "date":        date_str,
                            "time_start":  parsed["time_start"],
                            "level_start": parsed["level_start"],
                            "time_end":    None,
                            "level_end":   None,
                        }
                    print(f"[Leapmotor] Start: {date_str} {parsed['time_start']} poziom {parsed['level_start']}%", file=sys.stderr)

            elif "zakończone" in subject or "zakonczone" in subject or "zako" in subject.lower():
                parsed = parse_end(body, date_str)
                if parsed:
                    # Dopasuj do sesji startowej z tego samego dnia
                    matched = False
                    for key, session in sessions.items():
                        if session["date"] == date_str and session["level_end"] is None:
                            session["time_end"]  = parsed["time_end"]
                            session["level_end"] = parsed["level_end"]
                            matched = True
                            break
                    if not matched:
                        # Brak sesji startowej — utwórz niekompletną
                        key = f"{date_str}_{parsed['time_end']}_end"
                        sessions[key] = {
                            "id":          key,
                            "date":        date_str,
                            "time_start":  None,
                            "level_start": None,
                            "time_end":    parsed["time_end"],
                            "level_end":   parsed["level_end"],
                        }
                    print(f"[Leapmotor] Koniec: {date_str} {parsed['time_end']} poziom {parsed['level_end']}%", file=sys.stderr)

        mail.logout()

    except Exception as e:
        print(f"[Leapmotor] Błąd: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)

    # Sortuj od najnowszych
    result = sorted(sessions.values(), key=lambda s: s["date"], reverse=True)
    print(f"[Leapmotor] Sesje: {len(result)}", file=sys.stderr)
    return result


if __name__ == "__main__":
    if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
        print("[Błąd] Brak EMAIL_ADDRESS i EMAIL_PASSWORD", file=sys.stderr)
        sys.exit(1)
    sessions = fetch_leapmotor_emails()
    print(json.dumps(sessions, ensure_ascii=False, indent=2))
