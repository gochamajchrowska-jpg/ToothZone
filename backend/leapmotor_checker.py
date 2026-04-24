# -*- coding: utf-8 -*-
"""
leapmotor_checker.py — Sesje ładowania Leapmotor C10
Szuka maili od nonreply@app.leapmotor-international.com we wszystkich folderach.
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

LEAPMOTOR_KEYWORD = "leapmotor"


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


def is_leapmotor(msg):
    from_hdr = msg.get("From", "").lower()
    return LEAPMOTOR_KEYWORD in from_hdr


def get_folders(mail):
    """Zwraca listę wszystkich folderów IMAP."""
    typ, folder_list = mail.list()
    folders = ["INBOX"]
    if typ == "OK":
        for f in folder_list:
            try:
                f_str = f.decode("utf-8", errors="replace")
                # Format: (\HasNoChildren) "/" "Folder/Name"
                # Wyciągnij ostatnią część po separatorze
                m = re.search(r'"/" "?(.+?)"?\s*$', f_str)
                if m:
                    name = m.group(1).strip().strip('"')
                    if name and name not in folders:
                        folders.append(name)
            except Exception:
                continue
    return folders


def search_folder(mail, folder, since_days):
    """Szuka maili Leapmotor w danym folderze. Zwraca listę (folder, mail_id, msg)."""
    results = []
    try:
        rv, _ = mail.select(f'"{folder}"', readonly=True)
        if rv != "OK":
            return results

        # Kryterium wyszukiwania
        if since_days:
            since_date = (datetime.now() - timedelta(days=since_days)).strftime("%d-%b-%Y")
            criteria = f"SINCE {since_date}"
        else:
            criteria = "ALL"

        status, data = mail.search(None, criteria)
        if status != "OK" or not data[0]:
            return results

        all_ids = data[0].split()
        print(f"[Leapmotor] Folder {folder!r}: {len(all_ids)} maili do sprawdzenia", file=sys.stderr)

        for mid in all_ids:
            try:
                # Pobierz tylko nagłówek FROM najpierw (szybciej)
                s, hdr_data = mail.fetch(mid, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
                if s != "OK" or not hdr_data or not hdr_data[0]:
                    continue
                raw_hdr = hdr_data[0][1] if isinstance(hdr_data[0], tuple) else b""
                hdr_text = raw_hdr.decode("utf-8", errors="replace").lower()

                if LEAPMOTOR_KEYWORD not in hdr_text:
                    continue

                # Mamy mail Leapmotor — pobierz pełną treść
                s2, msg_data = mail.fetch(mid, "(RFC822)")
                if s2 != "OK" or not msg_data or not msg_data[0]:
                    continue

                msg = email.message_from_bytes(msg_data[0][1])
                results.append((folder, mid, msg))
                print(f"[Leapmotor] Znaleziono mail #{mid.decode()} w {folder!r}: FROM={msg.get('From','?')[:60]}", file=sys.stderr)

            except Exception as e:
                print(f"[Leapmotor] Błąd fetcha #{mid}: {e}", file=sys.stderr)
                continue

    except Exception as e:
        print(f"[Leapmotor] Błąd folderu {folder!r}: {e}", file=sys.stderr)

    return results


def fetch_leapmotor_emails():
    sessions = {}

    try:
        print(f"[Leapmotor] Łączę z {IMAP_SERVER}:{IMAP_PORT}...", file=sys.stderr)
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        print("[Leapmotor] Zalogowano.", file=sys.stderr)

        folders = get_folders(mail)
        print(f"[Leapmotor] Foldery do sprawdzenia: {folders}", file=sys.stderr)

        all_messages = []
        for folder in folders:
            msgs = search_folder(mail, folder, SINCE_DAYS)
            all_messages.extend(msgs)

        print(f"[Leapmotor] Łącznie maili Leapmotor: {len(all_messages)}", file=sys.stderr)
        mail.logout()

        # Przetwórz wiadomości
        for folder, mid, msg in all_messages:
            # Data emaila
            date_raw = msg.get("Date", "")
            try:
                parsed_date = email.utils.parsedate_to_datetime(date_raw)
                date_str = parsed_date.strftime("%d.%m.%Y")
            except Exception:
                date_str = "—"

            # Subject
            subject_raw = msg.get("Subject", "")
            parts = decode_header(subject_raw)
            subject = ""
            for part, charset in parts:
                if isinstance(part, bytes):
                    subject += part.decode(charset or "utf-8", errors="replace")
                else:
                    subject += str(part)

            body = get_body(msg)
            subject_lower = subject.lower()
            body_lower    = body.lower()

            is_start = "rozpocz" in subject_lower or ("wynosi" in body_lower and "rozpocz" in body_lower)
            is_end   = "zako" in subject_lower or "do poziomu" in body_lower

            print(f"[Leapmotor] {date_str} | Subject: {subject!r} | start={is_start} end={is_end}", file=sys.stderr)

            if is_start:
                t, lvl = parse_start(body)
                if t and lvl is not None:
                    key = f"{date_str}_{t}"
                    if key not in sessions:
                        sessions[key] = {"id": key, "date": date_str,
                                         "time_start": t, "level_start": lvl,
                                         "time_end": None, "level_end": None}
                    print(f"[Leapmotor] ✅ Start {date_str} {t} → {lvl}%", file=sys.stderr)

            elif is_end:
                t, lvl = parse_end(body)
                if t and lvl is not None:
                    # Dopasuj do sesji z tego samego dnia
                    matched = None
                    for key, s in sessions.items():
                        if s["date"] == date_str and s["level_end"] is None:
                            matched = key
                    if matched:
                        sessions[matched]["time_end"]  = t
                        sessions[matched]["level_end"] = lvl
                    else:
                        key = f"{date_str}_{t}_end"
                        sessions[key] = {"id": key, "date": date_str,
                                         "time_start": None, "level_start": None,
                                         "time_end": t, "level_end": lvl}
                    print(f"[Leapmotor] ✅ Koniec {date_str} {t} → {lvl}%", file=sys.stderr)
            else:
                print(f"[Leapmotor] ⚠️ Pominięto (nieznany typ): {subject!r}", file=sys.stderr)

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
