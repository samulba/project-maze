# 06 – Google-Login-UI (Supabase)

**Branch:** `claude/project-maze-google-login-ui-o2q3n4` · **Basis:** `main` @ `08e4d91` · **Status: in main**

## Was drin ist

- `@supabase/supabase-js` als Client-Abhängigkeit; der Client entsteht nur aus
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
- **Fehlen die Variablen, existiert der ganze Login-Pfad nicht.** Kein grauer
  Knopf, kein Hinweis, nichts – Gast wie bisher. Ein toter Knopf ist schlimmer
  als kein Knopf.
- Dezenter „Mit Google anmelden"-Knopf, der nicht mit ARENA BETRETEN
  konkurriert; nach der Rückkehr vom Redirect wird die Sitzung übernommen und
  der angemeldete Zustand gezeigt (Name + Abmelden).
- Namensfeld wird mit dem Google-Namen **vorbelegt, nicht erzwungen** – wer
  selbst tippt, behält seine Eingabe.
- `authToken` in jeder Join-Nachricht, auch beim automatischen Reconnect: Das
  Token wird dort frisch über `getSession()` geholt, statt das alte zu wiederholen.
- Jeder Login-Fehler ist ein Toast. Gast bleibt immer spielbar.

## Nachgewiesen

Ohne echtes Google-Konto: ein Supabase-Stub im Browser plus ein präparierter
`localStorage`-Eintrag im Format `sb-<erstes URL-Label>-auth-token`.

- ohne ENV: kein Login-Element im DOM, Join ohne `authToken`
- angemeldet: Name vorbelegt, Join **mit** `authToken`
- Reconnect: Socket aus der Seite heraus geschlossen → „VERBINDUNG VERLOREN" →
  automatischer Reconnect → zweiter Join, wieder mit Token

## Geänderte Dateien

`auth.ts(+test)`, `auth-panel.ts`, `auth.css`, `main.ts`, `ui.ts`,
`apps/client/package.json`

## Von 01 gebraucht

Nichts im Code. Betrieb: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`
müssen zur **Bauzeit** gesetzt sein – Vite backt sie ins Bundle, ein späteres
Setzen in Railway wirkt nicht.
