# Auftrag für Chat 04 – Infra/Betrieb

**Ausgestellt: 2026-08-06 (3. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-04/UEBERGABE.md` – Rolle, Regeln,
> Sicherheitsauflagen und die Fallen, die uns schon Zeit gekostet haben.
> Danach diese Datei.

Paket 11 ist gemerged. Deine Deploy-Untersuchung war die beste Arbeit dieser
Runde – vor allem, weil du nicht bei „Watch-Paths" stehengeblieben bist,
sondern die Erklärung **widerlegt** hast: `d8568b6` hat selbst keine Datei in
`apps/server` oder `packages/shared` angefasst und wurde trotzdem deployt. Der
Schnitt liegt zeitlich, nicht in den Pfaden.

## Deine Frage 1 ist beantwortet – deine Gegenhypothese stimmt

Du wolltest von Sam wissen, ob die Seite hell oder dunkel ist. Ich kann es
dir sagen, ich hatte den Screenshot: **Sie war hell.** Der Diep-Umbau war live,
während `/health` noch `d8568b6` meldete.

Damit ist es entschieden, und zwar in Richtung deiner Gegenhypothese: **Die
Deploys liefen die ganze Zeit. `/health` hat gelogen.** Es gab nie einen
Deploy-Stillstand – meine ursprüngliche Diagnose war falsch, und du hast den
Weg gefunden, sie zu widerlegen, statt sie zu bestätigen. Das ist die Sorte
Skepsis, die dieses Projekt braucht.

Zwei Ursachen, die sich nicht ausschließen:

1. **`RAILWAY_GIT_COMMIT_SHA` ist als Service-Variable fest verdrahtet** –
   deine Vermutung. Dann meldet `/health` für immer denselben Commit.
2. **`/health` hatte kein `Cache-Control`** und wurde mit ETag ausgeliefert –
   ein Browser-Tab zeigt den alten Rumpf. Das habe ich am 06.08. behoben
   (`no-store`), aber es erklärt nur Sams Abruf, nicht einen dauerhaft alten
   Wert.

## Das Paket

**1. Die Deploy-Wache scharf machen – sie kann heute nicht grün werden.**
Dein `deploy-watch` pollt `/health`, bis der gepushte Commit dort steht. Wenn
`RAILWAY_GIT_COMMIT_SHA` fest verdrahtet ist, wird das **nie** passieren: Die
Wache schlägt bei jedem Push fehl, aus einem Grund, der nichts mit dem Deploy
zu tun hat. Eine Wache, die immer rot ist, wird nach drei Tagen ignoriert –
und dann ist sie schlimmer als keine.

Sam prüft die Service-Variablen (steht bei ihm auf der Liste). Bau darauf auf:
Solange die Ursache nicht raus ist, muss die Wache **unterscheiden können**
zwischen „nicht deployt" und „`commit` ist unbrauchbar". `uptimeSeconds` ist
dafür genau das richtige Werkzeug – du hast es selbst eingebaut. Ein Prozess,
der seit 40 Sekunden läuft, ist frisch deployt, egal was `commit` behauptet.
Formulier die Fehlermeldung entsprechend: Sie soll sagen, **welcher der drei
Fälle** vorliegt, nicht nur dass etwas nicht stimmt.

**2. Deine offenen Punkte zu Ende bringen.** Was im Bericht unter „Was 03 noch
fehlt" und in den drei Festlegungen steht, ziehst du selbst zu Ende, soweit es
dein Revier ist. Wenn die verdichteten Balance-Läufe noch offen sind, sind sie
jetzt dran – deine eigene Einschränkung war „ein Lauf je Konfiguration ist noch
keine Messung", und die Frage, ob Control und Impact gleichzeitig einbrechen
oder ob das Streuung war, ist weiterhin unbeantwortet.

## Kontext

- **KL4 ist gemerged** (02, Paket 13). Der Balance-Report trägt jetzt den Block
  `FAMILIEN-UPGRADES — DOMINANZPRUEFUNG`.
- **`FAMILY_UPGRADES_ENABLED` bleibt aus**, bis 03 die `Digit0`-Zuordnung
  geliefert hat – sonst verlieren Rapid- und Impact-Spieler Signature-Stärke,
  die sie über die Tastatur nicht zurückkaufen können. Das ist eine
  Betriebswarnung, keine Feinheit.
- **Der Grundlook ist zurückgebaut** – Sam hat den hellen Diep-Look live
  verworfen. Rein client-seitig, keine Deploy-Wirkung. Für dich nur relevant,
  weil „ist die Seite hell oder dunkel?" ab jetzt **keine** Deploy-Diagnose
  mehr ist: Beide Stände sind inzwischen dunkel.

Statusbericht wie gehabt nach `docs/status/chat-04/`, mit `LATEST.md`.
