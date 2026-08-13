import { describe, expect, it } from 'vitest';
import { DEPLOY_PATHS, deploybareDateien, erwarteterCommit, istDeploybar } from './deploy-scope.mjs';

describe('istDeploybar', () => {
  it('erkennt Anwendungscode und die Manifeste, an denen der Build hängt', () => {
    expect(istDeploybar('apps/server/src/index.ts')).toBe(true);
    expect(istDeploybar('apps/client/src/ui.ts')).toBe(true);
    expect(istDeploybar('packages/shared/src/index.ts')).toBe(true);
    expect(istDeploybar('package.json')).toBe(true);
    expect(istDeploybar('package-lock.json')).toBe(true);
    expect(istDeploybar('railway.json')).toBe(true);
  });

  it('lässt genau die Commits draußen, die am 13.08. die Fehlmails ausgelöst haben', () => {
    // Alle fünf Wege stammen aus echten Fehlschlägen der Wache.
    expect(istDeploybar('docs/status/chat-04/25-sams-spieltest-feedback.md')).toBe(false);
    expect(istDeploybar('docs/GOAL.md')).toBe(false);
    expect(istDeploybar('README.md')).toBe(false);
    expect(istDeploybar('scripts/mode-probe.mjs')).toBe(false);
    expect(istDeploybar('supabase/migrations/applied/0005_sessions.sql')).toBe(false);
  });

  it('verwechselt keine Namen, die nur so anfangen', () => {
    // 'apps/' mit Schrägstrich – eine Datei namens 'appsettings.json' im
    // Wurzelverzeichnis ist kein Anwendungscode.
    expect(istDeploybar('appsettings.json')).toBe(false);
    expect(istDeploybar('packages-notes.md')).toBe(false);
    // Exakte Wurzeldateien sind exakt: ein gleichnamiger Unterordner zählt nicht.
    expect(istDeploybar('tools/package.json')).toBe(false);
  });

  it('überlebt Unsinn statt zu werfen', () => {
    expect(istDeploybar('')).toBe(false);
    expect(istDeploybar(null)).toBe(false);
    expect(istDeploybar(undefined)).toBe(false);
    // Führendes ./ kommt aus manchen git-Ausgaben.
    expect(istDeploybar('./apps/server/src/index.ts')).toBe(true);
  });

  it('hält die Liste bewusst kurz – jeder Eintrag ist eine Kopie einer Railway-Einstellung', () => {
    expect([...DEPLOY_PATHS]).toEqual([
      'apps/', 'packages/', 'package.json', 'package-lock.json',
      'railway.json', 'docker-compose.yml', 'Dockerfile'
    ]);
  });
});

describe('deploybareDateien', () => {
  it('trennt gemischte Commits', () => {
    const gemischt = ['docs/LATEST.md', 'apps/server/src/game.ts', 'README.md'];
    expect(deploybareDateien(gemischt)).toEqual(['apps/server/src/game.ts']);
  });

  it('meldet leer für reine Doku-Commits und für Unsinn', () => {
    expect(deploybareDateien(['docs/a.md', 'docs/b.md'])).toEqual([]);
    expect(deploybareDateien(null)).toEqual([]);
  });
});

describe('erwarteterCommit', () => {
  it('wartet auf den Push selbst, wenn er deploybaren Code enthält', () => {
    const ergebnis = erwarteterCommit('aaaa111', 'aaaa111');
    expect(ergebnis.commit).toBe('aaaa111');
    expect(ergebnis.eigenerDeploy).toBe(true);
  });

  it('wartet auf den letzten Code-Stand, wenn der Push nur Doku ändert', () => {
    // Genau der Fall vom 13.08.: a99c426 war Doku, live stand (korrekt) 0b161a5.
    const ergebnis = erwarteterCommit('a99c426', '0b161a5');
    expect(ergebnis.commit).toBe('0b161a5');
    expect(ergebnis.eigenerDeploy).toBe(false);
    expect(ergebnis.grund).toContain('nichts');
  });

  it('fällt ohne Git-Historie auf das alte, strenge Verhalten zurück', () => {
    // Flacher Klon: lieber zu streng pruefen als gar nicht.
    const ergebnis = erwarteterCommit('a99c426', '');
    expect(ergebnis.commit).toBe('a99c426');
    expect(ergebnis.eigenerDeploy).toBe(true);
  });
});
