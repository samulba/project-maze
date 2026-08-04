# Gameplay Masterplan – implementierter Alpha-Meilenstein

## Kamera und Sicht

- Der eigene Tank bleibt exakt im Mittelpunkt des 16:9-Spielbereichs.
- Es gibt keinen manuellen Zoom und keinen Maus-Look-ahead.
- Breitere Monitore erhalten seitliche Balken statt zusätzlicher Sichtweite.
- Der Server filtert dynamische Entitäten außerhalb des relevanten Sichtbereichs.

## Combat

- Bewegung verwendet Beschleunigung und kontrolliertes Abbremsen.
- Tanks verdrängen sich gegenseitig und können Body-Damage verursachen.
- Projektile besitzen Schaden und Integrität.
- Gegnerische Projektile ziehen sich bei einer Kollision gegenseitig Integrität ab.
- Stärkere Projektile können geschwächt weiterfliegen.

## Farming und Progression

- Squares, Triangles und Pentagons besitzen unterschiedliche HP, XP und Body-Damage.
- Maximallevel: 45.
- Pro Level wird ein Upgrade-Punkt vergeben.
- Upgrades: Leben, Regeneration, Bewegung, Nachladen, Schaden, Projektiltempo, Durchschlag und Körperschaden.

## Klassenbaum

- Level 12: Rapid, Sniper, Controller oder Impact.
- Level 25: Twin, Railgun, Warden oder Crusher.
- Level 40: Storm, Lancer, Overseer oder Juggernaut.

## Drohnen

- Ohne Maustaste kehren Drohnen in eine Formation zurück.
- Linke Maustaste bewegt sie in Zielrichtung.
- Rechte Maustaste stößt sie von der Mausposition weg.
- Drohnen besitzen eigene Geschwindigkeit, HP, Wandkollision und Respawn-Zeit.

## Bots

Implementierte Profile:

- Farmer
- Hunter
- Kiter
- Ambusher
- Brawler
- Controller

Profile unterscheiden sich bei Reaktionszeit, Aim-Fehler, Aggression, Distanz, Farm-Priorität, Fluchtverhalten, Dodge, Klassenpfad und Build.

## Tod und Respawn

- Kein sofortiger Respawn.
- Manueller Respawn nach 2,5 Sekunden.
- Automatischer Respawn nach 7 Sekunden.
- Das neue Level entspricht `floor(altes Level × 0,5)`.
- Die Klasse fällt auf den höchsten für das neue Level erlaubten Vorgänger zurück.
- Upgrade-Punkte werden neu verteilt.
