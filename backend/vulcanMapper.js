// ============================================================
//  vulcanMapper.js
//  Przekształca surowe dane z Vulcan API na format wydarzeń
//  używany przez aplikację Tooth Zone.
//
//  Wejście (z Python skryptu):
//    {
//      uczen:  { imie_nazwisko, klasa, szkola },
//      oceny:  [ { przedmiot, ocena, data, ... } ],
//      lekcje: [ { przedmiot, data, godzina_od, godzina_do, ... } ]
//    }
//
//  Wyjście (format wydarzeń Tooth Zone):
//    [
//      { title, date, category, source }
//    ]
// ============================================================


// ── mapLekcjeToEvents ────────────────────────────────────────
// Zamienia listę lekcji Vulcan na tablicę wydarzeń rodzinnych.
// Każda lekcja staje się jednym wydarzeniem z kategorią "school".
//
// @param {Array}  lekcje   - tablica lekcji z Vulcan (pole "lekcje")
// @param {string} uczenNazwa - imię i nazwisko ucznia (do tytułu)
// @returns {Array} - tablica wydarzeń w formacie Tooth Zone

function mapLekcjeToEvents(lekcje = [], uczenNazwa = "") {
  return lekcje
    // Odfiltruj lekcje bez daty lub przedmiotu — nie da się ich sensownie wyświetlić
    .filter((lekcja) => lekcja.data && lekcja.przedmiot)

    // Zamień każdą lekcję na obiekt wydarzenia
    .map((lekcja) => {
      // Zbuduj tytuł: "Matematyka (Jan Kowalski)" lub samo "Matematyka"
      const ktoPrefix = uczenNazwa ? ` (${uczenNazwa})` : "";
      const title = `${lekcja.przedmiot}${ktoPrefix}`;

      // Sformatuj datę: jeśli mamy godziny to dodaj je do daty
      // np. "2026-04-20 08:00–08:45"  lub samo "2026-04-20"
      let date = lekcja.data;
      if (lekcja.godzina_od) {
        const koniec = lekcja.godzina_do ? `–${lekcja.godzina_do}` : "";
        date = `${lekcja.data} ${lekcja.godzina_od}${koniec}`;
      }

      return {
        title,
        date,
        category: "school",    // lekcje zawsze trafiają do kategorii "school"
        source:   "vulcan",    // znacznik: skąd pochodzi wydarzenie
      };
    });
}


// ── mapOcenyToEvents ─────────────────────────────────────────
// (opcjonalne) Zamienia oceny na wydarzenia, np. "Sprawdzian z matmy — 5"
// Przydatne gdy chcesz wyświetlić oceny razem z wydarzeniami w kalendarzu.
//
// @param {Array}  oceny     - tablica ocen z Vulcan (pole "oceny")
// @param {string} uczenNazwa - imię ucznia
// @returns {Array}

function mapOcenyToEvents(oceny = [], uczenNazwa = "") {
  return oceny
    // Odfiltruj oceny bez daty — nie można ich umieścić w kalendarzu
    .filter((ocena) => ocena.data && ocena.przedmiot)

    .map((ocena) => {
      // Tytuł: "Matematyka: 5 (Jan Kowalski)"
      const ktoPrefix = uczenNazwa ? ` (${uczenNazwa})` : "";
      const title = `${ocena.przedmiot}: ${ocena.ocena}${ktoPrefix}`;

      return {
        title,
        date:     ocena.data,
        category: "school",
        source:   "vulcan",
      };
    });
}


// ── mapVulcanToEvents ────────────────────────────────────────
// Główna funkcja eksportowana.
// Przyjmuje cały obiekt danych z Vulcan i zwraca płaską tablicę
// wydarzeń gotową do użycia przez frontend.
//
// @param {Object} vulcanData - pełny obiekt { uczen, oceny, lekcje }
// @param {Object} opcje      - { includeOceny: bool } (domyślnie false)
// @returns {Array}           - posortowana tablica wydarzeń

function mapVulcanToEvents(vulcanData = {}, opcje = {}) {
  const { includeOceny = false } = opcje;

  // Pobierz imię ucznia — używane w tytułach wydarzeń
  const uczenNazwa = vulcanData.uczen?.imie_nazwisko || "";

  // Zawsze mapuj lekcje
  const lekcjeEvents = mapLekcjeToEvents(vulcanData.lekcje || [], uczenNazwa);

  // Opcjonalnie dołącz oceny
  const ocenyEvents = includeOceny
    ? mapOcenyToEvents(vulcanData.oceny || [], uczenNazwa)
    : [];

  // Połącz obie tablice i posortuj po dacie rosnąco
  const wszystkie = [...lekcjeEvents, ...ocenyEvents];

  wszystkie.sort((a, b) => {
    // Porównujemy daty jako stringi — format "YYYY-MM-DD ..." sortuje się leksykograficznie
    return a.date.localeCompare(b.date);
  });

  return wszystkie;
}


// Eksportuj wszystkie funkcje — server.js importuje mapVulcanToEvents
module.exports = { mapVulcanToEvents, mapLekcjeToEvents, mapOcenyToEvents };
