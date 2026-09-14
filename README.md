# Kartograph

Kartografie-Werkzeug (Electron) zum Erstellen professioneller Landschaftskarten: prozedurale Terrain-Generierung (Höhen, Feuchtigkeit, Biome, Flüsse) kombiniert mit vollwertigen manuellen Zeichenwerkzeugen. Stadtkarten sind als Ausbaustufe geplant, siehe „Bekannte Prototyp-Grenzen“.

## Starten (Entwicklung)

```bash
npm install
npm start
```

`npm start` baut zuerst das Renderer-Bundle (esbuild) und startet danach Electron. Für automatisches Neubauen bei Änderungen im Renderer-Code:

```bash
npm run watch
```

## Tests

```bash
npm test
```

Deckt die reine Engine-Logik ab: Noise-Determinismus bei festem Seed, Biom-Klassifikation, Fluss-Erreichbarkeit der Küste, `.kmap`-Save/Load-Rundtrip.

## Installer bauen

```bash
npm run pack   # entpackter Build unter dist/win-unpacked
npm run dist   # fertiger NSIS-Installer unter dist/
```

## Funktionsumfang (v1 – Landschaftskarten)

- **Neue-Karte-Dialog**: Größe, Seed, Meeresspiegel; wahlweise prozedural generieren oder ein Graustufen-Höhenbild importieren.
- **Prozedurale Generierung** (Worker-Thread, blockiert die UI nicht): Multi-Oktaven-Simplex-Heightmap, Feuchtigkeits-Layer, Biom-Klassifikation (Ozean, Strand, Wüste, Ebene, Wald, Sumpf, Hügel, Gebirge, Schnee), Flussgenerierung per Steepest-Descent zur Küste.
- **Höhenbild-Import**: Ein echtes (oder von Hand gemaltes) Graustufen-Höhenbild ersetzt die generierte Heightmap; Feuchtigkeit/Biome/Flüsse laufen über dieselbe Pipeline weiter — die Datengrundlage für „echte Geodaten“ ist damit von Anfang an vorhanden, ein Live-Import aus einer DEM-/OSM-API ist als Ausbaustufe vorgesehen.
- **Stilisiertes Rendering**: Reliefschattierung (Hillshade) statt roher Heatmap, gerendert per PixiJS (WebGL) für flüssiges Pan/Zoom auch bei vielen Ebenen.
- **Ebenen-Panel**: Sichtbarkeit, Opazität für Terrain, Wasser, Symbole, Beschriftungen, Gitter.
- **Werkzeuge** (mit Undo/Redo): Terrain-Pinsel (Anheben/Absenken/Glätten), Biom-Pinsel, Wasser-Werkzeug (manuelle Flüsse/Seen), Symbol-Stempel (Berg, Hügel, Wald, Stadt, Kompassrose), Beschriftungs-Werkzeug, Radierer.
- **Kamera**: Pan (mittlere Maustaste / Leertaste+Ziehen), Zoom (Mausrad).
- **Export**: PNG in hoher Auflösung; natives Projektformat `.kmap` (Speichern/Öffnen/Zuletzt geöffnet).
- **Mehrsprachigkeit**: Deutsch/Englisch. **Theming**: Dunkel/Hell/System.

## Architektur

- `main.js` / `preload.js` – Electron-Hauptprozess und `contextBridge`-IPC (`contextIsolation`, kein `nodeIntegration`, `sandbox: true`), Kanalschema `domain:action` wie bei Purgo/Neox Shield.
- `src/engine/` – GUI-unabhängige, direkt testbare Kartenlogik: Noise/Heightmap (`noiseGenerator.js`), Flüsse (`hydrology.js`), Biom-Klassifikation (`biomeClassifier.js`), `.kmap`-Serialisierung (`mapProject.js`), Höhenbild-Import (`heightmapImport.js`).
- `src/workers/generateTerrain.js` – führt die Generierung in einem `worker_thread` aus und meldet Fortschritt per IPC-Event, damit die UI währenddessen reaktionsfähig bleibt.
- `renderer/` – Vanilla-HTML/CSS/JS-Oberfläche (`app.js`, `i18n.js`, `theme.js`) plus `renderer/canvas/` (PixiJS-Rendering, Werkzeuge, Undo/Redo-Historie). Der Renderer-Code ist in ES-Modulen organisiert und wird über `scripts/build-renderer.js` (esbuild) zu `renderer/dist/app.bundle.js` gebündelt — notwendig, weil die strikte CSP (`script-src 'self'`) sowohl externe Skripte als auch `unsafe-eval` verbietet (siehe `pixi.js/unsafe-eval`-Import in `MapRenderer.js`).

## Bekannte Prototyp-Grenzen

- Kein Stadtkarten-Generator (Straßennetz, Viertel, Gebäude) — als Ausbaustufe auf demselben Datenmodell vorgesehen.
- Kein Live-Import aus einer echten Geodaten-API (SRTM/OpenTopography, OSM); nur der Import eines fertigen Graustufen-Höhenbilds.
- Keine politischen Grenzen/Reichsnamen, kein Mehrseiten-/Atlas-Layout, kein Cloud-Speichern/Teilen.
- Symbol-Icons sind einfache Vektor-Platzhalter (kein Icon-Set); Beschriftungen nutzen eine einzelne Schriftart/Stil.
- Terrain- und Biom-Pinsel arbeiten pro Pinselstrich mit einem vollständigen Neu-Rendern der Terrain-Textur — bei sehr großen Kartengrößen (deutlich über 1024×1024) kann das spürbar werden.
- Der Installer ist nicht codesigniert (SmartScreen-Warnung bei Erstnutzung ist erwartetes Verhalten, siehe Purgo/Neox Shield).
