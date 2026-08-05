# 01 – Mobile-UX, Theme „Neon", Killcam, Onboarding

**Branch:** `claude/project-maze-client-polish-o2q3n4` · **Basis:** `claude/app-analysis-masterplan-lxao21` @ `1f7e911` · **Status: in main**

## Was drin ist

Vier Teile aus dem ersten Auftrag:

- **Mobile-UX.** Stick-Feintuning als eigene, getestete Mathematik
  (`stick-math.ts`): Totzone, Kurve, geglättete Richtung. Ability-Ergonomie und
  HUD-Lesbarkeit auf kleinen Screens in `mobile.css`, mit klaren vertikalen
  Zonen – der untere Bildrand gehört den Daumen, alles andere weicht darüber aus.
- **Viertes Theme „Neon"** in `themes.ts` plus Kantenlicht-Regeln im CSS.
- **Killcam** im Death-Screen: Ringpuffer der letzten Sekunden, rein
  clientseitig. (In Paket 07 durch den Live-Spectator ersetzt und ausgebaut.)
- **Onboarding** für die ersten 60 Sekunden: Schritte mit Priorität, Fokusring
  auf dem erklärten Bedienelement, Überspringen jederzeit.

## Der Fund, der zählt

**Der Ability-Button war auf Touch nie auslösbar.** `.core-ability` erbte
`pointer-events: none` von `.ui-layer`/`.hud`. Auf dem Desktop fällt das nicht
auf, weil die Leertaste dieselbe Aktion auslöst – auf dem Handy gab es die
Fähigkeit schlicht nicht. Ein `pointer-events: auto` behebt es; der Kommentar
im CSS steht bewusst dort, damit es nicht zurückfällt.

## Nachgewiesen

- Neue Tests: `stick-math.test.ts`, `killcam.test.ts`, `onboarding.test.ts`
- Zwei von den Tests gefundene eigene Fehler vor dem Push behoben:
  `smoothDirection` konvergierte bei `smoothing: 1` nie (Trägheit auf 0.9
  begrenzt), und die Killcam-Kadrierung schnitt das Opfer aus dem Bild, weil die
  Spanne mittig gerechnet, die Kamera aber zum Killer verschoben wurde.
- Onboarding: „Event gesehen" maß zuerst die Laufzeit des Events statt der
  Anzeigedauer des Hinweises – der Schritt markierte sich selbst als gelesen,
  ohne je sichtbar gewesen zu sein.

## Geänderte Dateien

`themes.ts`, `stick-math.ts(+test)`, `mobile.css`, `killcam.ts`/`killcam-view.ts`/`killcam.css(+test)`,
`onboarding.ts`/`onboarding-view.ts`/`onboarding.css(+test)`, `renderer.ts`, `input.ts`,
`gameplay-ui.ts/.css`, `main.ts`, `ui.ts`, `style.css`, `stability.css`

## Von 01 gebraucht

Nichts – reiner Client.
