# 05 – Arena-Direktor: dynamische Bot-Population

**Branch:** `claude/arena-director-bot-population` · **Basis:** `origin/main` @ `017d7eb` · **Status: in main**

## Was drin ist

`apps/server/src/arena-director.ts` als Tuning-Schicht nach dem
`tuneBotBrain`-Muster.

- **Zielgröße:** `baseBots − (Menschen−1)·botsPerHuman`, geklemmt. Die leere
  Arena wird wie „ein Mensch" behandelt – sonst müsste der erste Spieler warten,
  bis sich die Arena hochgephast hat. *(Vorschlag war 11 / −2 / 4; 01 hat beim
  Merge auf 8 / −1 / 3 korrigiert – siehe README.)*
- **Phasing:** genau eine Änderung pro 5-Sekunden-Fenster, egal wie weit Ist und
  Soll auseinanderliegen.
- **Despawn:** zuerst ein toter Bot, sonst der am weitesten entfernte, der
  >1600 Einheiten von jedem lebenden Menschen weg ist und seit 5 s keinen
  Treffer kassiert hat. 1600 liegt deutlich jenseits des festen Sichtfensters.
  Kein sauberer Kandidat → in dem Fenster passiert nichts: lieber ein Bot zu
  viel als einer, der mitten im Gefecht verschwindet.
- **Schwierigkeitskurve:** neue Bots starten bei 85 % des Median-Levels der
  Menschen und steigen über `internals.respawn` ein – derselbe Weg wie jeder
  Wiedereinstieg, inklusive Upgrade-Verteilung, Klassenaufstieg und Spawnschutz.

**Guardian-Schutz:** Der Hunter-Signal-Guardian und Debug-Dummies sind ebenfalls
`isBot`, haben aber keinen Bot-Zustand. Der Direktor greift nur auf
`isBot && bot !== null` zu.

Am Kern nur drei `export`-Schlüsselwörter in `game.ts` (`botState`, `BotState`,
`BOT_NAMES`), damit der Direktor Bots exakt so erzeugt wie der Konstruktor.

## Dateien

`apps/server/src/arena-director.ts` (neu), `arena-director.test.ts` (neu),
`game.ts` (nur Exporte), `index.ts`, `.env.example`, `docs/DEPLOY.md`,
`docs/DEPLOYMENT.md`, `README.md`

## Tests

22 neu / 315 gesamt grün. Vier Mutationsproben (Phasing-Sperre,
Gefechtsschutz, Abstandsregel, Guardian-Schutz) fallen jeweils im zuständigen
Test.

Beim ersten Durchlauf sind zwei Tests durchgefallen – Aufbaufehler: alle Bots auf
denselben Punkt geparkt, dadurch rammten sie sich gegenseitig und galten als „im
Gefecht". Nach Teamplan-Regel 8 umgebaut, hängt jetzt an keiner Zufallszahl.

## Von 01 gebraucht

Nichts – keine Shared-Typen, keine Client-Änderung.

## Abweichung

`ARENA_DIRECTOR_ENABLED` mit **Default `true`** ergänzt. Teamplan-Regel 4
verlangt einen Flag für Riskantes und „ohne Flag exakt wie vorher" – hier gibt
es aber keinen fehlenden Gegenpart. Kompromiss: Feature live, `false` friert die
Population auf `BOT_COUNT` ein, ein Test belegt das.
Nebenwirkung: `BOT_COUNT` ist nur noch die Startbesetzung.
