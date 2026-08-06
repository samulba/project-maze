import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS, type PlayerClass } from '@project-maze/shared';

/**
 * Der Klassenbaum als Rad (MASTERPLAN KL3).
 *
 * Alle 29 Klassen stehen in `CLASS_DEFINITIONS`, aber nur als flache Liste mit
 * `parent` und `unlockLevel`. Dieses Modul macht daraus die Geometrie: Core in
 * der Mitte, die vier Familien auf Ring 1, ihre Zweige auf Ring 2 und 3.
 *
 * Reine Rechnung – kein DOM, kein SVG. Die Winkel und Radien fallen als Zahlen
 * heraus; wer sie zeichnet, entscheidet das Rad-Modul. Damit ist die Frage
 * „steht jede Klasse an der richtigen Stelle?" ein Unit-Test und keine
 * Sichtprüfung.
 *
 * **Die Struktur wird nicht angenommen, sondern gelesen.** Wenn 02 eine Klasse
 * ergänzt, wächst das Rad mit; ein Test hält fest, dass die Aufteilung dabei
 * heil bleibt.
 */

/** Ringe von innen nach außen. `0` ist Core. */
export type RingIndex = 0 | 1 | 2 | 3;

export interface WheelNode {
  id: PlayerClass;
  label: string;
  description: string;
  branch: string;
  unlockLevel: number;
  parent: PlayerClass | null;
  ring: RingIndex;
  /** Winkel in Grad, 0 = oben, im Uhrzeigersinn. */
  angle: number;
  /** Klassen, zu denen diese führt. */
  children: PlayerClass[];
}

/**
 * Was die Familie *spielt* – der Satz, der eine Klassenwahl informiert.
 *
 * Ausdrücklich nicht die Werte: Wer auf Level 10 wählt, braucht zu wissen,
 * wonach sich die Familie anfühlt, nicht wie hoch ihr Nachladewert ist. Die
 * Zahlen stehen ohnehin auf den Wahlkarten.
 */
export interface FamilyInfo {
  branch: string;
  label: string;
  /** Wie sich die Familie spielt, in einem Satz. */
  style: string;
  /** Name der Signature, wie er im HUD steht. */
  signature: string;
  /** Wie die Signature aufgeladen wird. */
  builds: string;
  /** Was sie bringt, wenn sie voll ist. */
  pays: string;
}

export const FAMILIES: readonly FamilyInfo[] = [
  {
    branch: 'rapid',
    label: 'Dauerfeuer',
    style: 'Druck über Zeit: viele Läufe, kurze Nachladezeit, immer in Bewegung.',
    signature: 'Momentum',
    builds: 'Feuern in Fahrt baut Momentum auf. Wer stehen bleibt, verliert es schnell wieder.',
    pays: 'Bei vollem Momentum lädst du deutlich schneller nach – der Unterschied zwischen Druck und Dauerdruck.'
  },
  {
    branch: 'precision',
    label: 'Präzision',
    style: 'Ein Treffer statt zehn: Reichweite, Durchschlag und wenig Fehlertoleranz.',
    signature: 'Ladung',
    builds: 'Feuertaste halten lädt den Schuss. Ein Sofortklick bleibt ein schwacher Schuss.',
    pays: 'Der geladene Schuss trifft härter und größer. Aus Klickgeschwindigkeit wird Timing.'
  },
  {
    branch: 'control',
    label: 'Kontrolle',
    style: 'Du kämpfst nicht selbst, deine Einheiten tun es. Raum halten statt zielen.',
    signature: 'Einheiten',
    builds: 'Ein Nachschub-Konto füllt sich stetig; jede neue Einheit bezahlt daraus.',
    pays: 'Volles Konto heißt vollständige Flotte. Verluste kosten Budget, nicht Zeit.'
  },
  {
    branch: 'impact',
    label: 'Panzerung',
    style: 'Der Tank ist die Waffe: Leben, Tempo und Körperschaden statt Kugeln.',
    signature: 'Wucht',
    builds: 'Wucht lädt allein durch Fahren – die Feuertaste spielt keine Rolle.',
    pays: 'Ein Anlauf mit voller Wucht macht ein Vielfaches an Körperschaden und ist danach leer.'
  }
];

const FAMILY_BY_BRANCH = new Map(FAMILIES.map((eintrag) => [eintrag.branch, eintrag]));

export function familyInfo(branch: string): FamilyInfo | null {
  return FAMILY_BY_BRANCH.get(branch) ?? null;
}

/** Ring einer Klasse aus ihrem Freischalt-Level. */
export function ringOf(unlockLevel: number): RingIndex {
  if (unlockLevel <= 1) return 0;
  if (unlockLevel <= 10) return 1;
  if (unlockLevel <= 24) return 2;
  return 3;
}

/**
 * Baut das Rad.
 *
 * Aufteilung: Jede Familie bekommt einen gleich großen Sektor. Innerhalb des
 * Sektors verteilen sich die Ring-2-Zweige gleichmäßig, und jeder Ring-3-Knoten
 * steht **radial über seinem Elternteil** – im heutigen Baum hat jeder
 * Ring-2-Knoten genau ein Kind, sodass daraus eine Speiche wird. Bekommt einer
 * mehr Kinder, fächern sie im Sektor des Elternteils auf.
 */
export function buildWheel(): WheelNode[] {
  const kinder = new Map<PlayerClass, PlayerClass[]>();
  for (const id of PLAYER_CLASS_IDS) {
    const parent = CLASS_DEFINITIONS[id].parent;
    if (!parent) continue;
    const liste = kinder.get(parent) ?? [];
    liste.push(id);
    kinder.set(parent, liste);
  }

  const knoten = new Map<PlayerClass, WheelNode>();
  const anlegen = (id: PlayerClass, angle: number): WheelNode => {
    const definition = CLASS_DEFINITIONS[id];
    const eintrag: WheelNode = {
      id,
      label: definition.label,
      description: definition.description,
      branch: definition.branch,
      unlockLevel: definition.unlockLevel,
      parent: definition.parent,
      ring: ringOf(definition.unlockLevel),
      angle,
      children: kinder.get(id) ?? []
    };
    knoten.set(id, eintrag);
    return eintrag;
  };

  anlegen('core', 0);

  // Ring 1: die Familien, gleichmäßig auf dem Kreis, in der Reihenfolge von
  // FAMILIES – damit die Anordnung nicht von der Reihenfolge in `shared` abhängt.
  const wurzeln = (kinder.get('core') ?? []).slice().sort(
    (a, b) => FAMILIES.findIndex((f) => f.branch === CLASS_DEFINITIONS[a].branch)
      - FAMILIES.findIndex((f) => f.branch === CLASS_DEFINITIONS[b].branch)
  );
  const sektor = 360 / Math.max(1, wurzeln.length);
  wurzeln.forEach((id, index) => {
    const mitte = index * sektor;
    anlegen(id, mitte);
    // Ring 2 im Sektor der Familie, mit Rand zu den Nachbarn.
    const zweige = kinder.get(id) ?? [];
    const breite = sektor * 0.72;
    zweige.forEach((zweig, zweigIndex) => {
      const anteil = zweige.length === 1 ? 0.5 : zweigIndex / (zweige.length - 1);
      const winkel = mitte - breite / 2 + breite * anteil;
      anlegen(zweig, winkel);
      // Ring 3 über dem Elternteil; mehrere Kinder fächern eng auf.
      const enkel = kinder.get(zweig) ?? [];
      const enkelBreite = breite / Math.max(1, zweige.length) * 0.8;
      enkel.forEach((kind, kindIndex) => {
        const kindAnteil = enkel.length === 1 ? 0.5 : kindIndex / (enkel.length - 1);
        anlegen(kind, winkel - enkelBreite / 2 + enkelBreite * kindAnteil);
      });
    });
  });

  return [...knoten.values()];
}

/**
 * Der Pfad vom Core bis zu einer Klasse – für die Hervorhebung des eigenen
 * Wegs. Enthält die Klasse selbst.
 */
export function pathTo(id: PlayerClass): PlayerClass[] {
  const pfad: PlayerClass[] = [];
  let aktuell: PlayerClass | null = id;
  // Deckel gegen einen zyklischen Baum: 29 Klassen, mehr als 8 Ebenen kann es
  // nicht geben – lieber ein kurzer Pfad als eine Endlosschleife im Overlay.
  for (let tiefe = 0; aktuell && tiefe < 8; tiefe += 1) {
    pfad.unshift(aktuell);
    aktuell = CLASS_DEFINITIONS[aktuell]?.parent ?? null;
  }
  return pfad;
}

/** „Führt zu → X, Y, Z" – oder `null` bei einer Endklasse. */
export function leadsTo(id: PlayerClass): string[] | null {
  const kinder = PLAYER_CLASS_IDS.filter((kandidat) => CLASS_DEFINITIONS[kandidat].parent === id);
  return kinder.length > 0 ? kinder.map((kind) => CLASS_DEFINITIONS[kind].label) : null;
}

/**
 * Ist die Klasse für diesen Spieler erreichbar? Erreichbar heißt: Sie liegt auf
 * einem Pfad, der über die aktuelle Klasse führt – oder die aktuelle liegt auf
 * ihrem Pfad.
 */
export function reachableFrom(current: PlayerClass, target: PlayerClass): boolean {
  if (current === target) return true;
  return pathTo(target).includes(current);
}
