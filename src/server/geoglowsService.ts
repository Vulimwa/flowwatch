import fs from 'fs';
import zlib from 'zlib';
import proj4 from 'proj4';
import { fromUrl } from 'geotiff';
import type {
  GeoglowsEnsembleBundle,
  GeoglowsForecastBundle,
  GeoglowsHistoricalResponse,
  GeoglowsMapServerMeta,
  GeoglowsReachContextResponse,
  GeoglowsReachIndexResponse,
  GeoglowsReachRecord,
  GeoglowsReturnPeriodsResponse,
  MatchConfidence,
  TanaReachMatch,
} from '../types/geospatial';

export const GEOGLOWS_MAPSERVER_URL =
  'https://livefeeds3.arcgis.com/arcgis/rest/services/GEOGLOWS/GlobalWaterModel_Medium/MapServer';
export const GEOGLOWS_API_BASE = 'https://geoglows.ecmwf.int/api/v2';
export const GEOGLOWS_ZARR_BASE =
  'https://geoglows-v2.s3.us-west-2.amazonaws.com/retrospective/return-periods.zarr';
export const TANA_STREAMS_FS_URL =
  'https://services8.arcgis.com/oTalEaSXAuyNT7xf/arcgis/rest/services/tanariverstreams/FeatureServer';
export const PORTAL_ITEMS_BASE = 'https://africageoportal.maps.arcgis.com/sharing/rest/content/items';

export const TANA_AOI_BOUNDS: [number, number, number, number] = [36.55, -1.25, 38.65, 0.45];

const INDEX_DISK_CACHE_PATH = '/tmp/flowwatch-tana-geoglows-index-v1.json';
const UTM37S_PROJ = '+proj=utm +zone=37 +south +datum=WGS84 +units=m +no_defs';
const WGS84_PROJ = 'EPSG:4326';

const TTL_SHORT_MS = 1000 * 60 * 15; // 15 min for live forecasts
const TTL_LONG_MS = 1000 * 60 * 60 * 6; // 6 hours for static/historical/return periods

const memoryCache = new Map<string, { data: unknown; ts: number; ttl: number }>();

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached(key: string, data: unknown, ttl: number) {
  memoryCache.set(key, { data, ts: Date.now(), ttl });
}

function toUtm(lon: number, lat: number): [number, number] {
  return proj4(WGS84_PROJ, UTM37S_PROJ, [lon, lat]);
}

// ---------------------------------------------------------------------------
// 1. GEOGLOWS MapServer Metadata & Legend
// ---------------------------------------------------------------------------
export async function getGeoglowsMapServerMeta(): Promise<GeoglowsMapServerMeta> {
  const cached = getCached<GeoglowsMapServerMeta>('mapserver-meta');
  if (cached) return cached;

  try {
    const [rootResp, layerResp, legendResp] = await Promise.all([
      fetch(`${GEOGLOWS_MAPSERVER_URL}?f=json`, { signal: AbortSignal.timeout(12000) }),
      fetch(`${GEOGLOWS_MAPSERVER_URL}/0?f=json`, { signal: AbortSignal.timeout(12000) }),
      fetch(`${GEOGLOWS_MAPSERVER_URL}/legend?f=json`, { signal: AbortSignal.timeout(12000) }),
    ]);

    if (!rootResp.ok || !layerResp.ok) {
      throw new Error(`GEOGLOWS MapServer HTTP ${rootResp.status}/${layerResp.status}`);
    }

    const rootJson = (await rootResp.json()) as Record<string, unknown>;
    const layerJson = (await layerResp.json()) as Record<string, unknown>;
    const legendJson = legendResp.ok
      ? ((await legendResp.json()) as {
          layers?: Array<{
            layerId: number;
            legend?: Array<{ label: string; imageData: string; contentType: string; values?: string[] }>;
          }>;
        })
      : {};

    const timeInfo = (rootJson.timeInfo || layerJson.timeInfo || {}) as {
      timeExtent?: [number, number];
      defaultTimeInterval?: number;
      timeInterval?: number;
    };

    const fields = Array.isArray(layerJson.fields)
      ? (layerJson.fields as Array<{ name: string; type: string; alias?: string }>).map((f) => ({
          name: f.name,
          type: f.type,
          alias: f.alias || f.name,
        }))
      : [];

    const legendLayer = legendJson.layers?.find((l) => l.layerId === 0) || legendJson.layers?.[0];
    const legend = (legendLayer?.legend || []).map((item) => ({
      label: item.label,
      imageData: item.imageData,
      contentType: item.contentType || 'image/png',
      values: item.values || [],
    }));

    const result: GeoglowsMapServerMeta = {
      serviceUrl: GEOGLOWS_MAPSERVER_URL,
      layerId: 0,
      layerName: String(layerJson.name || 'Flow Forecast (m³/sec)'),
      capabilities: String(rootJson.capabilities || layerJson.capabilities || 'Map,Query,Data'),
      attribution:
        'GEOGLOWS / ECMWF / Esri Living Atlas (GlobalWaterModel_Medium). Modelled forecast visual context.',
      description:
        'Global Water Model Medium-Range 3-hourly forecast streamflow layer from Esri Living Atlas & GEOGLOWS ECMWF.',
      timeExtent:
        Array.isArray(timeInfo.timeExtent) && timeInfo.timeExtent.length === 2
          ? [Number(timeInfo.timeExtent[0]), Number(timeInfo.timeExtent[1])]
          : null,
      timeIntervalHours: Number(timeInfo.defaultTimeInterval || timeInfo.timeInterval || 3),
      maxRecordCount: Number(layerJson.maxRecordCount || 2000),
      fields,
      legend,
      status: 'available',
      checkedAt: new Date().toISOString(),
    };

    setCached('mapserver-meta', result, TTL_SHORT_MS);
    return result;
  } catch (err) {
    return {
      serviceUrl: GEOGLOWS_MAPSERVER_URL,
      layerId: 0,
      layerName: 'Flow Forecast (m³/sec)',
      capabilities: 'Unavailable',
      attribution: 'GEOGLOWS / ECMWF / Esri Living Atlas',
      description: 'GEOGLOWS MapServer unavailable',
      timeExtent: null,
      timeIntervalHours: 3,
      maxRecordCount: 2000,
      fields: [],
      legend: [],
      status: 'error',
      errorMessage: err instanceof Error ? err.message : 'GEOGLOWS MapServer check failed',
      checkedAt: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Spatial Reach Discovery & Geometric Matching (Tana Streams <-> GEOGLOWS)
// ---------------------------------------------------------------------------
interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?: { paths?: number[][][] };
}

async function fetchAllArcGisFeatures(
  layerUrl: string,
  params: Record<string, string>
): Promise<ArcGisFeature[]> {
  const all: ArcGisFeature[] = [];
  let offset = 0;
  while (true) {
    const qs = new URLSearchParams({
      ...params,
      resultOffset: String(offset),
      f: 'json',
    });
    const resp = await fetch(`${layerUrl}/query?${qs.toString()}`, {
      signal: AbortSignal.timeout(25000),
    });
    if (!resp.ok) {
      throw new Error(`ArcGIS query failed (${resp.status}) at ${layerUrl}`);
    }
    const json = (await resp.json()) as {
      features?: ArcGisFeature[];
      exceededTransferLimit?: boolean;
      error?: { message: string };
    };
    if (json.error) throw new Error(json.error.message);
    const batch = json.features || [];
    all.push(...batch);
    if (!json.exceededTransferLimit || batch.length === 0) break;
    offset += batch.length;
  }
  return all;
}

interface PreparedUtmGeom {
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
  segs: Array<[number, number, number, number]>;
  bearingVec: [number, number];
}

function prepareUtmGeometry(paths: number[][][]): PreparedUtmGeom {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  const segs: Array<[number, number, number, number]> = [];
  let startPt: [number, number] | null = null;
  let endPt: [number, number] | null = null;

  for (const path of paths) {
    if (!path.length) continue;
    const utm = path.map(([x, y]) => toUtm(x, y));
    if (!startPt) startPt = utm[0];
    endPt = utm[utm.length - 1];
    for (let i = 0; i < utm.length; i++) {
      const [x, y] = utm[i];
      if (x < minx) minx = x;
      if (y < miny) miny = y;
      if (x > maxx) maxx = x;
      if (y > maxy) maxy = y;
      if (i + 1 < utm.length) {
        segs.push([x, y, utm[i + 1][0], utm[i + 1][1]]);
      }
    }
  }

  let bx = 1;
  let by = 0;
  if (startPt && endPt) {
    const dx = endPt[0] - startPt[0];
    const dy = endPt[1] - startPt[1];
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      bx = dx / len;
      by = dy / len;
    }
  }
  return { minx, miny, maxx, maxy, segs, bearingVec: [bx, by] };
}

function sampleUtmPoints(paths: number[][][], stepMeters = 600): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (const path of paths) {
    const utm = path.map(([x, y]) => toUtm(x, y));
    for (let i = 0; i < utm.length; i++) {
      pts.push(utm[i]);
      if (i + 1 < utm.length) {
        const [x1, y1] = utm[i];
        const [x2, y2] = utm[i + 1];
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.floor(dist / stepMeters);
        for (let s = 1; s < steps; s++) {
          const f = s / steps;
          pts.push([x1 + f * (x2 - x1), y1 + f * (y2 - y1)]);
        }
      }
    }
  }
  return pts;
}

function pointToSegDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function evaluateAlignment(
  pts: Array<[number, number]>,
  targetSegs: Array<[number, number, number, number]>
): { meanDist: number; maxDist: number; overlapRatio: number } {
  if (!pts.length || !targetSegs.length) {
    return { meanDist: Infinity, maxDist: Infinity, overlapRatio: 0 };
  }
  let sum = 0;
  let maxD = 0;
  let within500 = 0;
  for (const [px, py] of pts) {
    let best = Infinity;
    for (const [ax, ay, bx, by] of targetSegs) {
      const d = pointToSegDist(px, py, ax, ay, bx, by);
      if (d < best) best = d;
    }
    sum += best;
    if (best > maxD) maxD = best;
    if (best <= 500) within500++;
  }
  return {
    meanDist: sum / pts.length,
    maxDist: maxD,
    overlapRatio: within500 / pts.length,
  };
}

function computeCentroidAndBboxWgs84(paths: number[][][]): {
  centroid: [number, number];
  bbox: [number, number, number, number];
} {
  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;
  const flatPts: Array<[number, number]> = [];
  for (const path of paths) {
    for (const [x, y] of path) {
      flatPts.push([x, y]);
      if (x < xmin) xmin = x;
      if (y < ymin) ymin = y;
      if (x > xmax) xmax = x;
      if (y > ymax) ymax = y;
    }
  }
  if (!flatPts.length) {
    return { centroid: [37.6, -0.4], bbox: TANA_AOI_BOUNDS };
  }
  const mid = flatPts[Math.floor(flatPts.length / 2)];
  return {
    centroid: [Number(mid[0].toFixed(5)), Number(mid[1].toFixed(5))],
    bbox: [xmin, ymin, xmax, ymax],
  };
}

function classifyDamPosition(
  centroid: [number, number],
  upstreamAreaKm2: number,
  matchedNames: string[]
): GeoglowsReachRecord['damPosition'] {
  const [lon, lat] = centroid;
  const namesJoined = matchedNames.join(' ').toLowerCase();
  // Masinga Dam is near (37.59E, -0.88S), Seven Forks extends to ~37.96E, -0.70S
  if (lon < 37.57 && lat < -0.2 && lat > -1.15 && (upstreamAreaKm2 >= 250 || /sagana|tana|thika|chania|mathioya|maragua/.test(namesJoined))) {
    return 'upstream_masinga';
  }
  if (lon >= 37.57 && lon <= 37.98 && lat >= -0.96 && lat <= -0.66 && upstreamAreaKm2 >= 2500) {
    return 'seven_forks_cascade';
  }
  if (lon > 37.98 && upstreamAreaKm2 >= 8000) {
    return 'downstream_cascade';
  }
  return 'tributary_or_outside';
}

let inFlightIndexPromise: Promise<GeoglowsReachIndexResponse> | null = null;

export async function getTanaGeoglowsReachIndex(
  forceRefresh = false
): Promise<GeoglowsReachIndexResponse> {
  if (!forceRefresh) {
    const mem = getCached<GeoglowsReachIndexResponse>('tana-geoglows-index');
    if (mem) return mem;

    try {
      if (fs.existsSync(INDEX_DISK_CACHE_PATH)) {
        const stat = fs.statSync(INDEX_DISK_CACHE_PATH);
        if (Date.now() - stat.mtimeMs < TTL_LONG_MS) {
          const parsed = JSON.parse(
            fs.readFileSync(INDEX_DISK_CACHE_PATH, 'utf8')
          ) as GeoglowsReachIndexResponse;
          if (parsed?.reaches?.length > 0 && parsed?.tanaMatches?.length > 0) {
            setCached('tana-geoglows-index', parsed, TTL_LONG_MS);
            return parsed;
          }
        }
      }
    } catch {
      // Rebuild if disk cache unreadable
    }
  }

  if (inFlightIndexPromise) return inFlightIndexPromise;

  inFlightIndexPromise = (async () => {
    try {
      const [geoglowsFeats, tanaFeats] = await Promise.all([
        fetchAllArcGisFeatures(`${GEOGLOWS_MAPSERVER_URL}/0`, {
          geometry: TANA_AOI_BOUNDS.join(','),
          geometryType: 'esriGeometryEnvelope',
          inSR: '4326',
          outSR: '4326',
          spatialRel: 'esriSpatialRelIntersects',
          outFields:
            'comid,outletcomid,vpu,upstreamarea,geodesiclength,streamorder,rivercountry,meanflow,returnperiod',
          maxAllowableOffset: '0.0004',
          resultRecordCount: '2000',
          returnGeometry: 'true',
        }),
        fetchAllArcGisFeatures(`${TANA_STREAMS_FS_URL}/0`, {
          where: '1=1',
          outSR: '4326',
          outFields: 'FID,NAME,Shape__Length',
          maxAllowableOffset: '0.0004',
          resultRecordCount: '2000',
          returnGeometry: 'true',
        }),
      ]);

      const preparedGeoglows = geoglowsFeats
        .map((f) => {
          const a = f.attributes;
          const linkno = Number(a.comid);
          const paths = f.geometry?.paths || [];
          const utm = prepareUtmGeometry(paths);
          const { centroid, bbox } = computeCentroidAndBboxWgs84(paths);
          return {
            linkno,
            outletLinkno: a.outletcomid != null ? Number(a.outletcomid) : null,
            vpu: a.vpu != null ? Number(a.vpu) : null,
            upstreamAreaKm2: Number(((Number(a.upstreamarea) || 0) / 1e6).toFixed(2)),
            geodesicLengthMeters: Number(a.geodesiclength) || 0,
            streamOrder: Number(a.streamorder) || 1,
            riverCountry: String(a.rivercountry || 'Kenya'),
            mapMeanFlowM3s: a.meanflow != null ? Number(a.meanflow) : null,
            mapReturnPeriod: a.returnperiod != null ? Number(a.returnperiod) : null,
            paths: paths.map((p) =>
              p.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))])
            ),
            centroid,
            bbox,
            utm,
          };
        })
        .filter((r) => Number.isInteger(r.linkno) && r.linkno > 0);

      const reachByLinkno = new Map<number, (typeof preparedGeoglows)[number]>();
      const localNamesByLinkno = new Map<number, Set<string>>();
      const localFidsByLinkno = new Map<number, number[]>();
      for (const r of preparedGeoglows) {
        reachByLinkno.set(r.linkno, r);
      }

      let verifiedHighCount = 0;
      let verifiedMediumCount = 0;
      let unverifiedCount = 0;
      let ambiguousCount = 0;

      const tanaMatches: TanaReachMatch[] = [];

      for (const tf of tanaFeats) {
        const fid = Number(tf.attributes.FID);
        const rawName = String(tf.attributes.NAME || '').trim();
        const tanaName = rawName.length > 0 ? rawName : null;
        const lengthMeters = Number(tf.attributes.Shape__Length) || 0;
        const paths = tf.geometry?.paths || [];
        const tUtm = prepareUtmGeometry(paths);
        const pts = sampleUtmPoints(paths, 650);

        const candidates = preparedGeoglows.filter(
          (g) =>
            g.utm.maxx >= tUtm.minx - 3000 &&
            g.utm.minx <= tUtm.maxx + 3000 &&
            g.utm.maxy >= tUtm.miny - 3000 &&
            g.utm.miny <= tUtm.maxy + 3000
        );

        const scored = candidates
          .map((g) => {
            const align = evaluateAlignment(pts, g.utm.segs);
            const bearingCos = Math.abs(
              tUtm.bearingVec[0] * g.utm.bearingVec[0] +
                tUtm.bearingVec[1] * g.utm.bearingVec[1]
            );
            return { g, align, bearingCos };
          })
          .sort((a, b) => a.align.meanDist - b.align.meanDist);

        const best = scored[0];
        const second = scored[1];

        let confidence: MatchConfidence = 'unverified';
        let reason = 'No GEOGLOWS TDX-Hydro reach within 1,200 m geometric corridor.';

        if (best) {
          const isAmbiguousTie =
            Boolean(second) &&
            Math.abs(second.align.meanDist - best.align.meanDist) < 85 &&
            best.align.meanDist > 350;
          const isPerpendicular =
            best.bearingCos < 0.45 && best.align.overlapRatio < 0.4 && lengthMeters > 2000;

          if (isAmbiguousTie) {
            ambiguousCount++;
            reason = `Ambiguous confluence/parallel tie (${best.g.linkno} vs ${second.g.linkno} within 85 m).`;
          } else if (isPerpendicular) {
            reason = `Perpendicular crossing / tributary misalignment (cos θ = ${best.bearingCos.toFixed(2)}).`;
          } else if (best.align.meanDist <= 450 && best.align.overlapRatio >= 0.4) {
            confidence = 'high';
            reason = `High-confidence projected alignment (${Math.round(best.align.meanDist)} m mean offset, ${Math.round(best.align.overlapRatio * 100)}% corridor overlap).`;
          } else if (best.align.meanDist <= 1150 && best.align.overlapRatio >= 0.2) {
            confidence = 'medium';
            reason = `Moderate projected alignment (${Math.round(best.align.meanDist)} m mean offset, ${Math.round(best.align.overlapRatio * 100)}% corridor overlap).`;
          } else {
            reason = `Geometric offset too large (${Math.round(best.align.meanDist)} m mean offset, ${Math.round(best.align.overlapRatio * 100)}% overlap).`;
          }
        }

        const isVerified = confidence === 'high' || confidence === 'medium';
        if (confidence === 'high') verifiedHighCount++;
        else if (confidence === 'medium') verifiedMediumCount++;
        else unverifiedCount++;

        if (isVerified && best) {
          if (!localFidsByLinkno.has(best.g.linkno)) localFidsByLinkno.set(best.g.linkno, []);
          localFidsByLinkno.get(best.g.linkno)!.push(fid);
          if (tanaName) {
            if (!localNamesByLinkno.has(best.g.linkno)) localNamesByLinkno.set(best.g.linkno, new Set());
            localNamesByLinkno.get(best.g.linkno)!.add(tanaName);
          }
        }

        tanaMatches.push({
          tana_feature_id: fid,
          tana_name: tanaName,
          tana_length_m: Math.round(lengthMeters),
          geoglows_linkno: isVerified && best ? best.g.linkno : null,
          river_name: isVerified ? tanaName || `GEOGLOWS Reach ${best.g.linkno}` : tanaName,
          upstream_area_km2: isVerified && best ? best.g.upstreamAreaKm2 : null,
          stream_order: isVerified && best ? best.g.streamOrder : null,
          match_distance_m: best ? Math.round(best.align.meanDist) : null,
          max_distance_m: best ? Math.round(best.align.maxDist) : null,
          overlap_ratio: best ? Number(best.align.overlapRatio.toFixed(2)) : 0,
          bearing_cos: best ? Number(best.bearingCos.toFixed(2)) : null,
          match_confidence: confidence,
          match_method: 'EPSG:32737 projected polyline-to-segment distance, overlap & bearing check',
          identifier_source: isVerified
            ? 'GEOGLOWS GlobalWaterModel_Medium/MapServer/0 (TDX-Hydro comid/LINKNO)'
            : 'Unverified local tanariverstreams feature',
          verification_status: isVerified ? 'verified' : 'unverified',
          reason,
        });
      }

      const reaches: GeoglowsReachRecord[] = preparedGeoglows
        .map((r) => {
          const names = Array.from(localNamesByLinkno.get(r.linkno) || []);
          const fids = localFidsByLinkno.get(r.linkno) || [];
          const displayName =
            names.length > 0
              ? `${names.slice(0, 2).join(' / ')} (${r.linkno})`
              : `GEOGLOWS Reach ${r.linkno}`;
          return {
            linkno: r.linkno,
            outletLinkno: r.outletLinkno,
            vpu: r.vpu,
            upstreamAreaKm2: r.upstreamAreaKm2,
            geodesicLengthMeters: r.geodesicLengthMeters,
            streamOrder: r.streamOrder,
            riverCountry: r.riverCountry,
            mapMeanFlowM3s: r.mapMeanFlowM3s,
            mapReturnPeriod: r.mapReturnPeriod,
            matchedLocalNames: names,
            matchedFids: fids,
            displayName,
            centroid: r.centroid,
            bbox: r.bbox,
            paths: r.paths,
            damPosition: classifyDamPosition(r.centroid, r.upstreamAreaKm2, names),
          };
        })
        .sort((a, b) => b.upstreamAreaKm2 - a.upstreamAreaKm2);

      const response: GeoglowsReachIndexResponse = {
        stats: {
          aoiExtent: TANA_AOI_BOUNDS,
          geoglowsReachCount: reaches.length,
          tanaSegmentCount: tanaMatches.length,
          verifiedHighCount,
          verifiedMediumCount,
          unverifiedCount,
          ambiguousCount,
          projectionUsed: 'EPSG:32737 (WGS 84 / UTM Zone 37S)',
          sourceService: `${GEOGLOWS_MAPSERVER_URL}/0`,
          generatedAt: new Date().toISOString(),
        },
        reaches,
        tanaMatches,
      };

      setCached('tana-geoglows-index', response, TTL_LONG_MS);
      try {
        fs.writeFileSync(INDEX_DISK_CACHE_PATH, JSON.stringify(response), 'utf8');
      } catch {
        // Non-fatal if /tmp write fails
      }
      return response;
    } finally {
      inFlightIndexPromise = null;
    }
  })();

  return inFlightIndexPromise;
}

export async function validateLinknoInBasin(linkno: number): Promise<GeoglowsReachRecord | null> {
  if (!Number.isInteger(linkno) || linkno <= 0) return null;
  const idx = await getTanaGeoglowsReachIndex();
  return (
    idx.reaches.find((r) => r.linkno === linkno && r.matchedFids.length > 0) || null
  );
}

// ---------------------------------------------------------------------------
// 3. GEOGLOWS Point Identify (MapServer Spatial Query + Index Lookup)
// ---------------------------------------------------------------------------
export async function identifyGeoglowsAtPoint(
  lon: number,
  lat: number
): Promise<{
  reach: GeoglowsReachRecord | null;
  distanceMeters: number | null;
  apiNearestRiverId: number | null;
}> {
  const index = await getTanaGeoglowsReachIndex();
  const [px, py] = toUtm(lon, lat);

  // Check MapServer spatial query within 2,000m first
  let nearest: GeoglowsReachRecord | null = null;
  let bestDist = Infinity;

  for (const reach of index.reaches) {
    const [xmin, ymin, xmax, ymax] = reach.bbox;
    if (lon < xmin - 0.03 || lon > xmax + 0.03 || lat < ymin - 0.03 || lat > ymax + 0.03) {
      continue;
    }
    for (const path of reach.paths) {
      const utm = path.map(([x, y]) => toUtm(x, y));
      for (let i = 0; i + 1 < utm.length; i++) {
        const d = pointToSegDist(px, py, utm[i][0], utm[i][1], utm[i + 1][0], utm[i + 1][1]);
        if (d < bestDist) {
          bestDist = d;
          nearest = reach;
        }
      }
    }
  }

  if (nearest && bestDist <= 1800) {
    return {
      reach: nearest,
      distanceMeters: Math.round(bestDist),
      apiNearestRiverId: nearest.linkno,
    };
  }

  return { reach: null, distanceMeters: null, apiNearestRiverId: null };
}

// ---------------------------------------------------------------------------
// 4. GEOGLOWS REST API v2 Proxy (Dates, Forecasts, Ensembles, Historical)
// ---------------------------------------------------------------------------
export async function getGeoglowsDates(): Promise<string[]> {
  const cached = getCached<string[]>('geoglows-dates');
  if (cached) return cached;

  const resp = await fetch(`${GEOGLOWS_API_BASE}/dates?format=json`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) {
    throw new Error(`GEOGLOWS dates endpoint returned HTTP ${resp.status}`);
  }
  const json = (await resp.json()) as { dates?: string[] };
  const dates = Array.isArray(json.dates) ? json.dates : [];
  setCached('geoglows-dates', dates, TTL_SHORT_MS);
  return dates;
}

function toNumOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getGeoglowsForecast(
  linkno: number,
  issueDate?: string | null
): Promise<GeoglowsForecastBundle> {
  const cleanDate = issueDate && /^\d{10}$/.test(issueDate) ? issueDate : null;
  const cacheKey = `forecast:${linkno}:${cleanDate || 'latest'}`;
  const cached = getCached<GeoglowsForecastBundle>(cacheKey);
  if (cached) return cached;

  const dates = await getGeoglowsDates().catch(() => [] as string[]);
  const candidateDates: Array<string | null> = cleanDate
    ? [cleanDate]
    : [null, ...dates.slice(1, 4)];

  interface ForecastStatsPayload {
    datetime?: string[];
    flow_min?: unknown[];
    flow_25p?: unknown[];
    flow_med?: unknown[];
    flow_avg?: unknown[];
    flow_75p?: unknown[];
    flow_max?: unknown[];
    high_res?: unknown[];
    metadata?: Record<string, unknown>;
    error?: string;
  }

  let resolvedDate: string | null = cleanDate;
  let statsJson: ForecastStatsPayload | null = null;
  let lastStatus: number | string = 'timeout';

  for (const cand of candidateDates) {
    const candQs = cand ? `&date=${cand}` : '';
    try {
      const resp = await fetch(`${GEOGLOWS_API_BASE}/forecaststats/${linkno}?format=json${candQs}`, {
        signal: AbortSignal.timeout(18000),
      });
      if (resp.ok) {
        const parsed = (await resp.json()) as ForecastStatsPayload;
        if (!parsed.error && Array.isArray(parsed.datetime)) {
          statsJson = parsed;
          resolvedDate = cand;
          break;
        }
      }
      lastStatus = resp.status;
    } catch {
      lastStatus = 'timeout';
    }
  }

  if (!statsJson || statsJson.error) {
    throw new Error(statsJson?.error || `GEOGLOWS forecaststats failed (${lastStatus}) for LINKNO ${linkno}`);
  }

  const resolvedQs = resolvedDate ? `&date=${resolvedDate}` : '';
  const [summaryResp, recordsResp] = await Promise.allSettled([
    fetch(`${GEOGLOWS_API_BASE}/forecast/${linkno}?format=json${resolvedQs}`, {
      signal: AbortSignal.timeout(18000),
    }),
    fetch(`${GEOGLOWS_API_BASE}/forecastrecords/${linkno}?format=json`, {
      signal: AbortSignal.timeout(18000),
    }),
  ]);

  const datetime = statsJson.datetime || [];
  const flowMin = (statsJson.flow_min || []).map(toNumOrNull);
  const flow25 = (statsJson.flow_25p || []).map(toNumOrNull);
  const flowMed = (statsJson.flow_med || []).map(toNumOrNull);
  const flowAvg = (statsJson.flow_avg || []).map(toNumOrNull);
  const flow75 = (statsJson.flow_75p || []).map(toNumOrNull);
  const flowMax = (statsJson.flow_max || []).map(toNumOrNull);
  const highRes = (statsJson.high_res || []).map(toNumOrNull);

  let forecastSummary: GeoglowsForecastBundle['forecastSummary'] = null;
  if (summaryResp.status === 'fulfilled' && summaryResp.value.ok) {
    try {
      const sumJson = (await summaryResp.value.json()) as {
        datetime?: string[];
        flow_median?: unknown[];
        flow_uncertainty_lower?: unknown[];
        flow_uncertainty_upper?: unknown[];
      };
      if (Array.isArray(sumJson.datetime)) {
        forecastSummary = {
          datetime: sumJson.datetime,
          flow_median: (sumJson.flow_median || []).map(toNumOrNull),
          flow_uncertainty_lower: (sumJson.flow_uncertainty_lower || []).map(toNumOrNull),
          flow_uncertainty_upper: (sumJson.flow_uncertainty_upper || []).map(toNumOrNull),
        };
      }
    } catch {
      // Optional summary endpoint unavailable
    }
  }

  let recentForecastRecords: GeoglowsForecastBundle['recentForecastRecords'] = null;
  if (recordsResp.status === 'fulfilled' && recordsResp.value.ok) {
    try {
      const recJson = (await recordsResp.value.json()) as {
        datetime?: string[];
        average_flow?: unknown[];
      };
      if (Array.isArray(recJson.datetime)) {
        recentForecastRecords = {
          datetime: recJson.datetime,
          average_flow: (recJson.average_flow || []).map(toNumOrNull),
        };
      }
    } catch {
      // Optional forecastrecords endpoint unavailable
    }
  }

  let peakMeanM3s: number | null = null;
  let peakMeanTime: string | null = null;
  let peakMedianM3s: number | null = null;
  let peakMedianTime: string | null = null;
  let peakMaxEnsembleM3s: number | null = null;
  let peakMaxEnsembleTime: string | null = null;

  datetime.forEach((dt, i) => {
    const avg = flowAvg[i];
    if (avg !== null && (peakMeanM3s === null || avg > peakMeanM3s)) {
      peakMeanM3s = avg;
      peakMeanTime = dt;
    }
    const med = flowMed[i];
    if (med !== null && (peakMedianM3s === null || med > peakMedianM3s)) {
      peakMedianM3s = med;
      peakMedianTime = dt;
    }
    const mx = flowMax[i];
    if (mx !== null && (peakMaxEnsembleM3s === null || mx > peakMaxEnsembleM3s)) {
      peakMaxEnsembleM3s = mx;
      peakMaxEnsembleTime = dt;
    }
  });

  const meta = statsJson.metadata || {};
  const result: GeoglowsForecastBundle = {
    linkno,
    issueDateRequested: resolvedDate || cleanDate,
    availableDates: dates,
    metadata: {
      river_id: Number(meta.river_id || linkno),
      gen_date: String(meta.gen_date || resolvedDate || ''),
      start_date: String(meta.start_date || datetime[0] || ''),
      end_date: String(meta.end_date || datetime[datetime.length - 1] || ''),
      units: 'm³/s',
      timezone: 'UTC',
      model: 'GEOGLOWS ECMWF River Forecast System v2',
      retrievedAt: new Date().toISOString(),
    },
    stats: {
      datetime,
      flow_min: flowMin,
      flow_25p: flow25,
      flow_med: flowMed,
      flow_avg: flowAvg,
      flow_75p: flow75,
      flow_max: flowMax,
      high_res: highRes,
    },
    forecastSummary,
    recentForecastRecords,
    peakStats: {
      peakMeanM3s,
      peakMeanTime,
      peakMedianM3s,
      peakMedianTime,
      peakMaxEnsembleM3s,
      peakMaxEnsembleTime,
      initialFlowM3s: flowAvg[0] ?? flowMed[0] ?? null,
    },
  };

  setCached(cacheKey, result, TTL_SHORT_MS);
  return result;
}

export async function getGeoglowsEnsembles(
  linkno: number,
  issueDate?: string | null
): Promise<GeoglowsEnsembleBundle> {
  const cleanDate = issueDate && /^\d{10}$/.test(issueDate) ? issueDate : null;
  const cacheKey = `ensembles:${linkno}:${cleanDate || 'latest'}`;
  const cached = getCached<GeoglowsEnsembleBundle>(cacheKey);
  if (cached) return cached;

  const dates = await getGeoglowsDates().catch(() => [] as string[]);
  const candidateDates: Array<string | null> = cleanDate
    ? [cleanDate]
    : [null, ...dates.slice(1, 4)];

  let json: Record<string, unknown> | null = null;
  let lastStatus: number | string = 'timeout';
  for (const cand of candidateDates) {
    const dateQs = cand ? `&date=${cand}` : '';
    try {
      const resp = await fetch(`${GEOGLOWS_API_BASE}/forecastensemble/${linkno}?format=json${dateQs}`, {
        signal: AbortSignal.timeout(22000),
      });
      if (resp.ok) {
        const parsed = (await resp.json()) as Record<string, unknown>;
        if (!parsed.error) {
          json = parsed;
          break;
        }
      }
      lastStatus = resp.status;
    } catch {
      lastStatus = 'timeout';
    }
  }
  if (!json || json.error) {
    throw new Error(String(json?.error || `GEOGLOWS forecastensemble failed (${lastStatus}) for LINKNO ${linkno}`));
  }

  const datetime = Array.isArray(json.datetime) ? (json.datetime as string[]) : [];
  const memberNames = Object.keys(json)
    .filter((k) => /^ensemble_\d+$/.test(k))
    .sort();

  const members: Record<string, Array<number | null>> = {};
  for (const name of memberNames) {
    const arr = Array.isArray(json[name]) ? (json[name] as unknown[]) : [];
    members[name] = arr.map(toNumOrNull);
  }

  const bundle: GeoglowsEnsembleBundle = {
    linkno,
    datetime,
    members,
    memberNames,
    retrievedAt: new Date().toISOString(),
  };
  setCached(cacheKey, bundle, TTL_SHORT_MS);
  return bundle;
}

export async function getGeoglowsHistorical(
  linkno: number,
  mode: GeoglowsHistoricalResponse['mode'],
  startDate?: string,
  endDate?: string
): Promise<GeoglowsHistoricalResponse> {
  const start = startDate && /^\d{8}$/.test(startDate) ? startDate : '20200101';
  const end = endDate && /^\d{8}$/.test(endDate) ? endDate : '';
  const cacheKey = `hist:${linkno}:${mode}:${start}:${end}`;
  const cached = getCached<GeoglowsHistoricalResponse>(cacheKey);
  if (cached) return cached;

  let endpoint = '';
  let label = '';
  let coverageNote = '';

  if (mode === 'daily') {
    endpoint = `${GEOGLOWS_API_BASE}/retrospectivedaily/${linkno}?format=json&start_date=${start}${end ? `&end_date=${end}` : ''}`;
    label = 'GEOGLOWS retrospective simulated streamflow (Daily)';
    coverageNote = `ERA5-forced retrospective daily simulation (${start}${end ? `–${end}` : '–present'}).`;
  } else if (mode === 'monthly') {
    endpoint = `${GEOGLOWS_API_BASE}/retrospectivemonthly/${linkno}?format=json&start_date=${start}${end ? `&end_date=${end}` : ''}`;
    label = 'GEOGLOWS retrospective simulated streamflow (Monthly)';
    coverageNote = `ERA5-forced retrospective monthly mean simulation (${start}${end ? `–${end}` : '–present'}).`;
  } else if (mode === 'annual') {
    endpoint = `${GEOGLOWS_API_BASE}/annualaverages/${linkno}?format=json`;
    label = 'GEOGLOWS retrospective simulated streamflow (Annual Averages 1940–2024)';
    coverageNote = 'Long-term annual mean simulated discharge from 1940 onward.';
  } else if (mode === 'monthly_climatology') {
    endpoint = `${GEOGLOWS_API_BASE}/monthlyaverages/${linkno}?format=json`;
    label = 'GEOGLOWS retrospective monthly climatology (Jan–Dec)';
    coverageNote = 'Multi-decadal monthly mean seasonal cycle derived from 1940–present simulation.';
  } else {
    endpoint = `${GEOGLOWS_API_BASE}/dailyaverages/${linkno}?format=json`;
    label = 'GEOGLOWS retrospective day-of-year climatology (366 days)';
    coverageNote = 'Day-of-year climatological mean derived from 1940–present simulation.';
  }

  const resp = await fetch(endpoint, { signal: AbortSignal.timeout(28000) });
  if (!resp.ok) {
    throw new Error(`GEOGLOWS historical endpoint returned HTTP ${resp.status}`);
  }
  const json = (await resp.json()) as Record<string, unknown>;
  if (json.error) throw new Error(String(json.error));

  const dates = Array.isArray(json.datetime) ? (json.datetime as unknown[]) : [];
  const flows = Array.isArray(json[String(linkno)])
    ? (json[String(linkno)] as unknown[])
    : [];

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const points: Array<{ date: string; flowM3s: number }> = [];

  for (let i = 0; i < Math.min(dates.length, flows.length); i++) {
    const val = Number(flows[i]);
    if (!Number.isFinite(val)) continue;
    let dateStr = String(dates[i]);
    if (mode === 'monthly_climatology') {
      const mIdx = Number(dates[i]) - 1;
      dateStr = MONTH_NAMES[mIdx] || dateStr;
    } else if (mode === 'annual') {
      dateStr = dateStr.slice(0, 4);
    } else if (mode === 'monthly') {
      dateStr = dateStr.slice(0, 7);
    } else {
      dateStr = dateStr.slice(0, 10);
    }
    points.push({ date: dateStr, flowM3s: Number(val.toFixed(2)) });
  }

  let sum = 0;
  let minM3s: number | null = null;
  let minDate: string | null = null;
  let maxM3s: number | null = null;
  let maxDate: string | null = null;

  for (const p of points) {
    sum += p.flowM3s;
    if (minM3s === null || p.flowM3s < minM3s) {
      minM3s = p.flowM3s;
      minDate = p.date;
    }
    if (maxM3s === null || p.flowM3s > maxM3s) {
      maxM3s = p.flowM3s;
      maxDate = p.date;
    }
  }

  const result: GeoglowsHistoricalResponse = {
    linkno,
    mode,
    label,
    sourceEndpoint: endpoint,
    units: 'm³/s',
    timezone: 'UTC',
    coverageNote,
    retrievedAt: new Date().toISOString(),
    points,
    summary: {
      count: points.length,
      meanM3s: points.length ? Number((sum / points.length).toFixed(2)) : null,
      minM3s,
      minDate,
      maxM3s,
      maxDate,
    },
  };

  setCached(cacheKey, result, TTL_LONG_MS);
  return result;
}

// ---------------------------------------------------------------------------
// 5. Return Periods (API First + Official GEOGLOWS v2 S3 Blosc/Zarr Store)
// ---------------------------------------------------------------------------
function lz4BlockDecompress(src: Buffer, outLen: number): Buffer {
  const dst = Buffer.alloc(outLen);
  let i = 0;
  let o = 0;
  while (i < src.length) {
    const token = src[i++];
    let litLen = token >>> 4;
    if (litLen === 15) {
      let s: number;
      do {
        s = src[i++];
        litLen += s;
      } while (s === 255);
    }
    src.copy(dst, o, i, i + litLen);
    i += litLen;
    o += litLen;
    if (i >= src.length) break;
    const offset = src.readUInt16LE(i);
    i += 2;
    let matchLen = (token & 0x0f) + 4;
    if ((token & 0x0f) === 15) {
      let s: number;
      do {
        s = src[i++];
        matchLen += s;
      } while (s === 255);
    }
    let mPos = o - offset;
    for (let k = 0; k < matchLen; k++) {
      dst[o++] = dst[mPos++];
    }
  }
  return dst;
}

function decompressBloscSlice(cSlice: Buffer, outLen: number, compcode: number): Buffer {
  if (cSlice.length === outLen) return cSlice;
  if (compcode === 1 || compcode === 2) return lz4BlockDecompress(cSlice, outLen);
  if (compcode === 4 || compcode === 5) return zlib.zstdDecompressSync(cSlice);
  throw new Error(`Unsupported Blosc compcode ${compcode}`);
}

function decodeBloscBuffer(buf: Buffer): Buffer {
  const flags = buf[2];
  const typesize = buf[3];
  const nbytes = buf.readUInt32LE(4);
  const blocksize = buf.readUInt32LE(8);
  const cbytes = buf.readUInt32LE(12);
  const doshuffle = (flags & 1) !== 0;
  const memcpy = (flags & 2) !== 0;
  const compcode = flags >>> 5;
  if (memcpy) return buf.subarray(16, 16 + nbytes);

  const nblocks = Math.ceil(nbytes / blocksize);
  const out = Buffer.alloc(nbytes);
  const bstarts = Array.from({ length: nblocks }, (_, b) => buf.readInt32LE(16 + b * 4));

  for (let b = 0; b < nblocks; b++) {
    const bOutLen = b === nblocks - 1 ? nbytes - b * blocksize : blocksize;
    const start = bstarts[b];
    const end = b + 1 < nblocks ? bstarts[b + 1] : cbytes;
    const blockBuf = buf.subarray(start, end);
    const outOffset = b * blocksize;

    const ct0 = blockBuf.readInt32LE(0);
    if (ct0 + 4 === blockBuf.length) {
      const raw = decompressBloscSlice(blockBuf.subarray(4), bOutLen, compcode);
      if (doshuffle && typesize > 1) {
        const nItems = Math.floor(bOutLen / typesize);
        for (let i = 0; i < nItems; i++) {
          for (let t = 0; t < typesize; t++) {
            out[outOffset + i * typesize + t] = raw[t * nItems + i];
          }
        }
      } else {
        raw.copy(out, outOffset);
      }
    } else {
      const streamOutLen = bOutLen / typesize;
      const streams: Buffer[] = [];
      let pos = 0;
      for (let t = 0; t < typesize; t++) {
        const ct = blockBuf.readInt32LE(pos);
        pos += 4;
        const cSlice = blockBuf.subarray(pos, pos + ct);
        pos += ct;
        streams.push(decompressBloscSlice(cSlice, streamOutLen, compcode));
      }
      for (let i = 0; i < streamOutLen; i++) {
        for (let t = 0; t < typesize; t++) {
          out[outOffset + i * typesize + t] = streams[t][i];
        }
      }
    }
  }
  return out;
}

const zarrChunkCache = new Map<string, Buffer>();
let riverIdIndexMap: Map<number, number> | null = null;
let riverIdPromise: Promise<Map<number, number>> | null = null;

async function getRiverIdIndexMap(): Promise<Map<number, number>> {
  if (riverIdIndexMap) return riverIdIndexMap;
  if (riverIdPromise) return riverIdPromise;

  riverIdPromise = (async () => {
    const map = new Map<number, number>();
    // Chunk 0 of river_id holds VPU 101–120 (including all VPU 103 Kenya/Tana 110xxxxxx reaches).
    // Check chunks 0..2 if needed; stop once we pass 120000000 or load chunk 0 first.
    for (let c = 0; c < 4; c++) {
      const resp = await fetch(`${GEOGLOWS_ZARR_BASE}/river_id/${c}`, {
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) break;
      const dec = decodeBloscBuffer(Buffer.from(await resp.arrayBuffer()));
      const n = dec.length / 4;
      const baseIdx = c * 213716;
      for (let i = 0; i < n; i++) {
        map.set(dec.readInt32LE(i * 4), baseIdx + i);
      }
      // If chunk 0 already contains VPU 103 (110xxxxxx), that's sufficient for Tana Basin
      if (map.has(110463955)) break;
    }
    riverIdIndexMap = map;
    return map;
  })();

  return riverIdPromise;
}

async function fetchZarrChunk(pathSuffix: string): Promise<Buffer> {
  const cached = zarrChunkCache.get(pathSuffix);
  if (cached) return cached;
  const resp = await fetch(`${GEOGLOWS_ZARR_BASE}/${pathSuffix}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) {
    throw new Error(`Zarr chunk ${pathSuffix} returned HTTP ${resp.status}`);
  }
  const dec = decodeBloscBuffer(Buffer.from(await resp.arrayBuffer()));
  zarrChunkCache.set(pathSuffix, dec);
  return dec;
}

export async function getGeoglowsReturnPeriods(
  linkno: number
): Promise<GeoglowsReturnPeriodsResponse> {
  const cacheKey = `rp:${linkno}`;
  const cached = getCached<GeoglowsReturnPeriodsResponse>(cacheKey);
  if (cached) return cached;

  let restNote: string | null = null;

  // 1. Try official REST endpoint first
  try {
    const apiResp = await fetch(`${GEOGLOWS_API_BASE}/returnperiods/${linkno}?format=json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (apiResp.ok) {
      const json = (await apiResp.json()) as Record<string, unknown>;
      if (!json.error && (json['2'] != null || json.return_period_2 != null)) {
        const result: GeoglowsReturnPeriodsResponse = {
          linkno,
          units: 'm³/s',
          method: 'Gumbel (GEV Type I)',
          source: 'GEOGLOWS REST API v2 (/api/v2/returnperiods)',
          restApiStatusNote: null,
          retrievedAt: new Date().toISOString(),
          thresholds: {
            rp2: toNumOrNull(json['2'] ?? json.return_period_2),
            rp5: toNumOrNull(json['5'] ?? json.return_period_5),
            rp10: toNumOrNull(json['10'] ?? json.return_period_10),
            rp25: toNumOrNull(json['25'] ?? json.return_period_25),
            rp50: toNumOrNull(json['50'] ?? json.return_period_50),
            rp100: toNumOrNull(json['100'] ?? json.return_period_100),
          },
          gumbelDaily: null,
          maxSimulatedM3s: toNumOrNull(json.max_simulated),
        };
        setCached(cacheKey, result, TTL_LONG_MS);
        return result;
      }
      if (json.error) restNote = String(json.error);
    } else {
      const errTxt = await apiResp.text().catch(() => '');
      restNote = `REST /v2/returnperiods HTTP ${apiResp.status}${errTxt ? `: ${errTxt.slice(0, 140)}` : ''}`;
    }
  } catch (err) {
    restNote = err instanceof Error ? err.message : 'REST returnperiods unavailable';
  }

  // 2. Read directly from the official GEOGLOWS v2 S3 Return Periods Zarr store
  const idxMap = await getRiverIdIndexMap();
  const globalIdx = idxMap.get(linkno);
  if (globalIdx === undefined) {
    throw new Error(`LINKNO ${linkno} not found in GEOGLOWS v2 return-periods Zarr index.`);
  }

  const gChunk = Math.floor(globalIdx / 40000);
  const gLocal = globalIdx % 40000;

  const [gumbelDec, gumbelDailyDec, maxDec] = await Promise.all([
    fetchZarrChunk(`gumbel/0.${gChunk}`),
    fetchZarrChunk(`gumbel_daily/0.${gChunk}`),
    fetchZarrChunk(`max_simulated/${Math.floor(globalIdx / 40000)}`).catch(() => null),
  ]);

  const cols = gumbelDec.length / (6 * 8);
  const readGumbel = (dec: Buffer) => ({
    rp2: Number(dec.readDoubleLE((0 * cols + gLocal) * 8).toFixed(2)),
    rp5: Number(dec.readDoubleLE((1 * cols + gLocal) * 8).toFixed(2)),
    rp10: Number(dec.readDoubleLE((2 * cols + gLocal) * 8).toFixed(2)),
    rp25: Number(dec.readDoubleLE((3 * cols + gLocal) * 8).toFixed(2)),
    rp50: Number(dec.readDoubleLE((4 * cols + gLocal) * 8).toFixed(2)),
    rp100: Number(dec.readDoubleLE((5 * cols + gLocal) * 8).toFixed(2)),
  });

  const maxSimulatedM3s = maxDec
    ? Number(maxDec.readDoubleLE(gLocal * 8).toFixed(2))
    : null;

  const result: GeoglowsReturnPeriodsResponse = {
    linkno,
    units: 'm³/s',
    method: 'Gumbel (GEV Type I, Method of Moments on 1940–present annual maxima)',
    source: 'GEOGLOWS v2 Official Return Periods Store (geoglows-v2 S3 return-periods.zarr rev.4)',
    restApiStatusNote: restNote
      ? `Upstream REST /v2/returnperiods returned schema mismatch (${restNote}); resolved directly from official GEOGLOWS v2 Zarr store.`
      : null,
    retrievedAt: new Date().toISOString(),
    thresholds: readGumbel(gumbelDec),
    gumbelDaily: readGumbel(gumbelDailyDec),
    maxSimulatedM3s,
  };

  setCached(cacheKey, result, TTL_LONG_MS);
  return result;
}

// ---------------------------------------------------------------------------
// 6. Reach Location Basin Context Probe (FlowWatch EO & Terrain GeoTIFFs)
// ---------------------------------------------------------------------------
async function probeGeoTiffBands(
  itemId: string,
  lon: number,
  lat: number
): Promise<Array<number | null>> {
  try {
    const tiff = await fromUrl(`${PORTAL_ITEMS_BASE}/${itemId}/data`);
    const img = await tiff.getImage(0);
    const [xmin, ymin, xmax, ymax] = img.getBoundingBox();
    if (lon < xmin || lon > xmax || lat < ymin || lat > ymax) return [];
    const w = img.getWidth();
    const h = img.getHeight();
    const px = Math.min(w - 1, Math.max(0, Math.floor(((lon - xmin) / (xmax - xmin)) * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor(((ymax - lat) / (ymax - ymin)) * h)));
    const spp = img.getSamplesPerPixel();
    const nodata = img.getGDALNoData();
    const rasters = await img.readRasters({ window: [px, py, px + 1, py + 1] });
    const out: Array<number | null> = [];
    for (let b = 0; b < spp; b++) {
      const v = Number((rasters[b] as ArrayLike<number>)[0]);
      const isNd =
        !Number.isFinite(v) ||
        (nodata !== null &&
          nodata !== undefined &&
          (Number.isNaN(nodata) ? Number.isNaN(v) : Math.abs(v - nodata) < 1e-6));
      out.push(isNd ? null : v);
    }
    return out;
  } catch {
    return [];
  }
}

const WORLDCOVER_LABELS: Record<number, string> = {
  10: 'Tree cover',
  20: 'Shrubland',
  30: 'Grassland',
  40: 'Cropland',
  50: 'Built-up',
  60: 'Bare / sparse vegetation',
  70: 'Snow and ice',
  80: 'Permanent water bodies',
  90: 'Herbaceous wetland',
  95: 'Mangroves',
  100: 'Moss and lichen',
};

export async function getGeoglowsReachContext(
  linkno: number,
  lon: number,
  lat: number
): Promise<GeoglowsReachContextResponse> {
  const cacheKey = `ctx:${linkno}:${lon.toFixed(3)}:${lat.toFixed(3)}`;
  const cached = getCached<GeoglowsReachContextResponse>(cacheKey);
  if (cached) return cached;

  const [
    chirpsAnom,
    chirpsSeas26,
    chirpsSeasClim,
    era5SmAnom,
    era5SmRecent,
    era5SmBase,
    era5Temp,
    era5Pet,
    dem,
    slope,
    hand,
    upa,
    jrcOcc,
    landCover,
    pop25,
    built20,
  ] = await Promise.all([
    probeGeoTiffBands('8c53d070230d44b5a5368359d8e0aba4', lon, lat),
    probeGeoTiffBands('483fa00e14574b69b296909a5ff1023f', lon, lat),
    probeGeoTiffBands('0cafb49664b64d8281fa7f4dda734e97', lon, lat),
    probeGeoTiffBands('32caa1f895204faba25499c3be8530be', lon, lat),
    probeGeoTiffBands('aae7a128735f477fbb97552f7e6598b9', lon, lat),
    probeGeoTiffBands('17c6ec596303422eb2bf62b9aa89f73f', lon, lat),
    probeGeoTiffBands('3a82b3ab720d4b00a0db20b4c2fdc0f6', lon, lat),
    probeGeoTiffBands('ba9a885ac8d34fb4b026dd898bafd2d8', lon, lat),
    probeGeoTiffBands('7d997cccb0754d1bad502d99b6a03698', lon, lat),
    probeGeoTiffBands('4004c9ec8ec14b13bbcee3a19c2694c5', lon, lat),
    probeGeoTiffBands('69c37b1d239f49b9aa6daf3126b36fe9', lon, lat),
    probeGeoTiffBands('c853b62a787c45e9a4431594d27ccfbb', lon, lat),
    probeGeoTiffBands('1a4acb0eaad34c3ba6ed0804eae7be15', lon, lat),
    probeGeoTiffBands('85dee424a76a43ca96d1657f8f4e28bf', lon, lat),
    probeGeoTiffBands('8eb142a239f34993a72180478bb6c9f3', lon, lat),
    probeGeoTiffBands('728dfadc55264d899e84dfc42255a5ab', lon, lat),
  ]);

  const lcCode = landCover[0] !== null && landCover[0] !== undefined ? Math.round(landCover[0]) : null;

  const result: GeoglowsReachContextResponse = {
    linkno,
    probeCoord: [Number(lon.toFixed(5)), Number(lat.toFixed(5))],
    spatialScopeNote:
      'Values sampled from native grid cells at the reach corridor coordinate (0.05° CHIRPS, 0.10° ERA5-Land, 30–90 m terrain, 10–100 m exposure). Point/corridor pixels represent local reach surroundings rather than full upstream watershed polygon averages.',
    retrievedAt: new Date().toISOString(),
    climate: {
      chirpsYtd2026Mm: chirpsAnom[0] ?? null,
      chirpsYtdBaselineMm: chirpsAnom[1] ?? null,
      chirpsAnomMm: chirpsAnom[2] ?? null,
      chirpsAnomPct: chirpsAnom[3] ?? null,
      chirpsAnomZ: chirpsAnom[4] ?? null,
      chirpsMam2026Mm: chirpsSeas26[1] ?? null,
      chirpsMamClimMm: chirpsSeasClim[1] ?? null,
    },
    soil: {
      smRootZone2026: era5SmRecent[4] ?? null,
      smRootZoneBaseline: era5SmBase[4] ?? null,
      smRootZoneAnom: era5SmAnom[4] ?? null,
      smRootZoneZ: era5SmAnom[5] ?? null,
      temp2026C: era5Temp[0] ?? null,
      pet2026MmDay: era5Pet[0] ?? null,
    },
    terrainAndWater: {
      elevationM: dem[0] ?? null,
      slopeDeg: slope[0] ?? null,
      handM: hand[0] ?? null,
      terrainUpaKm2: upa[0] ?? null,
      jrcWaterOccurrencePct: jrcOcc[0] ?? null,
      landCoverCode: lcCode,
      landCoverLabel: lcCode !== null ? WORLDCOVER_LABELS[lcCode] || `Class ${lcCode}` : null,
      population2025Cell: pop25[0] ?? null,
      builtUp2020Pct: built20[0] ?? null,
    },
  };

  setCached(cacheKey, result, TTL_SHORT_MS);
  return result;
}
