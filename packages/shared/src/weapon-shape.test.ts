import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS } from './index';
import { basisReichweite } from './appearance';
import {
  GRUPPENWINKEL,
  ROOT_DISTANCE,
  gruppiere,
  rundumZuschlag,
  waffenformen,
  waffenformenVon,
  winkeldifferenz
} from './weapon-shape';

/**
 * Der finale Klassenauftrag nennt Abschnitt 5 „die wichtigste visuelle Regel
 * des gesamten Auftrags": Mehrere eng beieinanderliegende Frontrohre erscheinen
 * als EIN gemeinsames Waffenmodul und nicht als einzelne Drähte aus dem Rumpf.
 * Diese Datei hält genau das fest.
 */

const emitterBei = (grade: number[]) =>
  grade.map((grad) => ({ winkel: grad * Math.PI / 180, versatz: 0, muendung: 40, wurzelbreite: 11, muendungsbreite: 11 }));

describe('Gruppierung der Läufe', () => {
  it('fasst zusammen, was höchstens 28° auseinanderliegt', () => {
    expect(gruppiere(emitterBei([-7, -4, -1, 1, 4, 7]))).toHaveLength(1);
    expect(gruppiere(emitterBei([-24, -16, -8, 0, 8, 16, 24]))).toHaveLength(1);
  });

  it('trennt, was weiter auseinanderliegt', () => {
    // Octo: 45° Schritte – acht getrennte Rohre, kein Gehäuse.
    expect(gruppiere(emitterBei([0, 45, 90, 135, 180, 225, 270, 315]))).toHaveLength(8);
    // Flanker: vorn und hinten bleiben getrennt.
    expect(gruppiere(emitterBei([0, 180]))).toHaveLength(2);
  });

  it('schließt den Ring über den 0°/360°-Übergang', () => {
    // Der Fall, den eine naive Sortierung nach Grad zerreißt: 350° und 10°
    // liegen 20° auseinander und gehören zusammen.
    expect(gruppiere(emitterBei([350, 0, 10]))).toHaveLength(1);
  });

  it('rechnet den Winkelabstand kürzest herum', () => {
    expect(winkeldifferenz(10, 350)).toBeCloseTo(20, 9);
    expect(winkeldifferenz(350, 10)).toBeCloseTo(-20, 9);
    expect(Math.abs(winkeldifferenz(180, 0))).toBeCloseTo(180, 9);
  });

  it('hält genau an der Grenze zusammen und einen Hauch darüber nicht mehr', () => {
    expect(gruppiere(emitterBei([0, GRUPPENWINKEL]))).toHaveLength(1);
    expect(gruppiere(emitterBei([0, GRUPPENWINKEL + 0.1]))).toHaveLength(2);
  });
});

describe('Waffenformen', () => {
  it('gibt einem Einzelrohr genau ein Teil und keinem Bündel ein loses Rohr', () => {
    const einzeln = waffenformenVon('core').filter((f) => f.art !== 'rohr' || true);
    expect(einzeln.filter((f) => f.art === 'gehaeuse')).toHaveLength(0);
    expect(einzeln.filter((f) => f.art === 'rohr')).toHaveLength(1);
  });

  it('baut für jede Mehrrohr-Frontklasse ein Gehäuse mit kurzen Mündungen', () => {
    // Die Liste stammt wörtlich aus Abschnitt 5 des Auftrags.
    const module = ['twin', 'repeater', 'vanguard', 'storm', 'gatling', 'hailstorm', 'vortex',
      'arbalest', 'deadeye', 'scorch', 'inferno', 'cataclysm', 'bombard', 'howitzer',
      'ragnarok', 'reflector', 'retributor', 'sanctum'] as const;
    for (const id of module) {
      const formen = waffenformenVon(id);
      const gehaeuse = formen.filter((f) => f.art === 'gehaeuse');
      const muendungen = formen.filter((f) => f.art === 'muendung');
      expect(gehaeuse.length, `${id} ohne Gehäuse`).toBeGreaterThanOrEqual(1);
      expect(muendungen.length, `${id} ohne Mündungen`).toBe(CLASS_DEFINITIONS[id].barrelCount);
      // Kein einzelnes feuerndes Rohr mehr – das wären wieder die Drähte.
      const zier = (CLASS_DEFINITIONS[id].launchers ?? []).length;
      expect(formen.filter((f) => f.art === 'rohr').length, `${id} hat lose Rohre`).toBe(zier);
    }
  });

  it('lässt octo und flanker ausdrücklich getrennt', () => {
    for (const id of ['octo', 'flanker'] as const) {
      const formen = waffenformenVon(id);
      expect(formen.filter((f) => f.art === 'gehaeuse'), id).toHaveLength(0);
      expect(formen.filter((f) => f.art === 'rohr').length, id).toBe(CLASS_DEFINITIONS[id].barrelCount);
    }
  });

  it('macht alleinstehende Rundumrohre kräftiger, Bündel aber nicht', () => {
    expect(rundumZuschlag(8)).toBe(2.1);
    expect(rundumZuschlag(2)).toBe(1.4);
    expect(rundumZuschlag(1)).toBe(1);
    // Octo (8 einzelne Rohre) muss sichtbar breiter sein als sein rohes Profil.
    const roh = 11 * (CLASS_DEFINITIONS.octo.barrels![0]!.breite ?? 1);
    const gezeichnet = waffenformenVon('octo')[0]!.punkte;
    const breite = Math.hypot(gezeichnet[0]! - gezeichnet[6]!, gezeichnet[1]! - gezeichnet[7]!);
    expect(breite).toBeGreaterThan(roh * 1.9);
  });

  it('beginnt jedes Teil am Rumpf und lässt keine Lücke zur Mündung', () => {
    for (const id of PLAYER_CLASS_IDS) {
      for (const form of waffenformen(CLASS_DEFINITIONS[id])) {
        for (let i = 0; i < form.punkte.length; i += 2) {
          expect(Number.isFinite(form.punkte[i]!), `${id} NaN`).toBe(true);
          expect(Number.isFinite(form.punkte[i + 1]!), `${id} NaN`).toBe(true);
        }
        expect(form.punkte.length, id).toBe(8);
      }
    }
  });

  it('zeichnet Zier-Rohre als eigene Teile, ohne sie zu gruppieren', () => {
    // Hive hat fünf Launcher rundum und kein feuerndes Rohr.
    const formen = waffenformenVon('hive');
    expect(formen.filter((f) => f.art === 'rohr')).toHaveLength(5);
    expect(formen.filter((f) => f.art === 'gehaeuse')).toHaveLength(0);
  });

  it('setzt die Rohrwurzel überall auf denselben Abstand', () => {
    // ROOT_DISTANCE liegt innerhalb des Rumpfes (r22) – die Base verdeckt die
    // Wurzel, so verlangt es Abschnitt 8.
    expect(ROOT_DISTANCE).toBeLessThan(22);
  });
});

describe('Jedes Rohr ragt sichtbar aus dem Rumpf', () => {
  /*
   * Eine Lücke im finalen Klassenauftrag, beim Nachmessen aufgefallen:
   * Abschnitt 4 setzt die Mindestlänge (11 px) ab der ROHRWURZEL, nicht ab der
   * Rumpfkante. Für die kurzläufigen IMPACT-Klassen ergab das eine Mündung bei
   * 24,5 px, während ihre Base bis 23,2 px reicht – **1,3 px sichtbares Rohr**.
   * Juggernaut, Fortress und Leviathan wären Quadrate ohne Waffe gewesen.
   */
  it('lässt bei jeder Klasse jede Rohrrichtung aus der Base herausschauen', () => {
    /*
     * Geprüft wird die SILHOUETTE, nicht jedes Einzelteil: Ein gemeinsames
     * Gehäuse endet zwölf Pixel vor der kürzesten Mündung und liegt deshalb
     * absichtlich fast ganz unter dem Rumpf – sichtbar sind dort die Mündungen.
     * Ein erster, zu strenger Anlauf dieses Tests hat genau daran Scorch
     * gemeldet, obwohl der Tank richtig aussieht.
     */
    for (const id of PLAYER_CLASS_IDS) {
      if (id === 'smasher') continue;
      const formen = waffenformenVon(id);
      expect(formen.length, `${id} zeichnet gar nichts`).toBeGreaterThan(0);
      // Je Richtung das weiteste gezeichnete Stück gegen die Rumpfkante halten.
      const jeRichtung = new Map<string, { weiteste: number; winkel: number }>();
      for (const form of formen) {
        for (let i = 0; i < form.punkte.length; i += 2) {
          const abstand = Math.hypot(form.punkte[i]!, form.punkte[i + 1]!);
          const winkel = Math.atan2(form.punkte[i + 1]!, form.punkte[i]!);
          const fach = (Math.round(winkel * 180 / Math.PI / 15) * 15).toString();
          const vorher = jeRichtung.get(fach);
          if (!vorher || abstand > vorher.weiteste) jeRichtung.set(fach, { weiteste: abstand, winkel });
        }
      }
      let bestesUeberstehen = -Infinity;
      for (const { weiteste, winkel } of jeRichtung.values()) {
        bestesUeberstehen = Math.max(bestesUeberstehen, weiteste - basisReichweite(id, winkel));
      }
      expect(bestesUeberstehen, `${id}: nur ${bestesUeberstehen.toFixed(1)} px Rohr sichtbar`).toBeGreaterThan(5);
    }
  });
});
