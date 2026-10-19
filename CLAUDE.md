# Finanzübersicht – Projektbeschreibung

Web-App für eine Gesamtübersicht über Sparvermögen und Anlagen. Kein Haushaltsbuch.
Kernziel: **lückenlose, tagesgenaue Performanceberechnung über frei wählbare Zeiträume** –
ein Kauf am 12. Januar muss anders zählen als einer am 30. November.

Nutzer: Jean. Kommunikation auf Deutsch.

---

## Arbeitsweise (verbindlich)

- **Keine eigenmächtigen Änderungen am Code.** Ideen zuerst als Vorschlag formulieren,
  Umsetzung vorab im Detail abklären, erst nach Freigabe bauen.
- **Etappen:** Große Aufgaben in Etappen aufteilen. Nach jeder Etappe ein lauffähiger
  Zwischenstand mit eigener Versionsnummer (Commit), damit bei einem Abbruch nichts
  von vorn beginnen muss.
- **Veröffentlichung:** Freigegebene und getestete Änderungen lädt Claude direkt auf
  `main` hoch, ohne Pull Request. GitHub Pages veröffentlicht automatisch
  (https://7zd5zyccrd-beep.github.io/FA/). Nach etwa einer Minute in der App „Neu laden“
  tippen; die Versionsnummer zeigt, ob der neue Stand da ist.
- Jean arbeitet mobil, **Hauptaugenmerk: iPhone** (Safari), daneben iPad. Alles muss
  dort voll bedienbar sein (Touch, Bildschirmtastatur, Hoch- und Querformat).
  Gestaltung zuerst für den schmalen iPhone-Bildschirm.

---

## Plattform und Speicherung (festgelegt)

- Web-App, veröffentlicht über **GitHub Pages**, Nutzung als Home-Bildschirm-App am iPhone (und iPad).
- Daten **nur lokal** im Browser (IndexedDB). Kein Server, keine Cloud-Synchronisation.
- Pflicht: **Sicherung als Datei exportieren und wieder einlesen**, dazu eine
  Sicherungserinnerung (Safari kann Daten länger nicht genutzter Seiten löschen).
- Repository ist öffentlich: **keine API-Schlüssel oder persönlichen Daten im Code.**
  Schlüssel für Kursquellen gibt Jean in der App ein, sie werden lokal gespeichert.

---

## Umfang Start: Wertpapiere (festgelegt)

- Arten: **Aktien, ETFs, aktive Fonds, Anleihen**
- **Fremdwährungen** kommen vor (z. B. US-Aktien)
- **Kapitalmaßnahmen** (Splits u. a.) kommen vor und müssen abgebildet werden
- Mehrere Depots (z. B. Comdirect)
- Weitere Anlagearten (Tagesgeld, Festgeld, Bausparen, Versicherungen) später

### Erfassung (festgelegt)
- **Von Hand.** Kein PDF- oder CSV-Import zum Start.
- Transaktionsarten: Kauf, Verkauf, Dividende/Ausschüttung, Kapitalmaßnahme,
  ggf. Ein-/Auslieferung (Depotübertrag).
- Je Transaktion: Datum, Wertpapier (ISIN), Stückzahl (auch Bruchstücke), Kurs,
  Währung und Devisenkurs, Gebühren, Steuern (Abgeltungsteuer, Soli, Kirchensteuer,
  Quellensteuer) getrennt, Börsenplatz, Notiz.
- Anleihen: Kurs in % vom Nennwert, Stückzinsen berücksichtigen.

### Sparpläne
- **Jede Ausführung wird einzeln erfasst** (festgelegt – nötig für genaue Rendite).
- Vorgeschlagen, noch zu bestätigen: Sparplan-Vorlage (Wertpapier, Betrag, Rhythmus);
  die App schlägt fällige Ausführungen vor, Jean trägt Kurs und Stückzahl aus der
  Abrechnung ein und bestätigt.

---

## Kurse (festgelegt, mit hohen Anforderungen)

- **Kurse zu Kauf- und Verkaufszeitpunkten trägt Jean selbst ein** (aus der Abrechnung).
- **Stichtagskurse kommen aus Online-Quellen.** Anforderung: präzise und höchstverlässlich.
- Achtung: Für die zeitgewichtete Rendite wird der Wert *aller* Positionen an *jedem*
  Transaktionstag gebraucht – also Tagesschlusskurse für beliebige Daten, nicht nur
  Monats- oder Jahresenden.
- Vorgeschlagen, noch zu bestätigen:
  - Jeder Kurs wird mit Quelle, Börsenplatz, Datum und Abrufzeit lokal gespeichert
  - Jeder Kurs kann von Hand überschrieben werden (sichtbar markiert)
  - Plausibilitätsprüfung meldet auffällige Sprünge
  - Fremdwährungen über die **EZB-Referenzkurse**
- **Offen:** Welche Kursquelle. Wird in Etappe 1 getestet, bevor entschieden wird.
  Problempunkte: Abdeckung deutscher Fonds/ETFs per ISIN, Abruf direkt aus dem
  Browser (CORS), Verlässlichkeit, Kosten.

---

## Performance (festgelegt)

- Beide Methoden anzeigen:
  - **Geldgewichtet (interner Zinsfuß, IZF):** Rendite aus Sicht des Anlegers,
    berücksichtigt Zeitpunkt und Höhe der Ein- und Auszahlungen.
  - **Zeitgewichtet (TWR):** Rendite der Anlagen an sich, bereinigt um Zu- und
    Abflüsse, vergleichbar mit Fonds/Index.
- Zeiträume frei wählbar (Monat, Jahr, seit Beginn, beliebiger Bereich).
- Je Wertpapier, je Depot und gesamt.
- **Vor und nach Steuern, umschaltbar.**

---

## Etappen (vorgeschlagen)

1. **kurs-test.html** – ISIN und Datum eingeben, Kurs aus Kandidatenquellen abrufen,
   mit Abrechnungen vergleichen. Danach Entscheidung über die Kursquelle.
   *Stand v0.1.2:* Quellen onvista, Yahoo, EODHD, Twelve Data, Alpha Vantage,
   OpenFIGI (nur Zuordnung), EZB-Devisenkurse; Testprotokoll als CSV;
   Eingabe per ISIN oder WKN (WKN wird über onvista in die ISIN übersetzt).
2. **Grundgerüst** – Depots, Wertpapiere, Transaktionen, Sicherung/Wiederherstellung.
3. **Bewertung** – Bestände zu jedem Datum (inkl. Kapitalmaßnahmen), Kursabruf und
   Kursspeicher, Devisenkurse.
4. **Performance** – IZF und TWR für frei wählbare Zeiträume, vor/nach Steuern.
5. **Darstellung** – Verlaufsdiagramme, Jahresvergleich.

---

## Ideen für später

- Funktionen nach Vorbild **DivvyDiary** (Jean nutzt die App gern): Dividendenkalender
  mit Zahl- und Ex-Tagen, Nettodividenden, Auswertungen nach Sektor, Land, Region,
  Währung, Wertpapiertyp. Braucht eine Datenquelle für Dividendentermine.
- CSV-Export, z. B. für den Import in DivvyDiary.
- Weitere Anlagearten (Tagesgeld, Festgeld, Bausparen, Versicherungen).

---

## Hintergrund: Datenquellen bei der Bank

Vollständigste Quelle für Altdaten sind die PDF-Abrechnungen im Postfach der Bank
(bei Comdirect: PostBox). Kontoumsätze zeigen nur Geldbeträge ohne Stückzahl, Kurs,
Gebühren- und Steueraufschlüsselung.
