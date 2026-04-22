"""
vulcan_script.py
================
Pobiera dane ucznia z e-dziennika UONET+ (Vulcan).
Wypisuje wynik jako JSON na stdout.
"""

import asyncio
import json
import os
import sys
from datetime import date

from vulcan import Keystore, Account, Vulcan

# ── Konfiguracja ─────────────────────────────────────────────
SYMBOL   = os.getenv("VULCAN_SYMBOL",   "")
USERNAME = os.getenv("VULCAN_USERNAME", "")
PASSWORD = os.getenv("VULCAN_PASSWORD", "")

KEYSTORE_FILE = os.path.join(os.path.dirname(__file__), "keystore.json")
ACCOUNT_FILE  = os.path.join(os.path.dirname(__file__), "account.json")


async def get_client():
    """Zwraca gotowego klienta Vulcan (ładuje lub rejestruje)."""

    if os.path.exists(KEYSTORE_FILE) and os.path.exists(ACCOUNT_FILE):
        print("[INFO] Ładowanie zapisanych danych logowania...", file=sys.stderr)
        with open(KEYSTORE_FILE) as f:
            keystore = Keystore.load(f)
        with open(ACCOUNT_FILE) as f:
            account = Account.load(f)
    else:
        print("[INFO] Rejestrowanie nowego urządzenia...", file=sys.stderr)

        # POPRAWKA: Keystore.create() jest async — wymaga await
        keystore = await Keystore.create()

        # Rejestracja konta
        account = await Account.register(keystore, SYMBOL, USERNAME, PASSWORD)

        # Zapisz do pliku
        with open(KEYSTORE_FILE, "w") as f:
            f.write(keystore.as_json)
        with open(ACCOUNT_FILE, "w") as f:
            f.write(account.as_json)

        print("[INFO] Zapisano keystore.json i account.json", file=sys.stderr)

    return Vulcan(keystore, account)


async def fetch_data():
    """Pobiera dane ucznia, oceny i lekcje."""

    async with await get_client() as client:

        # Uczeń
        students = await client.get_students()
        client.student = students[0]
        student = client.student

        student_info = {
            "imie_nazwisko": student.full_name,
            "klasa":  student.class_.symbol if student.class_ else None,
            "szkola": student.school.name   if student.school  else None,
        }

        # Oceny
        grades_list = []
        async for grade in await client.data.get_grades():
            grades_list.append({
                "przedmiot": grade.column.subject.name if (grade.column and grade.column.subject) else None,
                "ocena":     grade.content,
                "waga":      grade.column.weight       if grade.column else None,
                "data":      str(grade.date_created.date) if grade.date_created else None,
                "nauczyciel":str(grade.teacher_created)   if grade.teacher_created else None,
                "kategoria": grade.column.category.name   if (grade.column and grade.column.category) else None,
            })

        # Lekcje (dzisiaj)
        lessons_list = []
        today = date.today()
        async for lesson in await client.data.get_lessons(date_from=today, date_to=today):
            lessons_list.append({
                "przedmiot":  lesson.subject.name  if lesson.subject else None,
                "data":       str(lesson.date.date) if lesson.date   else None,
                "godzina_od": str(lesson.time.from_) if lesson.time  else None,
                "godzina_do": str(lesson.time.to)    if lesson.time  else None,
                "sala":       lesson.room.code       if lesson.room  else None,
                "nauczyciel": str(lesson.teacher)    if lesson.teacher else None,
            })

        return {
            "uczen":  student_info,
            "oceny":  grades_list,
            "lekcje": lessons_list,
        }


async def main():
    if not SYMBOL or not USERNAME or not PASSWORD:
        print("[BŁĄD] Brak zmiennych środowiskowych VULCAN_SYMBOL, VULCAN_USERNAME, VULCAN_PASSWORD", file=sys.stderr)
        sys.exit(1)

    try:
        data = await fetch_data()
        print(json.dumps(data, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"[BŁĄD] {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
