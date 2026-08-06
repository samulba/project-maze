import { type PlayerClass } from '@project-maze/shared';
import {
  buildWheel,
  familyInfo,
  leadsTo,
  pathTo,
  reachableFrom,
  type WheelNode
} from './class-tree';

/**
 * Das Rad als SVG (MASTERPLAN KL3).
 *
 * Ein Bauteil, zwei Orte: das Overlay im Spiel (Taste `C`) und die
 * Enzyklopädie auf dem Startscreen. Beide zeigen dasselbe Rad, nur mit anderem
 * Rahmen – deshalb liegt das Zeichnen hier und nicht zweimal daneben.
 *
 * **Warum SVG und nicht Canvas:** 29 Knoten mit Text, die nur auf Klick und
 * Größenänderung neu gezeichnet werden. Ein Canvas müsste die Trefferprüfung
 * selbst rechnen und bei jeder Auflösung neu malen; SVG bringt beides mit,
 * skaliert verlustfrei und kostet nichts, solange sich nichts ändert. Das Rad
 * liegt außerdem im DOM und ist damit über die Tastatur bedienbar.
 *
 * **Kosten (Auflage 4):** Das SVG entsteht **einmal** beim Öffnen und wird
 * danach nur noch über Klassen umgefärbt – kein Neuaufbau bei jedem Snapshot.
 * 29 Kreise, 28 Linien, 29 Beschriftungen: rund 90 Knoten. Zum Vergleich: Die
 * Bestenliste allein hat 8 Zeilen à 4 Elemente. Auf der Qualitätsstufe
 * „niedrig" entfallen die Ringlinien und die Kantenglättung des Textes; die
 * Knoten bleiben, weil sie der Inhalt sind.
 */

const NS = 'http://www.w3.org/2000/svg';

/** Radien der vier Ringe in SVG-Einheiten. Das Feld ist 1000 × 1000 groß. */
// Fuenf Ringe seit Klassen 4.0: Core, Familien (L5), L15, L28, Apex (L42).
const RADIEN = [0, 112, 214, 322, 430] as const;
const MITTE = 500;
/** Knotengrößen je Ring – innen wichtiger, also größer. */
const GROESSE = [46, 32, 24, 20, 18] as const;

export interface WheelSelection {
  node: WheelNode;
  /** Liegt die Klasse auf dem Pfad des Spielers? */
  reachable: boolean;
}

const punkt = (angle: number, radius: number): { x: number; y: number } => {
  // 0° oben, im Uhrzeigersinn – so, wie man ein Rad liest.
  const bogen = (angle - 90) * Math.PI / 180;
  return { x: MITTE + Math.cos(bogen) * radius, y: MITTE + Math.sin(bogen) * radius };
};

const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
  const knoten = document.createElementNS(NS, name);
  for (const [schluessel, wert] of Object.entries(attrs)) knoten.setAttribute(schluessel, String(wert));
  return knoten;
};

/**
 * Zeichnet das Rad und meldet die Auswahl.
 *
 * Der Aufrufer bestimmt, was mit der Auswahl passiert – das Overlay zeigt eine
 * Karte daneben, die Enzyklopädie dieselbe Karte darunter.
 */
export class ClassWheel {
  readonly element: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly knoten = new Map<PlayerClass, SVGGElement>();
  private readonly kanten = new Map<PlayerClass, SVGLineElement>();
  private readonly rad = buildWheel();
  private aktuell: PlayerClass = 'core';
  private gewaehlt: PlayerClass = 'core';

  constructor(private readonly onSelect: (auswahl: WheelSelection) => void) {
    this.element = document.createElement('div');
    this.element.className = 'wheel';
    this.svg = el('svg', {
      viewBox: '0 0 1000 1000',
      class: 'wheel-svg',
      role: 'group',
      'aria-label': 'Klassenbaum'
    });
    this.zeichne();
    this.element.append(this.svg);
    this.waehle('core');
  }

  /** Aktuelle Klasse des Spielers – hebt den eigenen Pfad hervor. */
  setCurrent(playerClass: PlayerClass): void {
    if (playerClass === this.aktuell) return;
    this.aktuell = playerClass;
    this.faerbe();
    // Beim Klassenwechsel springt die Auswahl mit: Was man gerade geworden ist,
    // will man auch lesen.
    this.waehle(playerClass);
  }

  /** Auswahl von außen setzen (Tastatur, Sprung aus der Wahlkarte). */
  waehle(id: PlayerClass): void {
    this.gewaehlt = id;
    this.faerbe();
    const eintrag = this.rad.find((k) => k.id === id);
    if (eintrag) this.onSelect({ node: eintrag, reachable: reachableFrom(this.aktuell, id) });
  }

  get selected(): PlayerClass { return this.gewaehlt; }

  private zeichne(): void {
    // Ringlinien zuerst, damit alles andere darüber liegt.
    const ringe = el('g', { class: 'wheel-rings' });
    for (const radius of RADIEN.slice(1)) {
      ringe.append(el('circle', { cx: MITTE, cy: MITTE, r: radius, class: 'wheel-ring' }));
    }
    this.svg.append(ringe);

    const kanten = el('g', { class: 'wheel-edges' });
    const knoten = el('g', { class: 'wheel-nodes' });
    const nach = new Map(this.rad.map((k) => [k.id, k]));

    for (const eintrag of this.rad) {
      if (eintrag.parent) {
        const eltern = nach.get(eintrag.parent);
        if (eltern) {
          const von = punkt(eltern.angle, RADIEN[eltern.ring]);
          const bis = punkt(eintrag.angle, RADIEN[eintrag.ring]);
          const linie = el('line', {
            x1: von.x, y1: von.y, x2: bis.x, y2: bis.y,
            class: `wheel-edge branch-${eintrag.branch}`
          });
          kanten.append(linie);
          this.kanten.set(eintrag.id, linie);
        }
      }

      const mitte = punkt(eintrag.angle, RADIEN[eintrag.ring]);
      const gruppe = el('g', {
        class: `wheel-node ring-${eintrag.ring} branch-${eintrag.branch}`,
        tabindex: 0,
        role: 'button',
        'aria-label': `${eintrag.label}, ab Level ${eintrag.unlockLevel}`
      });
      gruppe.append(el('circle', { cx: mitte.x, cy: mitte.y, r: GROESSE[eintrag.ring], class: 'wheel-dot' }));
      const beschriftung = el('text', {
        x: mitte.x,
        y: mitte.y + GROESSE[eintrag.ring] + 24,
        class: 'wheel-label',
        'text-anchor': 'middle'
      });
      beschriftung.textContent = eintrag.label;
      gruppe.append(beschriftung);
      gruppe.addEventListener('click', () => this.waehle(eintrag.id));
      gruppe.addEventListener('keydown', (ereignis) => {
        if (ereignis.key === 'Enter' || ereignis.key === ' ') {
          ereignis.preventDefault();
          this.waehle(eintrag.id);
        }
      });
      knoten.append(gruppe);
      this.knoten.set(eintrag.id, gruppe);
    }
    this.svg.append(kanten, knoten);
  }

  /**
   * Färbt Auswahl und eigenen Pfad. Nur Klassen umschalten, nichts neu bauen –
   * das ist der Grund, warum das Rad auch mitten im Gefecht nichts kostet.
   */
  private faerbe(): void {
    const eigenerPfad = new Set(pathTo(this.aktuell));
    for (const [id, gruppe] of this.knoten) {
      gruppe.classList.toggle('is-selected', id === this.gewaehlt);
      gruppe.classList.toggle('is-current', id === this.aktuell);
      gruppe.classList.toggle('on-path', eigenerPfad.has(id));
      gruppe.classList.toggle('is-reachable', reachableFrom(this.aktuell, id));
    }
    for (const [id, linie] of this.kanten) {
      linie.classList.toggle('on-path', eigenerPfad.has(id));
    }
  }
}

/**
 * Die Karte zu einer Klasse: Spielstil, Signature und wohin es weitergeht.
 *
 * Der Auftrag ist ausdrücklich, dass die **Signature** erklärt wird und nicht
 * nur der Baum gezeichnet – deshalb stehen Aufbau und Wirkung hier vor der
 * Klassenbeschreibung, und die Werte kommen gar nicht vor.
 */
export function renderClassCard(auswahl: WheelSelection): HTMLElement {
  const { node } = auswahl;
  const karte = document.createElement('div');
  karte.className = `wheel-card branch-${node.branch}`;

  const familie = familyInfo(node.branch);
  const kopf = document.createElement('div');
  kopf.className = 'wheel-card-head';
  const rolle = document.createElement('em');
  rolle.textContent = familie ? familie.label.toUpperCase() : 'ALLROUNDER';
  const titel = document.createElement('strong');
  titel.textContent = node.label;
  const stufe = document.createElement('small');
  stufe.textContent = node.unlockLevel <= 1 ? 'START' : `AB LEVEL ${node.unlockLevel}`;
  kopf.append(rolle, titel, stufe);
  karte.append(kopf);

  const beschreibung = document.createElement('p');
  beschreibung.className = 'wheel-card-text';
  beschreibung.textContent = node.description;
  karte.append(beschreibung);

  if (familie) {
    const block = document.createElement('div');
    block.className = 'wheel-signature';
    const name = document.createElement('div');
    name.className = 'wheel-signature-head';
    const wort = document.createElement('span');
    wort.textContent = familie.signature.toUpperCase();
    const art = document.createElement('small');
    art.textContent = familie.label;
    name.append(wort, art);
    block.append(name);
    for (const [beschriftung, text] of [['Lädt', familie.builds], ['Bringt', familie.pays]] as const) {
      const zeile = document.createElement('p');
      const marke = document.createElement('b');
      marke.textContent = beschriftung;
      zeile.append(marke, document.createTextNode(text));
      block.append(zeile);
    }
    karte.append(block);
  } else {
    const hinweis = document.createElement('p');
    hinweis.className = 'wheel-card-text muted';
    hinweis.textContent = 'Die Startklasse hat keine Signature – sie kommt mit der Familie auf Level 10.';
    karte.append(hinweis);
  }

  const weiter = leadsTo(node.id);
  const fuss = document.createElement('p');
  fuss.className = 'wheel-card-next';
  fuss.textContent = weiter ? `Führt zu → ${weiter.join(' · ')}` : 'Endklasse – hier endet der Pfad.';
  karte.append(fuss);

  if (!auswahl.reachable) {
    const sperre = document.createElement('p');
    sperre.className = 'wheel-card-locked';
    sperre.textContent = 'Von deinem aktuellen Pfad aus nicht mehr erreichbar.';
    karte.append(sperre);
  }
  return karte;
}
