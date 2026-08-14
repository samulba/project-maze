import { dauer, komma, trend, zahl, zeitpunkt } from './format';
import { escape, klassen } from './html';
import { icon, type IconName } from './icons';
import { ring, verlauf } from './charts';
import {
  backlogBlock,
  bestenliste,
  betrieb,
  block,
  kachel,
  klassenTabelle,
  kohortenTabelle,
  quoteText,
  spielerTabelle,
  spielerWerkzeuge,
  treppe,
  type BacklogAntwort
} from './panels';
import type { DailyRow, DeviceRow, Overview, Summary, Wiederkehr } from './types';

export { backlogBlock, type BacklogAntwort };

/**
 * Die Ansicht des Portals.
 *
 * Reines HTML aus Daten – kein Framework, keine Diagrammbibliothek.
 *
 * **Was sich geändert hat.** Die erste Fassung war eine einzige Rolle: acht
 * Abschnitte untereinander, gut vier Bildschirmhöhen, jeder Abschnitt im selben
 * Gewicht wie der davor. Wer sie öffnete, sah alles gleichzeitig und damit
 * nichts – und die Frage, mit der man kam, stand irgendwo zwischen Frage drei
 * und Frage sieben.
 *
 * Jetzt liegen dieselben Zahlen auf fünf **Tafeln**, eine je Frage: Läuft es?
 * Wer war da? Wie wird gespielt? Was ist offen? Was meldet der Betrieb? Die
 * Navigation links nennt die Fragen, und man beantwortet immer nur eine.
 *
 * Alle Tafeln stehen im Dokument, sichtbar ist die mit `data-tafel` am Rahmen.
 * Das kostet ein paar Kilobyte Markup und spart dafür jeden Umbau beim
 * Umschalten: Ein Wechsel ist ein Attribut, kein Rendern – und beim
 * Nachladen alle zwanzig Sekunden bleibt die offene Tafel offen, ohne dass
 * irgendwer sich etwas merken müsste.
 */

export type TafelName = 'uebersicht' | 'wiederkehr' | 'spieler' | 'klassen' | 'liste' | 'betrieb';

export interface Tafel {
  name: TafelName;
  titel: string;
  unter: string;
  symbol: IconName;
  /** Verwendet diese Tafel den Zeitraum-Schalter? Steuert, ob er sichtbar ist. */
  zeitraum: boolean;
}

export const TAFELN: readonly Tafel[] = [
  { name: 'uebersicht', titel: 'Übersicht', unter: 'Läuft es gerade, und wachsen wir?', symbol: 'uebersicht', zeitraum: true },
  { name: 'wiederkehr', titel: 'Wiederkehr', unter: 'Kommen Fremde wieder? Die letzte offene Zeile des Ziels.', symbol: 'wiederkehr', zeitraum: true },
  { name: 'spieler', titel: 'Spieler', unter: 'Wer war da, und wie oft?', symbol: 'spieler', zeitraum: false },
  { name: 'klassen', titel: 'Klassen', unter: 'Wie wird gespielt – und was spielt niemand?', symbol: 'klassen', zeitraum: true },
  { name: 'liste', titel: 'Sams Liste', unter: 'Was ist offen, was ist erledigt?', symbol: 'liste', zeitraum: false },
  { name: 'betrieb', titel: 'Betrieb', unter: 'Was meldet der Server über sich selbst?', symbol: 'betrieb', zeitraum: false }
];

/** Nachschlag mit Rückfall auf die Übersicht – ein unbekannter Name aus der Adresse darf nichts umwerfen. */
export const tafelInfo = (name: TafelName): Tafel =>
  TAFELN.find((eintrag) => eintrag.name === name) ?? TAFELN[0]!;

export interface ViewState {
  overview: Overview;
  players: DeviceRow[];
  playersTotal: number;
  sortierung: 'new' | 'active';
  tage: number;
  aktualisiert: number;
  backlog: BacklogAntwort | null;
  /** `null`, solange die Route nicht geantwortet hat oder keine Datenbank hängt. */
  wiederkehr?: Wiederkehr | null;
  /** Welche Tafel offen ist. Fehlt sie, ist es die Übersicht. */
  tafel?: TafelName;
  /** Name des angemeldeten Kontos, für den Fuß der Seitenleiste. */
  konto?: string | null;
}

/**
 * Vergleicht die zweite Hälfte des Zeitraums mit der ersten – **gleich lange
 * Hälften**, sonst vergleicht die Kachel Äpfel mit Birnen.
 *
 * Der erste Anlauf teilte bei `Math.floor(länge / 2)` und gab der jüngeren
 * Hälfte den Rest. Bei sieben Tagen standen damit vier Tage gegen drei: Eine
 * vollkommen flache Woche – jeden Tag dieselben zehn Spieler – meldete auf
 * jeder Kachel **+33 %**. Das ist die schlimmste Sorte Fehler in einem Portal,
 * in das man täglich zehn Sekunden schaut: Die Zahl sieht nach Wachstum aus,
 * das Wachstum kommt aus der Division.
 *
 * Betroffen war nicht nur die Sieben-Tage-Ansicht. Fehlt in einem längeren
 * Fenster ein Tag ohne Daten – bei einem jungen Spiel der Normalfall –, ist die
 * Zeilenzahl ungerade, und derselbe Aufschlag entsteht.
 *
 * Bei ungerader Zeilenzahl fällt deshalb der **älteste** Tag heraus: Verglichen
 * werden die letzten k Tage mit den k davor.
 */
export function haelften(rows: readonly DailyRow[]): { jung: Summary; alt: Summary } | null {
  if (rows.length < 4) return null;
  const k = Math.floor(rows.length / 2);
  const summe = (teil: readonly DailyRow[]): Summary => teil.reduce((acc, row) => ({
    players: acc.players + row.players,
    newPlayers: acc.newPlayers + row.newPlayers,
    sessions: acc.sessions + row.sessions,
    accounts: acc.accounts + row.accounts,
    runs: acc.runs + row.runs,
    kills: acc.kills + row.kills,
    totalSeconds: acc.totalSeconds + row.totalSeconds,
    avgSessionSeconds: 0
  }), { players: 0, newPlayers: 0, sessions: 0, accounts: 0, runs: 0, kills: 0, totalSeconds: 0, avgSessionSeconds: 0 });
  return { alt: summe(rows.slice(rows.length - 2 * k, rows.length - k)), jung: summe(rows.slice(rows.length - k)) };
}

/* ------------------------------------------------------------------ *
 * Rahmen: Seitenleiste, Kopfleiste
 * ------------------------------------------------------------------ */

/** Die Pille, die sagt, ob gerade jemand spielt. Der einzige Wert, der blinkt. */
function livePille(overview: Overview): string {
  const online = Number(overview.live.humans ?? 0);
  const zustand = overview.live.draining ? 'draining' : online > 0 ? 'aktiv' : 'ruhig';
  const text = overview.live.draining ? 'fährt herunter' : online > 0 ? `${zahl(online)} online` : 'niemand online';
  return `<span class="live ${zustand}"><i></i>${escape(text)}</span>`;
}

function seitenleiste(state: ViewState, offeneWuensche: number): string {
  const punkte = TAFELN.map((tafel) => {
    const abzeichen = tafel.name === 'liste' && offeneWuensche > 0
      ? `<b class="abzeichen">${offeneWuensche}</b>`
      : tafel.name === 'spieler' && state.playersTotal > 0
        ? `<b class="abzeichen leise">${zahl(state.playersTotal)}</b>`
        : '';
    return `<button type="button" class="navi-punkt" data-ziel="${tafel.name}" aria-current="${state.tafel === tafel.name}">
      ${icon(tafel.symbol)}<span>${escape(tafel.titel)}</span>${abzeichen}
    </button>`;
  }).join('');

  const live = state.overview.live;
  return `<aside class="seitenleiste">
    <div class="marken-block">
      <span class="marken-glyphe" aria-hidden="true">M</span>
      <span class="marken-text">
        <b>MAZERS</b>
        <i>Zentrale</i>
      </span>
    </div>
    <nav class="navi" aria-label="Bereiche">${punkte}</nav>
    <div class="seitenleiste-fuss">
      ${livePille(state.overview)}
      <dl class="server-fakten">
        <div><dt>Laufzeit</dt><dd>${escape(dauer(Number(live.uptimeSeconds ?? 0)))}</dd></div>
        <div><dt>Stand</dt><dd class="mono">${escape(String(live.commit ?? '?')).slice(0, 8)}</dd></div>
      </dl>
      ${state.konto ? `<p class="konto">${escape(state.konto)}</p>` : ''}
      <button id="abmelden" type="button" class="navi-punkt leise">${icon('abmelden')}<span>Abmelden</span></button>
    </div>
  </aside>`;
}

function kopfleiste(state: ViewState, offen: Tafel): string {
  const auswahl = [7, 14, 30, 90].map((d) => `<button type="button" data-tage="${d}" class="${d === state.tage ? 'an' : ''}" aria-pressed="${d === state.tage}">${d}&thinsp;T</button>`).join('');
  // Nur der Titel der offenen Tafel steht im Dokument; beim Wechsel schreibt
  // `main.ts` ihn um. Vorher lagen alle sechs da und wurden per CSS versteckt –
  // eine Regel je Tafel, die beim Hinzufügen der sechsten prompt fehlte.
  return `<header class="kopfleiste">
    <button id="navi-auf" type="button" class="nur-schmal" aria-label="Bereiche öffnen">${icon('menue')}</button>
    <div class="kopf-titel">
      <h1 id="tafel-titel">${escape(offen.titel)}</h1>
      <p id="tafel-unter">${escape(offen.unter)}</p>
    </div>
    <div class="kopf-werkzeuge">
      <div class="segmente zeitraum" role="group" aria-label="Zeitraum">${auswahl}</div>
      <button id="neu" type="button" class="knopf" title="Jetzt neu laden">${icon('aktualisieren')}<span class="nur-breit">Aktualisieren</span></button>
    </div>
  </header>`;
}

/* ------------------------------------------------------------------ *
 * Die Tafeln
 * ------------------------------------------------------------------ */

function tafelUebersicht(state: ViewState): string {
  const { overview } = state;
  const live = overview.live;
  const heute = overview.today;
  const fenster = overview.window;
  const vergleich = haelften(overview.daily);
  const online = Number(live.humans ?? 0);
  const takt = Number(live.tick?.averageMs ?? 0);
  const last = Math.round(Number(live.tick?.busyRatio ?? 0) * 100);

  // Der Nordstern steht ganz oben und ist die einzige Kachel im Portal mit
  // eigener Gestalt: `docs/GOAL.md` nennt zwölf technische Zeilen, die alle
  // grün sind, und eine dreizehnte, die keine Prüfung beantworten kann.
  const nordstern = state.wiederkehr
    ? `<section class="nordstern">
        <div class="nordstern-text">
          <span class="nordstern-label">${icon('wiederkehr')}Fremde kommen wieder</span>
          <p>Die letzte offene Zeile des Ziels – und die einzige, die kein Test beantwortet.</p>
        </div>
        <div class="nordstern-wert">
          <strong>${escape(quoteText(state.wiederkehr.quote))}</strong>
          <small>${state.wiederkehr.quote === null
            ? 'noch kein Gerät alt genug'
            : `von ${zahl(state.wiederkehr.betrachtet - state.wiederkehr.frisch)} Geräten kamen ${zahl(state.wiederkehr.wieder)} am nächsten Tag zurück`}</small>
        </div>
        <button type="button" class="knopf" data-ziel="wiederkehr">Aufschlüsseln</button>
      </section>`
    : '';

  const jetzt = block('Jetzt in der Arena', `<div class="kacheln">
    ${kachel({
      label: 'Spieler online',
      wert: zahl(online),
      fuss: `${zahl(Number(live.bots ?? 0))} Bots in der Arena`,
      ton: online > 0 ? 'gut' : undefined
    })}
    ${kachel({
      label: 'Projektile',
      wert: zahl(Number(live.projectiles ?? 0)),
      fuss: `${zahl(Number(live.drones ?? 0))} Drohnen · ${zahl(Number(live.shapes ?? 0))} Formen`
    })}
    ${kachel({
      label: 'Läuft seit',
      wert: dauer(Number(live.uptimeSeconds ?? 0)),
      fuss: `Deploy ${String(live.deploymentId ?? '?')}`
    })}
    ${kachel({
      label: 'Takt',
      wert: `${komma(takt)} ms`,
      fuss: `Budget ${zahl(Number(live.tick?.budgetMs ?? 25))} ms · ${last} % ausgelastet`,
      ton: last >= 50 ? 'warn' : 'gut'
    })}
  </div>`, '', 'Direkt aus dem Prozess – keine Datenbank beteiligt.');

  const heuteBlock = block('Heute', `<div class="kacheln">
    ${kachel({ label: 'Spieler', wert: zahl(heute.players), fuss: `${zahl(heute.sessions)} Besuche` })}
    ${kachel({
      label: 'Davon neu',
      wert: zahl(heute.newPlayers),
      fuss: heute.players > 0 ? `${Math.round((heute.newPlayers / heute.players) * 100)} % der Besucher` : 'noch niemand da'
    })}
    ${kachel({ label: 'Runden', wert: zahl(heute.runs), fuss: `${zahl(heute.kills)} Abschüsse` })}
    ${kachel({ label: 'Spielzeit', wert: dauer(heute.totalSeconds), fuss: `Ø ${dauer(heute.avgSessionSeconds)} je Besuch` })}
  </div>`);

  const daily = overview.daily;
  const zeitraum = block(`Letzte ${state.tage} Tage`, `<div class="kacheln">
    ${kachel({
      label: 'Spielertage',
      wert: zahl(fenster.players),
      fuss: 'Summe der Tageswerte – wer an drei Tagen spielt, zählt dreimal',
      vergleich: vergleich ? trend(vergleich.jung.players, vergleich.alt.players) : undefined,
      verlauf: daily.map((row) => row.players)
    })}
    ${kachel({
      label: 'Neue Spieler',
      wert: zahl(fenster.newPlayers),
      fuss: 'exakt: jedes Gerät ist an genau einem Tag neu',
      vergleich: vergleich ? trend(vergleich.jung.newPlayers, vergleich.alt.newPlayers) : undefined,
      verlauf: daily.map((row) => row.newPlayers)
    })}
    ${kachel({
      label: 'Besuche',
      wert: zahl(fenster.sessions),
      fuss: `Ø ${dauer(fenster.avgSessionSeconds)} lang`,
      vergleich: vergleich ? trend(vergleich.jung.sessions, vergleich.alt.sessions) : undefined,
      verlauf: daily.map((row) => row.sessions)
    })}
    ${kachel({
      label: 'Spielzeit',
      wert: dauer(fenster.totalSeconds),
      fuss: `${zahl(fenster.runs)} Runden · ${zahl(fenster.kills)} Abschüsse`,
      vergleich: vergleich ? trend(vergleich.jung.totalSeconds, vergleich.alt.totalSeconds) : undefined,
      verlauf: daily.map((row) => row.totalSeconds)
    })}
  </div>
  ${verlauf(daily)}`, '', vergleich ? 'Der Trend vergleicht die zweite Hälfte des Zeitraums mit der ersten.' : 'Für einen Trendvergleich fehlen noch Tage.');

  return `${nordstern}${jetzt}${heuteBlock}${zeitraum}`;
}

/**
 * Die Tafel zur letzten offenen Zeile aus `docs/GOAL.md`.
 *
 * Sie steht direkt hinter der Übersicht und vor allem anderen, weil sie die
 * einzige Frage beantwortet, die kein Test beantworten kann. Alle anderen
 * Tafeln sagen, dass etwas läuft; diese sagt, ob es jemanden interessiert.
 */
function tafelWiederkehr(state: ViewState): string {
  const w = state.wiederkehr;
  if (!w) {
    return `<div class="leer">
      <strong>Noch keine Wiederkehr-Zahlen.</strong>
      <span>Ohne Datenbank (Migration 0005) gibt es keine Geräte, die wiederkommen könnten.</span>
    </div>`;
  }

  const sieben = w.stufen.find((stufe) => stufe.tage === 7);
  const kopf = block('Kommen sie wieder?', `<div class="kacheln">
    ${kachel({
      label: 'Kamen am nächsten Tag wieder',
      wert: quoteText(w.quote),
      fuss: w.quote === null
        ? 'noch kein Gerät alt genug für die Frage'
        : `${zahl(w.wieder)} von ${zahl(w.betrachtet - w.frisch)} Geräten, die es konnten`,
      ton: w.quote === null ? undefined : w.quote >= 25 ? 'gut' : 'warn'
    })}
    ${kachel({
      label: 'Nach 7 Tagen noch da',
      wert: quoteText(sieben?.quote ?? null),
      fuss: sieben && sieben.reif > 0
        ? `${zahl(sieben.geblieben)} von ${zahl(sieben.reif)} Geräten, die schon 7 Tage alt sind`
        : 'noch kein Gerät sieben Tage alt',
      ton: (sieben?.quote ?? 0) >= 10 ? 'gut' : undefined
    })}
    ${kachel({
      label: 'Einmal und nie wieder',
      wert: zahl(w.einmal),
      fuss: 'Geräte, die die Chance hatten und sie nicht genutzt haben',
      ton: 'warn'
    })}
    ${kachel({
      label: 'Betrachtete Geräte',
      wert: zahl(w.betrachtet),
      fuss: w.frisch > 0
        ? `${zahl(w.frisch)} davon von heute – sie zählen noch nirgends mit`
        : 'alle alt genug für mindestens eine Stufe'
    })}
  </div>`, '', `Erster Besuch in den letzten ${state.tage} Tagen. Gezählt wird das Gerät, nicht die Person.`);

  // Die Regel steht als Text auf der Tafel und nicht nur im Quelltext: Wer die
  // Zahl weitergibt, muss sagen können, worauf sie sich bezieht.
  const regel = `<p class="notiz regel">${icon('warnung')}<span>Jede Stufe zählt nur Geräte, die <b>alt genug</b> sind, um die Frage zu beantworten.
    Wer heute zum ersten Mal da war, fehlt in Zähler und Nenner – sonst ließe ein guter Tag mit vielen Neuen die Quote einbrechen.
    Gerechnet wird in Kalendertagen: Wer abends anfängt und am nächsten Abend wiederkommt, ist wiedergekommen.</span></p>`;

  const stufen = block('Wie lange bleiben sie?', `${treppe(w.stufen)}${regel}`);

  const kohorten = block('Woche für Woche', kohortenTabelle(w.kohorten), '',
    'Jede Zeile ist ein Jahrgang: alle Geräte, die in dieser Woche zum ersten Mal da waren.');

  const fussnote = w.abgeschnitten
    ? `<p class="notiz warn">${icon('warnung')}<span>Die Abfrage hat ihr Zeilenlimit erreicht – die jüngsten Geräte des Zeitraums fehlen in dieser Rechnung.</span></p>`
    : '';

  return `${kopf}${stufen}${kohorten}${fussnote}`;
}

function tafelSpieler(state: ViewState): string {
  const sortierText = state.sortierung === 'new' ? 'erstem Besuch' : 'letztem Besuch';
  return `${block('Geräte', spielerTabelle(state.players, state.playersTotal, sortierText), spielerWerkzeuge(state.sortierung),
    'Wiedererkannt wird der Browser, nicht die Person – zwei Browser sind zwei Zeilen.')}
    ${block('Bestenliste', bestenliste(state.overview.top))}`;
}

function tafelKlassen(state: ViewState): string {
  const { overview } = state;
  const verteilung = ring(overview.classes);
  return `${verteilung ? block('Verteilung', verteilung, '', `Alle beendeten Runden der letzten ${state.tage} Tage.`) : ''}
    ${block('Klassen im Einzelnen', klassenTabelle(overview.classes, overview.unusedClasses))}`;
}

/**
 * Diese Tafel bekommt keinen Blocktitel: Die Kopfzeile sagt bereits „Sams
 * Liste", und eine Überschrift, die den Titel darüber wiederholt, ist genau die
 * Sorte Füllung, gegen die der ganze Umbau hier antritt.
 */
function tafelListe(state: ViewState): string {
  const inhalt = backlogBlock(state.backlog);
  if (!inhalt) {
    return `<div class="leer">
      <strong>Die Liste ist gerade nicht erreichbar.</strong>
      <span>Das Portal steht trotzdem – sie ist eine Beigabe, kein Betriebswert.</span>
    </div>`;
  }
  return inhalt;
}

function tafelBetrieb(state: ViewState): string {
  const live = state.overview.live;
  return `${block('Selbstauskunft', betrieb(state.overview), '', 'Grün heißt: Der Server hält seine eigenen Zusagen ein.')}
    ${block('Auslieferung', `<dl class="fakten">
      <div><dt>Commit</dt><dd class="mono">${escape(String(live.commit ?? '?'))}</dd></div>
      <div><dt>Deploy</dt><dd class="mono">${escape(String(live.deploymentId ?? '?'))}</dd></div>
      <div><dt>Snapshot-Rate</dt><dd>${escape(String(live.snapshotRate ?? '?'))} Hz</dd></div>
      <div><dt>Debug-Werkzeuge</dt><dd>${live.debugTools ? 'an' : 'aus'}</dd></div>
      <div><dt>Datenbank</dt><dd>${state.overview.database ? 'verbunden' : 'nicht verbunden'}</dd></div>
      <div><dt>Zeitfenster</dt><dd>${zahl(state.overview.days)} Tage</dd></div>
    </dl>`)}`;
}

/* ------------------------------------------------------------------ *
 * Zusammenbau
 * ------------------------------------------------------------------ */

export function renderPortal(state: ViewState): string {
  const tafel = state.tafel ?? 'uebersicht';
  const offeneWuensche = state.backlog
    ? state.backlog.zaehlung.offen + state.backlog.zaehlung.arbeit
    : 0;

  const warnung = state.overview.database
    ? ''
    : `<div class="warnung">${icon('warnung')}<span>${escape(state.overview.hint ?? 'Ohne Datenbank gibt es keinen Verlauf.')}</span></div>`;

  const inhalte: Record<TafelName, string> = {
    uebersicht: tafelUebersicht(state),
    wiederkehr: tafelWiederkehr(state),
    spieler: tafelSpieler(state),
    klassen: tafelKlassen(state),
    liste: tafelListe(state),
    betrieb: tafelBetrieb(state)
  };

  const tafeln = TAFELN.map((eintrag) => `<section class="tafel" data-tafel="${eintrag.name}"${eintrag.name === tafel ? '' : ' hidden'}>
    ${eintrag.name === 'uebersicht' ? warnung : ''}
    ${inhalte[eintrag.name]}
  </section>`).join('');

  const offen = tafelInfo(tafel);
  return `<div class="${klassen('portal')}" data-offen="${tafel}" data-zeitraum="${offen.zeitraum ? 'an' : 'aus'}">
    ${seitenleiste({ ...state, tafel }, offeneWuensche)}
    <div class="haupt">
      ${kopfleiste(state, offen)}
      <main class="inhalt">${tafeln}</main>
      <footer class="fuss">
        <span>Zuletzt aktualisiert ${escape(zeitpunkt(new Date(state.aktualisiert).toISOString()))}</span>
        <span class="fuss-takt">${icon('puls')}aktualisiert sich alle 20 Sekunden</span>
      </footer>
    </div>
    <div class="navi-schleier" hidden></div>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Das Tor
 * ------------------------------------------------------------------ */

/** Der Zustand vor dem Login – und der, in dem die Allowlist noch leer ist. */
export function renderTor(zustand: {
  authEnabled: boolean;
  userId: string | null;
  allowlistSize: number;
  fehler: string | null;
  laedt: boolean;
}): string {
  const rahmen = (inhalt: string): string => `<div class="tor-buehne">
    <div class="tor">
      <div class="marken-block gross">
        <span class="marken-glyphe" aria-hidden="true">M</span>
        <span class="marken-text"><b>MAZERS</b><i>Zentrale</i></span>
      </div>
      ${inhalt}
    </div>
  </div>`;

  if (zustand.laedt) {
    return rahmen('<div class="tor-laden"><span class="spinner" aria-hidden="true"></span><p>Einen Moment …</p></div>');
  }

  if (!zustand.authEnabled) {
    return rahmen(`<h1>Der Login fehlt</h1>
      <p class="warnung">${icon('warnung')}<span>Der Login ist auf diesem Server abgeschaltet. Das Portal braucht ihn.</span></p>
      <p class="tor-text">Setze in Railway <code>AUTH_ENABLED=true</code> (dazu <code>SUPABASE_JWT_SECRET</code> oder die JWKS-Konfiguration, siehe <code>docs/SUPABASE.md</code>) und starte neu.</p>`);
  }

  if (zustand.userId) {
    // Angemeldet, aber nicht eingetragen: Hier steht die ID, die in die
    // Allowlist gehört. Ohne diesen Bildschirm käme niemand je hinein.
    return rahmen(`<h1>Noch kein Zutritt</h1>
      <p class="warnung">${icon('warnung')}<span>${zustand.allowlistSize === 0
        ? 'Es ist noch kein Admin eingetragen.'
        : 'Dieses Konto steht nicht auf der Liste.'}</span></p>
      <p class="tor-text">Deine Konto-ID:</p>
      <code class="id" id="konto-id">${escape(zustand.userId)}</code>
      <button id="kopieren" type="button" class="knopf">${icon('kopieren')}<span>ID kopieren</span></button>
      <p class="klein">Trage sie in Railway unter <code>ADMIN_USER_IDS</code> ein (mehrere durch Komma getrennt) und starte den Dienst neu. Danach lädst du diese Seite neu.</p>
      <button id="abmelden" type="button" class="knopf leise">${icon('abmelden')}<span>Abmelden</span></button>`);
  }

  return rahmen(`<h1>Anmelden</h1>
    <p class="tor-text">Die Zahlen hinter MAZERS – Spieler, Wachstum, Betrieb.</p>
    ${zustand.fehler ? `<p class="warnung">${icon('warnung')}<span>${escape(zustand.fehler)}</span></p>` : ''}
    <button id="anmelden" type="button" class="knopf gross">${icon('google')}<span>Mit Google anmelden</span></button>
    <p class="klein">Zutritt hat nur, wer in <code>ADMIN_USER_IDS</code> steht.</p>`);
}
