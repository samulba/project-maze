# Projekt eingefroren – was gilt jetzt

Stand 17.08. Das Projekt ruht auf unbestimmte Zeit. Das Repository bleibt
öffentlich, der Dienst bleibt online. Dieses Dokument sagt, was dafür
abgesichert wurde, was **von Hand** in GitHub und Railway nachzuziehen ist, und
wie man den Zustand wieder aufhebt.

## Die Ausgangslage

Drei Dinge treffen gleichzeitig zu, und nur zusammen sind sie ein Problem:

1. **Das Repository ist öffentlich.** Jeder kann lesen, forken, Issues und Pull
   Requests aufmachen.
2. **Der Dienst läuft weiter.** Wer die Adresse kennt, spielt – und verbraucht
   dabei Rechenzeit, Datenbankzeilen und Supabase-Kontingent.
3. **Niemand sieht mehr hin.** Genau das ist der Unterschied zu vorher. Ein
   Missbrauch, der im laufenden Betrieb in Stunden auffällt, läuft in einer
   Pause wochenlang.

## Was im Code abgesichert ist

### Passwort vor der ganzen Seite

`apps/server/src/site-gate.ts`. Ein Passwort, ein signiertes Cookie, kein
Konto. Geschützt ist **alles ausser `/health`**:

| Weg | Vorher | Jetzt |
| --- | --- | --- |
| Spielseite, Client-Bundle | offen | Passwort |
| `GET /ws` (WebSocket) | offen | Passwort |
| `/metrics` | offen (bzw. `METRICS_TOKEN`) | Passwort |
| `/leaderboard`, `/profile/:id`, `/map` | offen | Passwort |
| `POST /client-metrics` | offen | Passwort |
| `/admin` | Google-Login + Allowlist | Passwort **und** Google-Login + Allowlist |
| `/health` | offen | **weiterhin offen** |

`/health` ist bewusst frei: Railway prüft darüber, ob der Dienst lebt
(`railway.json`), und die Deploy-Wache der CI liest denselben Endpunkt. Ein Tor
davor würde den Dienst bei jedem Deploy als tot melden. Der Endpunkt verrät
Zählerstände und Feature-Schalter, keine Spieldaten.

Der WebSocket ist der wichtigste Punkt in dieser Tabelle. Ohne ihn wäre die
Abfrage Fassade: Gespielt wird über den Socket, nicht über die HTML-Seite – ein
Skript mit `new WebSocket(...)` säße in der Arena, während die Startseite brav
nach dem Passwort fragt.

**Das Tor ist von sich aus an.** Ohne gesetzte Variable greift das
Standardpasswort aus `site-gate.ts`. Das steht dort im Klartext, und das ist
Absicht: Das Repository ist öffentlich, also wäre auch ein Hash in Sekunden
zurückgerechnet. Der Standard schützt nicht gegen jemanden, der hinsieht – er
sorgt nur dafür, dass die Tür auch dann zu ist, wenn niemand mehr eine Variable
in Railway setzt. Für echten Schutz `SITE_PASSWORD` setzen (siehe unten).

Brute-Force: nach fünf Fehlversuchen je IP wird gesperrt, die Sperre verdoppelt
sich (30 s → 15 min Deckel) und vergisst nach einer Stunde Ruhe. Das richtige
Passwort hilft während einer laufenden Sperre nicht.

Der Compose-Stack liefert den Client über nginx aus, also am Node-Prozess
vorbei. `apps/client/nginx.conf` fragt für jede dieser Dateien per
`auth_request` beim Server nach (`/gate/check`) – das Passwort steht damit an
genau einer Stelle.

**Lokale Entwicklung ist ausgenommen.** `npm run dev` setzt
`SITE_GATE_ENABLED=false` (`apps/server/src/dev.ts`). Grund: Vite liefert die
Seite auf Port 5173 aus, der Spielserver hört auf 2567 – das Cookie hinge am
falschen Port, und das Spiel wäre lokal unbenutzbar, ohne dass die Ursache
irgendwo sichtbar würde. Produktion fasst `dev.ts` nie an (das Image startet
`node apps/server/dist/index.js`), der Weg ist also nicht mit der Live-Seite
verbunden. Zum Ausprobieren: `SITE_GATE_ENABLED=true npm run dev`.

### CI

`.github/workflows/ci.yml` läuft **nur noch auf Knopfdruck**
(`workflow_dispatch`). Die `push`- und `pull_request`-Auslöser sind seit dem
14.08. auskommentiert; der Inhalt steht unverändert da, um ihn später
zurückzuholen. Solange das so bleibt, verbraucht ein Push – auch ein fremder
Pull Request – keine Actions-Minuten.

Der auskommentierte Block ist die einzige Falle in dieser Datei: Wer ihn
wiederbelebt, startet damit sofort wieder drei Jobs pro Push.

## Was von Hand nachzuziehen ist

Diese Schritte gehen nicht über Code. Sie sind der Teil, der wirklich zählt.

### GitHub (Repository-Einstellungen)

- [ ] **Settings → Actions → General → Actions permissions:** auf *Disable
      actions* stellen. Das ist der einzige Schalter, der garantiert, dass gar
      nichts läuft – ein Workflow-File kann jede Session wieder ändern.
- [ ] **Settings → Branches:** Schutzregel für `main` (keine direkten Pushes,
      keine Force-Pushes, keine Löschung).
- [ ] **Settings → General → Features:** Issues und Wiki abschalten, solange
      niemand hinsieht. Unbeantwortete Issues in einem toten Projekt sind
      schlechter als gar keine.
- [ ] **Settings → General → Pull Requests:** nichts weiter nötig – Forks
      können in einem öffentlichen Repo ohnehin keine Secrets sehen und ohne
      `pull_request`-Trigger keine Minuten verbrauchen.

### Railway

- [ ] `SITE_PASSWORD` auf etwas Zufälliges setzen (nicht das Standardpasswort).
      Danach `https://www.mazers.de/health` aufrufen: unter `gate` muss
      `enabled: true` und `defaultPassword: false` stehen.
- [ ] `ALLOWED_ORIGIN` auf die echte Domain setzen, falls dort noch `*` steht.
- [ ] `ENABLE_DEV_TOOLS` muss `false` sein.
- [ ] Erwägen, den Dienst ganz zu pausieren. Das Tor spart Missbrauch, aber
      nicht die Grundkosten eines laufenden Containers. Wenn das Spiel während
      der Pause niemand braucht, ist Abschalten die ehrlichere Lösung.

### Supabase

- [ ] Wenn der Railway-Dienst abgeschaltet wird: Projekt ebenfalls pausieren.
- [ ] Sonst nichts. Der `service_role`-Key liegt ausschliesslich in den
      Railway-Variablen und war nie im Repository (nachgeprüft am 17.08.).

## Wie man das Tor wieder aufmacht

Für **einen** Besucher: Passwort weitergeben. Mehr ist nicht nötig – es gibt
keine Konten und keine Freischaltung.

Alle hinauswerfen: `SITE_PASSWORD` ändern (oder `SITE_GATE_SECRET` setzen). Der
Signaturschlüssel hängt am Passwort, also entwertet ein Wechsel jedes
ausgegebene Cookie sofort.

Ganz aufmachen: `SITE_GATE_ENABLED=false`. Dann verhält sich der Server exakt
wie vor dem Tor.

## Wenn das Projekt wieder anläuft

1. `SITE_GATE_ENABLED=false` setzen – oder das Tor stehen lassen, solange nur
   Testspieler hereinsollen.
2. In `.github/workflows/ci.yml` den `on:`-Block wieder einkommentieren und
   dabei die Frage von damals beantworten: Braucht es wirklich alle drei Jobs,
   oder deckt die Hosting-Plattform einen davon schon ab?
3. In GitHub Actions wieder erlauben (siehe Checkliste oben).
