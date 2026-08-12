/**
 * Text des Level-Toasts – als reine Funktion, damit er testbar ist.
 *
 * Zwei Befunde aus Bericht 19 stecken dahinter:
 *
 * - Befund 24: Die untersten Stufen kosten 73/107/143/184 XP – ein Anfänger
 *   sah in den ersten zwölf Sekunden sechsmal denselben Toast, drei davon
 *   gleichzeitig gestapelt, während die Klassenwahl aufklappte. Deshalb
 *   meldet sich der Toast nur noch an den Stufen, an denen sich wirklich
 *   etwas öffnet (den `unlockLevel`-Stufen aus dem Klassenbaum – abgeleitet,
 *   nicht abgetippt). Für alle übrigen Level blinkt ohnehin das Punkte-Badge.
 *
 * - Befund 33: Eine Pentagon bringt aus dem Stand Level 5 – vier Punkte in
 *   einem Snapshot. Der alte Text nannte fest die Einzahl („einen neuen
 *   Upgrade-Punkt") und war damit genau beim ersten Mal falsch, wenn er zum
 *   ersten Mal gelesen wird.
 */
import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS } from '@project-maze/shared';

export interface LevelToastContent {
  title: string;
  body: string;
}

/**
 * Freischalt-Stufen des Klassenbaums, aufsteigend und ohne die 1 – wer ein
 * Klassentor verschiebt, verschiebt damit automatisch auch den Toast.
 */
const unlockLevels: readonly number[] = [...new Set(PLAYER_CLASS_IDS.map((id) => CLASS_DEFINITIONS[id].unlockLevel))]
  .filter((level) => level > 1)
  .sort((a, b) => a - b);

/** Anzahl der Klassen, die exakt an dieser Stufe aufgehen. */
const classesAt = (level: number): number => PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].unlockLevel === level).length;

export function levelToast(fromLevel: number, toLevel: number): LevelToastContent | null {
  const gained = toLevel - fromLevel;
  if (gained <= 0) return null;
  const crossed = unlockLevels.filter((level) => level > fromLevel && level <= toLevel);
  if (crossed.length === 0) return null;

  const gate = crossed[crossed.length - 1] as number;
  const points = gained === 1 ? '+1 Punkt' : `+${gained} Punkte`;
  // Auf Stufe 5 sind es für jeden dieselben acht Starter; ab Stufe 15 hängt
  // die Zahl der Wahlen am Familienpfad – dort bleibt der Text allgemein,
  // statt eine Zahl zu behaupten, die nur für manche stimmt.
  const gateText = gate === unlockLevels[0]
    ? `${classesAt(gate)} Klassen stehen offen`
    : 'Eine neue Klassenstufe ist frei';
  return {
    title: `Level ${toLevel}`,
    body: `${gateText} · ${points}.`
  };
}
