"""
vulcan_fetch.py
===============
Pobiera dane ucznia z e-dziennika UONET+ (Vulcan) przez nieoficjalne API.
Wyświetla wynik jako JSON na standardowe wyjście (stdout).

Jak działa logowanie w vulcan-api v2.x:
  1. Tworzysz Keystore (jednorazowo) - to "wirtualne urządzenie mobilne"
  2. Rejestrujesz go podając symbol szkoły, email i hasło -> dostajesz Account
  3. Zapisujesz oba obiekty do pliku JSON (żeby nie rejestrować się każdym razem)
  4. Przy kolejnych uruchomieniach ładujesz z pliku i logujesz się

Wymagania:
  pip install vulcan-api

Użycie:
  python vulcan_fetch.py
"""

import asyncio
import json
import os
import sys
from datetime import date

# Główne klasy z biblioteki vulcan-api
from vulcan import Keystore, Account, Vulcan

# ==============================================================
# KONFIGURACJA — uzupełnij swoimi danymi lub ustaw zmienne env
# ==============================================================

SYMBOL   = os.getenv("VULCAN_SYMBOL",   "TWÓJ_SYMBOL")    # np. "warszawa" lub kod szkoły
USERNAME = os.getenv("VULCAN_USERNAME", "TWÓJ_EMAIL")      # adres e-mail do e-dziennika
PASSWORD = os.getenv("VULCAN_PASSWORD", "TWOJE_HASŁO")     # hasło do e-dziennika

# Pliki do przechowywania danych logowania (żeby nie rejestrować się przy każdym uruchomieniu)
KEYSTORE_FILE = "keystore.json"
ACCOUNT_FILE  = "account.json"


# ==============================================================
# KROK 1: Zaloguj się lub załaduj zapisane dane logowania
# ==============================================================

async def get_client() -> Vulcan:
    """
    Zwraca gotowego klienta Vulcan.
    - Jeśli pliki keystore.json i account.json istnieją -> ładuje z pliku
    - Jeśli nie -> rejestruje nowe urządzenie i zapisuje pliki
    """

    if os.path.exists(KEYSTORE_FILE) and os.path.exists(ACCOUNT_FILE):
        # Załaduj zapisany keystore i account (szybsze, nie wymaga ponownej rejestracji)
        print("[INFO] Ładowanie zapisanych danych logowania...", file=sys.stderr)

        with open(KEYSTORE_FILE) as f:
            keystore = Keystore.load(f)

        with open(ACCOUNT_FILE) as f:
            account = Account.load(f)

    else:
        # Pierwsze uruchomienie — zarejestruj jako nowe urządzenie mobilne
        print("[INFO] Rejestrowanie nowego urządzenia (pierwsze uruchomienie)...", file=sys.stderr)

        # Keystore to klucze kryptograficzne "wirtualnego telefonu"
        keystore = Keystore.create()

        # Rejestracja — podaj symbol szkoły, email i hasło
        # Symbol znajdziesz w URL: https://uonetplus.vulcan.net.pl/<symbol>/
        account = await Account.register(keystore, SYMBOL, USERNAME, PASSWORD)

        # Zapisz do pliku — przy kolejnych uruchomieniach nie trzeba się rejestrować
        with open(KEYSTORE_FILE, "w") as f:
            f.write(keystore.as_json)

        with open(ACCOUNT_FILE, "w") as f:
            f.write(account.as_json)

        print("[INFO] Zapisano keystore.json i account.json", file=sys.stderr)

    # Utwórz i zwróć klienta API
    return Vulcan(keystore, account)


# ==============================================================
# KROK 2: Pobierz dane ucznia
# ==============================================================

async def fetch_data() -> dict:
    """
    Łączy się z API i pobiera:
    - dane ucznia (imię, nazwisko, klasa)
    - oceny
    - lekcje z bieżącego tygodnia
    Zwraca słownik gotowy do serializacji do JSON.
    """

    async with await get_client() as client:

        # --- Uczeń ---
        # Pobierz listę uczniów przypisanych do konta
        students = await client.get_students()
        # Ustaw pierwszego ucznia jako aktywnego
        client.student = students[0]
        student = client.student

        student_info = {
            "imie_nazwisko": student.full_name,        # np. "Jan Kowalski"
            "klasa":         student.class_.symbol if student.class_ else None,  # np. "3A"
            "szkola":        student.school.name if student.school else None,
        }

        # --- Oceny ---
        grades_list = []
        # get_grades() zwraca AsyncIterator — iterujemy przez niego
        async for grade in await client.data.get_grades():
            grades_list.append({
                "przedmiot":  grade.column.subject.name if grade.column and grade.column.subject else None,
                "ocena":      grade.content,           # treść oceny, np. "5", "4+", "np"
                "waga":       grade.column.weight if grade.column else None,
                "data":       str(grade.date_created.date) if grade.date_created else None,
                "nauczyciel": str(grade.teacher_created) if grade.teacher_created else None,
                "kategoria":  grade.column.category.name if (grade.column and grade.column.category) else None,
            })

        # --- Lekcje (plan lekcji z bieżącego tygodnia) ---
        lessons_list = []
        today = date.today()

        # get_lessons() przyjmuje date_from i date_to (obiekt date)
        async for lesson in await client.data.get_lessons(date_from=today, date_to=today):
            lessons_list.append({
                "przedmiot":   lesson.subject.name if lesson.subject else None,
                "data":        str(lesson.date.date) if lesson.date else None,
                "godzina_od":  str(lesson.time.from_) if lesson.time else None,
                "godzina_do":  str(lesson.time.to) if lesson.time else None,
                "sala":        lesson.room.code if lesson.room else None,
                "nauczyciel":  str(lesson.teacher) if lesson.teacher else None,
                "odwolana":    lesson.changes.type.name if (lesson.changes and lesson.changes.type) else None,
            })

        # Złóż końcowy wynik
        result = {
            "uczen":   student_info,
            "oceny":   grades_list,
            "lekcje":  lessons_list,
        }

        return result


# ==============================================================
# KROK 3: Uruchom i wypisz JSON
# ==============================================================

async def main():
    # Sprawdź czy podano dane logowania
    if "TWÓJ" in SYMBOL or "TWÓJ" in USERNAME or "TWOJE" in PASSWORD:
        print(
            "[BŁĄD] Uzupełnij dane logowania!\n"
            "  Opcja 1 — zmienne środowiskowe:\n"
            "    set VULCAN_SYMBOL=twoj_symbol\n"
            "    set VULCAN_USERNAME=email@szkola.pl\n"
            "    set VULCAN_PASSWORD=haslo\n"
            "  Opcja 2 — edytuj stałe SYMBOL / USERNAME / PASSWORD w pliku skryptu.",
            file=sys.stderr
        )
        sys.exit(1)

    try:
        data = await fetch_data()
        # Wypisz czytelny JSON na stdout (ensure_ascii=False — polskie znaki)
        print(json.dumps(data, ensure_ascii=False, indent=2))

    except Exception as e:
        # Wypisz błąd na stderr żeby nie mieszać z JSON-em na stdout
        print(f"[BŁĄD] {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
