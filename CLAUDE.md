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
- **Stand Test (Okt. 2026):** onvista liefert Schlusskurse vom iPhone (über `eod_history`);
  Yahoo, OpenFIGI und **EODHD** (mit Schlüssel, auch direkte Kursabfrage) werden vom Browser
  blockiert – EODHD scheidet damit ohne eigenen Server aus. Twelve Data, Alpha Vantage ungetestet.
- Erinnerung EODHD-Schlüssel erledigt (Jean hat ihn; EODHD blockiert, s. o.).

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

## Etappen

1. **kurs-test.html** – Kursquellen im Vergleich (v0.1.x). Ergebnis bisher: onvista liefert
   Schlusskurse vom iPhone (`eod_history`), Yahoo und OpenFIGI blockiert, Rest ohne Schlüssel
   ungetestet. Kursquelle der App vorerst **onvista**; zweite Quelle offen (siehe Erinnerung).
   **Dividenden (v0.2.0, Okt. 2026):** Bereich „Dividenden“ im Kurs-Test. onvista hat keine bekannte
   Dividenden-Schnittstelle – der Test zeigt Fundstellen in der Snapshot-Antwort; EODHD über `/api/div`.
   Danach: „Offene Dividenden“ in der App (erwartete Zahlung aus Bestand am Ex-Tag × Betrag je
   Aktie als vorausgefüllte Buchung; Steuern trägt Jean aus der Abrechnung ein) – freigegeben.
   Mit eingeplant (freigegeben): **„Offene Kapitalmaßnahmen“** – Splits aus derselben Quelle
   (onvista-Snapshot `stocksSplitList.list[]`: `dateSplit`, `factor` = neue Stücke je bisheriges) als Vorschlag mit Verhältnis und Bestand vorher/nachher, ein Tipp öffnet
   die vorausgefüllte Split-Buchung je Depot. **Umgesetzt in App v1.1.0** (Mehr → Offene Vorschläge;
   Abruf bei „Kurse aktualisieren“, gespeichert in meta `ca.<secId>`, ausgeblendete in `ca.dismissed`).
   onvista liefert **keine Dividende je Aktie** (nur Rendite in %, ein Ex-Tag je Geschäftsjahr, in EUR).
   Deshalb freigegeben: **Dividenden-Vorschläge aus der eigenen Historie** (Rhythmus aus erfassten
   Dividenden, Betrag = Bestand × letzte Dividende je Aktie) – **umgesetzt in App v1.2.0**
   (Rhythmus: Median der letzten Abstände, gerundet auf 1/3/6/12 Monate; nach nur einer Zahlung
   USD/CAD vierteljährlich, sonst jährlich, als „geschätzt“ markiert; ausgeblendete in `div.dismissed`).
   Alpha Vantage zurückgestellt.
2.–5. **App v1.0.0** (Okt. 2026): Grundgerüst, Bewertung, Performance, Darstellung umgesetzt,
   danach Prüfung durch UI-, UX- und Design-Fachleute, Entscheidung durch einen Vorgesetzten,
   Umsetzung in drei Etappen (v0.9.1–v0.9.3). **Jean beurteilt die fertige App noch.**

### Aufbau des Codes
- `index.html`, `css/app.css`, `js/app.js` (Navigation), `js/ctx.js` (gemeinsamer Zugriff, Version)
- `js/calc.js` Rechenkern (Bestände, Bewertung, Flüsse, TWR, IZF) – ohne DOM, in Node testbar
- `js/db.js` IndexedDB und Sicherung, `js/prices.js` onvista/EZB, `js/demo.js` Beispieldaten
- `js/views/*.js` Seiten, `js/ui.js` Bausteine, `js/chart.js` SVG-Diagramme
- Prüffälle: `node tests/calc.test.mjs` (muss vor jeder Veröffentlichung grün sein)

### Festlegungen aus der Umsetzung (von Jean noch zu bestätigen)
- **Zu- und Abflüsse:** Sicht des Depots ohne Verrechnungskonto. Kauf = Einzahlung (inkl.
  Gebühren, Stückzinsen), Verkauf/Dividende/Zinsen = Auszahlung, Ein-/Auslieferung zum Marktwert.
- **Zeitgewichtet:** Zuflüsse zählen zum Tagesanfang, Abflüsse zum Tagesende. Unter einem Jahr
  keine Hochrechnung (TWR und IZF „im Zeitraum“), ab einem Jahr zusätzlich p. a.
- **Beginn:** Ohne Bestand am Vortag beginnt ein Zeitraum mit dem ersten Kauf.
- **Nach Steuern:** nur die in Abrechnungen ausgewiesenen Steuern (inkl. Vorabpauschale,
  Erstattungen); keine latente Steuer auf unrealisierte Gewinne.
- **Bewertung:** je Wertpapier ein fester Börsenplatz; Buchungen dürfen in anderer Währung sein.
  Börsenplatz der Buchung ist freier Text; fehlende Plätze in der Vorschlagsliste auf Zuruf ergänzen.
  Fremdwährung über EZB-Referenzkurse, Anleihen in % vom Nennwert.
- **Stückzinsen** sind Zinsertrag (gezahlte negativ), nicht Kursgewinn. Einstand nach
  Durchschnittskosten.
- **Kapitalmaßnahmen:** Split (je Depot zu buchen), Umtausch, Abspaltung (Marktwert wandert).
- Umgesetzt aus den Vorschlägen: Sparplan-Vorlage mit offenen Ausführungen, Kursspeicher mit
  Quelle/Abrufzeit, Kurse von Hand (markiert), Plausibilitätshinweise, EZB-Devisenkurse.

### Zurückgestellt (aus der Fachprüfung)
- Beim Wertpapier Vorjahr/freier Zeitraum/vor-nach-Steuern direkt (bisher über Auswertung)
- „Sichern & weitere Buchung“ für das Nacherfassen vieler Abrechnungen
- Sicherungserinnerung vorübergehend ausblenden
- VoiceOver-Feinheiten, kompakte Tableiste im Querformat
- Gestaltung: Banner und Kopfblock der Übersicht, Kennzahlkarten, Überschriften,
  Achsenmarken nach Jahren/Monaten, App-Symbol
- Abgerufene Kurse, die vor dem Erfassen eines späteren Splits gespeichert wurden, gelten als
  splitbereinigt – Prüfung gegen die Abrufzeit fehlt noch (Plausibilitätsprüfung meldet Sprünge)

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
