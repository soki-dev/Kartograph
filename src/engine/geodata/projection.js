const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Distanz zwischen zwei lat/lon-Punkten in Metern (Haversine).
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Erzeugt eine einfache rechteckige Projektion einer lat/lon-Bounding-Box auf
 * ein width x height Zellraster. Bewusst simpel (lineare Skalierung statt
 * echter Kartenprojektion) – für regionale Kartengrößen ausreichend, für
 * Kontinent-Maßstab würde die Verzerrung zu groß.
 */
function createProjection({ north, south, east, west, width, height }) {
  if (north <= south) throw new Error('north muss größer als south sein');
  if (east <= west) throw new Error('east muss größer als west sein');

  const lonSpan = east - west;
  const latSpan = north - south;

  function toLocal(lat, lon) {
    const x = ((lon - west) / lonSpan) * width;
    const y = ((north - lat) / latSpan) * height;
    return [x, y];
  }

  function toLatLon(x, y) {
    const lon = west + (x / width) * lonSpan;
    const lat = north - (y / height) * latSpan;
    return { lat, lon };
  }

  return { toLocal, toLatLon };
}

/**
 * Durchschnittliche reale Ausdehnung (Meter pro Zelle) einer Bounding-Box,
 * gemittelt aus der Ost-West-Distanz (auf mittlerer Breite) und der
 * Nord-Sued-Distanz. Grundlage fuer Lineal/Maßstabsbalken bei importierten
 * echten Karten.
 */
function metersPerCell({ north, south, east, west, width, height }) {
  const latMid = (north + south) / 2;
  const widthMeters = haversineDistance(latMid, west, latMid, east);
  const heightMeters = haversineDistance(north, west, south, west);
  return (widthMeters / width + heightMeters / height) / 2;
}

module.exports = { createProjection, haversineDistance, metersPerCell, EARTH_RADIUS_M };
