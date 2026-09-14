# Kartograph

Kartografie-Werkzeug (Electron) zum Erstellen professioneller Landschaftskarten: prozedurale Terrain-Generierung (Höhen, Feuchtigkeit, Biome, Flüsse) und echter Regions-Import aus OpenStreetMap-Daten, kombiniert mit vollwertigen manuellen Zeichenwerkzeugen. Stadtkarten-Generierung ist als Ausbaustufe geplant, siehe „Bekannte Prototyp-Grenzen“.

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

Deckt die reine Engine-Logik ab: Noise-Determinismus bei festem Seed, Biom-Klassifikation, Fluss-Erreichbarkeit der Küste, Geodaten-Projektion/OSM-Parsing/Höhenraster-Resampling, `.kmap`-Save/Load-Rundtrip.

## Installer bauen

```bash
npm run pack   # entpackter Build unter dist/win-unpacked
npm run dist   # fertiger NSIS-Installer (mit Lizenz-/Info-Seite) unter dist/
```

## Funktionsumfang

- **Neue-Karte-Dialog**: Größe, Seed, Meeresspiegel, Maßstab (Meter/Zelle); wahlweise prozedural generieren oder ein Graustufen-Höhenbild importieren.
- **Prozedurale Generierung** (Worker-Thread, blockiert die UI nicht): Multi-Oktaven-Simplex-Heightmap, Feuchtigkeits-Layer, Biom-Klassifikation (Ozean, Strand, Wüste, Ebene, Wald, Sumpf, Hügel, Gebirge, Schnee), Flussgenerierung per Steepest-Descent zur Küste.
- **Weltkarten-Modus**: dauerhafte, interaktive OpenStreetMap-Ansicht mit Ortssuche (Nominatim). Per Shift+Ziehen eine Region auswählen und importieren — Höhendaten (Open-Elevation/OpenTopoData) **und** echte OSM-Vektordaten (Straßen, Flüsse, Gebäude, Ortsnamen) werden für die Bounding-Box geladen und in dieselbe Bearbeitungs-Pipeline wie generierte Karten überführt.
- **Höhenbild-Import**: Alternativ ein eigenes Graustufen-Höhenbild als Heightmap-Basis importieren.
- **Stilisiertes Rendering**: Reliefschattierung (Hillshade) statt roher Heatmap, gerendert per PixiJS (WebGL) für flüssiges Pan/Zoom auch bei vielen Ebenen.
- **Ebenen-Panel**: Sichtbarkeit, Opazität für Terrain, Regionen/Grenzen, Wasser, Straßen, Gebäude, Symbole, reale Orte, Beschriftungen, Gitter.
- **Werkzeuge** (mit Undo/Redo): Terrain-Pinsel (Anheben/Absenken/Glätten), Biom-Pinsel, Wasser-Werkzeug, Straßen-/Routen-Werkzeug, Grenzen-Werkzeug (politische Regionen mit Name & Farbe), Lineal (Distanzmessung in realen Einheiten), Symbol-Stempel, Beschriftungs-Werkzeug, Radierer.
- **Maßstab**: realer Maßstab pro Karte (Meter/Zelle, bei Regions-Import automatisch aus der Bounding-Box berechnet), permanenter Maßstabsbalken, Lineal-Werkzeug mit Distanzanzeige.
- **Kamera**: Pan (mittlere Maustaste / Leertaste+Ziehen), Zoom (Mausrad).
- **Export**: PNG in hoher Auflösung; PDF-Export (Titel, Seitengröße/-ausrichtung, Legende mit Biom-/Regionen-Farben) für Druck/Atlas-Layouts; natives Projektformat `.kmap` (Speichern/Öffnen/Zuletzt geöffnet).
- **Mehrsprachigkeit**: Deutsch/Englisch. **Theming**: Dunkel/Hell/System. **Auto-Update-Check** über GitHub Releases (kein stiller Download/Install).

## Architektur

- `main.js` / `preload.js` – Electron-Hauptprozess und `contextBridge`-IPC (`contextIsolation`, kein `nodeIntegration`, `sandbox: true`), Kanalschema `domain:action` wie bei Purgo/Neox Shield. Alle externen Netzwerkzugriffe (Nominatim, Overpass, Höhendaten-APIs) laufen im Hauptprozess bzw. in Workern, nicht im Renderer — die Renderer-CSP bleibt dadurch strikt (`connect-src 'self'`).
- `src/engine/` – GUI-unabhängige, direkt testbare Kartenlogik: Noise/Heightmap (`noiseGenerator.js`), Flüsse (`hydrology.js`), Biom-Klassifikation (`biomeClassifier.js`), `.kmap`-Serialisierung (`mapProject.js`), Höhenbild-Import (`heightmapImport.js`), Geodaten (`geodata/projection.js`, `geodata/osmParser.js`, `geodata/elevationGrid.js`).
- `src/workers/generateTerrain.js` / `src/workers/importRealRegion.js` – prozedurale Generierung bzw. echter Regions-Import als `worker_thread`, melden Fortschritt per IPC-Event.
- `renderer/` – Vanilla-HTML/CSS/JS-Oberfläche (`app.js`, `i18n.js`, `theme.js`) plus `renderer/canvas/` (PixiJS-Rendering, Werkzeuge, Undo/Redo-Historie), `renderer/worldmap/` (Leaflet-Weltkarte), `renderer/print/` (PDF-Layout via `pdf-lib`). Der Renderer-Code ist in ES-Modulen organisiert und wird über `scripts/build-renderer.js` (esbuild) zu `renderer/dist/app.bundle.js` gebündelt — notwendig, weil die strikte CSP (`script-src 'self'`) sowohl externe Skripte als auch `unsafe-eval` verbietet (siehe `pixi.js/unsafe-eval`-Import in `MapRenderer.js`).

## Bekannte Prototyp-Grenzen

- Kein Stadtkarten-Generator (prozedurale Straßennetze/Viertel) — importierte OSM-Straßen/Gebäude sind bereits editierbar, ein Generator für frei erfundene Städte fehlt noch.
- OSM-Tiles laufen über den öffentlichen `tile.openstreetmap.org`-Dienst — für eine größere öffentliche Verbreitung sollte vorher auf einen dedizierten kostenlosen Tile-Anbieter (eigener Key) umgestellt werden, siehe OSM-Nutzungsrichtlinie.
- Regions-Import ist auf regionale Kartengrößen ausgelegt (einfache, nicht Erdkrümmung-korrigierte Projektion) — für Kontinent-Maßstab ungeeignet.
- Symbol-Icons sind einfache Vektor-Platzhalter (kein Icon-Set); Beschriftungen nutzen eine einzelne Schriftart/Stil.
- Terrain- und Biom-Pinsel arbeiten pro Pinselstrich mit einem vollständigen Neu-Rendern der Terrain-Textur — bei sehr großen Kartengrößen (deutlich über 1024×1024) kann das spürbar werden.
- Der Installer ist nicht codesigniert (SmartScreen-Warnung bei Erstnutzung ist erwartetes Verhalten, siehe Purgo/Neox Shield).
