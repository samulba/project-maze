import type { PlayerSnapshot } from '@project-maze/shared';
import type { RoyaleZoneSnapshot } from '@project-maze/shared/gameplay';

/**
 * Was die Royale-Zeile im HUD sagt – als reine Entscheidung, getrennt vom
 * Einhängen ins DOM.
 *
 * Der Grund für die Trennung ist nicht Ordnung, sondern Prüfbarkeit: Die
 * Client-Tests laufen ohne DOM. Stünde die Entscheidung mitten in
 * `GameplayUI.update`, könnte niemand prüfen, ob „draußen" wirklich draußen
 * heißt – und genau solche ungeprüften Zeilen haben in diesem Projekt schon
 * zweimal still das Falsche getan.
 */
export interface RoyaleBannerCopy {
  /** Steuert die Randfarbe: `data-state` am Element. */
  state: 'over' | 'outside' | RoyaleZoneSnapshot['phase'];
  title: string;
  line: string;
}

const PHASE_COPY: Record<RoyaleZoneSnapshot['phase'], string> = {
  wartet: 'Zone startet gleich',
  schrumpft: 'Zone schrumpft',
  haelt: 'Zone hält'
};

export function royaleBannerCopy(zone: RoyaleZoneSnapshot | null, self: PlayerSnapshot): RoyaleBannerCopy | null {
  if (!zone) return null;
  if (zone.roundOver) {
    return {
      state: 'over',
      // Eine Runde ohne Sieger ist selten, aber möglich – die Zone kann auch den
      // Letzten holen. Dann steht hier nicht der Name von niemandem.
      title: zone.winnerName ? `${zone.winnerName} GEWINNT` : 'RUNDE VORBEI',
      line: `Neue Runde in ${Math.max(0, Math.ceil(zone.nextRoundInMs / 1000))}s`
    };
  }
  const abstand = Math.hypot(self.position.x - zone.center.x, self.position.y - zone.center.y);
  /*
   * Dieselben drei Bedingungen wie der Server, in derselben Reihenfolge:
   * lebendig, Stufe über null, und echt außerhalb – der Rand selbst zählt noch
   * als drinnen (`abstand <= radius` überspringt dort den Schaden).
   *
   * `stage > 0` steht mit dabei, obwohl der Startkreis die Karte heute exakt
   * umschließt und niemand in der Schonfrist draußen stehen *kann*. Genau
   * darauf zu bauen hieße, eine Anzeige an das zufällige Zusammentreffen zweier
   * Zahlen aus zwei Dateien zu hängen. Ein kleinerer Startradius, und das HUD
   * warnte vor einem Schaden, den es nicht gibt.
   */
  if (!self.dead && zone.stage > 0 && abstand > zone.radius) {
    return {
      state: 'outside',
      title: 'AUSSERHALB DER ZONE',
      line: `-${zone.damagePerSecond.toFixed(0)} HP/s · noch ${zone.alive} im Rennen`
    };
  }
  return { state: zone.phase, title: `NOCH ${zone.alive}`, line: PHASE_COPY[zone.phase] ?? 'Zone aktiv' };
}

/**
 * Der Text unter dem Respawn-Knopf, solange man ausgeschieden ist.
 *
 * Er steht hier statt im Death-Screen, weil er dieselbe Frage beantwortet wie
 * das Banner – „wann geht es weiter" – und beide Antworten sonst
 * auseinanderlaufen könnten, ohne dass es jemand merkt.
 */
export function royaleDeathHint(zone: RoyaleZoneSnapshot): string {
  if (!zone.roundOver) return `Ausgeschieden · noch ${zone.alive} im Rennen`;
  const sekunden = Math.max(0, Math.ceil(zone.nextRoundInMs / 1000));
  return zone.winnerName
    ? `${zone.winnerName} gewinnt · nächste Runde in ${sekunden}s`
    : `Runde vorbei · nächste Runde in ${sekunden}s`;
}
