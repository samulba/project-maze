import type { Vector2 } from '@project-maze/shared';
import { drohnenEcken, type Drohnenform } from '@project-maze/shared/drone-shape';

/**
 * Das Zeichnen der Drohnen – als reine Funktion, damit es prüfbar ist.
 *
 * Warum es diese Datei gibt: Am 13.08. lief von jeder angeschlagenen Drohne
 * eine Linie in die obere linke Ecke der Welt. Die Ursache war ein `arc()`
 * ohne vorangehendes `moveTo` – in PixiJS hängt ein Bogen an den aktuellen
 * Pfadpunkt an, und der stand nach dem vorherigen `stroke()` auf (0,0).
 *
 * Gefunden hat den Fehler ein Spieler, kein Test. Das war kein Zufall: Von 27
 * Client-Testdateien fasst keine einzige einen Zeichenaufruf an. Genau diese
 * Lücke schließt dieses Modul – die Zeichenschritte laufen gegen eine
 * beliebige Senke, und der Test schiebt eine Senke unter, die mitschreibt.
 *
 * Die Regel, die der Test durchsetzt, ist allgemein: **Jeder Pfad beginnt bei
 * seiner eigenen Drohne.** Ein neuer nackter Bogen fällt damit sofort auf,
 * ohne dass jemand den Pixi-Mechanismus noch einmal verstehen muss.
 */

/** Die Teilmenge von PixiJS' Graphics, die das Zeichnen der Drohnen braucht. */
export interface Zeichenflaeche {
  moveTo(x: number, y: number): Zeichenflaeche;
  lineTo(x: number, y: number): Zeichenflaeche;
  arc(x: number, y: number, radius: number, von: number, bis: number): Zeichenflaeche;
  poly(punkte: number[]): Zeichenflaeche;
  fill(stil: unknown): Zeichenflaeche;
  stroke(stil: unknown): Zeichenflaeche;
}

/** Was der Renderer je Drohne über sie weiß. */
export interface DrohnenBild {
  position: Vector2;
  velocity: Vector2;
  /** Blickrichtung aus dem Snapshot – Rückfall, solange die Drohne steht. */
  angle: number;
  /** Kollisionsradius vom Server; 13 nur, falls das Feld einmal fehlt. */
  radius: number;
  /**
   * Die Form aus Teil D des Klassenauftrags. Bis dahin war jede Drohne in allen
   * zehn Klassen ein Dreieck – der letzte Ort, an dem sich die Drohnenklassen
   * NICHT unterschieden haben. Fehlt sie, bleibt es beim Dreieck.
   */
  form?: string | undefined;
  health: number;
  maxHealth: number;
  color: number;
}

/** Ab diesem Schadensanteil erscheint der Lebensbogen (Befund 8). */
export const LEBENSBOGEN_AB = 0.6;
/** Kürzester gezeigter Bogen – sonst wäre eine sterbende Drohne wieder unsichtbar. */
export const LEBENSBOGEN_MIN = 0.05;
/** Der Bogen beginnt oben, damit alle Drohnen dieselbe Leserichtung haben. */
export const BOGEN_START = -Math.PI / 2;
/** Ab dieser Geschwindigkeit zeigt die Spur, wo die Drohne herkommt. */
export const SPUR_AB_TEMPO = 90;

const ecken = (seiten: number, radius: number, drehung: number): number[] => {
  const punkte: number[] = [];
  for (let index = 0; index < seiten; index += 1) {
    const winkel = drehung + (index * Math.PI * 2) / seiten;
    punkte.push(Math.cos(winkel) * radius, Math.sin(winkel) * radius);
  }
  return punkte;
};

const versetzt = (punkte: number[], position: Vector2): number[] =>
  punkte.map((wert, index) => wert + (index % 2 === 0 ? position.x : position.y));

/**
 * Blickrichtung einer Drohne.
 *
 * Bewusst kein `||`: Eine Drohne, die exakt nach rechts fliegt, hat den Winkel
 * 0 – und 0 ist falsy. Sie hätte dann den Snapshot-Winkel benutzt statt ihrer
 * echten Flugrichtung.
 */
export function drohnenWinkel(bild: Pick<DrohnenBild, 'velocity' | 'angle'>): number {
  const tempo = Math.hypot(bild.velocity.x, bild.velocity.y);
  return tempo > 0.001 ? Math.atan2(bild.velocity.y, bild.velocity.x) : bild.angle;
}

/** Zeichnet alle Drohnen. Die Fläche wird NICHT geleert – das bleibt beim Aufrufer. */
export function zeichneDrohnen(flaeche: Zeichenflaeche, bilder: Iterable<DrohnenBild>): void {
  for (const bild of bilder) {
    const tempo = Math.hypot(bild.velocity.x, bild.velocity.y);
    const winkel = drohnenWinkel(bild);

    if (tempo > SPUR_AB_TEMPO) {
      flaeche
        .moveTo(bild.position.x - (bild.velocity.x / tempo) * 16, bild.position.y - (bild.velocity.y / tempo) * 16)
        .lineTo(bild.position.x, bild.position.y)
        .stroke({ color: bild.color, alpha: 0.2, width: 3 });
    }

    // Echte Größe statt Einheitsdreieck (Befund 41): Der Server rechnet mit
    // Radien von 7,5 (Hive) bis 15,5 (Carrier) – gezeichnet wurde immer 13.
    // Die Form kommt aus `shared/drone-shape.ts` – dieselbe Quelle, aus der der
    // Server seinen Trefferradius nimmt. Eine Form, die nur der Client kennt,
    // sähe früher oder später anders aus, als sie getroffen wird.
    flaeche
      .poly(versetzt(gedreht(drohnenEcken((bild.form ?? 'triangle') as Drohnenform, bild.radius), winkel), bild.position))
      .fill(bild.color)
      .stroke({ color: 0xffffff, alpha: 0.3, width: 2 });

    // Lebensbogen ab 60 % Schaden (Befund 8): Eine Drohne bei 5 % Leben sah
    // exakt aus wie eine frische, obwohl beide Zahlen im Snapshot liegen.
    const anteil = bild.health / Math.max(1, bild.maxHealth);
    if (anteil < LEBENSBOGEN_AB) {
      // `moveTo` eröffnet den Unterpfad – ohne es zieht Pixi eine Linie vom
      // letzten Pfadpunkt (nach `stroke()` die Weltecke) zum Bogenanfang.
      // Startpunkt und Anfangswinkel kommen aus DERSELBEN Konstante; zwei
      // getrennte Zahlen wären der Weg, auf dem der Strich als Stummel
      // zurückkäme.
      const bogen = bild.radius + 4;
      flaeche
        .moveTo(bild.position.x + Math.cos(BOGEN_START) * bogen, bild.position.y + Math.sin(BOGEN_START) * bogen)
        .arc(bild.position.x, bild.position.y, bogen, BOGEN_START, BOGEN_START + Math.PI * 2 * Math.max(LEBENSBOGEN_MIN, anteil))
        .stroke({ color: anteil > 0.3 ? 0x65d39a : 0xf05e72, alpha: 0.7, width: 2 });
    }
  }
}

/** Eckenliste um den Ursprung drehen – die Formen zeigen nach +X. */
function gedreht(punkte: number[], winkel: number): number[] {
  const cos = Math.cos(winkel);
  const sin = Math.sin(winkel);
  const raus: number[] = [];
  for (let i = 0; i < punkte.length; i += 2) {
    raus.push(punkte[i]! * cos - punkte[i + 1]! * sin, punkte[i]! * sin + punkte[i + 1]! * cos);
  }
  return raus;
}
