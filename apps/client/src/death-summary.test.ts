import { describe, expect, it } from 'vitest';
import { respawnLevelFrom } from '@project-maze/shared';
import { deathToastText, respawnFacts, respawnTileLabel, respawnTileValue } from './death-summary';

const factsFor = (deathLevel: number, score: number) =>
  respawnFacts({ deathLevel, respawnLevel: respawnLevelFrom(deathLevel), playerClass: 'gatling', score });

describe('respawnFacts', () => {
  it('nennt die Zahlen, die der Server gleich setzt: halber Score, Core, halbes Level', () => {
    const facts = factsFor(22, 2840);
    expect(facts.level).toBe(11);
    expect(facts.classLabel).toBe('Core');
    expect(facts.score).toBe(1420);
  });

  it('rechnet den XP-Behalt ehrlich statt "halbes Level" zu suggerieren', () => {
    // Befund 28: Die Kurve ist kubisch – behalten wird nicht die Hälfte.
    // Nachgerechnet aus xpAtLevelStart: L10→5 = 507/2137, L60→30 = 27710/168595.
    expect(factsFor(10, 100).xpPercent).toBe(24);
    expect(factsFor(60, 100).xpPercent).toBe(16);
  });

  it('lässt den Prozentwert auf Level 1 weg statt durch null zu teilen', () => {
    expect(factsFor(1, 50).xpPercent).toBeNull();
    expect(respawnTileLabel(factsFor(1, 50))).toBe('Neustart');
  });
});

describe('death screen texts', () => {
  it('sagt im Toast Klasse und Score dazu, nicht nur das Level', () => {
    // Befund 15: "Du startest auf Level 11 neu" verschwieg Core und halben Score.
    const text = deathToastText(factsFor(22, 2840));
    expect(text).toContain('Level 11');
    expect(text).toContain('Core');
    expect(text).toContain('1.420');
  });

  it('trägt die Kachel Neustart mit allen drei Angaben plus XP-Behalt', () => {
    const facts = factsFor(60, 20_000);
    expect(respawnTileValue(facts)).toBe('Level 30 · Core · 10.000 Score');
    expect(respawnTileLabel(facts)).toBe('Neustart (~16 % der XP)');
  });
});
