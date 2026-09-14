import L from 'leaflet';

// Leaflets Standard-Marker-Icons lösen ihren Bildpfad normalerweise über eine
// bundler-spezifische Autoerkennung auf, die mit esbuild nicht funktioniert –
// stattdessen feste, von build-renderer.js nach renderer/dist/vendor/leaflet
// kopierte Pfade setzen (siehe scripts/build-renderer.js).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'dist/vendor/leaflet/images/marker-icon-2x.png',
  iconUrl: 'dist/vendor/leaflet/images/marker-icon.png',
  shadowUrl: 'dist/vendor/leaflet/images/marker-shadow.png'
});

const LARGE_REGION_DEGREES = 1.5;

const el = (id) => document.getElementById(id);

/**
 * Dauerhafter Weltkarten-Modus: interaktive OSM-Karte mit Ortssuche und
 * Rechteck-Auswahl, aus der eine Bounding-Box für den echten Regions-Import
 * (siehe main.js -> geodata:importRegion) übernommen werden kann.
 */
export class WorldMapView {
  constructor({ onImportRegion, onWarnLargeRegion }) {
    this.onImportRegion = onImportRegion;
    this.onWarnLargeRegion = onWarnLargeRegion;
    this.map = null;
    this.selectionRect = null;
    this.selectionBounds = null;
    this.resultMarker = null;
    this._selecting = false;
    this._selectStart = null;
  }

  open() {
    el('worldmap-overlay').hidden = false;
    if (!this.map) this._init();
    setTimeout(() => this.map.invalidateSize(), 50);
  }

  close() {
    el('worldmap-overlay').hidden = true;
    el('worldmap-search-results').hidden = true;
  }

  getSelectionBounds() {
    return this.selectionBounds;
  }

  clearSelection() {
    this.selectionBounds = null;
    if (this.selectionRect) {
      this.map.removeLayer(this.selectionRect);
      this.selectionRect = null;
    }
    el('worldmap-import-btn').disabled = true;
  }

  showSearchResults(results) {
    const list = el('worldmap-search-results');
    list.innerHTML = '';
    if (!results.length) {
      list.hidden = true;
      return;
    }
    for (const result of results) {
      const li = document.createElement('li');
      li.textContent = result.displayName;
      li.addEventListener('click', () => this._goToResult(result));
      list.appendChild(li);
    }
    list.hidden = false;
  }

  _goToResult(result) {
    el('worldmap-search-results').hidden = true;
    if (this.resultMarker) this.map.removeLayer(this.resultMarker);
    this.resultMarker = L.marker([result.lat, result.lon]).addTo(this.map).bindPopup(result.displayName).openPopup();

    if (result.boundingBox) {
      const [south, north, west, east] = result.boundingBox;
      this.map.fitBounds([[south, west], [north, east]]);
    } else {
      this.map.setView([result.lat, result.lon], 12);
    }
  }

  _init() {
    this.map = L.map('worldmap-map', { zoomControl: true }).setView([51.1657, 10.4515], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
    }).addTo(this.map);

    this._bindSelection();
  }

  _bindSelection() {
    const container = this.map.getContainer();

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !e.shiftKey) return;
      this._selecting = true;
      this.map.dragging.disable();
      const point = this.map.mouseEventToLatLng(e);
      this._selectStart = point;
      if (this.selectionRect) this.map.removeLayer(this.selectionRect);
      this.selectionRect = L.rectangle([point, point], { color: '#e8a856', weight: 2, fillOpacity: 0.12 }).addTo(this.map);
    });

    container.addEventListener('mousemove', (e) => {
      if (!this._selecting) return;
      const point = this.map.mouseEventToLatLng(e);
      this.selectionRect.setBounds(L.latLngBounds(this._selectStart, point));
    });

    window.addEventListener('mouseup', () => {
      if (!this._selecting) return;
      this._selecting = false;
      this.map.dragging.enable();
      this.selectionBounds = this.selectionRect.getBounds();
      el('worldmap-import-btn').disabled = false;

      const latSpan = this.selectionBounds.getNorth() - this.selectionBounds.getSouth();
      const lonSpan = this.selectionBounds.getEast() - this.selectionBounds.getWest();
      if ((latSpan > LARGE_REGION_DEGREES || lonSpan > LARGE_REGION_DEGREES) && this.onWarnLargeRegion) {
        this.onWarnLargeRegion();
      }
    });
  }
}
