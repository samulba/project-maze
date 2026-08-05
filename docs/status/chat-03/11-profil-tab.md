# 11 – K2: Profil-Tab auf dem Startscreen

**Branch:** `claude/project-maze-profil-tab-o2q3n4` · **Basis:** `origin/main` @ `f6b510c` · **Status: OFFEN – wartet auf Merge**

## Was drin ist

Ein aufklappbares Panel in der Seitenspalte über der Bestenliste – gleiche
Formensprache, gleiche Kanten, gleiche Kopfzeile.

**Angemeldet:** Profilkarte mit änderbarem Anzeigenamen, „seit Juli 2026",
Lieblingsklasse mit Laufzahl, sechs Bestwerte (Bestscore, Bestes Level, Kills
gesamt, Beste Serie, Längster Lauf, Spielzeit) und die Achievements-Galerie.

**Die Galerie zeigt den ganzen Katalog**, nicht nur Freigeschaltetes: Eine
Liste der eigenen Erfolge ist keine Galerie – man sieht darin nicht, was es
noch zu holen gibt. Offene Einträge stehen gedämpft daneben, freigeschaltete
tragen als einzige Farbe. Namen und Beschreibungen kommen aus
`ACHIEVEMENT_CATALOG`, nicht aus der Serverantwort – so steht dort immer der
Text, den auch das Popup im Spiel zeigt.

**Namensänderung** über `POST /profile` mit dem Supabase-Token. Die
`202`-Antwort („angenommen, noch nicht geschrieben") wird optimistisch
übernommen – auf den nächsten Flush zu warten sähe für den Spieler wie ein
Fehler aus. Angezeigt wird der **vom Server bereinigte** Name, nicht der
getippte, und das Namensfeld für den Join wird gleich mit vorbelegt.

### Vier Zustände, drei davon ohne Fehlertext

| Zustand | was zu sehen ist |
|---|---|
| **Kein Login konfiguriert** | Panel existiert nicht; die Bühne fällt auf eine Spalte zurück |
| **Gast** | ein einziger leiser Satz – der Login-Knopf steht schon darüber |
| **Angemeldet, kein Serverprofil** | Karte mit Namen, dazu „Noch keine Läufe gespeichert" |
| **Angemeldet mit Profil** | volle Karte, Werte, Galerie |

Ein Fehlertext auf dem Startscreen beschreibt einen Zustand, den niemand
beheben kann – deshalb gibt es keinen.

## Nachgewiesen

Angemeldeter Zustand über eine vorbereitete Supabase-Sitzung im
`localStorage` (`getSession()` liest sie ohne Netz), Serverantworten über
Playwright-Routen:

| Fall | Ergebnis |
|---|---|
| ohne `VITE_SUPABASE_*` | `hidden: true`, Bühne `grid-template-columns: 430px` (eine Spalte) |
| Gast | Panel sichtbar, Kopfzeile „GAST", nur der Hinweissatz |
| angemeldet + Profil | Kopfzeile „12 LÄUFE", Name „Ada Lovelace", „seit Juli 2026 · Storm · 4 Läufe", 6 Werte, **7 Badges / 2 freigeschaltet** |
| angemeldet + `404` | Kopfzeile „ANGEMELDET", Google-Name „Ada L.", Hinweis auf den ersten Lauf |

**Namensänderung**, echte Anfrage mitgeschnitten:

```
POST /profile
Authorization: Bearer test-zugriffstoken
{"displayName":"Ada Lovelace II"}      ← getippt war "   Ada Lovelace II   "
→ 202  →  Feld zeigt "Ada Lovelace II"
          Toast "Name geändert"
          Join-Namensfeld ebenfalls "Ada Lovelace II"
```

Dazu 14 Unit-Tests für Adressen, Antwortprüfung, Galerie und Formatierung –
darunter: unbekannte Klasse aus einer neueren Serverfassung wird verworfen
statt roh angezeigt, ein Achievement außerhalb des Katalogs fliegt raus, und
`1 Lauf` statt `1 Läufe`.

## Design-Richtung nachgezogen (NACHTRAG vom 06.08.)

Der Startscreen hatte **eigene, fest verdrahtete Dunkeltöne** (`#090b12`,
`rgba(10,12,20,.72)`, …) und war dadurch nach 01s Anhebung der Basistöne
dunkler als der Rest der App. Fläche, Vignette, Namensfeld, Einstellungen und
Bestenliste hängen jetzt an `--bg`, `--surface` und `--strong` – sie ziehen ab
sofort automatisch mit, wenn an den Grundtönen weiter geschraubt wird.

## Geänderte Dateien

**Neu:** `profile.ts(+test)`, `profile-panel.ts`, `profile.css`
**Geändert:** `ui.ts`, `main.ts`, `start.css`

## Tests

`npm run check` grün: 41 Dateien, 531 Tests (14 neu), Build in Ordnung.

## Von 01 gebraucht

Merge. Danach ist das Profil für jedes angemeldete Konto sofort da – kein Flag,
keine neue ENV-Variable.

**Für Sam:** Ohne die eingespielte Migration `0004_profile_favorite_class.sql`
fehlt nur die Zeile „Lieblingsklasse"; alles andere steht trotzdem.

## Abweichungen und Grenzen

- **Panel statt Tab.** Der Auftrag sagt „eigener Tab/Panel". Ein Tab-Wechsel
  hätte die Bestenliste versteckt, sobald man ins Profil schaut – zwei
  aufklappbare Panels übereinander zeigen beides und folgen dem Muster, das
  „Sound & Loadout" und „Bestenliste" schon vorgeben.
- **Kein Avatar.** Der Auftrag nennt „Avatar/Name von Google". Der Server
  liefert kein Avatar-Feld, und das Google-Bild direkt einzubinden hieße, bei
  jedem Startscreen-Aufruf eine Google-URL zu laden. Das wäre eine
  Datenschutz-Entscheidung, keine Design-Entscheidung – deshalb bewusst nicht
  gemacht.
- **Kein echtes Supabase-Konto im Test.** Die Sitzung ist vorbereitet, die
  Serverantworten sind gestellt. Der Weg „echtes Google-Login → echtes Profil"
  ist erst auf der Live-Instanz prüfbar.
