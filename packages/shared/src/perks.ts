import type { PlayerClass } from './index';

/**
 * Perks (Klassen 4.0, Welle B) – „jeder Tank ist irgendwo special".
 *
 * Jede Klasse ab der zweiten Wahlstufe (L15) trägt genau EINEN benannten Perk.
 * Der Perk steht auf der Wahlkarte und im Rad – er ist das Merkmal, das man
 * beschreiben kann, ohne Zahlen zu nennen (MASTERPLAN „Klassen-Identität").
 *
 * Die Daten liegen in shared, damit Server (Wirkung) und Client (Beschriftung)
 * dieselbe Quelle lesen. Die Wirkung selbst rechnet ausschließlich der Server
 * (`apps/server/src/perks.ts`) – der Client zeigt nur an.
 *
 * Der Baukasten ist klein und parametrisiert: 15 Mechaniken tragen 38 Perks.
 * Das ist Absicht – 38 frei erfundene Sonderregeln wären nicht balancierbar
 * und nicht testbar.
 */

export type PerkEffect =
  /** Jede n-te Salve feuert doppelt. */
  | { kind: 'doubleSalvo'; every: number }
  /** Bonusschaden gegen Ziele unter der Lebens-Schwelle. */
  | { kind: 'executioner'; threshold: number; bonus: number }
  /** Bonusschaden, solange das eigene Leben voll ist. */
  | { kind: 'overcharge'; bonus: number }
  /** Projektiltreffer verlangsamen das Ziel. */
  | { kind: 'frostShot'; slow: number; seconds: number }
  /** Ein Kill beschleunigt kurz. */
  | { kind: 'adrenaline'; bonus: number; seconds: number }
  /** Ein Kill heilt einen Anteil des Maximal-Lebens. */
  | { kind: 'killHeal'; share: number }
  /** Kontakt-Angreifer erleiden einen Anteil ihres Schadens zurück. */
  | { kind: 'thorns'; share: number }
  /** Nach einer ruhigen Phase absorbiert ein Schild den nächsten Treffer. */
  | { kind: 'shieldRing'; quietSeconds: number }
  /** Projektile prallen n-mal von Wänden ab. */
  | { kind: 'ricochet'; bounces: number }
  /** Ein Projektil-Kill zerlegt die Kugel in Splitter. */
  | { kind: 'splitter'; shards: number; damageShare: number }
  /** Sterbende eigene Drohnen explodieren. */
  | { kind: 'droneNova'; damage: number; radius: number }
  /** Rammen verlangsamt das Ziel. */
  | { kind: 'contactSlow'; slow: number; seconds: number }
  /** Erlittener Kontaktschaden ist reduziert. */
  | { kind: 'contactArmor'; reduction: number }
  /** Im Stillstand arbeitet die Regeneration vielfach. */
  | { kind: 'standingRegen'; multiplier: number }
  /** Treffer brennen nach. */
  | { kind: 'burn'; dps: number; seconds: number };

export interface PerkDefinition {
  /** Anzeigename – kurz, eine Waffengattung von Wort. */
  label: string;
  /** Ein Satz, der die Wirkung ohne Zahlen erklärt. */
  blurb: string;
  effect: PerkEffect;
}

export const PERKS: Partial<Record<PlayerClass, PerkDefinition>> = {
  // RAPID – Druck, der Formen annimmt
  twin: { label: 'Doppelschlag', blurb: 'Jede vierte Salve feuert doppelt.', effect: { kind: 'doubleSalvo', every: 4 } },
  repeater: { label: 'Nadelregen', blurb: 'Treffer verlangsamen das Ziel kurz.', effect: { kind: 'frostShot', slow: 0.1, seconds: 0.6 } },
  flanker: { label: 'Nachbrenner', blurb: 'Ein Abschuss macht dich kurz schneller.', effect: { kind: 'adrenaline', bonus: 0.2, seconds: 1.5 } },
  storm: { label: 'Querschläger', blurb: 'Deine Kugeln prallen einmal von Wänden ab.', effect: { kind: 'ricochet', bounces: 1 } },
  gatling: { label: 'Glühende Läufe', blurb: 'Treffer brennen kurz nach.', effect: { kind: 'burn', dps: 2.5, seconds: 1 } },
  octo: { label: 'Igelstellung', blurb: 'Wer dich rammt, verletzt sich selbst.', effect: { kind: 'thorns', share: 0.15 } },
  vortex: { label: 'Kugelsturm', blurb: 'Ein Kill zerlegt die Kugel in Splitter.', effect: { kind: 'splitter', shards: 3, damageShare: 0.4 } },

  // PRECISION – der eine Schuss, veredelt
  railgun: { label: 'Kaltstart', blurb: 'Mit vollem Leben trifft dein Schuss härter.', effect: { kind: 'overcharge', bonus: 0.2 } },
  hunter: { label: 'Jagdrausch', blurb: 'Ein Abschuss heilt dich.', effect: { kind: 'killHeal', share: 0.12 } },
  arbalest: { label: 'Zwillingsschlag', blurb: 'Jede fünfte Salve feuert doppelt.', effect: { kind: 'doubleSalvo', every: 5 } },
  lancer: { label: 'Splitterlanze', blurb: 'Ein Kill zerlegt die Lanze in Splitter.', effect: { kind: 'splitter', shards: 2, damageShare: 0.5 } },
  phantom: { label: 'Schleier', blurb: 'Nach ruhigen Sekunden absorbiert ein Schild den nächsten Treffer.', effect: { kind: 'shieldRing', quietSeconds: 4 } },
  deadeye: { label: 'Vollstrecker', blurb: 'Schwer verwundete Ziele erleiden Bonusschaden.', effect: { kind: 'executioner', threshold: 0.25, bonus: 0.4 } },
  eclipse: { label: 'Finsternis', blurb: 'Dein Treffer verlangsamt das Ziel spürbar.', effect: { kind: 'frostShot', slow: 0.3, seconds: 1 } },

  // CONTROL – der Hof arbeitet
  warden: { label: 'Schildwall', blurb: 'Nach ruhigen Sekunden absorbiert ein Schild den nächsten Treffer.', effect: { kind: 'shieldRing', quietSeconds: 5 } },
  factory: { label: 'Sollbruchstelle', blurb: 'Sterbende Drohnen explodieren.', effect: { kind: 'droneNova', damage: 18, radius: 90 } },
  guardian: { label: 'Vergeltung', blurb: 'Wer dich rammt, verletzt sich selbst.', effect: { kind: 'thorns', share: 0.2 } },
  overseer: { label: 'Ernte', blurb: 'Ein Abschuss heilt dich.', effect: { kind: 'killHeal', share: 0.1 } },
  carrier: { label: 'Brandfracht', blurb: 'Sterbende Drohnen explodieren heftig.', effect: { kind: 'droneNova', damage: 26, radius: 110 } },
  hive: { label: 'Schwarmrausch', blurb: 'Ein Abschuss macht dich kurz schneller.', effect: { kind: 'adrenaline', bonus: 0.15, seconds: 2 } },
  sovereign: { label: 'Thron', blurb: 'Im Stillstand regeneriert der Hofstaat dich doppelt.', effect: { kind: 'standingRegen', multiplier: 2 } },

  // IMPACT – Masse mit Meinung
  crusher: { label: 'Erschütterung', blurb: 'Dein Rammstoß verlangsamt das Ziel.', effect: { kind: 'contactSlow', slow: 0.25, seconds: 0.8 } },
  bulwark: { label: 'Dornenpanzer', blurb: 'Wer dich rammt, verletzt sich selbst – deutlich.', effect: { kind: 'thorns', share: 0.3 } },
  blitz: { label: 'Blitzstart', blurb: 'Ein Abschuss macht dich kurz deutlich schneller.', effect: { kind: 'adrenaline', bonus: 0.25, seconds: 2 } },
  juggernaut: { label: 'Unaufhaltsam', blurb: 'Du erleidest weniger Kontaktschaden.', effect: { kind: 'contactArmor', reduction: 0.3 } },
  fortress: { label: 'Bastion', blurb: 'Im Stillstand regenerierst du vielfach.', effect: { kind: 'standingRegen', multiplier: 2.5 } },
  comet: { label: 'Sternenfresser', blurb: 'Ein Abschuss heilt dich kräftig.', effect: { kind: 'killHeal', share: 0.18 } },
  leviathan: { label: 'Flutwelle', blurb: 'Dein Rammstoß verlangsamt lange und schwer.', effect: { kind: 'contactSlow', slow: 0.35, seconds: 1.2 } },

  // SPECTER – das Dunkel arbeitet mit
  wraith: { label: 'Hetzjagd', blurb: 'Ein Abschuss macht dich kurz sehr schnell.', effect: { kind: 'adrenaline', bonus: 0.3, seconds: 1.2 } },
  shade: { label: 'Gnadenstoß', blurb: 'Schwer verwundete Ziele erleiden schweren Bonusschaden.', effect: { kind: 'executioner', threshold: 0.35, bonus: 0.3 } },
  mirage: { label: 'Trugbild', blurb: 'Jede dritte Salve feuert doppelt.', effect: { kind: 'doubleSalvo', every: 3 } },
  revenant: { label: 'Totengriff', blurb: 'Dein Rammstoß verlangsamt das Ziel.', effect: { kind: 'contactSlow', slow: 0.3, seconds: 1 } },
  eidolon: { label: 'Seelenraub', blurb: 'Ein Abschuss heilt dich kräftig.', effect: { kind: 'killHeal', share: 0.2 } },

  // TEMPEST – Hitze, die Spuren hinterlässt
  scorch: { label: 'Zunder', blurb: 'Treffer brennen nach.', effect: { kind: 'burn', dps: 4, seconds: 1.2 } },
  surge: { label: 'Doppelpuls', blurb: 'Jede fünfte Salve feuert doppelt.', effect: { kind: 'doubleSalvo', every: 5 } },
  inferno: { label: 'Flächenbrand', blurb: 'Treffer brennen lange nach.', effect: { kind: 'burn', dps: 5, seconds: 1.5 } },
  overload: { label: 'Entladung', blurb: 'Deine schweren Kugeln prallen einmal von Wänden ab.', effect: { kind: 'ricochet', bounces: 1 } },
  cataclysm: { label: 'Supernova', blurb: 'Ein Kill zerlegt die Kugel in viele Splitter.', effect: { kind: 'splitter', shards: 4, damageShare: 0.35 } },

  // SIEGE – wer steht, hält
  bombard: { label: 'Grundfeste', blurb: 'Im Stillstand regenerierst du deutlich schneller.', effect: { kind: 'standingRegen', multiplier: 2.2 } },
  mortar: { label: 'Einschlag', blurb: 'Dein Treffer verlangsamt das Ziel schwer.', effect: { kind: 'frostShot', slow: 0.32, seconds: 1.1 } },
  howitzer: { label: 'Sperrfeuer', blurb: 'Jede vierte Salve feuert doppelt.', effect: { kind: 'doubleSalvo', every: 4 } },
  trebuchet: { label: 'Steinschlag', blurb: 'Ein Kill zerlegt den Brocken in schwere Splitter.', effect: { kind: 'splitter', shards: 3, damageShare: 0.45 } },
  ragnarok: { label: 'Weltenbrand', blurb: 'Treffer brennen lange und heiß nach.', effect: { kind: 'burn', dps: 6, seconds: 1.6 } },

  // AEGIS – wer schluckt, gibt zurück
  bulwarker: { label: 'Standfest', blurb: 'Du erleidest deutlich weniger Kontaktschaden.', effect: { kind: 'contactArmor', reduction: 0.35 } },
  reflector: { label: 'Rückwurf', blurb: 'Wer dich rammt, verletzt sich schwer.', effect: { kind: 'thorns', share: 0.35 } },
  paladin: { label: 'Läuterung', blurb: 'Ein Abschuss heilt dich kräftig.', effect: { kind: 'killHeal', share: 0.16 } },
  retributor: { label: 'Vergeltungsschlag', blurb: 'Wer dich rammt, verletzt sich schwer – und du schlägst doppelt.', effect: { kind: 'thorns', share: 0.42 } },
  sanctum: { label: 'Heiligtum', blurb: 'Nach ruhigen Sekunden absorbiert ein Schild den nächsten Treffer.', effect: { kind: 'shieldRing', quietSeconds: 3.5 } },

  // Neue Zweige der Altfamilien
  vanguard: { label: 'Nadelwand', blurb: 'Treffer verlangsamen das Ziel kurz.', effect: { kind: 'frostShot', slow: 0.12, seconds: 0.7 } },
  hailstorm: { label: 'Hagelschlag', blurb: 'Jede dritte Salve feuert doppelt.', effect: { kind: 'doubleSalvo', every: 3 } },
  ballista: { label: 'Durchbohrer', blurb: 'Mit vollem Leben trifft dein Bolzen härter.', effect: { kind: 'overcharge', bonus: 0.25 } },
  siegebreaker: { label: 'Mauerbrecher', blurb: 'Schwer verwundete Ziele erleiden schweren Bonusschaden.', effect: { kind: 'executioner', threshold: 0.3, bonus: 0.45 } },
  sentinel: { label: 'Wachposten', blurb: 'Sterbende Wächter explodieren heftig.', effect: { kind: 'droneNova', damage: 30, radius: 100 } },
  aviary: { label: 'Schwarmflug', blurb: 'Ein Abschuss macht dich kurz deutlich schneller.', effect: { kind: 'adrenaline', bonus: 0.22, seconds: 1.8 } },
  rampart: { label: 'Walze', blurb: 'Dein Rammstoß verlangsamt das Ziel.', effect: { kind: 'contactSlow', slow: 0.28, seconds: 0.9 } },
  behemoth: { label: 'Koloss', blurb: 'Du erleidest kaum noch Kontaktschaden.', effect: { kind: 'contactArmor', reduction: 0.4 } }
};

/** Perk einer Klasse, oder `null` – Starter und Core tragen bewusst keinen. */
export const perkFor = (playerClass: PlayerClass): PerkDefinition | null => PERKS[playerClass] ?? null;
