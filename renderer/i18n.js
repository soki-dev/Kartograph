const STRINGS = {
  de: {
    'app.title': 'Kartograph',
    'toolbar.new': 'Neue Karte',
    'toolbar.open': 'Öffnen',
    'toolbar.save': 'Speichern',
    'toolbar.saveAs': 'Speichern unter',
    'toolbar.exportPng': 'Als PNG exportieren',
    'toolbar.undo': 'Rückgängig',
    'toolbar.redo': 'Wiederholen',
    'toolbar.checkUpdate': 'Updates',
    'tools.terrainBrush': 'Terrain-Pinsel',
    'tools.biomeBrush': 'Biom-Pinsel',
    'tools.waterTool': 'Wasser',
    'tools.symbolTool': 'Symbole',
    'tools.labelTool': 'Beschriftung',
    'tools.eraser': 'Radierer',
    'panel.layers': 'Ebenen',
    'panel.toolOptions': 'Werkzeug-Optionen',
    'layer.terrain': 'Terrain',
    'layer.water': 'Wasser',
    'layer.symbols': 'Symbole',
    'layer.labels': 'Beschriftungen',
    'layer.grid': 'Gitter',
    'option.brushRadius': 'Pinselradius',
    'option.brushMode': 'Modus',
    'option.brushMode.raise': 'Anheben',
    'option.brushMode.lower': 'Absenken',
    'option.brushMode.smooth': 'Glätten',
    'option.biome': 'Biom',
    'option.symbolType': 'Symbol',
    'symbol.mountain': 'Berg',
    'symbol.hill': 'Hügel',
    'symbol.forest': 'Wald',
    'symbol.city': 'Stadt',
    'symbol.compass': 'Kompassrose',
    'dialog.newMap.title': 'Neue Karte erstellen',
    'dialog.newMap.width': 'Breite',
    'dialog.newMap.height': 'Höhe',
    'dialog.newMap.seed': 'Seed',
    'dialog.newMap.randomSeed': 'Zufällig',
    'dialog.newMap.mode': 'Modus',
    'dialog.newMap.mode.generate': 'Prozedural generieren',
    'dialog.newMap.mode.import': 'Höhenbild importieren',
    'dialog.newMap.seaLevel': 'Meeresspiegel',
    'dialog.newMap.pickImage': 'Bild wählen…',
    'dialog.newMap.generate': 'Karte erzeugen',
    'dialog.newMap.cancel': 'Abbrechen',
    'status.ready': 'Bereit',
    'status.generating': 'Karte wird generiert…',
    'status.saved': 'Karte gespeichert',
    'status.exported': 'PNG exportiert',
    'status.noMap': 'Keine Karte geöffnet — „Neue Karte“ zum Starten',
    'update.checking': 'Suche nach Updates…',
    'update.available': 'Update verfügbar: v{version}',
    'update.notAvailable': 'Du hast bereits die neueste Version.',
    'update.error': 'Update-Check fehlgeschlagen: {error}',
    biome_ocean: 'Ozean',
    biome_beach: 'Strand',
    biome_desert: 'Wüste',
    biome_plains: 'Ebene',
    biome_forest: 'Wald',
    biome_swamp: 'Sumpf',
    biome_hills: 'Hügel',
    biome_mountains: 'Gebirge',
    biome_snow: 'Schnee'
  },
  en: {
    'app.title': 'Kartograph',
    'toolbar.new': 'New Map',
    'toolbar.open': 'Open',
    'toolbar.save': 'Save',
    'toolbar.saveAs': 'Save As',
    'toolbar.exportPng': 'Export as PNG',
    'toolbar.undo': 'Undo',
    'toolbar.redo': 'Redo',
    'toolbar.checkUpdate': 'Updates',
    'tools.terrainBrush': 'Terrain Brush',
    'tools.biomeBrush': 'Biome Brush',
    'tools.waterTool': 'Water',
    'tools.symbolTool': 'Symbols',
    'tools.labelTool': 'Labels',
    'tools.eraser': 'Eraser',
    'panel.layers': 'Layers',
    'panel.toolOptions': 'Tool Options',
    'layer.terrain': 'Terrain',
    'layer.water': 'Water',
    'layer.symbols': 'Symbols',
    'layer.labels': 'Labels',
    'layer.grid': 'Grid',
    'option.brushRadius': 'Brush Radius',
    'option.brushMode': 'Mode',
    'option.brushMode.raise': 'Raise',
    'option.brushMode.lower': 'Lower',
    'option.brushMode.smooth': 'Smooth',
    'option.biome': 'Biome',
    'option.symbolType': 'Symbol',
    'symbol.mountain': 'Mountain',
    'symbol.hill': 'Hill',
    'symbol.forest': 'Forest',
    'symbol.city': 'City',
    'symbol.compass': 'Compass Rose',
    'dialog.newMap.title': 'Create New Map',
    'dialog.newMap.width': 'Width',
    'dialog.newMap.height': 'Height',
    'dialog.newMap.seed': 'Seed',
    'dialog.newMap.randomSeed': 'Random',
    'dialog.newMap.mode': 'Mode',
    'dialog.newMap.mode.generate': 'Generate procedurally',
    'dialog.newMap.mode.import': 'Import heightmap image',
    'dialog.newMap.seaLevel': 'Sea Level',
    'dialog.newMap.pickImage': 'Choose Image…',
    'dialog.newMap.generate': 'Generate Map',
    'dialog.newMap.cancel': 'Cancel',
    'status.ready': 'Ready',
    'status.generating': 'Generating map…',
    'status.saved': 'Map saved',
    'status.exported': 'PNG exported',
    'status.noMap': 'No map open — use "New Map" to start',
    'update.checking': 'Checking for updates…',
    'update.available': 'Update available: v{version}',
    'update.notAvailable': 'You already have the latest version.',
    'update.error': 'Update check failed: {error}',
    biome_ocean: 'Ocean',
    biome_beach: 'Beach',
    biome_desert: 'Desert',
    biome_plains: 'Plains',
    biome_forest: 'Forest',
    biome_swamp: 'Swamp',
    biome_hills: 'Hills',
    biome_mountains: 'Mountains',
    biome_snow: 'Snow'
  }
};

let currentLocale = localStorage.getItem('kartograph.locale') || 'de';

export function setLocale(locale) {
  currentLocale = STRINGS[locale] ? locale : 'de';
  localStorage.setItem('kartograph.locale', currentLocale);
  applyI18n();
}

export function getLocale() {
  return currentLocale;
}

export function t(key, vars) {
  const template = (STRINGS[currentLocale] && STRINGS[currentLocale][key]) || STRINGS.de[key] || key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
}
