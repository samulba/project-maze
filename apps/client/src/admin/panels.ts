import { escape, klassen } from './html';
import { icon } from './icons';
import { funke, leer, ring } from './charts';
import { dauer, farbton, initialen, komma, kurzId, seit, trend, zahl, zeitpunkt } from './format';
import type { ClassUsage, DeviceRow, Overview, TopRun } from './types';
import type { BacklogBereich, BacklogEintrag, BacklogStand, BacklogZaehlung } from '@project-maze/shared/backlog';

/**
 * Die Bausteine der Tafeln.
 *
 * Getrennt von `view.ts`, seit das Portal aus fünf Tafeln besteht statt aus
 * einer Rolle: Dort steht nur noch, welcher Baustein auf welcher Tafel liegt.
 */

/**
 * Die Felder tragen ihr `undefined` ausdrücklich: Das Projekt steht auf
 * `exactOptionalPropertyTypes`, und die Aufrufe setzen `ton` und `vergleich`
 * bedingt (`x ? … : undefined`). Ohne das explizite `| undefined` müsste jeder
 * Aufruf das Feld weglassen statt es auf undefined zu setzen – und das geht in
 * einem Objektliteral nicht ohne Verrenkungen.
 */
export interface KachelWunsch {
  label: string;
  wert: string;
  fuss?: string | undefined;
  vergleich?: ReturnType<typeof trend> | undefined;
  verlauf?: readonly number[] | undefined;
  ton?: 'akzent' | 'gut' | 'warn' | undefined;
}

/**
 * Eine Kennzahl.
 *
 * Drei Zeilen in fester Rangfolge: Beschriftung klein und ruhig, der Wert groß,
 * die Einordnung darunter. Der Trend sitzt **neben** dem Wert und nicht darunter,
 * weil er zum Wert gehört und nicht zur Fußnote – die alte Kachel hatte ihn in
 * der Grundlinie des Werts hängen, wo er wie eine Einheit aussah.
 */
export function kachel(wunsch: KachelWunsch): string {
  const { label, wert, fuss, vergleich, verlauf, ton } = wunsch;
  const trendMarkup = vergleich
    ? `<em class="trend ${vergleich.richtung}">${escape(vergleich.text)}</em>`
    : '';
  return `<article class="${klassen('kachel', ton && `ton-${ton}`)}">
    <span class="kachel-label">${escape(label)}</span>
    <div class="kachel-zeile">
      <strong class="kachel-wert">${escape(wert)}</strong>
      ${trendMarkup}
    </div>
    ${fuss ? `<small>${escape(fuss)}</small>` : ''}
    ${verlauf ? funke(verlauf, vergleich?.richtung === 'runter' ? 'neutral' : 'gut') : ''}
  </article>`;
}

/** Ein Block mit Überschrift – das einzige Gefäß für Inhalt auf einer Tafel. */
export function block(titel: string, inhalt: string, werkzeuge = '', hinweis = ''): string {
  return `<section class="block">
    <div class="block-kopf">
      <div>
        <h2>${escape(titel)}</h2>
        ${hinweis ? `<p class="block-hinweis">${escape(hinweis)}</p>` : ''}
      </div>
      ${werkzeuge}
    </div>
    ${inhalt}
  </section>`;
}

/* ------------------------------------------------------------------ *
 * Klassen
 * ------------------------------------------------------------------ */

export function klassenTabelle(classes: readonly ClassUsage[], ungenutzt: readonly string[]): string {
  if (classes.length === 0) {
    return leer('In diesem Zeitraum wurde keine Runde beendet.', 'Ohne beendete Runden gibt es nichts zu verteilen.');
  }
  const spitze = Math.max(...classes.map((eintrag) => eintrag.runs));
  const zeilen = classes.slice(0, 20).map((eintrag, index) => `<tr>
    <td class="rang">${index + 1}</td>
    <td class="name-zelle">
      <i class="familie branch-${escape(eintrag.branch)}"></i>
      <span>${escape(eintrag.label)}</span>
    </td>
    <td class="zahl">${zahl(eintrag.runs)}</td>
    <td class="anteil">
      <span class="anteil-balken"><b class="branch-${escape(eintrag.branch)}" style="width:${Math.max(2, (eintrag.runs / spitze) * 100).toFixed(1)}%"></b></span>
      <em>${komma(eintrag.share)} %</em>
    </td>
    <td class="zahl">${komma(eintrag.avgLevel)}</td>
    <td class="zahl">${zahl(eintrag.avgScore)}</td>
    <td class="zahl">${dauer(eintrag.avgSeconds)}</td>
  </tr>`).join('');

  // Die ungespielten Klassen sind für einen Product Owner die interessantere
  // Hälfte der Tabelle: Sie zeigen, was gebaut wurde und niemand findet.
  const rest = ungenutzt.length > 0
    ? `<div class="tote-klassen">
        <h3>${icon('warnung')}Nie gespielt <b>${ungenutzt.length}</b></h3>
        <div class="marken">${ungenutzt.map((name) => `<span class="marke-pille">${escape(name)}</span>`).join('')}</div>
      </div>`
    : `<p class="notiz gut">${icon('haken')}Jede Klasse wurde mindestens einmal gespielt.</p>`;

  return `<div class="tabellen-rahmen">
    <table class="tabelle">
      <thead><tr>
        <th class="rang">#</th><th>Klasse</th><th class="zahl">Runden</th><th>Verteilung</th>
        <th class="zahl">Ø Level</th><th class="zahl">Ø Score</th><th class="zahl">Ø Dauer</th>
      </tr></thead>
      <tbody>${zeilen}</tbody>
    </table>
  </div>${rest}`;
}

/* ------------------------------------------------------------------ *
 * Spieler
 * ------------------------------------------------------------------ */

export function spielerTabelle(rows: readonly DeviceRow[], total: number, sortierung: string): string {
  if (rows.length === 0) return leer('Noch keine Besuche aufgezeichnet.', 'Sobald jemand die Arena betritt, steht er hier.');
  const zeilen = rows.map((row) => {
    const name = row.lastName ?? 'Gast';
    // Der Suchschlüssel steht am Element und nicht im Filtercode: Die Suche in
    // `main.ts` soll nichts über den Aufbau einer Zeile wissen müssen.
    const schluessel = `${name} ${row.deviceId}`.toLowerCase();
    return `<tr data-suche="${escape(schluessel)}">
      <td class="name-zelle">
        <span class="avatar" style="--ton:${farbton(row.deviceId)}">${escape(initialen(row.lastName))}</span>
        <span class="name-block">
          <strong>${escape(name)}</strong>
          <small>${escape(kurzId(row.deviceId))}</small>
        </span>
        ${row.lastUserId ? '<em class="marke-konto">Konto</em>' : ''}
      </td>
      <td class="leise">${escape(zeitpunkt(row.firstSeen))}</td>
      <td>${escape(seit(row.lastSeen))}</td>
      <td class="zahl">${zahl(row.sessions)}</td>
      <td class="zahl">${zahl(row.runs)}</td>
      <td class="zahl">${dauer(row.totalSeconds)}</td>
      <td class="zahl">${zahl(row.bestScore)}</td>
      <td class="zahl">${zahl(row.bestLevel)}</td>
    </tr>`;
  }).join('');

  return `<div class="tabellen-rahmen">
    <table class="tabelle tabelle-spieler">
      <thead><tr>
        <th>Spieler</th><th>Erster Besuch</th><th>Zuletzt</th>
        <th class="zahl">Besuche</th><th class="zahl">Runden</th><th class="zahl">Spielzeit</th>
        <th class="zahl">Bester Score</th><th class="zahl">Bestes Level</th>
      </tr></thead>
      <tbody>${zeilen}</tbody>
    </table>
  </div>
  <p class="notiz" id="spieler-bilanz" data-gesamt="${total}" data-sortierung="${escape(sortierung)}">${zahl(rows.length)} von ${zahl(total)} Geräten, sortiert nach ${escape(sortierung)}.</p>`;
}

/** Die Suchleiste über der Spielertabelle. */
export function spielerWerkzeuge(sortierung: 'new' | 'active'): string {
  return `<div class="werkzeuge">
    <label class="suchfeld">
      ${icon('suche')}
      <input id="spieler-suche" type="search" placeholder="Name oder Geräte-ID" aria-label="Spieler suchen" autocomplete="off" spellcheck="false"/>
    </label>
    <div class="segmente" role="group" aria-label="Sortierung">
      <button type="button" data-sort="active" class="${sortierung === 'active' ? 'an' : ''}" aria-pressed="${sortierung === 'active'}">Zuletzt da</button>
      <button type="button" data-sort="new" class="${sortierung === 'new' ? 'an' : ''}" aria-pressed="${sortierung === 'new'}">Neu</button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Bestenliste
 * ------------------------------------------------------------------ */

export function bestenliste(top: readonly TopRun[]): string {
  if (top.length === 0) return leer('Noch kein Lauf in der Bestenliste.', 'Gewertet wird ab dem ersten Punkt.');
  const zeilen = top.map((run) => `<tr class="${run.rank <= 3 ? `podest podest-${run.rank}` : ''}">
    <td class="rang">${run.rank <= 3 ? `<span class="medaille">${run.rank}</span>` : run.rank}</td>
    <td><strong>${escape(run.playerName)}</strong></td>
    <td class="zahl stark">${zahl(run.score)}</td>
    <td class="zahl">${zahl(run.level)}</td>
    <td><span class="marke-pille">${escape(run.playerClass)}</span></td>
    <td class="zahl">${dauer(run.durationSeconds)}</td>
    <td class="leise">${escape(seit(run.achievedAt))}</td>
  </tr>`).join('');
  return `<div class="tabellen-rahmen">
    <table class="tabelle">
      <thead><tr><th class="rang">#</th><th>Name</th><th class="zahl">Score</th><th class="zahl">Level</th><th>Klasse</th><th class="zahl">Dauer</th><th>Wann</th></tr></thead>
      <tbody>${zeilen}</tbody>
    </table>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Betrieb
 * ------------------------------------------------------------------ */

/** Feature-Schalter als Pillenreihe – falsch gesetzte ENV-Variablen sieht man hier. */
function schalter(features: Record<string, unknown> | undefined): string {
  if (!features || Object.keys(features).length === 0) return '';
  const eintraege = Object.entries(features).map(([name, value]) => {
    const an = value === true || (typeof value === 'string' && value.length > 0);
    const text = typeof value === 'string' ? value : an ? 'an' : 'aus';
    return `<span class="flag ${an ? 'an' : 'aus'}"><b>${escape(name)}</b>${escape(text)}</span>`;
  });
  return `<div class="flags">${eintraege.join('')}</div>`;
}

export function betrieb(overview: Overview): string {
  const live = overview.live;
  const tick = live.tick ?? {};
  const auth = live.auth ?? {};
  const sessions = (overview.sessions ?? {}) as Record<string, number | boolean | null>;
  const persistence = (overview.persistence ?? {}) as Record<string, number | boolean | null>;

  interface Zeile { name: string; wert: string; ok: boolean; teile: Array<[string, string]> }
  const zeilen: Zeile[] = [
    {
      name: 'Takt',
      wert: `Ø ${komma(Number(tick.averageMs ?? 0))} ms`,
      // Nicht am Mittelwert messen, sondern an der Auslastung: Ein Takt, der im
      // Schnitt schnell ist und in jeder zehnten Runde das Budget reißt, ruckelt.
      ok: Number(tick.busyRatio ?? 0) < 0.5 && Number(tick.overrunsTotal ?? 0) === 0,
      teile: [
        ['p95', `${komma(Number(tick.p95Ms ?? 0))} ms`],
        ['Spitze', `${komma(Number(tick.maxMs ?? 0))} ms`],
        ['Überläufe', zahl(Number(tick.overrunsTotal ?? 0))],
        ['Ticks', zahl(Number(tick.ticksTotal ?? 0))]
      ]
    },
    {
      name: 'Login',
      wert: auth.enabled ? `an · ${escape(String(auth.mode ?? ''))}` : 'aus',
      ok: Boolean(auth.enabled),
      teile: [['geprüft', zahl(Number(auth.verified ?? 0))], ['abgelehnt', zahl(Number(auth.rejected ?? 0))]]
    },
    {
      name: 'Runs-Puffer',
      wert: `${zahl(Number(persistence['written'] ?? 0))} geschrieben`,
      ok: Number(persistence['dropped'] ?? 0) === 0 && persistence['enabled'] === true,
      teile: [['wartend', zahl(Number(persistence['queued'] ?? 0))], ['verworfen', zahl(Number(persistence['dropped'] ?? 0))]]
    },
    {
      name: 'Sitzungs-Puffer',
      wert: `${zahl(Number(sessions['written'] ?? 0))} geschrieben`,
      ok: Number(sessions['dropped'] ?? 0) === 0 && sessions['enabled'] === true,
      teile: [
        ['offen', zahl(Number(sessions['open'] ?? 0))],
        ['wartend', zahl(Number(sessions['queued'] ?? 0))],
        ['zu kurz', zahl(Number(sessions['discarded'] ?? 0))]
      ]
    }
  ];

  // Name und Wert stehen untereinander statt nebeneinander: „Sitzungs-Puffer"
  // und „4.610 geschrieben" nebeneinander brachen in einer 270-px-Karte beide
  // um, und zwei zweizeilige Fragmente in einer Zeile liest niemand.
  const karten = zeilen.map((zeile) => `<article class="betrieb-karte ${zeile.ok ? 'gut' : 'achtung'}">
    <header><i class="ampel"></i><b>${escape(zeile.name)}</b></header>
    <strong class="betrieb-wert">${zeile.wert}</strong>
    <dl>${zeile.teile.map(([schild, wert]) => `<div><dt>${escape(schild)}</dt><dd>${escape(wert)}</dd></div>`).join('')}</dl>
  </article>`).join('');

  return `<div class="betrieb">${karten}</div>${schalter(live.features)}`;
}

/* ------------------------------------------------------------------ *
 * Sams Liste
 * ------------------------------------------------------------------ */

export interface BacklogAntwort {
  zaehlung: BacklogZaehlung;
  gruppen: Array<{ bereich: BacklogBereich; eintraege: BacklogEintrag[] }>;
}

const STAND_TEXT: Record<BacklogStand, string> = {
  offen: 'offen',
  arbeit: 'in Arbeit',
  erledigt: 'erledigt',
  verworfen: 'verworfen'
};

const BEREICH_TEXT: Record<BacklogBereich, string> = {
  drohnen: 'Drohnen',
  projektile: 'Projektile',
  karte: 'Karte',
  klassen: 'Klassen',
  bots: 'Bots',
  ui: 'Oberfläche',
  bug: 'Fehler'
};

/**
 * Sams Rückmeldungen mit Stand. „Ich will die Liste im Admin-Bereich sehen
 * können und auch, was erledigt wurde, was noch offen ist."
 *
 * Offenes steht oben, in jeder Gruppe und über alle Gruppen hinweg – wer die
 * Liste öffnet, will wissen, was noch fehlt, nicht was schon geht. Erledigtes
 * bleibt trotzdem stehen: Es ist der Beleg, und es beantwortet die Frage
 * „habe ich das schon einmal gesagt?".
 */
export function backlogBlock(antwort: BacklogAntwort | null): string {
  if (!antwort) return '';
  const { zaehlung, gruppen } = antwort;
  const prozent = Math.round(zaehlung.fortschritt * 100);

  const zeilen = gruppen.map((gruppe) => {
    const punkte = gruppe.eintraege.map((eintrag) => `<li class="wunsch ${eintrag.stand}" data-stand="${escape(eintrag.stand)}">
      <span class="wunsch-kennung">${escape(eintrag.id)}</span>
      <span class="wunsch-text">
        <b>${escape(eintrag.wunsch)}</b>
        ${eintrag.notiz ? `<i>${escape(eintrag.notiz)}</i>` : ''}
      </span>
      <span class="wunsch-stand">${escape(STAND_TEXT[eintrag.stand])}${eintrag.nachweis ? `<em>${escape(eintrag.nachweis)}</em>` : ''}</span>
    </li>`).join('');
    const offen = gruppe.eintraege.filter((e) => e.stand === 'offen' || e.stand === 'arbeit').length;
    return `<div class="wunsch-gruppe">
      <h3>${escape(BEREICH_TEXT[gruppe.bereich] ?? gruppe.bereich)} <span>${offen > 0 ? `${offen} offen` : 'alles erledigt'}</span></h3>
      <ul class="wunsch-liste">${punkte}</ul>
    </div>`;
  }).join('');

  // Der Fortschrittsbalken oben ist die einzige Zahl, die Sam wirklich sucht,
  // wenn er die Liste öffnet: Wie weit sind wir?
  const filter = `<div class="wunsch-filter" role="group" aria-label="Liste filtern">
    ${([['alle', 'Alle'], ['offen', 'Offen'], ['arbeit', 'In Arbeit'], ['erledigt', 'Erledigt']] as const)
      .map(([wert, text], index) => `<button type="button" data-stand-filter="${wert}" class="${index === 0 ? 'an' : ''}" aria-pressed="${index === 0}">${text}</button>`).join('')}
  </div>`;

  return `<div class="wunsch-bilanz">
      <div class="wunsch-zahlen">
        <strong>${zaehlung.erledigt} von ${zaehlung.gesamt - zaehlung.verworfen} erledigt</strong>
        <span>${zaehlung.offen} offen${zaehlung.arbeit > 0 ? ` · ${zaehlung.arbeit} in Arbeit` : ''}</span>
      </div>
      <div class="wunsch-fortschritt">
        <span class="wunsch-balken"><i style="width:${prozent}%"></i></span>
        <b>${prozent} %</b>
      </div>
    </div>
    ${filter}
    <div class="wunsch-gruppen">${zeilen}</div>`;
}
