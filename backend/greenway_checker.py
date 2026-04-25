# -*- coding: utf-8 -*-
"""
greenway_checker.py - Sesje ladowania GreenWay
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
    """
    Obsluguje dwa formaty maili GreenWay:
    Stary: "Stacja: X  Typ zlacza: Y  Czas ladowania: Z  Doladowana energia: W  Szacowana oplata: K PLN"
    Nowy:  etykiety i wartosci w osobnych liniach, "Calkowity koszt sesji" jako sekcja
    """
    try:
        soup = BeautifulSoup(html, "html.parser")
        lines = [l.strip() for l in soup.get_text(separator="\n").split("\n") if l.strip()]
        text  = " ".join(lines)
    except Exception:
        text  = re.sub(r"<[^>]+>", " ", html)
        text  = re.sub(r"\s+", " ", text)
        lines = text.split(" ")

    def find_inline(patterns):
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m: return m.group(1).strip()
        return None

    # ── Stacja ──
    # Stary format: "Stacja: Aldi..."
    stacja = find_inline([r"Stacja:\s*([^:]+?)(?=Typ|Czas|$)"])
    if not stacja:
        # Nowy format: po linii "Rodzaj lokalizacji" jest nazwa stacji
        for i, line in enumerate(lines):
            if line.lower() == "rodzaj lokalizacji":
                if i + 1 < len(lines):
                    stacja = lines[i + 1].strip()
                break

    # ── Zlacze ──
    zlacze = find_inline([r"Typ z[l\u0142][a\u0105]cza:\s*(\S+)"])
    if not zlacze:
        for line in lines:
            if re.match(r"^Type[12]\w*$", line):
                zlacze = line
                break

    # ── Energia ──
    energia = find_inline([r"Do[l\u0142]adowana energia:\s*([\d,\.]+ kWh)"])
    if not energia:
        # Nowy format: po "Lacznie pobrana energia" sa 2 etykiety, potem wartosci kWh
        for i, line in enumerate(lines):
            if "cznie pobrana energia" in line.lower():
                for j in range(i + 1, min(i + 8, len(lines))):
                    if re.match(r"[\d,\.]+ kWh", lines[j]):
                        energia = lines[j]
                        break
                break

    # ── Czas ──
    czas_str = find_inline([r"Czas [l\u0142]adowania:\s*(\d+\s*min[^\.]*\.?)"])
    if not czas_str:
        # Nowy format: po "Czas trwania" szukaj "X,XX min"
        for i, line in enumerate(lines):
            if "czas trwania" in line.lower():
                for j in range(i + 1, min(i + 10, len(lines))):
                    if re.match(r"[\d]+[,\.][\d]+ min", lines[j]):
                        czas_str = lines[j]
                        break
                break

    # ── Data ──
    date_match = re.search(r"(\d{2}\.\d{2}\.\d{4})\s+\d{2}:\d{2}", text)
    if date_match:
        date_str = date_match.group(1)

    # ── Koszt ──
    # Stary: "Szacowana oplata: 2,36 PLN"
    koszt_str = find_inline([r"Szacowana op[l\u0142]ata:\s*([\d,\.]+ PLN)"])
    if not koszt_str:
        # Nowy: po "Calkowity koszt sesji" sa 3 etykiety, potem wartosc PLN
        for i, line in enumerate(lines):
            if "calkowity koszt" in line.lower() or "ca\u0142kowity koszt" in line.lower():
                for j in range(i + 1, min(i + 8, len(lines))):
                    if re.match(r"[\d,\.]+ PLN", lines[j]):
                        koszt_str = lines[j]
                        break
                break

    # ── Parsuj liczby ──
    energia_kwh = None
    if energia:
        m = re.search(r"([\d,]+)", energia)
        if m:
            try: energia_kwh = float(m.group(1).replace(",", "."))
            except: pass

    koszt = None
    if koszt_str:
        m = re.search(r"([\d,]+)", koszt_str)
        if m:
            try: koszt = float(m.group(1).replace(",", "."))
            except: pass

    # Jesli brak kluczowych danych — pomij
    if not energia_kwh and not stacja:
        return None

    return {
        "id":          "gw_" + str(mail_id),
        "date":        date_str,
        "source":      "greenway",
        "stacja":      stacja or "—",
        "zlacze":      zlacze or "—",
        "czas":        czas_str or "—",
        "energia_kwh": energia_kwh,
        "energia_str": energia or "—",
        "koszt":       koszt,
        "koszt_str":   koszt_str or "—",
    }


def fetch_greenway_sessions():
    sessions = []

    try:
        print("[GreenWay] Lacze z " + IMAP_SERVER + ":" + str(IMAP_PORT) + "...", file=sys.stderr)
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        print("[GreenWay] Zalogowano.", file=sys.stderr)

        mail.select("INBOX", readonly=True)

        if SINCE_DAYS:
            since_date = (datetime.now() - timedelta(days=SINCE_DAYS)).strftime("%d-%b-%Y")
            criteria = 'FROM "' + GREENWAY_SENDER + '" SINCE ' + since_date
        else:
            criteria = 'FROM "' + GREENWAY_SENDER + '"'

        status, data = mail.search(None, criteria)
        if status != "OK" or not data[0]:
            print("[GreenWay] Brak maili.", file=sys.stderr)
            return []

        mail_ids = data[0].split()
        print("[GreenWay] Znaleziono " + str(len(mail_ids)) + " maili.", file=sys.stderr)

        for mid in mail_ids:
            try:
                s, msg_data = mail.fetch(mid, "(RFC822)")
                if s != "OK":
                    continue

                msg = email.message_from_bytes(msg_data[0][1])

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
                    print("[GreenWay] Pominieto mail #" + mid.decode() + " — brak danych sesji", file=sys.stderr)
                    continue
                sessions.append(session)
                print("[GreenWay] OK " + session["date"] + " | " + session["stacja"] + " | " + session["energia_str"], file=sys.stderr)

            except Exception as e:
                print("[GreenWay] Blad maila #" + mid.decode() + ": " + str(e), file=sys.stderr)
                continue

        mail.logout()

    except Exception as e:
        import traceback
        print("[GreenWay] Blad: " + str(type(e).__name__) + ": " + str(e), file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

    sessions.sort(key=lambda s: list(reversed(s["date"].split("."))), reverse=True)
    print("[GreenWay] Sesje: " + str(len(sessions)), file=sys.stderr)
    return sessions


if __name__ == "__main__":
    if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
        print("[Blad] Brak danych logowania", file=sys.stderr)
        sys.exit(1)
    sessions = fetch_greenway_sessions()
    print(json.dumps(sessions, ensure_ascii=False, indent=2))
