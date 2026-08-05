import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { tuneArenaSystems } from './arena-systems';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';
import { tuneLoadoutSystem } from './loadout-system';
import { hardenSimulation } from './simulation-hardening';
import { spectatorTargetFor, tuneSpectator } from './spectator';

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
}

/** Der Zuschauer liegt innen, alle Gameplay-Schichten außen – wie in Produktion. */
const createGame = (enabled = true): MazeGame =>
  tuneArenaSystems(
    tuneLoadoutSystem(tuneCombatScaling(tuneSpectator(hardenSimulation(new MazeGame(0)), enabled)))
  );

/** Opfer und Killer weit auseinander, damit sich ihre Sichtfelder nicht überlappen. */
function staged(enabled = true): {
  game: MazeGame;
  internals: Internals;
  victimId: string;
  killerId: string;
  victim: any;
  killer: any;
} {
  const game = createGame(enabled);
  const internals = game as unknown as Internals;
  const victimId = game.addPlayer('Opfer');
  const killerId = game.addPlayer('Killer');
  const victim = internals.players.get(victimId);
  const killer = internals.players.get(killerId);
  victim.position = { x: 900, y: 600 };
  killer.position = { x: 4_800, y: 3_200 };
  for (const player of [victim, killer]) {
    player.level = 20;
    player.invulnerable = false;
    player.invulnerableUntil = 0;
  }
  return { game, internals, victimId, killerId, victim, killer };
}

const kill = (internals: Internals, victim: any, killerId: string, now = 1_000): void => {
  internals.killPlayer(victim, killerId, now, 'Arena');
};

describe('Zuschauen nach dem Tod', () => {
  it('zeigt einem Lebenden weiterhin seine eigene Umgebung', () => {
    const { game, victimId } = staged();
    const snapshot = game.snapshot(victimId) as any;
    expect(snapshot.selfId).toBe(victimId);
    expect(snapshot.spectatorTargetId).toBeNull();
  });

  it('schaltet nach dem Tod auf die Perspektive des Killers', () => {
    const { game, internals, victimId, killerId, victim } = staged();
    kill(internals, victim, killerId);

    expect(spectatorTargetFor(game, victimId)).toBe(killerId);
    const snapshot = game.snapshot(victimId) as any;
    expect(snapshot.spectatorTargetId).toBe(killerId);
    // Die eigene ID bleibt die eigene – HUD, Death-Screen und Respawn hängen daran.
    expect(snapshot.selfId).toBe(victimId);
    expect(snapshot.players.find((player: any) => player.id === victimId)?.dead).toBe(true);
    expect(snapshot.players.some((player: any) => player.id === killerId)).toBe(true);
  });

  it('zeigt exakt das, was der Killer auch sieht – und nichts darüber hinaus', () => {
    const { game, internals, victimId, killerId, victim } = staged();
    kill(internals, victim, killerId);

    const watched = game.snapshot(victimId) as any;
    const killerView = game.snapshot(killerId) as any;

    const ids = (snapshot: any, key: string): Set<string> =>
      new Set(snapshot[key].map((entity: any) => entity.id));
    for (const key of ['shapes', 'projectiles', 'drones', 'walls']) {
      expect(ids(watched, key)).toEqual(ids(killerView, key));
    }
    // Bei den Spielern kommt genau ein Eintrag dazu: der eigene Leichnam.
    const extra = [...ids(watched, 'players')].filter((id) => !ids(killerView, 'players').has(id));
    expect(extra).toEqual([victimId]);
  });

  it('behält die Fensterlogik: entfernte Objekte bleiben ausgefiltert', () => {
    const { game, internals, victimId, killerId, victim, killer } = staged();
    kill(internals, victim, killerId);

    // Eine Form direkt neben dem Killer ist sichtbar, eine neben der Leiche nicht.
    const shapes = [...internals.shapes.values()];
    const nearKiller = shapes[0];
    const nearVictim = shapes[1];
    nearKiller.position = { x: killer.position.x + 80, y: killer.position.y };
    nearVictim.position = { x: victim.position.x + 80, y: victim.position.y };

    const watched = game.snapshot(victimId) as any;
    const visible = new Set(watched.shapes.map((shape: any) => shape.id));
    expect(visible.has(nearKiller.id)).toBe(true);
    expect(visible.has(nearVictim.id)).toBe(false);
  });

  it('liefert Gameplay-Daten für den Toten selbst mit', () => {
    const { game, internals, victimId, killerId, victim } = staged();
    kill(internals, victim, killerId);
    const snapshot = game.snapshot(victimId) as any;
    // Die äußeren Schichten sehen den korrigierten Snapshot – der Death-Screen
    // bekommt seine eigenen Modul- und Bounty-Daten.
    expect(snapshot.gameplay[victimId]).toBeDefined();
    expect(snapshot.gameplay[killerId]).toBeDefined();
  });

  it('fällt auf die eigene Todesposition zurück, wenn der Killer selbst stirbt', () => {
    const { game, internals, victimId, killerId, victim, killer } = staged();
    kill(internals, victim, killerId);
    expect((game.snapshot(victimId) as any).spectatorTargetId).toBe(killerId);

    kill(internals, killer, victimId, 2_000);
    expect(spectatorTargetFor(game, victimId)).toBeNull();
    const snapshot = game.snapshot(victimId) as any;
    expect(snapshot.spectatorTargetId).toBeNull();
    expect(snapshot.selfId).toBe(victimId);
  });

  it('fällt zurück, wenn der Killer die Arena verlässt', () => {
    const { game, internals, victimId, killerId, victim } = staged();
    kill(internals, victim, killerId);
    game.removePlayer(killerId);
    expect(spectatorTargetFor(game, victimId)).toBeNull();
    expect((game.snapshot(victimId) as any).spectatorTargetId).toBeNull();
  });

  it('nimmt den Killer wieder auf, sobald er zurück ist', () => {
    const { game, internals, victimId, killerId, victim, killer } = staged();
    kill(internals, victim, killerId);
    kill(internals, killer, victimId, 2_000);
    expect(spectatorTargetFor(game, victimId)).toBeNull();

    killer.dead = false;
    expect(spectatorTargetFor(game, victimId)).toBe(killerId);
  });

  it('bietet nichts an bei Umgebungstod und Selbstabschuss', () => {
    const environment = staged();
    environment.internals.killPlayer(environment.victim, null, 1_000, 'Arena');
    expect(spectatorTargetFor(environment.game, environment.victimId)).toBeNull();

    const own = staged();
    kill(own.internals, own.victim, own.victimId);
    expect(spectatorTargetFor(own.game, own.victimId)).toBeNull();
  });

  it('endet mit dem Respawn', () => {
    const { game, internals, victimId, killerId, victim } = staged();
    kill(internals, victim, killerId);
    expect(spectatorTargetFor(game, victimId)).toBe(killerId);

    victim.canRespawnAt = 0;
    expect(game.requestRespawn(victimId, 5_000)).toBe(true);
    expect(victim.dead).toBe(false);
    expect(spectatorTargetFor(game, victimId)).toBeNull();
    expect((game.snapshot(victimId) as any).spectatorTargetId).toBeNull();
  });

  it('bleibt ohne Schalter vollständig untätig', () => {
    const { game, internals, victimId, killerId, victim } = staged(false);
    kill(internals, victim, killerId);

    const snapshot = game.snapshot(victimId) as any;
    expect(snapshot.selfId).toBe(victimId);
    expect(snapshot.spectatorTargetId).toBeUndefined();
    // Ohne Zuschauermodus liegt der Killer weit außerhalb des eigenen Fensters.
    expect(snapshot.players.some((player: any) => player.id === killerId)).toBe(false);
  });

  it('lässt die Sicht der Lebenden unangetastet', () => {
    const { game, internals, victimId, killerId, victim } = staged();
    const before = JSON.stringify(game.snapshot(killerId));
    kill(internals, victim, killerId);
    const after = game.snapshot(killerId) as any;
    expect(after.selfId).toBe(killerId);
    expect(after.spectatorTargetId).toBeNull();
    // Der Killer merkt vom Zuschauer nichts – bis auf den Killfeed-Eintrag.
    expect(JSON.parse(before).players.length).toBe(after.players.length);
  });

  it('hält die Grenzen des festen Sichtfensters ein', () => {
    const { game, internals, victimId, killerId, victim, killer } = staged();
    kill(internals, victim, killerId);
    const snapshot = game.snapshot(victimId) as any;

    const halfWidth = GAME.visibleWorldWidth / 2 + 48;
    const halfHeight = GAME.visibleWorldHeight / 2 + 48;
    for (const shape of snapshot.shapes) {
      expect(Math.abs(shape.position.x - killer.position.x)).toBeLessThanOrEqual(halfWidth);
      expect(Math.abs(shape.position.y - killer.position.y)).toBeLessThanOrEqual(halfHeight);
    }
    for (const player of snapshot.players) {
      if (player.id === victimId) continue;
      expect(Math.abs(player.position.x - killer.position.x)).toBeLessThanOrEqual(halfWidth);
    }
  });
});
