# 01 – Arena-Events: Overcharge und Hunter Signal

**Branch:** `claude/arena-events-overcharge-hunter-s4sipx` · **Basis:** `claude/app-analysis-masterplan-lxao21` @ `1f7e911` · **Status: in main**

## Was drin ist

**Overcharge** greift an genau einer Stelle an – `resolveProjectileCollisions`.
Geschosse in der Zone tragen einen Überladungspuffer von 75 % ihrer maximalen
Integrität, der bei einem Zusammenstoß zuerst verbraucht wird. Kugeln löschen
sich dadurch nicht mehr gegenseitig aus, sondern streifen sich: rund 8 Grad
Ablenkung, 94 % Resttempo. `damage` wird nirgends angefasst – kein pauschaler
Schadensbuff. Effekt: Kugelwände (Storm, Gatling, Octo) verlieren in der Zone
ihre Schutzwirkung, schwere Einzelschüsse kommen durchs Kreuzfeuer.

**Hunter Signal** stellt einen neutralen Guardian als PvE-Ziel in die Zone,
umgesetzt als Runtime-Spieler – dadurch laufen Kollision, Schaden, Drohnen und
Snapshot über die vorhandenen Pfade, ohne neuen Entity-Typ. Gesteuert von der
Event-Schicht (`bot: null`, also kein Bot-Brain), 30 % eingehender Schaden
(≈ 3,3× effektives Leben, analog zur Elite-Shape-Konvention statt HP-Inflation),
an die Zone angeleint, verschont Spieler unter Level 8 solange sie ihn in Ruhe
lassen, sammelt keinen Score (damit weder Bestenliste noch Bounty), respawnt
nicht, gibt 600 Bonus-XP.

Die Event-Rotation in `arena-systems.ts` wurde dafür eingeführt. Wichtig dabei:
Bonus-Formen und die erhöhte Elite-Chance hingen vorher an „irgendein aktives
Event" – das ist jetzt explizit auf Core Surge eingegrenzt, sonst hätten die
neuen Events still mitgefarmt.

## Dateien

`apps/server/src/arena-events.ts` (neu), `arena-events.test.ts` (neu),
`arena-systems.ts`, `arena-systems.test.ts`, `index.ts`,
`docs/BALANCE_MASTERPLAN.md`, `README.md`

## Tests

12 neu / 76 gesamt grün. Unter anderem: Schadensgleichheit in und außerhalb der
Zone, Zonenbegrenzung, Pufferverbrauch (Geschosse bleiben zerstörbar),
Guardian-Rüstung, Anfängerschutz, Kill-Belohnung ohne Respawn, Despawn zum
Eventende, Integrationstest dass der Guardian tatsächlich angreift.

## Von 01 gebraucht

Erledigt: `ArenaEventKind` um `'overcharge' | 'hunterSignal'` erweitert,
`arenaGuardianId: string | null` in `GameplayWorldExtension`, Banner-Copy je
Event-Kind, Boss-Rendering für den Guardian.
