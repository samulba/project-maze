/**
 * Sams Rückmeldungen als **eine Liste, an einer Stelle**.
 *
 * Der Anlass ist wörtlich: „MACH AUS DIESEM GANZEN FEEDBACK AUCH EINE LISTE,
 * DAMIT WIR JA NICHTS VERGESSEN […] sonst vergessen wir immer zu viel und ich
 * sag dir 30 mal, dass du das und das ändern sollst. UND ICH WILL DIE LISTE IM
 * ADMIN BEREICH SEHEN KÖNNEN UND AUCH WAS ERLEDIGT WURDE, WAS NOCH OFFEN IST."
 *
 * Deshalb steht sie hier und nicht in einer Markdown-Datei: `shared` lesen
 * Server und Client gemeinsam, das Admin-Portal zeigt sie also aus derselben
 * Quelle, aus der auch die Berichte zitieren. Eine Liste, die man an zwei
 * Stellen pflegen muss, ist nach zwei Wochen an einer davon falsch.
 *
 * ## Regeln für diese Datei
 *
 * * **Sams Wortlaut bleibt stehen** (`wunsch`). Er ist der Prüfstein: Wenn
 *   der Eintrag erledigt ist, muss sich *dieser Satz* erledigt haben – nicht
 *   das, was ich daraus gemacht habe.
 * * **`erledigt` braucht einen Beleg** (`nachweis`): Commit, Bericht oder
 *   Messung. Ohne Beleg bleibt es `offen`.
 * * Nichts wird gelöscht. Erledigtes bleibt sichtbar, sonst ist am Ende nicht
 *   mehr nachvollziehbar, was schon einmal beantwortet wurde.
 */

export type BacklogStand = 'offen' | 'arbeit' | 'erledigt' | 'verworfen';

export type BacklogBereich = 'drohnen' | 'projektile' | 'karte' | 'klassen' | 'bots' | 'ui' | 'bug';

export interface BacklogEintrag {
  id: string;
  /** Sams eigene Worte, gekürzt aber nicht umformuliert. */
  wunsch: string;
  bereich: BacklogBereich;
  stand: BacklogStand;
  /** Datum der Rückmeldung, ISO. */
  gemeldet: string;
  /** Commit, Bericht oder Messung – nur bei `erledigt` gefüllt. */
  nachweis?: string;
  /** Was zu tun ist bzw. was getan wurde, in einem Satz. */
  notiz?: string;
}

export const BACKLOG: readonly BacklogEintrag[] = [
  // ---------------------------------------------------------------- Spieltest 13.08., erste Runde
  {
    id: 'D1',
    wunsch: 'Die Drohnen ziehen einen Strich in die Bildecke.',
    bereich: 'drohnen',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: 'de63139',
    notiz: 'PixiJS `arc()` setzte am Pfadanfang (0,0) an; Zeichnung in drone-draw.ts herausgezogen und getestet.'
  },
  {
    id: 'D2',
    wunsch: 'Das macht ja gar keinen Sinn, dass sie einfach um dich schweben und dann nix passiert.',
    bereich: 'drohnen',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: 'b6ef43b',
    notiz: 'Drohnen suchen sich selbst Ziele. Gemessen 0 → 47–165 Schaden je Sekunde je nach Klasse.'
  },
  {
    id: 'D3',
    wunsch: 'Rechtsklick so clean wie möglich von Diep.io kopieren.',
    bereich: 'drohnen',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: 'b6ef43b',
    notiz: 'Stößt jetzt vom Cursor weg statt hinter den Tank zu spiegeln.'
  },
  {
    id: 'P1',
    wunsch: 'Die Schüsse gehen noch immer zu weit und sind von Anfang an zu schnell.',
    bereich: 'projektile',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '6035238',
    notiz: 'Erster Anlauf (Deckel 1400) griff bei den normalen Klassen nie. Jetzt Reichweiten-Skala: core 1271 → 636 px.'
  },
  {
    id: 'P2',
    wunsch: 'Es fehlt der Rückstoß bei den Klassen, die viel schießen. Aber jetzt auch nicht zu stark.',
    bereich: 'projektile',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: 'cb75f35',
    notiz: 'Rund 25 px/s Drift, über die Position getragen – die Geschwindigkeit bleibt unberührt.'
  },
  {
    id: 'K1',
    wunsch: 'Die Map ist noch zu wenig Maze – dickere Wände, mehr Wände.',
    bereich: 'karte',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: 'd471107',
    notiz: 'Echter Labyrinth-Generator. Begehbar 90,3 → 71,8 %, weite Blicke 46,4 → 19,5 %.'
  },
  {
    id: 'K2',
    wunsch: 'Zwei Mainspots.',
    bereich: 'karte',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: 'd471107',
    notiz: 'West- und Ostplatz, je 800 × 800 px, vier Tore, ein Drittel aller Formen.'
  },
  {
    id: 'C1',
    wunsch: 'Alle Klassen fühlen sich gleich an – der eine schießt drei nach vorne, der andere zwei.',
    bereich: 'klassen',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '7c92e34 (Schritt 1 – Salve statt Fächer) · 24ec93c (Schritt 2 – Pro-Lauf-Profile auf Storm) · fc946ba (Schritt 3 – Smasher und Trapper)',
    notiz: 'Stufe 4 komplett: Schritt 1 (Salve statt Fächer), Schritt 2 (Pro-Lauf-Profile – Storms mittlere Läufe treffen härter und fliegen langsamer, die äußeren schwächer und schneller, Gesamtschaden/Sekunde unverändert) und Schritt 3 (fehlende Archetypen). Schritt 3 bestand aus drei Teilen: Factory-Minions war über D8 bereits erledigt; neu dazu kommen der rohrlose Smasher (kein Rohr, reiner Aufprall, trägt Blitz/Comets Rammkurve) und Trapper (stehendes Projektil – der Schuss fliegt kurz und bleibt dann als Falle liegen, neue Mechanik `trapAfter`).'
  },

  // ---------------------------------------------------------------- Spieltest 13.08., zweite Runde
  {
    id: 'D4',
    wunsch: 'Drohnen brauchen noch ein Rework – die Bewegung ist noch nicht so clean, Rechtsklick und Auto-Modus gehen wesentlich smoother.',
    bereich: 'drohnen',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '69aecea',
    notiz: 'Rechtsklick-Ziel fest statt wandernd (Fächer statt Einzelpunkt); Zielgedächtnis gegen Flackern an der Suchradius-Grenze (84 px → 5 px Spannweite).'
  },
  {
    id: 'D5',
    wunsch: 'Drohnen bewegen sich noch zu schnell.',
    bereich: 'drohnen',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '69aecea',
    notiz: 'Tempo-Verhältnis Drohne:Besitzer 1,38–2,20× → 1,00–1,58×; Beschleunigungsrampe 0,28–0,33 s → 0,37–0,44 s.'
  },
  {
    id: 'D6',
    wunsch: 'Alles was gegen Wände geht sollte kaputtgehen (Drohnen etc.).',
    bereich: 'drohnen',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '69aecea',
    notiz: 'Frontalaufprall (Restgeschwindigkeit < 30 % des Anlaufs) zerstört die Drohne; Streifschuss beim Navigieren (20× häufiger) bleibt folgenlos.'
  },
  {
    id: 'D7',
    wunsch: 'Die Bots benutzen bei Drohnen kein Rechtsklick.',
    bereich: 'bots',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '48b1afd',
    notiz: 'Rechtsklick jetzt an die Fluchterkennung gekoppelt (Schutzschild beim Rückzug) statt an blosse Nähe. Gemessen: 17,4 % der Ticks bei niedrigem Leben, 0,0 % bei gesunder Flotte.'
  },
  {
    id: 'D8',
    wunsch: 'Factory ist noch keine Factory, sondern einfach Mini-Drohnen.',
    bereich: 'drohnen',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '830d20c – eigenes Minion-Geschütz für factory/carrier (zusätzlich zum Kontakt), gemessen: +25 bis +35 DPS'
  },
  {
    id: 'U1',
    wunsch: 'Die Minimap unten rechts sollte die GANZE Map zeigen und nicht nur, wo man gerade ist.',
    bereich: 'ui',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '52a37c4 – GET /map liefert das ganze Kartenlayout einmal, Minimap steht jetzt auf Weltmitte statt Kamera',
    notiz: 'Macht zugleich die beiden Hauptplätze auffindbar.'
  },
  {
    id: 'K3',
    wunsch: 'Die Blöcke sollten sich nicht überschneiden, sondern immer clean aneinanderreihen.',
    bereich: 'karte',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '6035238',
    notiz: 'Pfosten auf den Kreuzungen, Segmente dazwischen. Ein Test prüft alle Wandpaare auf Überlappung.'
  },
  {
    id: 'B1',
    wunsch: 'Wenn man eine Klasse aussuchen kann, kann man nicht mehr upgraden, solange man keine neue Klasse gewählt hat.',
    bereich: 'bug',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '6035238',
    notiz: 'Das Upgrade-Panel war auf `pointer-events: none` gesetzt. Jetzt stehen beide nebeneinander; Wächter in der Layout-Matrix.'
  },

  // ---------------------------------------------------------------- Spieltest 13.08., dritte Runde
  {
    id: 'P3',
    wunsch: 'Die Bullets fliegen zu WEIT direkt von Anfang an, also die normalen.',
    bereich: 'projektile',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '6035238',
    notiz: '51 von 55 Klassen schießen jetzt nicht weiter, als man sieht – vorher 4 von 55.'
  },
  {
    id: 'P4',
    wunsch: 'Die „normalen" [Kugeln] … zu schnell.',
    bereich: 'projektile',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '6035238',
    notiz: 'Abschlag am Ende der Rechnung: Ausweichzeit auf 400 px 0,67 → 0,79 s, ohne die Klassen einzuebnen.'
  },
  {
    id: 'P5',
    wunsch: 'Die „normalen" [Kugeln] … zu viel.',
    bereich: 'projektile',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '6035238',
    notiz: 'Kugeln gleichzeitig in der Luft: im Schnitt 4,4 → 2,2, bei core 7,4 → 4,3.'
  },
  {
    id: 'P6',
    wunsch: 'Zu klein – bzw. wenn man mehr levelt, müssen die etwas größer werden, wie in Diep.io.',
    bereich: 'projektile',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '6035238',
    notiz: 'Radius jetzt levelabhängig: core 43 % des Panzers auf Stufe 1, 67 % auf Stufe 60. Vorher konstant 32 %.'
  },

  // ---------------------------------------------------------------- Spieltest 13.08., vierte Runde
  {
    id: 'U2',
    wunsch: 'Von wo der Damage kam: mega coole Anzeige, nur noch etwas dezenter und kleiner machen.',
    bereich: 'ui',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '739b643 – Trefferkeil schmaler, dünner, dunkler; dasselbe Muster, weniger dominant'
  },
  {
    id: 'K4',
    wunsch: 'Nicht ZU VIELE Sackgassen – so maximal 5 bis 7 ist ok, der Rest ist zu viel.',
    bereich: 'karte',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '6035238',
    notiz: 'Gezielt aufgelöst statt über die Verflechtung: jetzt 6 – und das Labyrinth wurde dabei sogar besser.'
  },
  {
    id: 'U3',
    wunsch: 'Unten links, wenn man eliminiert wurde: der Countdown und der „Respawn bereit"-Text schauen bisschen kake aus.',
    bereich: 'ui',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '0deb725 – eigene Meta-Typografie statt vererbtem Fließtext, "Respawn bereit" farblich abgesetzt'
  },
  {
    id: 'U4',
    wunsch: 'Wenn ich nicht F11-Fullscreen habe, gibt es links und rechts Ränder, weil es nicht responsive ist.',
    bereich: 'ui',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '0deb725 – bildschirmfüllender Modus ist jetzt die Vorgabe (Sams Wahl), fest 16:9 bleibt als Option'
  },
  {
    id: 'U5',
    wunsch: 'Unten links das Widget mit Dropdown „CORE LOADOUT" und den zwei Dingern geht cleaner – man kann es kaum lesen.',
    bereich: 'ui',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '0deb725 – Auswahlfelder untereinander statt nebeneinander, volle Kartenbreite je Feld'
  },
  {
    id: 'U6',
    wunsch: 'Das Klassenrad (Taste C) ist super, aber noch etwas CLEANER – und man soll den Hintergrund sehen, um zu merken, wenn man angegriffen wird.',
    bereich: 'ui',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '0deb725 – Schleier eine Spur dichter (Mitte 97→98,5%, Rand 86→91%), Rand bleibt sichtbar heller'
  },
  {
    id: 'C2',
    wunsch: 'Bei den Tanks könnte man die Schussröhre etwas dicker machen, von Tank zu Tank unterschiedlich – damit man mit dem Design spielen kann.',
    bereich: 'klassen',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '739b643 – barrelHeightFor leitet die Breite aus der Lauflänge ab, jede Klasse dicker als vorher, außer Sniper'
  },
  {
    id: 'B2',
    wunsch: 'Beim Zuschauen sind ab und zu random gelbe Ringe im Screen.',
    bereich: 'bug',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '38e2e4b – drei Effekte prüften „ist das im Bild" gegen die eigene Leiche statt gegen den Killer',
    notiz: 'Per Code-Diagnose gefunden und behoben (spectator.ts erklärt den Mechanismus selbst), nicht live im Browser nachgestellt – bitte beim nächsten Zuschauen gegenprüfen.'
  },
  {
    id: 'U7',
    wunsch: 'Seinen eigenen Namen beim Tank muss man nicht sehen, das ist unnötig.',
    bereich: 'ui',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '3686266 – eigener Name zeigt am eigenen Tank nichts mehr an, Gegner behalten ihren Namen'
  },
  {
    id: 'U8',
    wunsch: 'Diese Zahlen, wenn man was damaged – auch kake, raus damit.',
    bereich: 'ui',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '3686266 – keine Schadenszahl mehr über einem Gegner, den man selbst trifft'
  },
  {
    id: 'C3',
    wunsch: 'Bei SNIPER ist ein mini dünnes Rohr, aber lang, dafür eine richtig fette Kugel – die passt da ja gar nicht durch.',
    bereich: 'klassen',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '739b643 – barrelHeightFor sichert für jede Klasse eine Mindestbreite aus dem eigenen projectileRadius',
    notiz: 'Hing mit C2 zusammen: Rohrbreite und Kugelgröße müssen zueinander passen. Dieselbe Funktion löst beides.'
  },
  {
    id: 'BO1',
    wunsch: 'Die Bots bewegen sich sehr komisch, sehr random und bothaft – nicht wie echte Spieler.',
    bereich: 'bots',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '52c5f40 – gemessen: perfekter Leerlauf-Kreis ersetzt, Strafe-Wechsel halbiert, Richtungssprünge 9,3°→~7°/Tick',
    notiz: 'Die auffälligsten geometrischen/ruckartigen Muster behoben, kein echtes Pathfinding durchs Labyrinth – das wäre ein eigenes, größeres Paket.'
  },
  {
    id: 'BO2',
    wunsch: 'Bei den Bots sollte man nicht sehen, dass es Bots sind.',
    bereich: 'bots',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '3686266 – keine "BOT"-Marke mehr am Tank-Namensschild oder in der Bestenliste (Bewegung selbst = BO1, bleibt offen)'
  },
  {
    id: 'U9',
    wunsch: 'Kein Level direkt beim Tank – nur oben rechts im Leaderboard.',
    bereich: 'ui',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: '3686266 – Level nicht mehr am Tank, steht weiterhin in der Bestenliste'
  },
  {
    id: 'U10',
    wunsch: 'Ich will die Liste im Admin-Bereich sehen können, und auch was erledigt wurde, was noch offen ist.',
    bereich: 'ui',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: 'diese Datei + /admin/api/backlog',
    notiz: 'Eine Quelle für Server, Client und Berichte.'
  },

  // ---------------------------------------------------------------- Spieltest 13.08., dritte Runde
  {
    id: 'U11',
    wunsch: 'Das Fenster für die neue Spezialisierung ist nichtmehr ganz rechts.',
    bereich: 'ui',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: 'a067377 – Wahl steht jetzt rechts oben statt links unten; Bestenliste weicht, solange eine Wahl ansteht',
    notiz: 'Layout-Prüfstand über 23 Fenstergrößen/Zustände: 21/23 grün, zwei unverwandte Altbefunde bestehen unverändert.'
  },
  {
    id: 'BAL1',
    wunsch: 'Die Tanks sind noch immer viel zu unbalanced – als LVL 60 Vortex fühlt man sich unbesiegbar: mega schnell, mega viel HP, riesiger Spread, alles. Überall fehlt das komplette Balancing.',
    bereich: 'klassen',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: 'ec5392c – vier Punkte-Koeffizienten geglättet, DPS/Leben/Tempo liegen jetzt bei 2,21x/2,25x/1,50x statt 2,84x/1,90x/1,30x',
    notiz: 'Deine Wahl auf Rückfrage: Punkte-Ökonomie global glätten, gilt für jede Klasse gleich. Gemessen (siehe BAL2): Ein L60 Vortex mit ausgewogenem Punkteeinsatz trug 273 statt 96 DPS (2,84x), aber nur 224 statt 118 Leben (1,9x) und 364 statt 280 Tempo (1,3x) gegenüber L1 – die Punkte-Ökonomie verstärkte Schaden deutlich stärker als Überleben oder Tempo, weil DPS aus zwei Feldern zusammenmultipliziert (Schaden × Nachladen), Leben und Tempo aber je nur aus einem. Vier Koeffizienten angepasst (combat-tuning.ts, movementStatsFor in shared): Schaden 0,07→0,055, Nachladen 0,95→0,965 (Exponent), max. Leben 0,09→0,125, Tempo 0,03→0,05. Jetzt: DPS 2,21x, Leben 2,25x, Tempo 1,50x – DPS und Leben liegen praktisch gleichauf statt 0,94 Punkte auseinander (scripts/messungen/messung-bal1-oekonomie.mjs). Deckt NICHT einzelne Klassenwerte ab (z. B. Vortex-Spread bleibt, wie er ist) – das war explizit nicht Teil der gewählten Option.'
  },
  {
    id: 'BAL2',
    wunsch: 'Auch fairer gegen kleinere (niedrigstufige) Tanks: Hochstufige sollen sie nicht so schnell töten können, aber die kleinen sollen dafür schneller abhauen können.',
    bereich: 'klassen',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: 'c59e878 – Schadensabschlag (bis −35 %) und Flucht-Tempo (bis +30 %, 2,5 s) ab 15 Stufen Differenz, gedeckelt ab 45',
    notiz: 'Gemessen: Vortex L60 (balanced) gegen unbewegliches L1 Core – TTK 0,49 s → 0,88 s (scripts/messungen/messung-bal2-fairness.mjs). Wirkt automatisch mit auf BAL1, deckt aber nicht dessen breitere Forderung "überall Balancing fehlt" ab.'
  },
  {
    id: 'K5',
    wunsch: 'An den Rändern der Karte darf komplett keine Mauer sein – man soll das Gefühl haben, einmal am Rand entlang durchrennen zu können.',
    bereich: 'karte',
    stand: 'erledigt',
    gemeldet: '2026-08-13',
    nachweis: 'c3f7abb – Randzellen bilden jetzt eine durchgehende Schleife, gemessen 0/2984 Randpunkte blockiert',
    notiz: 'Begehbare Fläche 71,8→74,0 %, weite Blicke 19,5→22,7 % – bleibt im Labyrinth-Korridor aus K1.'
  }
];

export interface BacklogZaehlung {
  gesamt: number;
  offen: number;
  arbeit: number;
  erledigt: number;
  verworfen: number;
  /** Anteil erledigt, 0–1. Verworfenes zählt nicht als offen. */
  fortschritt: number;
}

export function zaehleBacklog(eintraege: readonly BacklogEintrag[] = BACKLOG): BacklogZaehlung {
  const zaehle = (stand: BacklogStand): number => eintraege.filter((e) => e.stand === stand).length;
  const erledigt = zaehle('erledigt');
  const verworfen = zaehle('verworfen');
  const zaehlend = eintraege.length - verworfen;
  return {
    gesamt: eintraege.length,
    offen: zaehle('offen'),
    arbeit: zaehle('arbeit'),
    erledigt,
    verworfen,
    fortschritt: zaehlend === 0 ? 1 : erledigt / zaehlend
  };
}

/** Nach Bereich gruppiert, jeweils Offenes zuerst – so liest man eine Liste. */
export function backlogNachBereich(eintraege: readonly BacklogEintrag[] = BACKLOG): Array<{ bereich: BacklogBereich; eintraege: BacklogEintrag[] }> {
  const rang: Record<BacklogStand, number> = { arbeit: 0, offen: 1, erledigt: 2, verworfen: 3 };
  const gruppen = new Map<BacklogBereich, BacklogEintrag[]>();
  for (const eintrag of eintraege) {
    const liste = gruppen.get(eintrag.bereich) ?? [];
    liste.push(eintrag);
    gruppen.set(eintrag.bereich, liste);
  }
  return [...gruppen.entries()]
    .map(([bereich, liste]) => ({ bereich, eintraege: [...liste].sort((a, b) => rang[a.stand] - rang[b.stand]) }))
    .sort((a, b) => {
      const offenA = a.eintraege.filter((e) => e.stand === 'offen' || e.stand === 'arbeit').length;
      const offenB = b.eintraege.filter((e) => e.stand === 'offen' || e.stand === 'arbeit').length;
      return offenB - offenA;
    });
}
