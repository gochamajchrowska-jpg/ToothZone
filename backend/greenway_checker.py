# -*- coding: utf-8 -*-
"""
greenway_checker.py — Sesje ładowania GreenWay
Pobiera podsumowania sesji z bok@greenwaypolska.pl przez Gmail IMAP.
argv: email password [imap_server] [imap_port] [since_days]
"""

import imaplib, email, json, os, re, sys
from email.header import decode_header
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

if len(sys.argv) >= 3:
    EMAIL_ADDRESS  = sys.argv[1]
    EMAIL_PASSWORD = sys.argv[2]
    IMAP_SERVER    = sys.argv[3] if len(sys.argv) > 3 else "imap.gmail.com"
    IMAP_PORT      = int(sys.argv[4]) if len(sys.argv) > 4 else 993
    SINCE_DAYS     = int(sys.argv[5]) if len(sys.argv) > 5 else None
else:
    EMAIL_ADDRESS  = os.getenv("GREENWAY_EMAIL", "")
    EMAIL_PASSWORD = os.getenv("GREENWAY_PASSWORD", "")
    IMAP_SERVER    = "imap.gmail.com"
    IMAP_PORT      = 993
    SINCE_DAYS     = None

GREENWAY_SENDER = "bok@greenwaypolska.pl"


def decode_payload(part):
    raw = part.get_payload(decode=True)
    if not raw: return ""
    for enc in [part.get_content_charset() or "utf-8", "utf-8", "cp1250", "latin-1"]:
        try: return raw.decode(enc)
        except: continue
    return raw.decode("utf-8", errors="replace")


def get_html_body(msg):
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                return decode_payload(part)
    return decode_payload(msg)


def parse_greenway_session(html, date_str, mail_id):
    """Parsuje HTML maila GreenWay i zwraca dane sesji."""
    try:
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator="\n")
    except Exception:
        # Fallback — regex na surowym HTML
        text = re.sub(r"<[^>]+>", " ", html)

    def find_val(pattern, txt):
        m = re.search(pattern, txt, re.IGNORECASE | re.UNICODE)
        return m.group(1).strip() if m else None

    stacja    = find_val(r"Stacja:\s*(.+?)(?:\n|$)", text)
    zlacze    = find_val(r"Typ z[łl]ącza:\s*(.+?)(?:\n|$)", text)
    czas_str  = find_val(r"Czas [łl]adowania:\s*(.+?)(?:\n|$)", text)
    energia   = find_val(r"Do[łl]adowana energia:\s*(.+?)(?:\n|$)", text)

    # Parsuj energię do liczby (np. "1,21 kWh" → 1.21)
    energia_kwh = None
    if energia:
        m = re.search(r"([\d,\.]+)", energia)
        if m:
            energia_kwh = float(m.group(1).replace(",", "."))

    return {
        "id":          f"gw_{mail_id}",
        "date":        date_str,
        "source":      "greenway",
        "stacja":      stacja or "—",
        "zlacze":      zlacze or "—",
        "czas":        czas_str or "—",
        "energia_kwh": energia_kwh,
        "energia_str": energia or "—",
    }


def fetch_greenway_sessions():
    sessions = []

    try:
        print(f"[GreenWay] Łączę z {IMAP_SERVER}:{IMAP_PORT}...", file=sys.stderr)
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        print("[GreenWay] Zalogowano.", file=sys.stderr)

        mail.select("INBOX", readonly=True)

        # Szukaj maili od GreenWay
        if SINCE_DAYS:
            since_date = (datetime.now() - timedelta(days=SINCE_DAYS)).strftime("%d-%b-%Y")
            criteria = f'FROM "{GREENWAY_SENDER}" SINCE {since_date}'
            print(f"[GreenWay] Szukam od {since_date}", file=sys.stderr)
        else:
            criteria = f'FROM "{GREENWAY_SENDER}"'

        status, data = mail.search(None, criteria)
        if status != "OK" or not data[0]:
            print("[GreenWay] Brak maili.", file=sys.stderr)
            return []

        mail_ids = data[0].split()
        print(f"[GreenWay] Znaleziono {len(mail_ids)} maili.", file=sys.stderr)

        for mid in mail_ids:
            try:
                s, msg_data = mail.fetch(mid, "(RFC822)")
                if s != "OK":
                    continue

                msg = email.message_from_bytes(msg_data[0][1])

                # Data
                try:
                    parsed_date = email.utils.parsedate_to_datetime(msg.get("Date", ""))
                    date_str = parsed_date.strftime("%d.%m.%Y")
                except Exception:
                    date_str = "—"

                html = get_html_body(msg)
                if not html:
                    continue

                session = parse_greenway_session(html, date_str, mid.decode())
                if session is None:
                    print(f"[GreenWay] ⚠️ Pominięto mail #{mid.decode()} — brak danych sesji", file=sys.stderr)
                    continue
                sessions.append(session)
                print(f"[GreenWay] ✅ {session['date']} | {session['stacja']} | {session['energia_str']}", file=sys.stderr)

            except Exception as e:
                print(f"[GreenWay] Błąd maila #{mid}: {e}", file=sys.stderr)
                continue

        mail.logout()

    except Exception as e:
        import traceback
        print(f"[GreenWay] Błąd: {type(e).__name__}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

    # Sortuj od najnowszych
    sessions.sort(key=lambda s: s["date"].split(".")[::-1], reverse=True)
    print(f"[GreenWay] Sesje: {len(sessions)}", file=sys.stderr)
    return sessions


if __name__ == "__main__":
    if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
        print("[Błąd] Brak danych logowania", file=sys.stderr)
        sys.exit(1)
    sessions = fetch_greenway_sessions()
    print(json.dumps(sessions, ensure_ascii=False, indent=2))
