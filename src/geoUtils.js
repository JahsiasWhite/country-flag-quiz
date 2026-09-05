/** Largest-ring focus point; unwraps longitudes so Fiji/Kiribati don't average to Africa. */
export function getCountryFocus(geometry) {
  if (!geometry) return null;
  const polys =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : null;
  if (!polys?.length) return null;

  let bestRing = null;
  let bestArea = -1;
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring || ring.length < 3) continue;
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    area = Math.abs(area);
    if (area > bestArea) {
      bestArea = area;
      bestRing = ring;
    }
  }
  if (!bestRing) return null;

  const focus = ringFocus(bestRing);
  if (!focus) return null;

  // Approximate angular size of the main landmass (for camera zoom)
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  const ref = bestRing[0][0];
  for (const [x, y] of bestRing) {
    let lx = x;
    while (lx - ref > 180) lx -= 360;
    while (lx - ref < -180) lx += 360;
    minLon = Math.min(minLon, lx);
    maxLon = Math.max(maxLon, lx);
    minLat = Math.min(minLat, y);
    maxLat = Math.max(maxLat, y);
  }
  focus.spanDeg = Math.max(maxLon - minLon, maxLat - minLat);
  return focus;
}

/** Minimum click/hover target size in degrees (~80km). */
export const MIN_HIT_SIZE_DEG = 0.75;

export function ringArea(ring) {
  if (!ring || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area) / 2;
}

export function ringFocus(ring) {
  const ref = ring[0][0];
  let lon = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    let lx = x;
    while (lx - ref > 180) lx -= 360;
    while (lx - ref < -180) lx += 360;
    lon += lx;
    lat += y;
  }
  lon /= ring.length;
  lat /= ring.length;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return { lat, lon };
}

/** Expand a bbox so tiny countries remain clickable. */
export function expandBBox(box, minSize = MIN_HIT_SIZE_DEG) {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const halfW = Math.max((box.maxX - box.minX) / 2, minSize / 2);
  const halfH = Math.max((box.maxY - box.minY) / 2, minSize / 2);
  return {
    minX: cx - halfW,
    maxX: cx + halfW,
    minY: cy - halfH,
    maxY: cy + halfH,
  };
}

/** Approximate distance in degrees, compensating longitude at latitude. */
export function degDistance(a, b) {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = lat1 - lat2;
  let dLon = lon1 - lon2;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const midLat = ((lat1 + lat2) / 2) * (Math.PI / 180);
  return Math.hypot(dLon * Math.cos(midLat), dLat);
}
