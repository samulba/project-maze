/**
 * Texte des Death-Screens – als reine Funktionen, damit sie testbar sind.
 *
 * Zwei Befunde aus Bericht 19 stecken dahinter:
 *
 * - Befund 15: Der Tod nimmt die Hälfte des Scores und die ganze Klasse –
 *   und kein Text sagte es. Der Toast nannte nur das Level, die Kachel
 *   „Neustart" auch, und das Score-Feld trug den Wert VOR der Halbierung.
 *   Der Spieler saß nach RESPAWN in einem Core mit halbem Score und hielt
 *   das für einen Fehler.
 *
 * - Befund 28: „Neustart Level 30" nach einem Tod auf Level 60 liest sich
 *   wie „die Hälfte bleibt". Die Kurve ist kubisch: Behalten werden 16–24 %
 *   der XP, je höher desto weniger. Die Regel ist Sams Entscheidung – die
 *   Beschriftung muss sie ehrlich nennen.
 *
 * Die Zahlen kommen aus denselben shared-Funktionen, mit denen der Server
 * rechnet (`respawnLevelFrom`/`respawnScoreFrom`/`respawnClassFrom`), nicht
 * aus abgetippten Faktoren – abgetippte Zahlen sind die Fehlerklasse, die
 * GOAL.md zweimal dokumentiert.
 */
import {
  CLASS_DEFINITIONS,
  respawnClassFrom,
  respawnScoreFrom,
  xpAtLevelStart,
  type PlayerClass
} from '@project-maze/shared';

export interface RespawnFacts {
  /** Level nach dem Respawn (kommt fertig aus dem Snapshot). */
  level: number;
  /** Anzeigename der Klasse, in der es weitergeht. */
  classLabel: string;
  /** Score nach der Halbierung – exakt die Zahl, die der Server setzt. */
  score: number;
  /** Behaltener Anteil der kumulierten XP in Prozent; null auf Level 1. */
  xpPercent: number | null;
}

export function respawnFacts(self: {
  deathLevel: number;
  respawnLevel: number;
  playerClass: PlayerClass;
  score: number;
}): RespawnFacts {
  const totalXp = xpAtLevelStart(self.deathLevel);
  return {
    level: self.respawnLevel,
    classLabel: CLASS_DEFINITIONS[respawnClassFrom(self.playerClass)].label,
    score: respawnScoreFrom(self.score),
    xpPercent: totalXp <= 0 ? null : Math.round((100 * xpAtLevelStart(self.respawnLevel)) / totalXp)
  };
}

export const deathToastText = (facts: RespawnFacts): string =>
  `Du startest auf Level ${facts.level} als ${facts.classLabel} neu – ${facts.score.toLocaleString('de-DE')} Score bleiben.`;

export const respawnTileLabel = (facts: RespawnFacts): string =>
  facts.xpPercent === null ? 'Neustart' : `Neustart (~${facts.xpPercent} % der XP)`;

export const respawnTileValue = (facts: RespawnFacts): string =>
  `Level ${facts.level} · ${facts.classLabel} · ${facts.score.toLocaleString('de-DE')} Score`;
