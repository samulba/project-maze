/**
 * HUD-Kollisionsprüfung.
 *
 * Anlass: Sams „ES GIBT VIELE UI PROBLEME z.B. beim aussuchen der klasse".
 * Die Fehler saßen nicht in einem einzelnen Panel, sondern im Zusammenspiel –
 * jedes Stück war für sich geprüft, nie alle zusammen. Genau das prüft dieses
 * Skript: Es schiebt dem Client Spielerzustände unter (Level, Klasse, Punkte,
 * Tod, Signature), fährt eine Matrix aus Fenstergrößen ab und misst im DOM,
 * ob sich Flächen überlappen, verdecken, aus dem Bild ragen – oder ob eine
 * Klassenwahl unvollständig sichtbar ist.
 *
 * Unit-Tests können das nicht: Es ist Layout, und Layout entsteht erst im
 * Browser. Deshalb liegt die Prüfung hier statt in `npm run check` – sie
 * braucht einen laufenden Server und einen echten Chromium.
 *
 * ## Aufruf
 *
 * ```bash
 * npm run build
 * PORT=2599 HOST=127.0.0.1 node apps/server/dist/index.js &
 * npm i --no-save playwright-core        # Chromium ist im Container vorhanden
 * node scripts/ui-layout-check.mjs       # Exit 1, wenn etwas kollidiert
 * ```
 *
 * `playwright-core` steht bewusst **nicht** in `package.json`: Die Prüfung ist
 * ein Werkzeug für die Fehlersuche, kein Teil des Builds, und soll niemandem
 * eine Abhängigkeit aufzwingen.
 *
 * Umgebungsvariablen: `URL` (Standard `http://127.0.0.1:2599`),
 * `PW_CHROMIUM` (Standard `/opt/pw-browsers/chromium`), `SHOTS=1` legt zu
 * jedem Fall ein Bild unter `.probe/` ab, `ONLY=<text>` engt die Matrix auf
 * passende Fälle ein (beim Reparieren will man nicht alle abwarten), `DBG=1`
 * gibt die Zwischenwerte der Leseansicht-Erkennung aus.
 *
 * ## Was geprüft wird (Stand 11.08., 196 Fälle)
 *
 * | Bereich | Fälle | Frage |
 * | --- | --- | --- |
 * | Startscreen | 55 | Ist alles erreichbar, ohne die Seite zu scrollen? |
 * | Spiel-HUD | 133 | Überlappt sich etwas, ragt etwas heraus, nimmt zu viel keine Klicks? |
 * | Admin-Portal | 8 | Läuft etwas über seinen Kasten, sind die Knöpfe treffbar? |
 *
 * Zwölf der HUD-Fälle sind Battle Royale (`zustand.royale`): Die Rundenleiste
 * sitzt in der oberen Mitte, also dort, wo schon Onboarding, Banner und Toasts
 * stehen. Der erste Anlauf lag prompt auf der Onboarding-Karte -- und die Fälle
 * haben nebenbei einen Fehler gefunden, der gar nichts mit Royale zu tun hat:
 * Bei flachen Seitenverhältnissen ragte die Bestenliste in die
 * Onboarding-Karte, weil das Spielfeld schmaler wird als das Fenster.
 *
 * Gemessen wird in fünf Schichten:
 *
 * 1. **Panel gegen Panel** – Überlappung, Verdeckung, Rand des Bildes.
 * 2. **Innerhalb eines Panels** – Inhalt über dem Kasten, sich deckende
 *    Geschwister, nicht passender Text. (Seit 08.08.; vorher war das die
 *    Lücke, durch die Sams Befunde fielen.)
 * 3. **Tote Fläche** – wie viel des Bildes keine Klicks mehr annimmt.
 * 4. **Trefferflächen auf Touch** – alles unter 40 px. (Seit 09.08.)
 * 5. **Der Weg zurück** – ist der RESPAWN-Knopf im Bild und trifft ein Klick
 *    auf seine Mitte auch ihn? (Seit 11.08.) Die vier Schichten davor waren
 *    grün, während auf 1280 × 720 kein toter Spieler zurück in die Arena kam:
 *    Die Karte passte ins Bild, nur ihr wichtigster Knopf lag im abgeschnittenen
 *    Teil. Wer nur Flächen misst, findet das nie – gemessen wird die Handlung.
 *
 * Zwei Dinge sind bewusst **nicht** Befunde: Inhalt in einem Kasten, der
 * absichtlich waagerecht scrollt, und die Knoten des Klassenrades (eine
 * Landkarte mit 65 Zielen ist keine Knopfleiste – die Antwort dort heißt Zoom).
 */

import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://127.0.0.1:2599';
const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';
const SHOTS = process.env.SHOTS === '1';

/**
 * Zustand unterschieben. Der Server kennt keinen Weg, einen Client auf Level 10
 * mit vier Punkten und offener Klassenwahl zu setzen – hier wird der Snapshot
 * auf der Leitung ergänzt, bevor der Client ihn sieht.
 */
const SHIM = `
  window.__zustand = window.__zustand || {};
  const Original = window.WebSocket;
  window.WebSocket = class extends Original {
    addEventListener(type, listener, options) {
      if (type !== 'message') return super.addEventListener(type, listener, options);
      super.addEventListener(type, (event) => {
        let data = event.data;
        try {
          const p = JSON.parse(String(data));
          if (p.type === 'snapshot' && Array.isArray(p.players)) {
            const z = window.__zustand;
            const ich = p.players.find((x) => String(x.id) === String(p.selfId));
            if (ich) {
              if (z.level !== undefined) { ich.level = z.level; ich.xp = 0; ich.xpForNextLevel = 999; }
              if (z.playerClass !== undefined && ich.playerClass !== undefined) ich.playerClass = z.playerClass;
              if (z.punkte !== undefined) ich.availablePoints = z.punkte;
              if (z.tot !== undefined) { ich.dead = z.tot; ich.killerName = 'Nova'; ich.canRespawnAt = p.serverTime + 2000; ich.deathLevel = 12; }
              if (z.signature !== undefined) ich.signature = z.signature;
            }
            if (z.zuschauen) {
              // Ein Ziel muss her – im Sichtradius ist nicht immer jemand.
              let fremd = p.players.find((x) => String(x.id) !== String(p.selfId));
              if (!fremd && ich) {
                fremd = JSON.parse(JSON.stringify(ich));
                fremd.id = 999999; fremd.name = 'Nova'; fremd.dead = false;
                fremd.position = { x: ich.position.x + 120, y: ich.position.y };
                p.players.push(fremd);
              }
              if (fremd) p.spectatorTargetId = fremd.id;
            }
            if (z.event) {
              p.arenaEvent = { kind: z.event, phase: 'active', endsAt: p.serverTime + 30000,
                center: ich ? { x: ich.position.x, y: ich.position.y } : { x: 3000, y: 2000 }, radius: 700 };
            }
            if (z.bounty) {
              const opfer = p.players.find((x) => String(x.id) !== String(p.selfId));
              if (opfer) { p.bountyTargetId = opfer.id; p.gameplay = p.gameplay || {};
                p.gameplay[String(opfer.id)] = { ...(p.gameplay?.[String(opfer.id)] ?? {}), bountyValue: 1200 }; }
            }
            if (z.royale) {
              /*
               * Battle-Royale-Rundenstand. Der Modus haengt am Server
               * (ARENA_MODE), die Leiste aber nur an diesem Feld -- also wird es
               * hier untergeschoben, statt fuer die Layoutpruefung eine zweite
               * Arena zu starten.
               */
              const mitte = ich ? { x: ich.position.x + 400, y: ich.position.y + 300 } : { x: 4500, y: 3000 };
              p.royaleZone = {
                center: mitte, radius: 2600, targetRadius: 1900,
                phase: z.royale.sieg ? 'haelt' : 'schrumpft',
                nextShrinkInMs: z.royale.sieg ? 0 : 18000,
                damagePerSecond: 7.5, stage: 2, alive: z.royale.sieg ? 1 : 23,
                roundOver: Boolean(z.royale.sieg),
                winnerName: z.royale.sieg ? 'Nova' : null,
                nextRoundInMs: z.royale.sieg ? 9000 : 0
              };
            }
            if (z.achievements && !window.__achievementsGesendet) {
              // freshAchievements ist das Feld, aus dem der Client seine Popups
              // speist – einmal senden, sonst laufen sie endlos nach.
              window.__achievementsGesendet = true;
              p.freshAchievements = z.achievements;
            }
            data = JSON.stringify(p);
          }
        } catch { /* keine JSON-Nachricht */ }
        listener({ ...event, data, type: 'message' });
      }, options);
    }
  };
`;

/**
 * Läuft im Browser: prüft den Startscreen und seine Unterseiten. Andere Fragen
 * als im Spiel – dort geht es um Kollisionen, hier um Erreichbarkeit: Passt
 * alles ohne Seitenscrollen, bleibt der Weg ins Spiel sichtbar, ragt nichts
 * über den Rand?
 */
function messenStartscreen(seite) {
  const el = (sel) => document.querySelector(sel);
  const kasten = (sel) => { const e = el(sel); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width < 1 ? null : r; };
  const ganzImBild = (r) => r && r.top >= -1 && r.left >= -1 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1;
  const probleme = [];

  const bildschirm = el('#start-screen');
  if (bildschirm.scrollHeight > window.innerHeight + 1) probleme.push('Startscreen scrollt als Ganzes');

  if (seite === 'start') {
    const play = kasten('#join-button');
    const name = kasten('#player-name');
    if (!ganzImBild(play)) probleme.push('Play-Knopf nicht vollständig im Bild');
    if (!ganzImBild(name)) probleme.push('Namensfeld nicht vollständig im Bild');
    const bedien = [...el('#join-form').querySelectorAll('input, select, button, textarea')]
      .filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('.start-nav'));
    if (bedien.length > 2) probleme.push(`Startseite trägt ${bedien.length} Bedienelemente statt 2`);
    for (const knopf of el('.start-nav').querySelectorAll('[data-goto]')) {
      if (!ganzImBild(knopf.getBoundingClientRect())) probleme.push(`Navigationseintrag ${knopf.dataset.goto} ragt aus dem Bild`);
    }
  } else {
    const abschnitt = el(`[data-view="${seite}"]`);
    if (!abschnitt || abschnitt.hidden) return { probleme: [`Seite ${seite} öffnet nicht`] };
    const kopf = abschnitt.querySelector('.start-page-head').getBoundingClientRect();
    if (!ganzImBild(kopf)) probleme.push('Seitenkopf mit Zurück-Weg nicht im Bild');
    const koerper = abschnitt.querySelector('.start-page-body');
    const kr = koerper.getBoundingClientRect();
    if (kr.bottom > window.innerHeight + 1) probleme.push('Seiteninhalt ragt unter den Bildrand');
    if ((koerper.textContent || '').trim().length < 20) probleme.push('Seite ist praktisch leer – kein erklärender Text');
    // Waagerecht darf nichts überlaufen: Das ist der klassische Fehler auf schmalen Geräten.
    for (const kind of koerper.querySelectorAll('*')) {
      const r = kind.getBoundingClientRect();
      if (r.width > 0 && (r.left < kr.left - 2 || r.right > kr.right + 2)) {
        probleme.push(`Element läuft waagerecht über: ${kind.className || kind.tagName}`);
        break;
      }
    }
  }
  return { probleme };
}

/** Läuft im Browser: sammelt Flächen und sucht die vier Fehlerarten. */
function messenImBrowser() {
  const namen = {
    '#class-selection': 'Klassenwahl',
    '#upgrades': 'Upgrades',
    '#death-screen .death-card': 'Death-Karte',
    '#player-panel': 'Spielerkarte',
    '#leaderboard': 'Bestenliste',
    '.minimap': 'Minimap',
    '.auto-fire': 'Auto-Knopf',
    '.secondary-action': 'Repel',
    '.network-pill': 'Statuspille',
    '.killfeed': 'Killfeed',
    '.core-ability': 'Modul',
    '.onboarding': 'Onboarding',
    '.arena-event-banner': 'Event-Banner',
    '.spectator-banner': 'Zuschauerband',
    '.royale-bar': 'Royale-Leiste',
    '#royale-death-note': 'Royale-Rundennotiz',
    '.points-badge': 'Punkte-Badge',
    '.move-stick': 'Bewegungs-Stick',
    '.aim-stick': 'Ziel-Stick',
    '.class-overlay .codex-card': 'Klassen-Karte',
    '.class-overlay .codex-wheel': 'Klassenrad'
  };
  const sichtbar = (e) => {
    if (!e || e.hidden) return false;
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    const r = e.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const flaechen = [];
  for (const [sel, name] of Object.entries(namen)) {
    const e = document.querySelector(sel);
    if (!sichtbar(e)) continue;
    const r = e.getBoundingClientRect();
    flaechen.push({ name, sel, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  }

  const ueberlappungen = [];
  for (let i = 0; i < flaechen.length; i += 1) {
    for (let j = i + 1; j < flaechen.length; j += 1) {
      const a = flaechen[i], b = flaechen[j];
      const ea = document.querySelector(a.sel), eb = document.querySelector(b.sel);
      // Eltern und Kind teilen sich naturgemäß Fläche – das ist keine Kollision.
      if (ea.contains(eb) || eb.contains(ea)) continue;
      const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      if (ox > 2 && oy > 2) ueberlappungen.push({ a: a.name, b: b.name, ox, oy });
    }
  }

  // Verdeckung: An neun Punkten je Fläche nachsehen, wer dort wirklich oben
  // liegt. Nur so unterscheidet sich „zwei Panels teilen sich Platz" von
  // „ein Panel liegt ÜBER einem anderen und macht es unlesbar".
  const verdeckt = [];
  for (const f of flaechen) {
    const el = document.querySelector(f.sel);
    let getroffen = 0;
    const taeter = {};
    for (const px of [0.15, 0.5, 0.85]) {
      for (const py of [0.15, 0.5, 0.85]) {
        const x = f.x + f.w * px, y = f.y + f.h * py;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        const oben = document.elementFromPoint(x, y);
        if (!oben || el.contains(oben) || oben.contains(el)) continue;
        // Der Canvas liegt unter der Bedienebene – dass er „oben" gemeldet
        // wird, heißt nur, dass die Fläche keine Klicks nimmt.
        const treffer = Object.entries(namen).find(([sel]) => oben.closest(sel));
        if (!treffer) continue;
        getroffen += 1;
        taeter[treffer[1]] = (taeter[treffer[1]] || 0) + 1;
      }
    }
    if (getroffen > 0) verdeckt.push({ name: f.name, punkte: getroffen, durch: taeter });
  }

  // Ein zugefahrenes Bottom-Sheet liegt absichtlich unter dem Rand.
  const zugefahren = (f) => {
    const e = document.querySelector(f.sel);
    return e.classList.contains('upgrade-panel') && !e.classList.contains('sheet-open')
      && getComputedStyle(e).transform !== 'none';
  };
  const ausserhalb = flaechen
    .filter((f) => !zugefahren(f))
    .filter((f) => f.x < -1 || f.y < -1 || f.x + f.w > window.innerWidth + 1 || f.y + f.h > window.innerHeight + 1)
    .map((f) => ({ name: f.name, unter: Math.max(0, f.y + f.h - window.innerHeight), rechts: Math.max(0, f.x + f.w - window.innerWidth), ueber: Math.max(0, -f.y), links: Math.max(0, -f.x) }));

  /*
   * Der Weg ZURUECK ins Spiel. Fuenfte Schicht, und sie kam aus einem echten
   * Befund: Die Todeskarte deckelt sich auf hohen Karten und scrollt innen.
   * Auf 1280 x 720 lag der RESPAWN-Knopf dadurch komplett ausserhalb des
   * sichtbaren Kastens -- ein toter Spieler sah eine vollstaendig aussehende
   * Karte und hatte keinen sichtbaren Weg zurueck in die Arena.
   *
   * Die vier bestehenden Schichten konnten das NICHT finden: Panel gegen Panel
   * stimmte, aus dem Bild ragte nichts (die Karte selbst passt), und ein
   * scrollender Kasten ist hier absichtlich kein Befund. Gemessen wird deshalb
   * die HANDLUNG: Ist der Knopf im Bild, und trifft ein Klick auf seine Mitte
   * auch wirklich ihn?
   *
   * `null` heisst "gibt es hier nicht" und ist kein Fehler -- im Battle Royale
   * verschwindet der Respawn-Knopf mit Absicht, dort zaehlt nur der Ausgang.
   */
  const totenschirmOffen = document.querySelector('#death-screen');
  let rueckweg = null;
  if (totenschirmOffen && !totenschirmOffen.hidden) {
    const erreichbar = (sel) => {
      const el = document.querySelector(sel);
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      if (r.top < -1 || r.bottom > window.innerHeight + 1) return false;
      const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(oben && (oben === el || el.contains(oben)));
    };
    rueckweg = { respawn: erreichbar('#respawn-button'), start: erreichbar('#exit-to-start') };
  }

  // Eine Klassenwahl, von der man die Hälfte nicht sieht, ist keine Wahl.
  const wahl = document.querySelector('#class-selection');
  let wahlKarten = null;
  // Zugeklappt sind null von acht Karten sichtbar – und das ist der Sinn der
  // Sache, nicht ihr Fehler. Gemessen wird nur der aufgeklappte Zustand.
  if (wahl && !wahl.hidden && wahl.dataset.collapsed !== 'true') {
    const box = wahl.getBoundingClientRect();
    const karten = [...wahl.querySelectorAll('[data-class-choice]')];
    wahlKarten = {
      gesamt: karten.length,
      sichtbar: karten.filter((k) => {
        const r = k.getBoundingClientRect();
        return r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
      }).length
    };
  }

  /*
   * Innerhalb der Panels. Bis hierher hat dieser Prüfstand nur Panel gegen
   * Panel gemessen – und genau die Lücke hat Sam gefunden: „an allen stellen
   * wo es sich überschneidet". Zwei Karten, die sich innerhalb der Klassenwahl
   * decken, waren für die Matrix unsichtbar, weil beide zum selben Kasten
   * gehören.
   *
   * Gesucht wird zweierlei:
   *
   * 1. **Text, der nicht passt** – gemessen an `scrollWidth`/`scrollHeight`
   *    gegen die sichtbare Fläche. Ausgenommen ist, wo das Abschneiden Absicht
   *    ist: eigener Bildlauf, Ellipse, `line-clamp`.
   * 2. **Geschwister, die sich decken** – nur statisch positionierte. Absolute
   *    Positionierung ist eine Ansage, dass etwas übereinander liegen soll.
   */
  const innen = [];
  const beschriftung = (e) => (typeof e.className === 'string' && e.className.trim()
    ? `.${e.className.trim().split(/\s+/)[0]}`
    : e.id ? `#${e.id}` : e.tagName.toLowerCase());
  for (const [sel, name] of Object.entries(namen)) {
    const wurzel = document.querySelector(sel);
    if (!sichtbar(wurzel)) continue;
    const kinder = [...wurzel.querySelectorAll('*')].filter((e) => {
      if (e.tagName === 'SVG' || e.closest('svg')) return false;  // eigene Geometrie
      if (!sichtbar(e)) return false;
      const r = e.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    });

    /*
     * Inhalt, der breiter ist als sein Kasten. Das ist der Fehler, den weder
     * die Panel-Matrix noch die Geschwisterprüfung findet – und genau der, den
     * Sam am 08.08. in der Klassenwahl gesehen hat: `min-width: 220px` aus
     * `class-choice.css` gegen ein 320 px breites Raster, rechte Spalte 64 px
     * aus dem Panel heraus.
     *
     * Waagerecht ist immer ein Fehler; senkrecht nur dort, wo nicht absichtlich
     * gescrollt wird (Upgrade-Liste und Death-Karte tun das).
     */
    for (const e of [wurzel, ...kinder]) {
      const stil = getComputedStyle(e);
      const scrolltQuer = ['auto', 'scroll'].includes(stil.overflowX);
      const scrolltHoch = ['auto', 'scroll'].includes(stil.overflowY);
      const gekuerzt = stil.textOverflow === 'ellipsis' || stil.webkitLineClamp !== 'none';
      if (!scrolltQuer && !gekuerzt && e.scrollWidth > e.clientWidth + 2) {
        innen.push(`${name}: Inhalt läuft ${e.scrollWidth - e.clientWidth} px über die Breite (${beschriftung(e)})`);
      }
      if (!scrolltHoch && !gekuerzt && e.scrollHeight > e.clientHeight + 2) {
        innen.push(`${name}: Inhalt läuft ${e.scrollHeight - e.clientHeight} px über die Höhe (${beschriftung(e)})`);
      }
    }

    // Geschwister paarweise. Nur direkte Nachbarn im selben Elternteil, sonst
    // meldet jede Verschachtelung sich selbst.
    const eltern = new Map();
    for (const e of kinder) {
      const stil = getComputedStyle(e);
      // Inline-Text über zwei Zeilen liefert ein Rechteck, das beide Zeilen
      // umschließt – Geschwister darin lägen rechnerisch übereinander.
      if (stil.position !== 'static' || stil.display.startsWith('inline')) continue;
      const liste = eltern.get(e.parentElement) ?? [];
      liste.push(e);
      eltern.set(e.parentElement, liste);
    }
    for (const geschwister of eltern.values()) {
      for (let i = 0; i < geschwister.length; i += 1) {
        for (let j = i + 1; j < geschwister.length; j += 1) {
          const a = geschwister[i].getBoundingClientRect();
          const b = geschwister[j].getBoundingClientRect();
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 3 && oy > 3) {
            innen.push(`${name}: ${beschriftung(geschwister[i])} deckt ${beschriftung(geschwister[j])} (${Math.round(ox)}×${Math.round(oy)} px)`);
          }
        }
      }
    }
  }

  /*
   * Trefferflächen auf Touch. Ein Knopf, den man mit dem Daumen nicht trifft,
   * ist genauso kaputt wie einer, der aus dem Bild ragt – nur sieht man es auf
   * keinem Screenshot. 40 px ist die Untergrenze, unter der Apple und Google
   * unabhängig voneinander warnen.
   */
  if (window.matchMedia('(pointer: coarse)').matches) {
    for (const e of document.querySelectorAll('#hud button, #hud [role="button"], #hud select, #hud input')) {
      if (!sichtbar(e)) continue;
      /*
       * Die Knoten im Klassenrad sind ausgenommen – und das ist eine
       * Entscheidung, keine Nachlässigkeit: Das Rad ist eine Landkarte mit 65
       * Zielen, keine Knopfleiste. Alle auf 44 px zu bringen hieße, weniger zu
       * zeigen. Die Antwort dort heißt Zoom; er ist gebaut, er steht als
       * Hinweis unter dem Rad, und ein Doppeltipp setzt zurück.
       */
      if (e.closest('.wheel-node')) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) {
        innen.push(`Trefferfläche zu klein: ${Math.round(r.width)}×${Math.round(r.height)} px (${beschriftung(e)})`);
      }
    }
  }

  // Wie viel des Bildes nimmt keine Klicks mehr an? Gefeuert wird über den
  // Canvas; wo ein Panel darüber liegt, kommt kein Schuss an. Im Tod ist die
  // ganze Fläche belegt – das ist Absicht und wird nicht gemessen.
  const totenschirm = document.querySelector('#death-screen');
  const imTod = totenschirm && !totenschirm.hidden;
  // Leseansicht des Klassenrades: Dort tritt die Bedienung bewusst zurück –
  // die tote Fläche misst dann nicht mehr, was sie messen soll.
  const rad = document.querySelector('.class-overlay');
  const spielerkarte = document.querySelector('#player-panel');
  const leseansicht = Boolean(rad && !rad.hidden && spielerkarte
    && Number(getComputedStyle(spielerkarte).opacity) < 0.05);
  const canvas = document.querySelector('canvas');
  const kompakt = totenschirm && totenschirm.classList.contains('spectating');
  let tot = 0, raster = 0;
  if ((!imTod || kompakt) && !leseansicht) for (let x = 8; x < window.innerWidth; x += 24) {
    for (let y = 8; y < window.innerHeight; y += 24) {
      raster += 1;
      const oben = document.elementFromPoint(x, y);
      if (oben && oben !== canvas && !canvas.contains(oben)) tot += 1;
    }
  }

  /*
   * Stick-Schärfe auf Touch (Befund 13). `sichtbar()` filtert opacity < 0.05 –
   * lahmgelegte Sticks fielen damit still aus ALLEN Messschichten, und keine
   * wertete `pointer-events`. Gemessen wird der Standardzustand: Solange keine
   * Klassenwahl offen steht (offen legt sie die Sticks bewusst still,
   * hud-layout.css) und der Spieler lebt, müssen beide Sticks sichtbar und
   * scharf sein. Hochformat zeigt den Drehen-Hinweis und ist ausgenommen.
   */
  let sticksTot = null;
  if (window.matchMedia('(pointer: coarse)').matches
    && !window.matchMedia('(orientation: portrait)').matches
    && !imTod) {
    const wahlOffen = wahl && !wahl.hidden && wahl.dataset.collapsed !== 'true';
    // Das offene Rad (Taste C) ist ein Vollbild-Overlay und legt die Sticks
    // absichtlich still – dort ist Lesen der Zustand, nicht Fahren.
    const radOffen = Boolean(rad && !rad.hidden);
    if (!wahlOffen && !radOffen) {
      const lahm = [];
      for (const sel of ['#move-stick', '#aim-stick']) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05 || s.pointerEvents === 'none') lahm.push(sel);
      }
      if (lahm.length > 0) sticksTot = lahm;
    }
  }

  /*
   * Bedienbarkeit der Upgrades (Sams Befund vom 13.08.).
   *
   * „Wenn man eine Klasse aussuchen kann, kann man nicht mehr upgraden,
   * solange man nicht eine neue Klasse ausgesucht hat." Die Ursache war
   * `opacity: 0; pointer-events: none` auf dem Upgrade-Panel, solange die
   * Wahl aufgeklappt stand – also dieselbe Fehlerklasse wie bei den Sticks:
   * Ein Element, das da ist, aussieht wie da, und keine Klicks annimmt.
   *
   * Gemessen wird die HANDLUNG, nicht die Regel: Gibt es einen Punkt zu
   * verteilen, muss ein Klick auf die Mitte des ersten Slots auch wirklich
   * diesen Slot treffen.
   */
  let upgradesTot = null;
  const panel = document.querySelector('.upgrade-panel');
  const punkteOffen = Number(document.querySelector('#upgrade-points')?.textContent ?? '0') > 0;
  /*
   * Auf Touch ist das Panel ein Bottom-Sheet und liegt geschlossen mit Absicht
   * unter dem Bildrand (`mobile.css`) – dort ist der Weg „Punkte-Badge tippen,
   * dann Slot". Geprueft wird deshalb nur das offene Sheet; dass das Badge
   * erreichbar ist, deckt die Flaechenpruefung ab.
   */
  const alsSheet = window.matchMedia('(pointer: coarse)').matches;
  const sheetOffen = panel?.classList.contains('sheet-open');
  if (panel && !panel.hidden && punkteOffen && !imTod && (!alsSheet || sheetOffen)) {
    const stil = getComputedStyle(panel);
    const gruende = [];
    if (stil.pointerEvents === 'none') gruende.push('Panel nimmt keine Zeiger an');
    if (Number(stil.opacity) < 0.05) gruende.push('Panel unsichtbar');
    if (stil.display === 'none' || stil.visibility === 'hidden') gruende.push('Panel ausgeblendet');
    const knopf = [...panel.querySelectorAll('[data-upgrade]')]
      .find((b) => !b.hidden && !b.disabled && b.getBoundingClientRect().width > 1);
    if (!knopf) {
      if (gruende.length === 0) gruende.push('kein bedienbarer Slot trotz offenem Punkt');
    } else {
      const r = knopf.getBoundingClientRect();
      if (r.top < -1 || r.bottom > window.innerHeight + 1) gruende.push('erster Slot ausserhalb des Bildes');
      const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!(oben && (oben === knopf || knopf.contains(oben)))) {
        gruende.push(`Klick trifft ${oben ? oben.tagName.toLowerCase() : 'nichts'} statt den Slot`);
      }
    }
    if (gruende.length > 0) upgradesTot = gruende;
  }

  return { flaechen, ueberlappungen, verdeckt, ausserhalb, wahlKarten, rueckweg, imTod, innen, sticksTot, upgradesTot,
    _dbg: { radDa: Boolean(rad), radHidden: rad ? rad.hidden : null, kartenOpazitaet: spielerkarte ? getComputedStyle(spielerkarte).opacity : null, leseansicht },
    kompakterTod: Boolean(totenschirm && totenschirm.classList.contains('spectating')),
    totAnteil: raster > 0 ? +(tot / raster * 100).toFixed(1) : null };
}

/**
 * Die Matrix. Jede Zeile ist eine Zustandskombination, die es im echten Spiel
 * gibt – die meisten davon entstehen beim selben Level-Up.
 */
const FAELLE = [
  // --- Klassenwahl (Runde 6) --------------------------------------------
  { name: 'wahl', w: 1280, h: 720, zustand: { level: 10, playerClass: 'core' } },
  { name: 'wahl-punkte', w: 1280, h: 720, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-punkte-schmal', w: 900, h: 640, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-flach', w: 1280, h: 600, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-tot', w: 1280, h: 720, zustand: { level: 10, playerClass: 'core', punkte: 4, tot: true } },
  { name: 'wahl-21-9', w: 2560, h: 1080, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-21-9-fuellend', w: 2560, h: 1080, sicht: 'flaechengleich', zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-4-3', w: 1280, h: 1024, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-1080', w: 1920, h: 1080, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-stufe2', w: 1280, h: 720, zustand: { level: 24, playerClass: 'storm', punkte: 4 } },
  { name: 'wahl-stufe3', w: 1280, h: 720, zustand: { level: 38, playerClass: 'gatling', punkte: 4 } },
  { name: 'wahl-ladung', w: 1280, h: 720, zustand: { level: 24, playerClass: 'sniper', punkte: 4, signature: 72 } },
  { name: 'wahl-touch', w: 900, h: 500, touch: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  // Zugeklappt ist ein eigener Zustand, kein Zwischenschritt: Dann ist der
  // Killfeed wieder da, das Upgrade-Panel auch, und die Leiste steht mitten
  // drin. Ohne diese Faelle war genau das ungeprueft.
  { name: 'wahl-zu', w: 1280, h: 720, zuklappen: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-zu-flach', w: 1280, h: 600, zuklappen: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-zu-1080', w: 1920, h: 1080, zuklappen: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-zu-ladung', w: 1280, h: 720, zuklappen: true, zustand: { level: 24, playerClass: 'sniper', punkte: 4, signature: 72 } },
  { name: 'wahl-zu-touch', w: 844, h: 390, touch: true, zuklappen: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'upgrades-zehn', w: 1280, h: 720, zustand: { level: 24, playerClass: 'storm', punkte: 6 } },
  { name: 'ruhig', w: 1280, h: 720, zustand: { level: 9, playerClass: 'core' } },

  // --- Tod und Zuschauen (Runde 7) --------------------------------------
  // Der Death-Screen schrumpft beim Zuschauen, während darunter weitergespielt
  // wird – zwei Zustände übereinander, die es vorher nicht gab.
  { name: 'tod', w: 1280, h: 720, zustand: { tot: true } },
  { name: 'tod-flach', w: 1280, h: 600, zustand: { tot: true } },
  { name: 'tod-hoch', w: 900, h: 1180, zustand: { tot: true } },
  { name: 'zuschauen', w: 1280, h: 720, zustand: { tot: true, zuschauen: true } },
  { name: 'zuschauen-flach', w: 1280, h: 600, zustand: { tot: true, zuschauen: true } },
  { name: 'zuschauen-21-9', w: 2560, h: 1080, zustand: { tot: true, zuschauen: true } },
  { name: 'zuschauen-touch', w: 844, h: 390, touch: true, zustand: { tot: true, zuschauen: true } },
  { name: 'zuschauen-wahl', w: 1280, h: 720, zustand: { level: 10, playerClass: 'core', punkte: 4, tot: true, zuschauen: true } },

  // --- Der obere Bereich: alles gleichzeitig -----------------------------
  // Onboarding, Event-Banner, Bounty und Achievement-Popup teilen sich die
  // Mitte oben. Was passiert, wenn drei zusammen kommen?
  { name: 'oben-event', w: 1280, h: 720, zustand: { event: 'overcharge' } },
  { name: 'oben-event-bounty', w: 1280, h: 720, zustand: { event: 'overcharge', bounty: true } },
  { name: 'oben-alles', w: 1280, h: 720, zustand: { event: 'fracture', bounty: true, achievements: ['fivestreak'] } },
  { name: 'oben-alles-wahl', w: 1280, h: 720, zustand: { level: 10, playerClass: 'core', punkte: 4, event: 'fracture', bounty: true, achievements: ['fivestreak'] } },
  { name: 'oben-alles-schmal', w: 900, h: 640, zustand: { event: 'fracture', bounty: true, achievements: ['fivestreak'] } },
  { name: 'oben-alles-touch', w: 390, h: 844, touch: true, zustand: { event: 'fracture', bounty: true, achievements: ['fivestreak'] } },

  // --- Das Rad (KL3) ----------------------------------------------------
  // Ein Vollbild-Overlay auf 844×390 ist die härteste Prüfung, die es gibt –
  // und es öffnet mitten im Gefecht, also mit allem anderen zusammen.
  // Battle Royale: die Leiste sitzt in der oberen Mitte, also dort, wo schon
  // Onboarding, Banner und Toasts stehen -- genau die Stelle, an der der erste
  // Anlauf auf der Onboarding-Karte lag.
  /*
   * Flache Fenster mit frischem Spieler -- die Luecke, durch die der
   * Onboarding-Befund gefallen ist. Bei 420 px Hoehe frisst der Letterbox-Rand
   * 568 px Breite; wer hier nur 1280x600 prueft, sieht das nie.
   */
  /*
   * Ereignis und Kopfgeld stehen hier fest im Zustand, nicht dem Zufall
   * ueberlassen: Die Kollision "Banner auf Spielerkarte" gibt es nur, WENN in
   * der oberen Mitte etwas steht. Der erste Anlauf lief ohne laufendes Event
   * durch und meldete gruen -- der volle Lauf, in dem gerade eines lief, dann
   * rot. Ein Fall, der nur bei Spielglueck prueft, prueft nicht.
   */
  { name: 'frisch-sehr-flach', w: 1280, h: 430, zustand: { event: 'coreSurge', bounty: true } },
  { name: 'frisch-flach-breit', w: 1600, h: 500, zustand: { event: 'coreSurge', bounty: true } },
  /*
   * Die Klassenwahl steht hier bewusst NICHT mit in der flachen Reihe.
   * Nachgemessen: Auf 1280x540 sind 6 von 8 Karten sichtbar, auf 1600x500
   * vier. Der Kasten ist auf 34vh gedeckelt (hud-layout.css) und scrollt --
   * erreichbar sind alle, gleichzeitig sichtbar nicht. Das ist eine bekannte
   * Grenze halbhoher Fenster, keine Regression dieser Runde: Wer dort alle
   * Wege sehen will, oeffnet das Rad mit C. Es hier als Fall zu fuehren hiesse,
   * die Matrix dauerhaft rot zu lassen -- und Rot, das immer da ist, liest
   * irgendwann niemand mehr.
   */
  { name: 'royale', w: 1280, h: 720, zustand: { royale: {} } },
  { name: 'royale-sehr-flach', w: 1280, h: 430, zustand: { royale: {}, event: 'coreSurge', bounty: true } },
  { name: 'royale-flach', w: 1280, h: 600, zustand: { royale: {} } },
  { name: 'royale-sieg', w: 1280, h: 720, zustand: { royale: { sieg: true } } },
  { name: 'royale-wahl', w: 1280, h: 720, zustand: { level: 10, playerClass: 'core', punkte: 4, royale: {} } },
  { name: 'royale-oben-alles', w: 1280, h: 720, zustand: { royale: {}, event: 'fracture', bounty: true, achievements: ['fivestreak'] } },
  { name: 'royale-tot', w: 1280, h: 720, zustand: { tot: true, royale: {} } },
  { name: 'royale-tot-sieg', w: 1280, h: 720, zustand: { tot: true, royale: { sieg: true } } },
  // Zuschauen schrumpft die Todeskarte auf das Noetigste -- der Rundenstand
  // gehoert dann dazu, denn die Leiste weicht dem Death-Screen.
  { name: 'royale-zuschauen', w: 1280, h: 720, zustand: { tot: true, zuschauen: true, royale: {} } },
  { name: 'royale-zuschauen-touch', w: 844, h: 390, touch: true, zustand: { tot: true, zuschauen: true, royale: {} } },
  { name: 'royale-touch', w: 844, h: 390, touch: true, zustand: { royale: {} } },
  { name: 'royale-touch-klein', w: 667, h: 375, touch: true, zustand: { royale: {} } },
  { name: 'royale-touch-alles', w: 844, h: 390, touch: true, zustand: { royale: {}, event: 'fracture', bounty: true } },
  { name: 'rad', w: 1280, h: 720, rad: true, zustand: {} },
  { name: 'rad-punkte', w: 1280, h: 720, rad: true, zustand: { level: 24, playerClass: 'storm', punkte: 6 } },
  { name: 'rad-wahl', w: 1280, h: 720, rad: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'rad-flach', w: 1280, h: 600, rad: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'rad-schmal', w: 900, h: 640, rad: true, zustand: { level: 24, playerClass: 'storm', punkte: 6 } },
  { name: 'rad-21-9', w: 2560, h: 1080, rad: true, zustand: {} },
  { name: 'rad-1080', w: 1920, h: 1080, rad: true, zustand: { level: 38, playerClass: 'gatling' } },
  { name: 'rad-4-3', w: 1280, h: 1024, rad: true, zustand: {} },
  { name: 'rad-tot', w: 1280, h: 720, rad: true, zustand: { tot: true } },
  { name: 'rad-touch', w: 844, h: 390, touch: true, rad: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'rad-touch-klein', w: 667, h: 375, touch: true, rad: true, zustand: {} },
  { name: 'rad-oben-alles', w: 1280, h: 720, rad: true, zustand: { event: 'fracture', bounty: true, achievements: ['fivestreak'] } },

  // --- Mobil (R3 ist lange her) -----------------------------------------
  { name: 'mobil-hoch', w: 390, h: 844, touch: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'mobil-quer', w: 844, h: 390, touch: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'mobil-tablet', w: 820, h: 1180, touch: true, zustand: { level: 24, playerClass: 'storm', punkte: 6 } },
  { name: 'mobil-klein-quer', w: 667, h: 375, touch: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  // Seit Befund 38 ist die Bestenliste auf Touch wieder da – drei Zustände,
  // die es vorher nicht zu messen gab: mit offener Abruf-Minimap (gleicher
  // Anker oben rechts), mit laufendem Event auf dem schmalsten Format (der
  // zentrierte Meldungs-Slot und die Liste teilen sich 667 px) und die auf
  // Touch bewusst GEÖFFNETE Klassenwahl (Standard ist seit Befund 13 zu).
  { name: 'mobil-minimap', w: 844, h: 390, touch: true, minimap: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'mobil-klein-event', w: 667, h: 375, touch: true, zustand: { level: 10, playerClass: 'core', event: 'coreSurge' } },
  { name: 'mobil-wahl-offen', w: 844, h: 390, touch: true, aufklappen: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } }
];

/**
 * Geräte, auf denen MAZERS wirklich geöffnet wird.
 *
 * Die Liste ist nicht geraten, sondern die gängigen Auflösungen – und sie
 * schließt eine peinliche Lücke: **1366×768 ist bis heute die häufigste
 * Laptop-Auflösung überhaupt** und kam in dieser Matrix nicht ein einziges Mal
 * vor. Ebenso wenig 4K, Ultrawide oder irgendein iPad im Querformat.
 *
 * Querformat ist bei Telefonen die spielbare Lage (im Hochformat zeigt das
 * Spiel den Drehen-Hinweis), deshalb stehen sie hier breit-vor-hoch.
 */
const GERAETE = [
  ['laptop-1366', 1366, 768, false],
  ['laptop-1440', 1440, 900, false],
  ['laptop-1536', 1536, 864, false],
  ['macbook-1512', 1512, 982, false],
  ['desktop-1080', 1920, 1080, false],
  ['desktop-1440', 2560, 1440, false],
  ['ultrawide', 3440, 1440, false],
  /*
   * 3840×2160 steht hier **nicht**, und das ist eine Entscheidung mit Grund:
   * Der Software-Renderer dieses Containers bekommt eine 4K-Arena nicht mehr
   * gestartet – erst lief der Join in einen Timeout, dann der Seitenaufruf
   * selbst. Vier Fälle, die dann rot melden, ohne dass am Layout etwas falsch
   * wäre, sind schlimmer als vier fehlende Fälle: Sie gewöhnen einen an Rot.
   *
   * Der Verlust ist klein. Oberhalb von rund 1920 px skaliert das HUD stufenlos
   * über `clamp()`; es gibt keine Regel, die zwischen 2560×1440 und 3840×2160
   * umschaltet. Was auf 1440p sitzt, sitzt auf 4K.
   *
   * Der **Startscreen** wird weiterhin auf 3840×2160 geprüft (START_FAELLE) –
   * der braucht keine Arena und läuft dort ohne Probleme.
   */

  ['iphone-se', 667, 375, true],
  ['iphone-13', 844, 390, true],
  ['iphone-15', 852, 393, true],
  ['iphone-15-max', 932, 430, true],
  ['pixel', 915, 412, true],
  ['ipad-mini', 1024, 768, true],
  ['ipad', 1180, 820, true],
  ['ipad-pro', 1366, 1024, true],
  ['ipad-hoch', 820, 1180, true],
  ['tablet-hoch', 768, 1024, true]
];

/*
 * Je Gerät drei Zustände: die Klassenwahl mit Punkten (der vollste Moment im
 * Spiel), das offene Rad (das größte Overlay) und der Tod auf hohem Level
 * (die größte Karte). Wer diese drei übersteht, übersteht das Spiel.
 */
for (const [name, w, h, touch] of GERAETE) {
  FAELLE.push({ name: `geraet-${name}`, w, h, touch, zustand: { level: 10, playerClass: 'core', punkte: 4 } });
  FAELLE.push({ name: `geraet-${name}-zu`, w, h, touch, zuklappen: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } });
  FAELLE.push({ name: `geraet-${name}-rad`, w, h, touch, rad: true, zustand: { level: 38, playerClass: 'gatling', punkte: 6 } });
  FAELLE.push({ name: `geraet-${name}-tod`, w, h, touch, zustand: { tot: true, level: 44, playerClass: 'storm' } });
}

/**
 * Startscreen und Unterseiten. Andere Frage als im Spiel, deshalb eigene Liste:
 * Hier geht es um Erreichbarkeit, nicht um Kollision.
 */
const START_FAELLE = [];
for (const [w, h, label, touch] of [
  [1280, 900, 'desktop', false],
  [1280, 620, 'flach', false],
  [1366, 768, 'laptop', false],
  [2560, 1080, '21-9', false],
  [3840, 2160, 'vierk', false],
  [390, 844, 'handy', true],
  [375, 667, 'handy-klein', true],
  [844, 390, 'handy-quer', true],
  [667, 375, 'handy-quer-klein', true],
  [820, 1180, 'tablet', true],
  [1180, 820, 'tablet-quer', true]
]) {
  for (const seite of ['start', 'profil', 'achievements', 'bestenliste', 'einstellungen']) {
    START_FAELLE.push({ name: `seite-${seite}-${label}`, w, h, touch, seite });
  }
}

/**
 * Ab hier gilt eine tote Fläche als Fehler – gemessen ohne Wahl sind es 1,4 %.
 *
 * **Nur für Zeigergeräte.** Auf Touch misst die Kennzahl das Falsche: Dort
 * wird nicht über den Canvas gezielt, sondern über die Sticks, und die beiden
 * belegen allein schon 20 % eines 844×390-Schirms. Sie sind die Bedienung,
 * nicht ihr Hindernis. Der Wert wird trotzdem gemeldet – nur nicht bewertet.
 */
const TOT_GRENZE = 32;

/**
 * Läuft im Browser: prüft eine Seite, die gescrollt wird (das Admin-Portal).
 *
 * Andere Frage als im Spiel und andere als auf dem Startscreen: Hier darf
 * senkrecht gescrollt werden, waagerecht nie – und kein Kasten darf breiter
 * sein als sein Elternteil. Genau das ist der Fehler, der auf einem Telefon
 * eine Tabelle über den Rand schiebt.
 */
function messenPortal() {
  const probleme = [];
  const wurzel = document.querySelector('#admin-root');
  if (!wurzel) return { probleme: ['#admin-root fehlt'] };

  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    probleme.push(`Seite scrollt quer (${document.documentElement.scrollWidth - window.innerWidth} px)`);
  }

  const sichtbar = (e) => {
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    const r = e.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const name = (e) => (typeof e.className === 'string' && e.className.trim()
    ? `.${e.className.trim().split(/\s+/)[0]}` : e.id ? `#${e.id}` : e.tagName.toLowerCase());

  /*
   * Steht dieses Element in einem Kasten, der waagerecht scrollt? Dann ist
   * seine Breite kein Fehler, sondern der Zweck des Kastens. Ohne diese Frage
   * meldete die Prüfung jede breite Tabelle auf dem Telefon – also genau das,
   * was absichtlich in einem eigenen Bildlauf liegt.
   */
  const inScrollkasten = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };
  /* Inline-Text über zwei Zeilen liefert ein Rechteck, das beide umschließt –
     ein `<small>` in der zweiten Zeile liegt dann rechnerisch „unter" dem
     `<strong>` der ersten. Verglichen werden deshalb nur Block-Elemente. */
  const istBlock = (e) => !getComputedStyle(e).display.startsWith('inline');

  const alle = [wurzel, ...wurzel.querySelectorAll('*')].filter((e) => !e.closest('svg') && sichtbar(e));
  const gesehen = new Set();
  for (const e of alle) {
    const stil = getComputedStyle(e);
    const scrolltQuer = ['auto', 'scroll'].includes(stil.overflowX);
    const gekuerzt = stil.textOverflow === 'ellipsis' || stil.webkitLineClamp !== 'none';
    if (!scrolltQuer && !gekuerzt && !inScrollkasten(e) && e.scrollWidth > e.clientWidth + 2) {
      const text = `Inhalt läuft ${e.scrollWidth - e.clientWidth} px über die Breite (${name(e)})`;
      if (!gesehen.has(text)) { gesehen.add(text); probleme.push(text); }
    }
    const r = e.getBoundingClientRect();
    if (!inScrollkasten(e) && (r.left < -1 || r.right > window.innerWidth + 1)) {
      const text = `${name(e)} ragt seitlich aus dem Bild`;
      if (!gesehen.has(text)) { gesehen.add(text); probleme.push(text); }
    }
  }

  // Bedienelemente müssen ganz im Bild liegen und groß genug zum Treffen sein.
  for (const e of wurzel.querySelectorAll('button, select, a')) {
    if (!sichtbar(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.left < -1 || r.right > window.innerWidth + 1) probleme.push(`Bedienelement ${name(e)} ragt aus dem Bild`);
    if (r.height < 24) probleme.push(`Bedienelement ${name(e)} ist nur ${Math.round(r.height)} px hoch`);
  }

  // Geschwister, die sich decken – dieselbe Regel wie im Spiel.
  const eltern = new Map();
  for (const e of alle) {
    if (getComputedStyle(e).position !== 'static' || !e.parentElement || !istBlock(e)) continue;
    const liste = eltern.get(e.parentElement) ?? [];
    liste.push(e);
    eltern.set(e.parentElement, liste);
  }
  for (const geschwister of eltern.values()) {
    for (let i = 0; i < geschwister.length; i += 1) {
      for (let j = i + 1; j < geschwister.length; j += 1) {
        const a = geschwister[i].getBoundingClientRect();
        const b = geschwister[j].getBoundingClientRect();
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 3 && oy > 3) {
          const text = `${name(geschwister[i])} deckt ${name(geschwister[j])} (${Math.round(ox)}×${Math.round(oy)} px)`;
          if (!gesehen.has(text)) { gesehen.add(text); probleme.push(text); }
        }
      }
    }
  }
  return { probleme };
}

/**
 * Beispieldaten für das Portal. Bewusst am oberen Ende: lange Namen, große
 * Zahlen, viele Klassen – ein Layout, das mit leeren Tabellen sitzt, sagt
 * nichts darüber, ob es auch mit vollen sitzt.
 */
function portalDaten() {
  const tag = (i) => new Date(Date.UTC(2026, 6, 10 + i)).toISOString();
  const kurve = [2, 3, 5, 4, 9, 14, 11, 8, 7, 12, 10, 9, 15, 22, 41, 63, 58, 44, 31, 26, 24, 21, 19, 23, 20, 18, 17, 22, 25, 28];
  const daily = kurve.map((players, i) => ({
    day: tag(i), players,
    newPlayers: Math.max(1, Math.round(players * 0.4)),
    sessions: Math.round(players * 1.6), accounts: Math.round(players * 0.22),
    runs: players * 7, kills: players * 19, totalSeconds: players * 640, bestLevel: 30 + i
  }));
  const summe = (rows) => {
    const s = rows.reduce((a, r) => ({
      players: a.players + r.players, newPlayers: a.newPlayers + r.newPlayers,
      sessions: a.sessions + r.sessions, accounts: a.accounts + r.accounts,
      runs: a.runs + r.runs, kills: a.kills + r.kills, totalSeconds: a.totalSeconds + r.totalSeconds
    }), { players: 0, newPlayers: 0, sessions: 0, accounts: 0, runs: 0, kills: 0, totalSeconds: 0 });
    return { ...s, avgSessionSeconds: s.sessions ? Math.round(s.totalSeconds / s.sessions * 10) / 10 : 0 };
  };
  const klassen = [
    ['rapid', 'Rapid', 'rapid'], ['sniper', 'Sniper', 'precision'], ['rammer', 'Rammer', 'impact'],
    ['drone', 'Controller', 'control'], ['storm', 'Storm', 'rapid'], ['siege', 'Siege', 'siege'],
    ['aegis', 'Aegis', 'aegis'], ['specter', 'Specter', 'specter'], ['tempest', 'Tempest', 'tempest'],
    ['siegebreaker', 'Siegebreaker', 'precision'], ['juggernaut', 'Juggernaut', 'impact'], ['vortex', 'Vortex', 'rapid']
  ].map(([id, label, branch], i) => ({
    playerClass: id, label, branch, runs: 420 - i * 32, share: Math.round((420 - i * 32) / 30) / 10,
    avgLevel: 12 + i, avgScore: 2400 + i * 380, avgSeconds: 150 + i * 22,
    kills: (420 - i * 32) * 3, bestScore: 48210, bestLevel: 60
  }));
  return {
    overview: {
      live: {
        humans: 7, bots: 11, projectiles: 63, drones: 12, shapes: 238, draining: false,
        uptimeSeconds: 51300, commit: '26b506b', deploymentId: 'a91f22c8',
        tick: { averageMs: 8.4, p95Ms: 12.1, maxMs: 24.1, budgetMs: 25, busyRatio: 0.34, overrunsTotal: 0, ticksTotal: 402000 },
        auth: { enabled: true, mode: 'jwks', verified: 214, rejected: 2 },
        features: { perks: true, signatureSiege: true, signatureAegis: true, arenaDirector: true,
          spectator: true, achievements: true, projectileSpeedV2: true, repulseTravel: false, snapshotDeltas: false }
      },
      persistence: { enabled: true, queued: 0, written: 4821, dropped: 0, failedFlushes: 0 },
      sessions: { enabled: true, open: 7, queued: 1, written: 1930, dropped: 0, discarded: 88 },
      days: 30, database: true, daily,
      today: summe(daily.slice(-1)), window: summe(daily),
      classes: klassen,
      unusedClasses: ['Ragnarok', 'Sanctum', 'Eidolon', 'Cataclysm', 'Behemoth', 'Aviary', 'Siegebreaker', 'Hailstorm'],
      top: [1, 2, 3].map((rank) => ({
        rank, playerName: 'Maximallanganame', score: 48210 - rank * 3000, level: 58 - rank,
        playerClass: 'leviathan', kills: 96, durationSeconds: 1840,
        achievedAt: new Date(Date.UTC(2026, 7, 8, 12)).toISOString()
      }))
    },
    players: Array.from({ length: 8 }, (_, i) => ({
      deviceId: `${i}`.repeat(4) + 'abcdef0123456789',
      firstSeen: new Date(Date.UTC(2026, 6, 12 + i)).toISOString(),
      lastSeen: new Date(Date.UTC(2026, 7, 8, 9 + i)).toISOString(),
      sessions: 41 - i * 4, runs: (41 - i * 4) * 6, kills: (41 - i * 4) * 14,
      totalSeconds: (41 - i * 4) * 640, bestScore: 49200 - i * 4000, bestLevel: 60 - i * 5,
      lastUserId: i % 3 === 0 ? '11111111-2222-4333-8444-555555555555' : null,
      lastName: i === 0 ? 'Maximallanganame' : `Spieler${i}`
    })),
    playersTotal: 143, sortierung: 'active', tage: 30, aktualisiert: Date.UTC(2026, 7, 8, 20, 4)
  };
}

/**
 * Baut die Portalseite ohne Server und ohne Login. Der Login ist an anderer
 * Stelle geprüft (Unit-Tests des Torwächters); hier geht es allein darum, ob
 * das Layout auf einem Telefon sitzt – und dafür muss die Seite gefüllt sein.
 */
async function portalSeite() {
  const { build } = await import('esbuild');
  const gebaut = await build({
    entryPoints: ['apps/client/src/admin/view.ts'],
    bundle: true, format: 'esm', write: false, logLevel: 'silent'
  });
  const modul = gebaut.outputFiles[0].text;
  const css = (await import('node:fs')).readFileSync('apps/client/src/admin/admin.css', 'utf8');
  const daten = portalDaten();
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>
    <body class="admin"><div id="admin-root"></div>
    <script type="module">${modul}
      document.querySelector('#admin-root').innerHTML = renderPortal(${JSON.stringify(daten)});
    </script></body></html>`;
}

/** Die Geräte, auf denen das Portal geprüft wird – Sam sieht es auch mobil. */
const PORTAL_FAELLE = [
  ['portal-desktop', 1920, 1080, false],
  ['portal-laptop', 1366, 768, false],
  ['portal-schmal', 1024, 800, false],
  ['portal-tablet', 820, 1180, true],
  ['portal-tablet-quer', 1180, 820, true],
  ['portal-handy', 390, 844, true],
  ['portal-handy-klein', 375, 667, true],
  ['portal-handy-quer', 844, 390, true]
];

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const befunde = [];

  /**
   * Sofort ausgeben, nicht erst am Ende: Der volle Durchlauf dauert Minuten,
   * und ein Werkzeug, das so lange schweigt, benutzt niemand zweimal.
   */
  const melden = (b) => {
    befunde.push(b);
    const flaeche = b.tot === null ? '' : `tote Fläche ${b.tot} %`;
    console.log(`${b.probleme.length ? 'FEHLER' : 'ok    '} ${b.fall.padEnd(26)} ${b.fenster.padEnd(11)} ${flaeche}`);
    for (const p of b.probleme) console.log(`         · ${p}`);
  };

  /** Eine Seite mit Zustand und Fenstergröße öffnen. */
  const oeffnen = async (fall) => {
    const page = await browser.newPage({
      viewport: { width: fall.w, height: fall.h },
      ...(fall.touch ? { hasTouch: true, isMobile: true } : {})
    });
    const fehler = [];
    page.on('pageerror', (e) => fehler.push(String(e).slice(0, 140)));
    await page.addInitScript(
      `try{localStorage.setItem('project-maze-quality','low');localStorage.setItem('project-maze-view','${fall.sicht ?? 'fest'}');`
      + `localStorage.setItem('project-maze-onboarding-done','');}catch{};`
      + `window.__zustand = ${JSON.stringify(fall.zustand ?? {})};`
    );
    await page.addInitScript(SHIM);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#join-button:not([disabled])', { timeout: 60_000 });
    return { page, fehler };
  };

  // Mit `ONLY=<text>` lässt sich die Matrix auf passende Fälle einengen – beim
  // Reparieren will man nicht jedes Mal alle 75 abwarten.
  const nurWenn = (name) => !process.env.ONLY || name.includes(process.env.ONLY);

  // --- Startscreen und Unterseiten --------------------------------------
  for (const fall of START_FAELLE.filter((f) => nurWenn(f.name))) {
    try {
    const { page, fehler } = await oeffnen(fall);
    if (fall.seite !== 'start') {
      // Großzügiges Zeitfenster: Auf 3840×2160 mit Software-Rendering braucht
      // der erste Klick gelegentlich über 30 s – das ist die Testmaschine,
      // nicht die Seite.
      await page.click(`[data-goto="${fall.seite}"]`, { timeout: 90_000 });
      await page.waitForTimeout(350);
    }
    const messung = await page.evaluate(messenStartscreen, fall.seite);
    if (SHOTS) await page.screenshot({ path: `.probe/ui-${fall.name}.png` });
    await page.close();
    melden({
      fall: fall.name, fenster: `${fall.w}×${fall.h}`, tot: null,
      probleme: [...fehler.map((f) => `Skriptfehler: ${f}`), ...messung.probleme]
    });
    } catch (error) {
      // Ein Fall, der gar nicht erst hochkommt, ist der schwerste Befund –
      // aber er darf die restliche Matrix nicht abbrechen.
      melden({ fall: fall.name, fenster: `${fall.w}×${fall.h}`, tot: null,
        probleme: [`kommt nicht hoch: ${String(error).split('\n')[0].slice(0, 120)}`] });
    }
  }

  // --- Spiel-HUD ---------------------------------------------------------
  for (const fall of FAELLE.filter((f) => nurWenn(f.name))) {
    try {
    const { page, fehler } = await oeffnen(fall);
    await page.fill('#player-name', fall.name.slice(0, 18));
    // Wie beim Startscreen: Auf 3840×2160 mit Software-Rendering dauert der
    // erste Klick gelegentlich länger als die 30 s Voreinstellung. Das ist die
    // Testmaschine, nicht die Seite.
    await page.click('#join-button', { timeout: 90_000 });
    // Touch im Hochformat ist kein Spielzustand: Das Spiel blendet das HUD aus
    // und zeigt „Bitte Gerät drehen". Statt auf ein HUD zu warten, das
    // absichtlich nicht kommt, wird genau dieser Zustand geprüft.
    if (fall.touch && fall.h > fall.w) {
      await page.waitForTimeout(2500);
      const hinweis = await page.evaluate(() => {
        const n = document.querySelector('.rotate-notice');
        const hud = document.querySelector('#hud');
        return { sichtbar: Boolean(n) && getComputedStyle(n).display !== 'none',
          hudAus: Boolean(hud) && getComputedStyle(hud).visibility === 'hidden' };
      });
      if (SHOTS) await page.screenshot({ path: `.probe/ui-${fall.name}.png` });
      await page.close();
      const p = [];
      if (!hinweis.sichtbar) p.push('Drehen-Hinweis fehlt im Hochformat');
      if (!hinweis.hudAus) p.push('HUD bleibt im Hochformat sichtbar');
      melden({ fall: fall.name, fenster: `${fall.w}×${fall.h}`, tot: null, probleme: p });
      continue;
    }
    await page.waitForSelector('#hud:not([hidden])', { timeout: 60_000 });
    await page.waitForTimeout(3000);
    // Das Rad ist ein Zustand wie jeder andere – es wird geöffnet und dann
    // zusammen mit allem übrigen gemessen.
    if (fall.rad) {
      await page.keyboard.press('KeyC');
      // 1200 statt 600 ms: Die zurücktretenden HUD-Panels haben zwar nur
      // 0,18 s Übergang, aber unter Software-Rendering auf 1920×1080 liegt
      // der erste Bildwechsel danach deutlich später. Bei 600 ms wurde die
      // Spielerkarte mitten im Ausblenden gemessen – und die Leseansicht,
      // die daran hängt, damit gar nicht erkannt.
      await page.waitForTimeout(1200);
    }
    if (fall.zuklappen) {
      await page.click('#class-selection-close').catch(() => {});
      await page.waitForTimeout(400);
    }
    if (fall.aufklappen) {
      // Auf Touch startet die Wahl seit Befund 13 zugeklappt – der offene
      // Zustand ist trotzdem erreichbar und wird hier bewusst geöffnet.
      await page.click('#class-selection-open').catch(() => {});
      await page.waitForTimeout(400);
    }
    if (fall.minimap) {
      // Die Abruf-Minimap teilt sich den Anker oben rechts mit der
      // Bestenliste – dieser Zustand war nie in der Matrix (Befund 38).
      await page.evaluate(() => document.querySelector('#app')?.classList.add('minimap-open'));
      await page.waitForTimeout(200);
    }
    const messung = await page.evaluate(messenImBrowser);
    if (SHOTS) await page.screenshot({ path: `.probe/ui-${fall.name}.png` });
    await page.close();

    const zeile = fehler.map((f) => `Skriptfehler: ${f}`);
    // Der Death-Screen liegt bewusst über allem – in seiner großen Fassung
    // sind Verdeckungen kein Befund, in der kompakten schon.
    const grossImTod = messung.imTod && !messung.kompakterTod;
    for (const u of messung.ueberlappungen) {
      if (grossImTod && (u.a === 'Death-Karte' || u.b === 'Death-Karte')) continue;
      zeile.push(`${u.a} überlappt ${u.b} (${u.ox}×${u.oy} px)`);
    }
    for (const v of messung.verdeckt) {
      if (grossImTod && Object.keys(v.durch).every((d) => d === 'Death-Karte')) continue;
      zeile.push(`${v.name} verdeckt durch ${Object.keys(v.durch).join(', ')}`);
    }
    for (const a of messung.ausserhalb) zeile.push(`${a.name} ragt aus dem Bild (${JSON.stringify(a)})`);
    // Doppelte zusammenfassen: Acht gleich gebaute Wahlkarten melden denselben
    // Fehler achtmal, und eine Liste, die man nicht liest, findet nichts.
    const gezaehlt = new Map();
    for (const i of messung.innen ?? []) gezaehlt.set(i, (gezaehlt.get(i) ?? 0) + 1);
    for (const [text, anzahl] of gezaehlt) zeile.push(anzahl > 1 ? `${text} — ${anzahl}×` : text);
    if (messung.wahlKarten && messung.wahlKarten.sichtbar < messung.wahlKarten.gesamt) {
      zeile.push(`Klassenwahl nur ${messung.wahlKarten.sichtbar}/${messung.wahlKarten.gesamt} Karten sichtbar`);
    }
    if (messung.rueckweg) {
      if (messung.rueckweg.respawn === false) zeile.push('Weg zurueck: RESPAWN nicht ohne Scrollen erreichbar');
      if (messung.rueckweg.start === false) zeile.push('Weg zurueck: ZUM STARTSCREEN nicht ohne Scrollen erreichbar');
      if (messung.rueckweg.respawn === null && messung.rueckweg.start === null) {
        zeile.push('Weg zurueck: GAR KEIN Knopf auf der Todeskarte');
      }
    }
    if (messung.upgradesTot) {
      zeile.push(`Upgrades nicht bedienbar trotz offenem Punkt: ${messung.upgradesTot.join(', ')}`);
    }
    if (messung.sticksTot) {
      zeile.push(`Sticks lahmgelegt trotz Standardzustand: ${messung.sticksTot.join(', ')} (Befund 13)`);
    }
    if (!fall.touch && messung.totAnteil !== null && messung.totAnteil > TOT_GRENZE) {
      zeile.push(`${messung.totAnteil} % der Bildfläche nimmt keine Klicks an (Grenze ${TOT_GRENZE} %)`);
    }
    if (process.env.DBG) console.log('   dbg', JSON.stringify(messung._dbg));
    melden({ fall: fall.name, fenster: `${fall.w}×${fall.h}`, tot: messung.totAnteil, probleme: zeile });
    } catch (error) {
      melden({ fall: fall.name, fenster: `${fall.w}×${fall.h}`, tot: null,
        probleme: [`kommt nicht hoch: ${String(error).split('\n')[0].slice(0, 120)}`] });
    }
  }
  // --- Admin-Portal ------------------------------------------------------
  if (PORTAL_FAELLE.some((f) => nurWenn(f[0]))) {
    const seite = await portalSeite();
    for (const [name, w, h, touch] of PORTAL_FAELLE.filter((f) => nurWenn(f[0]))) {
      try {
        const page = await browser.newPage({ viewport: { width: w, height: h }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
        const fehler = [];
        page.on('pageerror', (e) => fehler.push(String(e).slice(0, 140)));
        await page.setContent(seite, { waitUntil: 'load' });
        await page.waitForSelector('.kopf', { timeout: 15_000 });
        const messung = await page.evaluate(messenPortal);
        if (SHOTS) await page.screenshot({ path: `.probe/ui-${name}.png`, fullPage: true });
        await page.close();
        melden({ fall: name, fenster: `${w}×${h}`, tot: null,
          probleme: [...fehler.map((f) => `Skriptfehler: ${f}`), ...messung.probleme] });
      } catch (error) {
        melden({ fall: name, fenster: `${w}×${h}`, tot: null,
          probleme: [`kommt nicht hoch: ${String(error).split('\n')[0].slice(0, 120)}`] });
      }
    }
  }

  await browser.close();

  const kaputt = befunde.filter((b) => b.probleme.length > 0).length;
  console.log(`\n${befunde.length - kaputt}/${befunde.length} Fälle ohne Befund.`);
  process.exitCode = kaputt > 0 ? 1 : 0;
}

await main();
