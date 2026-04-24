# -*- coding: utf-8 -*-
"""
leapmotor_checker.py — Sesje ładowania Leapmotor C10
argv: email password imap_server imap_port [since_days]
"""

import imaplib, email, json, os, re, sys
from email.header import decode_header
from datetime import datetime, timedelta
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

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
    if not raw: return ""
    for enc in [part.get_content_charset() or "utf-8", "utf-8", "cp1250", "latin-1"]:
        try: return raw.decode(enc)
        except: continue
    return raw.decode("utf-8", errors="replace")


def get_body(msg):
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                return decode_payload(part)
    return decode_payload(msg)


def decode_subject(raw):
    parts = decode_header(raw or "")
    result = ""
    for part, charset in parts:
        if isinstance(part, bytes):
            result += part.decode(charset or "utf-8", errors="replace")
        else:
            result += str(part)
    return result


def parse_start(body):
    m_time  = re.search(r"Czas pojazdu\s+(\d{1,2}:\d{2})", body)
    m_level = re.search(r"wynosi\s+(\d+)%", body)
    if m_time and m_level:
        return m_time.group(1), int(m_level.group(1))
    return None, None


def parse_end(body):
    m_time  = re.search(r"Czas pojazdu\s+(\d{1,2}:\d{2})", body)
    m_level = re.search(r"do poziomu\s+(\d+)%", body)
    if m_time and m_level:
        return m_time.group(1), int(m_level.group(1))
    return None, None


def fetch_leapmotor_emails():
    sessions = {}

    try:
        print(f"[Leapmotor] Łączę z {IMAP_SERVER}:{IMAP_PORT}...", file=sys.stderr)
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        print("[Leapmotor] Zalogowano.", file=sys.stderr)

        # Sprawdź wszystkie foldery
        typ, folder_list = mail.list()
        folders = []
        if typ == "OK":
            for f in folder_list:
                try:
                    f_str = f.decode("utf-8", errors="replace")
                    m = re.search(r'"/" (.+)$', f_str)
                    if m:
                        name = m.group(1).strip().strip('"')
                        folders.append(name)
                except Exception:
                    continue
        if not folders:
            folders = ["INBOX"]
        print(f"[Leapmotor] Foldery: {folders}", file=sys.stderr)

        all_mail_ids = []  # lista (folder, id)

        for folder in folders:
            try:
                rv, _ = mail.select(f'"{folder}"', readonly=True)
                if rv != "OK":
                    continue

                # Szukaj po FROM
                searches = [
                    f'FROM "nonreply@app.leapmotor-international.com"',
                    f'FROM "leapmotor-international.com"',
                    f'FROM "leapmotor"',
                ]
                if SINCE_DAYS:
                    since = (datetime.now() - timedelta(days=SINCE_DAYS)).strftime("%d-%b-%Y")
                    searches = [s + f" SINCE {since}" for s in searches]

                folder_ids = set()
                for criteria in searches:
                    try:
                        status, data = mail.search(None, criteria)
                        if status == "OK" and data[0]:
                            ids = data[0].split()
                            folder_ids.update(ids)
                            if ids:
                                print(f"[Leapmotor] {folder!r} '{criteria}': {len(ids)}", file=sys.stderr)
                    except Exception as e:
                        print(f"[Leapmotor] Search error: {e}", file=sys.stderr)

                for mid in folder_ids:
                    all_mail_ids.append((folder, mid))

            except Exception as e:
                print(f"[Leapmotor] Folder {folder!r} error: {e}", file=sys.stderr)
                continue

        print(f"[Leapmotor] Łącznie maili: {len(all_mail_ids)}", file=sys.stderr)

        current_folder = None
        for folder, mid in all_mail_ids:
            try:
                if folder != current_folder:
                    mail.select(f'"{folder}"', readonly=True)
                    current_folder = folder

                s, msg_data = mail.fetch(mid, "(RFC822)")
                if s != "OK" or not msg_data or not msg_data[0]:
                    continue

                msg = email.message_from_bytes(msg_data[0][1])

                # Sprawdź FROM
                from_hdr = msg.get("From", "").lower()
                if "leapmotor" not in from_hdr:
                    continue

                # Data
                try:
                    parsed_date = email.utils.parsedate_to_datetime(msg.get("Date", ""))
                    date_str = parsed_date.strftime("%d.%m.%Y")
                except Exception:
                    date_str = "—"

                subject = decode_subject(msg.get("Subject", ""))
                body = get_body(msg)
                sl = subject.lower()
                bl = body.lower()

                is_start = "rozpocz" in sl or ("wynosi" in bl and "rozpocz" in bl)
                is_end   = "zako" in sl or "do poziomu" in bl

                print(f"[Leapmotor] {date_str} {subject!r} start={is_start} end={is_end}", file=sys.stderr)

                if is_start:
                    t, lvl = parse_start(body)
                    if t and lvl is not None:
                        key = f"{date_str}_{t}"
                        if key not in sessions:
                            sessions[key] = {"id": key, "date": date_str,
                                             "time_start": t, "level_start": lvl,
                                             "time_end": None, "level_end": None}
                        print(f"[Leapmotor] ✅ Start {date_str} {t} {lvl}%", file=sys.stderr)

                elif is_end:
                    t, lvl = parse_end(body)
                    if t and lvl is not None:
                        matched = next((k for k, s in sessions.items()
                                        if s["date"] == date_str and s["level_end"] is None), None)
                        if matched:
                            sessions[matched]["time_end"]  = t
                            sessions[matched]["level_end"] = lvl
                        else:
                            key = f"{date_str}_{t}_end"
                            sessions[key] = {"id": key, "date": date_str,
                                             "time_start": None, "level_start": None,
                                             "time_end": t, "level_end": lvl}
                        print(f"[Leapmotor] ✅ Koniec {date_str} {t} {lvl}%", file=sys.stderr)
                else:
                    print(f"[Leapmotor] ⚠️ Pominięto: {subject!r}", file=sys.stderr)

            except Exception as e:
                import traceback
                print(f"[Leapmotor] Błąd maila: {e}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                continue

        mail.logout()

    except Exception as e:
        import traceback
        print(f"[Leapmotor] Błąd: {type(e).__name__}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

    result = sorted(sessions.values(), key=lambda s: s["date"], reverse=True)
    print(f"[Leapmotor] Sesje: {len(result)}", file=sys.stderr)
    return result


if __name__ == "__main__":
    if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
        print("[Błąd] Brak EMAIL_ADDRESS i EMAIL_PASSWORD", file=sys.stderr)
        sys.exit(1)
    sessions = fetch_leapmotor_emails()
    print(json.dumps(sessions, ensure_ascii=False, indent=2))
