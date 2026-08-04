import type { WorldSnapshot } from '@project-maze/shared';

interface DamageEvent {
  at: number;
  amount: number;
}

export class BalanceCombatMeter {
  private readonly element: HTMLElement | null;
  private readonly dps: HTMLElement | null;
  private readonly lastHit: HTMLElement | null;
  private readonly targets: HTMLElement | null;
  private readonly previousHealth = new Map<string, number>();
  private readonly events: DamageEvent[] = [];

  constructor(root: HTMLElement) {
    const local = import.meta.env.DEV || ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const config = local ? root.querySelector<HTMLElement>('.balance-lab-config') : null;
    if (!config) {
      this.element = null;
      this.dps = null;
      this.lastHit = null;
      this.targets = null;
      return;
    }
    const element = document.createElement('section');
    element.className = 'balance-combat-meter';
    element.innerHTML = `
      <div><span>3S DPS</span><b data-meter-dps>0</b></div>
      <div><span>LETZTER HIT</span><b data-meter-hit>0</b></div>
      <div><span>AKTIVE TARGETS</span><b data-meter-targets>0</b></div>`;
    const note = config.querySelector('.balance-lab-note');
    if (note) config.insertBefore(element, note);
    else config.append(element);
    this.element = element;
    this.dps = element.querySelector<HTMLElement>('[data-meter-dps]');
    this.lastHit = element.querySelector<HTMLElement>('[data-meter-hit]');
    this.targets = element.querySelector<HTMLElement>('[data-meter-targets]');
  }

  update(snapshot: WorldSnapshot): void {
    if (!this.element) return;
    const now = performance.now();
    const active = snapshot.players.filter((player) => player.name.startsWith('TARGET ·'));
    const activeIds = new Set(active.map((player) => player.id));
    for (const target of active) {
      const previous = this.previousHealth.get(target.id);
      if (previous !== undefined && target.health < previous) {
        this.events.push({ at: now, amount: Math.max(0, previous - target.health) });
      }
      this.previousHealth.set(target.id, target.health);
    }
    for (const id of this.previousHealth.keys()) if (!activeIds.has(id)) this.previousHealth.delete(id);
    while ((this.events[0]?.at ?? Infinity) < now - 3000) this.events.shift();

    const damage = this.events.reduce((sum, event) => sum + event.amount, 0);
    const last = this.events.at(-1)?.amount ?? 0;
    if (this.dps) this.dps.textContent = (damage / 3).toFixed(1);
    if (this.lastHit) this.lastHit.textContent = last.toFixed(1);
    if (this.targets) this.targets.textContent = String(active.length);
  }
}
