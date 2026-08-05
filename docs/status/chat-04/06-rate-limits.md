# 06 – Rate-Limits und Missbrauchsschutz

| | |
| --- | --- |
| **Branch** | `claude/maze-rate-limits-abuse-dfb335` |
| **Commit** | `ea2e4ec` |
| **Basis** | `origin/main` (`08e4d91`) |
| **Tests** | `npm run check` grün – 32 Dateien, 389 Tests (31 neu) |
| **Status** | **offen – wartet auf Review und Merge** |

## Was gebaut wurde

Neues Modul `apps/server/src/rate-limits.ts`, **keine neue Dependency** –
Token-Buckets und Zeitstempellisten reichen für einen einzelnen Prozess.

**Verbindungen je IP**: 5 gleichzeitig (Close `1013`), 20 Beitritte/Minute.

Zur IP-Ermittlung: `x-forwarded-for` ist eine Liste, an die *jeder* Proxy
anhängt – schickt ein Angreifer den Header selbst mit, stehen seine erfundenen
Werte **links**. Vertrauenswürdig ist nur, was der eigene Proxy angehängt hat,
bei Railway also der rechteste Eintrag. Ein Test schickt genau diesen Angriff
(`1.1.1.1, 2.2.2.2, 198.51.100.7`) und prüft, dass der Bucket auf
`198.51.100.7` fällt. IPv6 wird auf /64 gebündelt – sonst wäre das Limit mit
einer neuen Adresse je Verbindung wertlos.

**Nachrichten je Verbindung**: Budget je Art (`input` 50/s, `ping` 5/s,
`respawn` 5/s, …), erst Drosseln, dann Trennen. Nach 10 sauberen Sekunden
verfällt das Strafkonto – sonst hätten sich vereinzelte Drosselungen über eine
mehrstündige Sitzung zur Trennung summiert. 250 Nachrichten/s sind eine Flut und
trennen sofort.

**HTTP**: `/leaderboard` und `/profile` mit 60/min je IP und Burst 15, danach
`429` mit `Retry-After`. `/health` bleibt bewusst ungebremst, daran hängt
Railways Healthcheck.

**Betrieb**: `abuse`-Block in `/health` mit allen Zählern,
`features.rateLimits` zeigt den Schalter. Beobachtete IPs werden nach 10 Minuten
vergessen, höchstens 20 000 gleichzeitig – IP-Rotation ist damit kein
Speicherleck.

## Zwei Dinge, die beim Messen herauskamen

1. Erste Version mit festen Sekundenfenstern: der ehrliche Lasttest wurde
   69-mal gedrosselt. Umstellung auf Token-Buckets – immer noch 124. Statt das
   Limit hochzudrehen wurde nachgemessen, wie stark der Sender bündelt: gar
   nicht (Abstände 24–26 ms, p95 = 26). Es lag also nicht am Timing.
2. Der Übeltäter war **der eigene Lasttest**: er schickte `respawn` bei *jedem*
   Snapshot, solange der Spieler tot war – 30/s statt einmal auf Knopfdruck wie
   der echte Client (im Client geprüft: der sendet nur im Button-Handler). Nach
   dem Fix: **null Drosselungen bei 11 856 Eingaben.** Das Limit hat einen
   echten Fehler im Werkzeug gefunden, bevor er in Produktion Bandbreite
   verschwendet hat. Der Fix steckt mit im Commit.

## Verifiziert

| Szenario | Ergebnis |
| --- | --- |
| 12 Clients, 25 s, 11 856 Eingaben | 12/12 Joins, 0 Abbrüche, **0 Drosselungen** |
| 8 Verbindungen von einer IP | 5 offen, 3 mit `1013` abgewiesen |
| 26 Joins in einer Minute | 20 durch, 6 abgelehnt |
| 4 000 Pings am Stück | Close `1008` |
| 20× `/leaderboard` | 15 durch, dann `429` + `Retry-After` |
| `/health` parallel dazu | durchgehend `200` |
| `RATE_LIMITS_ENABLED=false` | 8 Verbindungen offen, 0 Ablehnungen, 25/25 HTTP – exakt wie vorher |

## Bewusste Abweichungen

- **Strafkonto-Verfall nach 10 s** (nicht beauftragt): ohne ihn hätte eine lange
  ehrliche Sitzung irgendwann getrennt.
- **Loadtest-Fix** (siehe oben).

## Betriebsrisiko, das nicht wegzudefinieren ist

**5 Verbindungen je IP ist hinter Carrier-NAT knapp.** Im Mobilfunk teilen sich
viele fremde Spieler eine IPv4 – dort wäre das die wahrscheinlichste
Fehlauslösung. Der vorgeschlagene Wert bleibt Default, aber
`RATE_LIMIT_CONNECTIONS_PER_IP` ist konfigurierbar und in beiden
Deploy-Dokumenten vermerkt.

## Von 01 gebraucht

- Review und Merge von `claude/maze-rate-limits-abuse-dfb335`.
- `index.ts` ist an mehreren Stellen berührt (Verbindungs-Wächter,
  Nachrichten-Urteil, Routen, `abuse`-Block, Shutdown) – bei Konflikten mit
  parallelen Paketen ist das die Stelle.

## Für Sam

- [ ] Nach dem Merge einmal `mazers.de/health` → `abuse` prüfen
- [ ] `TRUST_PROXY_HOPS=1` passt für Railway; bei einem zusätzlichen Proxy davor
      auf `2` setzen, sonst landet die Proxy-IP im Limit-Topf
- [ ] Steigt `abuse.rejectedConnections` ohne erkennbaren Angriff:
      `RATE_LIMIT_CONNECTIONS_PER_IP` erhöhen
