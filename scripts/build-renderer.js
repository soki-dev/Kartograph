const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: [path.join(__dirname, '..', 'renderer', 'app.js')],
  outfile: path.join(__dirname, '..', 'renderer', 'dist', 'app.bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  sourcemap: true,
  logLevel: 'info'
};

// Leaflet loest den Pfad seiner Marker-Icons normalerweise per
// bundler-spezifischer Autoerkennung auf, was mit esbuild nicht
// funktioniert (siehe renderer/worldmap/WorldMapView.js) - stattdessen
// werden CSS + Bilder hier fest nach renderer/dist/vendor/leaflet kopiert
// und im Code mit einem festen relativen Pfad referenziert.
function copyLeafletAssets() {
  const src = path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist');
  const dest = path.join(__dirname, '..', 'renderer', 'dist', 'vendor', 'leaflet');
  fs.mkdirSync(path.join(dest, 'images'), { recursive: true });
  fs.copyFileSync(path.join(src, 'leaflet.css'), path.join(dest, 'leaflet.css'));
  for (const file of fs.readdirSync(path.join(src, 'images'))) {
    fs.copyFileSync(path.join(src, 'images', file), path.join(dest, 'images', file));
  }
}

async function run() {
  copyLeafletAssets();
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('esbuild: watching renderer/ for changes...');
  } else {
    await esbuild.build(options);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
