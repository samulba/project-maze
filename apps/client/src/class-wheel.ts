import { classSilhouetteMarkup } from './class-preview';
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
/** Kantenlaenge der Uebersicht in viewBox-Einheiten. */
const BASIS_VIEW = 1000;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 6;
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
  private zoom = 1;
  private mitte = { x: 500, y: 500 };
  private zoomAnwenden: (() => void) | null = null;

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
    const hinweis = document.createElement('p');
    hinweis.className = 'wheel-hint';
    hinweis.textContent = 'Mausrad zoomt · Ziehen verschiebt · Doppelklick zeigt alles';
    this.element.append(hinweis);
    this.installiereZoom();
    this.waehle('core');
  }

  /**
   * Zoom und Verschieben. Mit 65 Klassen ist ein festes Bild nicht mehr lesbar:
   * Auf dem Startscreen wie im Overlay standen die Knoten als Punkthaufen, und
   * die Beschriftungen lagen uebereinander (Sams Befund vom 07.08., zweimal).
   *
   * Umgesetzt ueber die viewBox statt ueber CSS-Transform: Strichstaerken und
   * Schrift skalieren dann mit, das Bild bleibt scharf, und die Trefferflaechen
   * der Knoten stimmen ohne Umrechnung.
   */
  private installiereZoom(): void {
    const anwenden = (): void => {
      const groesse = BASIS_VIEW / this.zoom;
      this.svg.setAttribute('viewBox', `${this.mitte.x - groesse / 2} ${this.mitte.y - groesse / 2} ${groesse} ${groesse}`);
      // Wie viele Namen das Bild vertraegt, haengt am Zoom. 65 Knoten mit 65
      // Beschriftungen sind in der Uebersicht ein Teppich - gemessen ueber-
      // lappten auf Ring 2 und 3 die Haelfte der Namen. Also traegt die
      // Uebersicht nur die Familien und die Apex-Klassen ihren Namen, und mit
      // jedem Zoomschritt kommt eine Ebene dazu. Was ausgewaehlt, angesteuert
      // oder auf dem eigenen Pfad ist, bleibt immer beschriftet (CSS).
      this.svg.dataset.detail = this.zoom < 1.45 ? 'grob' : this.zoom < 2.4 ? 'mittel' : 'fein';
      // Die Schrift teilt sich durch den Zoom (class-tree.css) und behaelt
      // damit ihre Groesse auf dem Schirm, waehrend Knoten und Linien wachsen.
      this.svg.style.setProperty('--wheel-zoom', this.zoom.toFixed(3));
    };
    this.zoomAnwenden = anwenden;
    anwenden();

    this.svg.addEventListener('wheel', (ereignis) => {
      ereignis.preventDefault();
      // Auf den Mauszeiger zoomen, nicht auf die Bildmitte - sonst rutscht
      // einem der Zweig, den man ansieht, aus dem Bild.
      const box = this.svg.getBoundingClientRect();
      const vorher = this.nachViewBox(ereignis.clientX, ereignis.clientY, box);
      const faktor = ereignis.deltaY < 0 ? 1.18 : 1 / 1.18;
      this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * faktor));
      anwenden();
      const nachher = this.nachViewBox(ereignis.clientX, ereignis.clientY, box);
      this.mitte = { x: this.mitte.x + (vorher.x - nachher.x), y: this.mitte.y + (vorher.y - nachher.y) };
      anwenden();
    }, { passive: false });

    let ziehtVon: { x: number; y: number } | null = null;
    let startMitte = this.mitte;
    this.svg.addEventListener('pointerdown', (ereignis) => {
      // Knoten fangen ihre Klicks selbst ab; hier landet nur die freie Flaeche.
      if ((ereignis.target as Element).closest('.wheel-node')) return;
      ziehtVon = { x: ereignis.clientX, y: ereignis.clientY };
      startMitte = this.mitte;
      this.svg.setPointerCapture(ereignis.pointerId);
      this.element.classList.add('is-panning');
    });
    this.svg.addEventListener('pointermove', (ereignis) => {
      if (!ziehtVon) return;
      const box = this.svg.getBoundingClientRect();
      const proPixel = BASIS_VIEW / this.zoom / Math.max(1, box.width);
      this.mitte = {
        x: startMitte.x - (ereignis.clientX - ziehtVon.x) * proPixel,
        y: startMitte.y - (ereignis.clientY - ziehtVon.y) * proPixel
      };
      anwenden();
    });
    const loslassen = (): void => { ziehtVon = null; this.element.classList.remove('is-panning'); };
    this.svg.addEventListener('pointerup', loslassen);
    this.svg.addEventListener('pointercancel', loslassen);
    // Doppelklick auf die freie Flaeche stellt die Uebersicht wieder her.
    this.svg.addEventListener('dblclick', (ereignis) => {
      if ((ereignis.target as Element).closest('.wheel-node')) return;
      this.zuruecksetzen();
    });
  }

  /** Bildschirmpunkt in viewBox-Koordinaten. */
  private nachViewBox(clientX: number, clientY: number, box: DOMRect): { x: number; y: number } {
    const groesse = BASIS_VIEW / this.zoom;
    return {
      x: this.mitte.x - groesse / 2 + ((clientX - box.left) / Math.max(1, box.width)) * groesse,
      y: this.mitte.y - groesse / 2 + ((clientY - box.top) / Math.max(1, box.height)) * groesse
    };
  }

  /** Zurueck auf Uebersicht: ganzes Rad, zentriert. */
  zuruecksetzen(): void {
    this.zoom = 1;
    this.mitte = { x: 500, y: 500 };
    this.zoomAnwenden?.();
  }

  /** Auf eine Klasse zoomen - der Knopf „auf mich zentrieren" nutzt das. */
  zentriereAuf(id: PlayerClass, zoom = 2.2): void {
    const eintrag = this.rad.find((k) => k.id === id);
    if (!eintrag) return;
    const stelle = punkt(eintrag.angle, RADIEN[eintrag.ring]);
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    this.mitte = { x: stelle.x, y: stelle.y };
    this.zoomAnwenden?.();
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
      // Welle B: die echte Silhouette im Knoten - dieselbe Geometrie wie im
      // Spiel und auf der Wahlkarte. Skaliert auf den Knotenradius; die
      // Rotation entspricht der Kartenvorschau.
      const silhouette = el('g', { class: 'wheel-silhouette' });
      const scale = (GROESSE[eintrag.ring] * 2) / 110;
      silhouette.setAttribute('transform', `translate(${mitte.x} ${mitte.y}) scale(${scale.toFixed(3)}) rotate(-30)`);
      silhouette.innerHTML = classSilhouetteMarkup(eintrag.id);
      gruppe.append(silhouette);
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
