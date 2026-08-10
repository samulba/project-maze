import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS } from './index';
import { allClassBalanceMetrics, classBalanceMetrics } from './balance';

describe('class balance metrics', () => {
  it('produces finite metrics for every class', () => {
    const metrics = allClassBalanceMetrics();
    expect(metrics).toHaveLength(PLAYER_CLASS_IDS.length);
    for (const entry of metrics) {
      expect(Number.isFinite(entry.projectileDps)).toBe(true);
      expect(Number.isFinite(entry.projectileRange)).toBe(true);
      expect(Number.isFinite(entry.effectiveDurability)).toBe(true);
      expect(Number.isFinite(entry.mobility)).toBe(true);
      expect(Number.isFinite(entry.dronePressure)).toBe(true);
      expect(Number.isFinite(entry.bodyThreat)).toBe(true);
    }
  });

  it('prevents accidental extreme sustained bullet damage', () => {
    for (const id of PLAYER_CLASS_IDS) {
      const tank = CLASS_DEFINITIONS[id];
      if (tank.branch === 'impact' || tank.barrelCount === 0) continue;
      expect(classBalanceMetrics(id).forwardProjectileDps).toBeLessThanOrEqual(100);
      expect(classBalanceMetrics(id).projectileDps).toBeLessThanOrEqual(180);
    }
  });

  it('keeps drone pressure below the hard safety ceiling', () => {
    for (const id of ['drone', 'warden', 'factory', 'overseer', 'carrier', 'guardian', 'hive'] as const) {
      expect(classBalanceMetrics(id).dronePressure).toBeLessThanOrEqual(170);
    }
  });

  it('counts only forward barrels for rear-covering layouts', () => {
    expect(classBalanceMetrics('flanker').forwardProjectileDps).toBeLessThan(classBalanceMetrics('flanker').projectileDps);
    expect(classBalanceMetrics('octo').forwardProjectileDps).toBeLessThan(classBalanceMetrics('octo').projectileDps);
    expect(classBalanceMetrics('twin').forwardProjectileDps).toBe(classBalanceMetrics('twin').projectileDps);
  });

  it('keeps every specialised class inside its role corridor', () => {
    for (const id of PLAYER_CLASS_IDS) {
      const tank = CLASS_DEFINITIONS[id];
      const metrics = classBalanceMetrics(id);
      expect(tank.moveSpeed).toBeGreaterThanOrEqual(220);
      expect(tank.moveSpeed).toBeLessThanOrEqual(345);
      if (metrics.tier < 3) continue;
      if (tank.branch === 'rapid' || tank.branch === 'precision') {
        expect(metrics.forwardProjectileDps).toBeGreaterThanOrEqual(40);
        expect(metrics.forwardProjectileDps).toBeLessThanOrEqual(100);
      }
      if (tank.branch === 'control') {
        expect(metrics.dronePressure).toBeGreaterThanOrEqual(70);
        expect(metrics.dronePressure).toBeLessThanOrEqual(170);
      }
      if (tank.branch === 'impact') {
        expect(metrics.bodyThreat).toBeGreaterThanOrEqual(80);
        expect(metrics.bodyThreat).toBeLessThanOrEqual(160);
        expect(metrics.effectiveDurability).toBeGreaterThanOrEqual(150);
        expect(metrics.effectiveDurability).toBeLessThanOrEqual(310);
      }
      if (tank.branch === 'precision') expect(metrics.projectileRange).toBeGreaterThanOrEqual(1900);
      if (tank.branch !== 'precision' && tank.barrelCount > 0) expect(metrics.projectileRange).toBeLessThanOrEqual(1300);
    }
  });

  /**
   * Ein Apex muss auf mindestens einer Achse die Spitze seiner Familie sein.
   *
   * Anlass (09.08.): Zwei taten das nicht. Eclipse stand hinter Lancer bei
   * Reichweite und Einzelschuss und hinter Deadeye beim Dauerschaden; Sovereign
   * hatte weniger Drohnendruck als Overseer – eine Klasse von Stufe 28. Wer auf
   * Level 42 aufstieg, wurde in beiden Familien schlechter.
   *
   * Bewusst „mindestens eine" und nicht „alle": Ein Apex soll die Familie
   * krönen, nicht ihre Spezialisten ersetzen. Blitz darf schneller bleiben als
   * Leviathan – aber irgendetwas muss der Gipfel am besten können.
   *
   * Achsen, die für die ganze Familie null sind (Drohnendruck bei Schützen,
   * Reichweite bei Drohnenklassen), zählen nicht: Dort führt jeder.
   */
  it('gibt jedem Apex mindestens eine Achse, auf der er seine Familie anfuehrt', () => {
    const achsen = [
      'forwardProjectileDps', 'burstDamage', 'dronePressure',
      'bodyThreat', 'effectiveDurability', 'mobility', 'projectileRange'
    ] as const;

    const apexe = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].apexOf !== undefined);
    expect(apexe.length).toBeGreaterThan(0);

    for (const apex of apexe) {
      const familie = CLASS_DEFINITIONS[apex].apexOf!;
      const geschwister = PLAYER_CLASS_IDS.filter((id) =>
        id !== apex && CLASS_DEFINITIONS[id].branch === familie && CLASS_DEFINITIONS[id].unlockLevel >= 15);
      const meine = classBalanceMetrics(apex);

      const fuehrt = achsen.filter((achse) => {
        const werte = geschwister.map((id) => classBalanceMetrics(id)[achse]);
        // Achse, auf der die ganze Familie null ist – sagt nichts aus.
        if (meine[achse] === 0 && werte.every((wert) => wert === 0)) return false;
        return werte.every((wert) => meine[achse] >= wert);
      });

      expect(fuehrt.length, `${apex} fuehrt auf keiner Achse`).toBeGreaterThan(0);
    }
  });

  it('keeps final impact classes meaningfully distinct', () => {
    const juggernaut = classBalanceMetrics('juggernaut');
    const fortress = classBalanceMetrics('fortress');
    expect(juggernaut.bodyThreat).toBeGreaterThan(fortress.bodyThreat);
    expect(fortress.effectiveDurability).toBeGreaterThan(juggernaut.effectiveDurability);
  });
});
