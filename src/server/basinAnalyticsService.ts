import fs from 'fs';
import proj4 from 'proj4';
import { fromUrl, type GeoTIFF } from 'geotiff';
import {
  getGeoglowsForecast,
  getGeoglowsHistorical,
  getGeoglowsReturnPeriods,
  getTanaGeoglowsReachIndex,
  PORTAL_ITEMS_BASE,
  validateLinknoInBasin,
} from './geoglowsService.ts';
import type {
  BasinZonalStatsResponse,
  EnsoSeasonRecord,
  EnsoStatusResponse,
  ExposureScreeningResult,
  NearbyVectorFeature,
  StreamflowAnalysisResult,
  StreamflowSignalClass,
  SubBasinPolygon,
  SubBasinZonalStats,
  SubBasinsResponse,
  ZonalMetricSummary,
} from '../types/geospatial';

const HYDROBASINS_L7_URL =
  'https://services2.arcgis.com/wwKl7HyGwhVWeWyy/arcgis/rest/services/HydroBasins_Pfafstetter_Level7_with_lakes_Africa/FeatureServer/0';
const UPPER_TANA_HYBAS_IDS = [1071144170, 1071163050, 1071163110, 1071164250, 1071164400];

const KENYA_TOWNS_LAYER_URL =
  'https://services8.arcgis.com/oTalEaSXAuyNT7xf/arcgis/rest/services/Kenya_Towns/FeatureServer/0';
const KENYA_HEALTH_LAYER_URL =
  'https://services8.arcgis.com/oTalEaSXAuyNT7xf/arcgis/rest/services/KenyaHealthFacilities2026/FeatureServer/0';
const KENYA_SCHOOLS_LAYER_URL =
  'https://services8.arcgis.com/oTalEaSXAuyNT7xf/arcgis/rest/services/Kenya_Primary_Schools/FeatureServer/0';

const NOAA_ONI_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';

const SUBBASIN_DISK_CACHE = '/tmp/flowwatch-tana-subbasins-v1.json';
const ZONAL_DISK_CACHE = '/tmp/flowwatch-tana-zonal-stats-v1.json';

const UTM37S_PROJ = '+proj=utm +zone=37 +south +datum=WGS84 +units=m +no_defs';
const WGS84_PROJ = 'EPSG:4326';

const TTL_6H = 1000 * 60 * 60 * 6;
const TTL_15M = 1000 * 60 * 15;

const cache = new Map<string, { data: unknown; ts: number; ttl: number }>();

function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > hit.ttl) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}

function setCached(key: string, data: unknown, ttl: number) {
  cache.set(key, { data, ts: Date.now(), ttl });
}

function toUtm(lon: number, lat: number): [number, number] {
  return proj4(WGS84_PROJ, UTM37S_PROJ, [lon, lat]);
}

function isNoData(val: number, nodata: number | null): boolean {
  if (!Number.isFinite(val)) return true;
  if (nodata === null || nodata === undefined) return false;
  if (Number.isNaN(nodata)) return Number.isNaN(val);
  return Math.abs(val - nodata) < 1e-6;
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonRings(lon: number, lat: number, rings: number[][][]): boolean {
  if (!rings.length) return false;
  // Standard GeoJSON/ArcGIS parity rule: point inside odd number of rings
  let count = 0;
  for (const ring of rings) {
    if (pointInRing(lon, lat, ring)) count++;
  }
  return count % 2 === 1;
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

function minDistToUtmSegments(
  px: number,
  py: number,
  segs: Array<[number, number, number, number]>
): number {
  let best = Infinity;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const d = pointToSegDist(px, py, s[0], s[1], s[2], s[3]);
    if (d < best) best = d;
  }
  return best;
}

function computePolygonBboxAndCentroid(rings: number[][][]): {
  bbox: [number, number, number, number];
  centroid: [number, number];
} {
  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < xmin) xmin = x;
      if (y < ymin) ymin = y;
      if (x > xmax) xmax = x;
      if (y > ymax) ymax = y;
      sumX += x;
      sumY += y;
      count++;
    }
  }
  return {
    bbox: [xmin, ymin, xmax, ymax],
    centroid: count > 0 ? [Number((sumX / count).toFixed(4)), Number((sumY / count).toFixed(4))] : [37.6, -0.4],
  };
}

// ---------------------------------------------------------------------------
// 1. Real 5-Sub-Basin Upper Tana HydroBASINS Level-7 Multipolygon AOI
// ---------------------------------------------------------------------------
const SUBBASIN_ROLE_META: Record<number, { label: string; role: string }> = {
  1071164400: {
    label: 'Mt. Kenya West / Upper Sagana–Nyeri Headwaters',
    role: 'Highland headwater source feeding Sagana and Masinga inflows',
  },
  1071164250: {
    label: 'Upper Tana & Seven Forks Reservoir Corridor',
    role: 'Mainstem storage & hydropower cascade corridor (Masinga–Kiambere)',
  },
  1071163110: {
    label: 'Thika–Chania Southern Tributary Catchment',
    role: 'Southern Aberdare drainage joining the Tana cascade system',
  },
  1071163050: {
    label: 'Upper-Middle Southern Tributaries (Yatta / Tiva)',
    role: 'Semi-arid southern feeder tributaries below the upper highlands',
  },
  1071144170: {
    label: 'Mt. Kenya East & Lower Upper-Tana Plains',
    role: 'Eastern slopes (Thuchi/Mutonga/Kathita) and upper-middle valley outlet',
  },
};

export async function getTanaSubBasins(forceRefresh = false): Promise<SubBasinsResponse> {
  if (!forceRefresh) {
    const mem = getCached<SubBasinsResponse>('tana-subbasins');
    if (mem) return mem;
    try {
      if (fs.existsSync(SUBBASIN_DISK_CACHE)) {
        const st = fs.statSync(SUBBASIN_DISK_CACHE);
        if (Date.now() - st.mtimeMs < TTL_6H) {
          const parsed = JSON.parse(fs.readFileSync(SUBBASIN_DISK_CACHE, 'utf8')) as SubBasinsResponse;
          if (parsed?.subBasins?.length === 5) {
            setCached('tana-subbasins', parsed, TTL_6H);
            return parsed;
          }
        }
      }
    } catch {
      // rebuild cache
    }
  }

  const where = `HYBAS_ID IN (${UPPER_TANA_HYBAS_IDS.join(',')})`;
  const qs = new URLSearchParams({
    where,
    outFields: 'HYBAS_ID,PFAF_ID,MAIN_BAS,NEXT_DOWN,SUB_AREA,UP_AREA',
    outSR: '4326',
    returnGeometry: 'true',
    maxAllowableOffset: '0.0008',
    f: 'json',
  });

  const [hbResp, reachIndex] = await Promise.all([
    fetch(`${HYDROBASINS_L7_URL}/query?${qs.toString()}`, { signal: AbortSignal.timeout(20000) }),
    getTanaGeoglowsReachIndex(),
  ]);

  if (!hbResp.ok) {
    throw new Error(`HydroBASINS Level 7 service returned HTTP ${hbResp.status}`);
  }
  const hbJson = (await hbResp.json()) as {
    features?: Array<{
      attributes: Record<string, number>;
      geometry?: { rings?: number[][][] };
    }>;
    error?: { message: string };
  };
  if (hbJson.error) throw new Error(hbJson.error.message);

  const features = hbJson.features || [];
  const subBasins: SubBasinPolygon[] = features
    .map((f) => {
      const a = f.attributes;
      const hybasId = Number(a.HYBAS_ID);
      const pfafId = Number(a.PFAF_ID);
      const rings = (f.geometry?.rings || []).map((ring) =>
        ring.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))])
      );
      const { bbox, centroid } = computePolygonBboxAndCentroid(rings);

      const reachesInside = reachIndex.reaches.filter(
        (r) =>
          r.centroid[0] >= bbox[0] &&
          r.centroid[0] <= bbox[2] &&
          r.centroid[1] >= bbox[1] &&
          r.centroid[1] <= bbox[3] &&
          pointInPolygonRings(r.centroid[0], r.centroid[1], rings)
      );

      const riverNameCounts = new Map<string, number>();
      for (const r of reachesInside) {
        for (const nm of r.matchedLocalNames) {
          riverNameCounts.set(nm, (riverNameCounts.get(nm) || 0) + 1);
        }
      }
      const primaryRivers = Array.from(riverNameCounts.entries())
        .sort((x, y) => y[1] - x[1])
        .slice(0, 5)
        .map(([nm]) => nm);

      const topReach = reachesInside[0] || null; // already sorted descending by upstreamAreaKm2
      const roleMeta = SUBBASIN_ROLE_META[hybasId];
      const fallbackName =
        primaryRivers.length > 0
          ? `Pfafstetter ${pfafId} (${primaryRivers.slice(0, 2).join(' / ')})`
          : `Pfafstetter Sub-Basin ${pfafId}`;

      return {
        hybasId,
        pfafId,
        mainBas: Number(a.MAIN_BAS),
        nextDown: Number(a.NEXT_DOWN),
        name: roleMeta?.label || fallbackName,
        hydrologicRole:
          roleMeta?.role ||
          `HydroBASINS Level-7 sub-catchment (${Number(a.SUB_AREA || 0).toFixed(0)} km²)`,
        subAreaKm2: Number(a.SUB_AREA || 0),
        upAreaKm2: Number(a.UP_AREA || 0),
        centroid,
        bbox,
        rings,
        matchedReachCount: reachesInside.length,
        primaryRivers,
        topReachLinkno: topReach ? topReach.linkno : null,
      };
    })
    .sort((a, b) => b.subAreaKm2 - a.subAreaKm2);

  const totalSubAreaKm2 = Number(
    subBasins.reduce((s, b) => s + b.subAreaKm2, 0).toFixed(1)
  );

  const result: SubBasinsResponse = {
    sourceService: HYDROBASINS_L7_URL,
    geometryProvenance:
      'HydroBASINS Pfafstetter Level-7 Africa (MAIN_BAS = 1070008470, 5 Upper Tana polygons matched at 98–100% pixel mask agreement against analytical AOI GeoTIFFs)',
    totalSubAreaKm2,
    subBasins,
    generatedAt: new Date().toISOString(),
  };

  setCached('tana-subbasins', result, TTL_6H);
  try {
    fs.writeFileSync(SUBBASIN_DISK_CACHE, JSON.stringify(result), 'utf8');
  } catch {
    // non-fatal
  }
  return result;
}

// ---------------------------------------------------------------------------
// 2. Polygon-Masked Sub-Basin Zonal Statistics from Analytical GeoTIFFs
// ---------------------------------------------------------------------------
interface PreparedRasterBandGrid {
  bbox: [number, number, number, number];
  width: number;
  height: number;
  nodata: number | null;
  resolutionNote: string;
  bands: ArrayLike<number>[];
}

async function readGeoTiffGrid(
  itemId: string,
  targetMaxDim = 320,
  sampleBands?: number[]
): Promise<PreparedRasterBandGrid> {
  const tiff: GeoTIFF = await fromUrl(`${PORTAL_ITEMS_BASE}/${itemId}/data`);
  // CRITICAL: Always read bbox and nodata from base image 0; overview images lack affine tags
  const baseImg = await tiff.getImage(0);
  const bbox = baseImg.getBoundingBox() as [number, number, number, number];
  const nodata = baseImg.getGDALNoData();
  const baseW = baseImg.getWidth();
  const baseH = baseImg.getHeight();

  const imgCount = await tiff.getImageCount();
  let chosen = baseImg;
  if (imgCount > 1 && Math.max(baseW, baseH) > targetMaxDim * 1.4) {
    for (let i = 0; i < imgCount; i++) {
      const cand = await tiff.getImage(i);
      chosen = cand;
      if (Math.max(cand.getWidth(), cand.getHeight()) <= targetMaxDim * 1.35) {
        break;
      }
    }
  }

  let width = chosen.getWidth();
  let height = chosen.getHeight();
  const rasters = await chosen.readRasters(
    sampleBands ? { samples: sampleBands } : undefined
  );
  const resDegLon = (bbox[2] - bbox[0]) / width;
  const approxMeters = Math.round(resDegLon * 111320);
  const resolutionNote =
    approxMeters >= 1000
      ? `~${(approxMeters / 1000).toFixed(1)} km (${resDegLon.toFixed(3)}°)`
      : `~${approxMeters} m sampled grid (${width}×${height})`;

  const bands: ArrayLike<number>[] = [];
  for (let i = 0; i < rasters.length; i++) {
    bands.push(rasters[i] as ArrayLike<number>);
  }

  return { bbox, width, height, nodata, resolutionNote, bands };
}

function summarizeMaskOnBand(
  grid: PreparedRasterBandGrid,
  bandIndex: number,
  cellIndices: number[]
): ZonalMetricSummary {
  const arr = grid.bands[bandIndex];
  if (!arr || !cellIndices.length) {
    return {
      mean: null,
      min: null,
      max: null,
      validPixelCount: 0,
      resolutionNote: grid.resolutionNote,
    };
  }
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let valid = 0;
  for (let i = 0; i < cellIndices.length; i++) {
    const v = Number(arr[cellIndices[i]]);
    if (isNoData(v, grid.nodata)) continue;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    valid++;
  }
  if (valid === 0) {
    return {
      mean: null,
      min: null,
      max: null,
      validPixelCount: 0,
      resolutionNote: grid.resolutionNote,
    };
  }
  return {
    mean: Number((sum / valid).toFixed(4)),
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    validPixelCount: valid,
    resolutionNote: grid.resolutionNote,
  };
}

function mapCellsToSubBasins(
  grid: PreparedRasterBandGrid,
  subBasins: SubBasinPolygon[]
): { allCells: number[]; byHybas: Map<number, number[]> } {
  const [xmin, ymin, xmax, ymax] = grid.bbox;
  const dx = (xmax - xmin) / grid.width;
  const dy = (ymax - ymin) / grid.height;
  const byHybas = new Map<number, number[]>();
  subBasins.forEach((sb) => byHybas.set(sb.hybasId, []));
  const allCells: number[] = [];

  for (let r = 0; r < grid.height; r++) {
    const lat = ymax - (r + 0.5) * dy;
    for (let c = 0; c < grid.width; c++) {
      const lon = xmin + (c + 0.5) * dx;
      const idx = r * grid.width + c;
      let matchedAny = false;
      for (const sb of subBasins) {
        if (
          lon >= sb.bbox[0] &&
          lon <= sb.bbox[2] &&
          lat >= sb.bbox[1] &&
          lat <= sb.bbox[3] &&
          pointInPolygonRings(lon, lat, sb.rings)
        ) {
          byHybas.get(sb.hybasId)!.push(idx);
          matchedAny = true;
        }
      }
      if (matchedAny) allCells.push(idx);
    }
  }

  // Fallback for very small polygons under 0.10 deg (~11 km) ERA5 cells if 0 pixel centers landed strictly inside
  for (const sb of subBasins) {
    const list = byHybas.get(sb.hybasId)!;
    if (list.length === 0) {
      for (let r = 0; r < grid.height; r++) {
        const lat = ymax - (r + 0.5) * dy;
        for (let c = 0; c < grid.width; c++) {
          const lon = xmin + (c + 0.5) * dx;
          if (
            lon + dx * 0.5 >= sb.bbox[0] &&
            lon - dx * 0.5 <= sb.bbox[2] &&
            lat + dy * 0.5 >= sb.bbox[1] &&
            lat - dy * 0.5 <= sb.bbox[3]
          ) {
            list.push(r * grid.width + c);
          }
        }
      }
    }
  }

  return { allCells, byHybas };
}

export async function getSubBasinZonalStats(
  forceRefresh = false
): Promise<BasinZonalStatsResponse> {
  if (!forceRefresh) {
    const mem = getCached<BasinZonalStatsResponse>('tana-zonal-stats');
    if (mem) return mem;
    try {
      if (fs.existsSync(ZONAL_DISK_CACHE)) {
        const st = fs.statSync(ZONAL_DISK_CACHE);
        if (Date.now() - st.mtimeMs < TTL_6H) {
          const parsed = JSON.parse(
            fs.readFileSync(ZONAL_DISK_CACHE, 'utf8')
          ) as BasinZonalStatsResponse;
          if (parsed?.bySubBasin?.length === 5) {
            setCached('tana-zonal-stats', parsed, TTL_6H);
            return parsed;
          }
        }
      }
    } catch {
      // recompute
    }
  }

  const subBasinsResp = await getTanaSubBasins();
  const subBasins = subBasinsResp.subBasins;

  const [
    chirpsAnom,
    chirpsSeas26,
    chirpsSeasClim,
    chirpsMon26,
    chirpsMonClim,
    era5SmRecent,
    era5SmBase,
    era5SmAnom,
    era5Pet,
    era5Temp,
    demGrid,
    slopeGrid,
    handGrid,
  ] = await Promise.all([
    readGeoTiffGrid('8c53d070230d44b5a5368359d8e0aba4', 200),
    readGeoTiffGrid('483fa00e14574b69b296909a5ff1023f', 200),
    readGeoTiffGrid('0cafb49664b64d8281fa7f4dda734e97', 200),
    readGeoTiffGrid('92899763f4b3421f82de9af25db450c9', 200),
    readGeoTiffGrid('eac5ea7f479b409d80f69dda9b608609', 200),
    readGeoTiffGrid('aae7a128735f477fbb97552f7e6598b9', 200),
    readGeoTiffGrid('17c6ec596303422eb2bf62b9aa89f73f', 200),
    readGeoTiffGrid('32caa1f895204faba25499c3be8530be', 200),
    readGeoTiffGrid('ba9a885ac8d34fb4b026dd898bafd2d8', 200),
    readGeoTiffGrid('3a82b3ab720d4b00a0db20b4c2fdc0f6', 200),
    readGeoTiffGrid('7d997cccb0754d1bad502d99b6a03698', 320, [0]),
    readGeoTiffGrid('4004c9ec8ec14b13bbcee3a19c2694c5', 320, [0]),
    readGeoTiffGrid('69c37b1d239f49b9aa6daf3126b36fe9', 320, [0]),
  ]);

  const chirpsMap = mapCellsToSubBasins(chirpsAnom, subBasins);
  const era5Map = mapCellsToSubBasins(era5SmAnom, subBasins);
  const demMap = mapCellsToSubBasins(demGrid, subBasins);
  const handMap = mapCellsToSubBasins(handGrid, subBasins);

  const buildRow = (
    hybasId: number | 'all',
    name: string,
    subAreaKm2: number,
    cCells: number[],
    eCells: number[],
    dCells: number[],
    hCells: number[]
  ): SubBasinZonalStats => {
    const mon26Means: Array<number | null> = [];
    for (let m = 0; m < 12; m++) {
      if (m < chirpsMon26.bands.length) {
        mon26Means.push(summarizeMaskOnBand(chirpsMon26, m, cCells).mean);
      } else {
        mon26Means.push(null); // Oct-Dec 2026 unavailable
      }
    }
    const monClimMeans: Array<number | null> = [];
    for (let m = 0; m < 12; m++) {
      monClimMeans.push(summarizeMaskOnBand(chirpsMonClim, m, cCells).mean);
    }

    return {
      hybasId,
      name,
      subAreaKm2,
      chirpsYtd2026Mm: summarizeMaskOnBand(chirpsAnom, 0, cCells),
      chirpsYtdBaselineMm: summarizeMaskOnBand(chirpsAnom, 1, cCells),
      chirpsAnomMm: summarizeMaskOnBand(chirpsAnom, 2, cCells),
      chirpsAnomPct: summarizeMaskOnBand(chirpsAnom, 3, cCells),
      chirpsAnomZ: summarizeMaskOnBand(chirpsAnom, 4, cCells),
      chirpsMam2026Mm: summarizeMaskOnBand(chirpsSeas26, 1, cCells),
      chirpsMamClimMm: summarizeMaskOnBand(chirpsSeasClim, 1, cCells),
      chirpsMonthly2026Means: mon26Means,
      chirpsMonthlyClimMeans: monClimMeans,
      era5SmRootZone2026: summarizeMaskOnBand(era5SmRecent, 4, eCells),
      era5SmRootZoneBaseline: summarizeMaskOnBand(era5SmBase, 4, eCells),
      era5SmRootZoneAnom: summarizeMaskOnBand(era5SmAnom, 4, eCells),
      era5SmRootZoneZ: summarizeMaskOnBand(era5SmAnom, 5, eCells),
      era5Pet2026MmDay: summarizeMaskOnBand(era5Pet, 0, eCells),
      era5PetBaseMmDay: summarizeMaskOnBand(era5Pet, 1, eCells),
      era5Temp2026C: summarizeMaskOnBand(era5Temp, 0, eCells),
      demElevationM: summarizeMaskOnBand(demGrid, 0, dCells),
      slopeDeg: summarizeMaskOnBand(slopeGrid, 0, dCells),
      handM: summarizeMaskOnBand(handGrid, 0, hCells),
    };
  };

  const basinWide = buildRow(
    'all',
    'All 5 Upper Tana Sub-Basins (AOI Union)',
    subBasinsResp.totalSubAreaKm2,
    chirpsMap.allCells,
    era5Map.allCells,
    demMap.allCells,
    handMap.allCells
  );

  const bySubBasin = subBasins.map((sb) =>
    buildRow(
      sb.hybasId,
      sb.name,
      sb.subAreaKm2,
      chirpsMap.byHybas.get(sb.hybasId) || [],
      era5Map.byHybas.get(sb.hybasId) || [],
      demMap.byHybas.get(sb.hybasId) || [],
      handMap.byHybas.get(sb.hybasId) || []
    )
  );

  const response: BasinZonalStatsResponse = {
    retrievedAt: new Date().toISOString(),
    analysisWindow: '2026 YTD (Jan–Sep; Oct–Dec excluded)',
    baselinePeriod: '2001–2025 matched climatological baseline',
    basinWide,
    bySubBasin,
  };

  setCached('tana-zonal-stats', response, TTL_6H);
  try {
    fs.writeFileSync(ZONAL_DISK_CACHE, JSON.stringify(response), 'utf8');
  } catch {
    // non-fatal
  }
  return response;
}

// ---------------------------------------------------------------------------
// 3. Authoritative NOAA CPC Oceanic Niño Index (ONI)
// ---------------------------------------------------------------------------
export async function getEnsoStatus(): Promise<EnsoStatusResponse> {
  const cached = getCached<EnsoStatusResponse>('noaa-oni');
  if (cached) return cached;

  const basePayload = {
    sourceName: 'NOAA Climate Prediction Center — Oceanic Niño Index (ERSST.v5 Niño 3.4)',
    sourceUrl: NOAA_ONI_URL,
    thresholdDefinition:
      'NOAA CPC threshold: ONI >= +0.5 °C indicates El Niño conditions; <= -0.5 °C indicates La Niña conditions; between -0.5 °C and +0.5 °C indicates ENSO-Neutral.',
    tanaSeasonCaveat:
      'Upper Tana hydrological impact caveat: El Niño events often coincide with wetter-than-average OND Short Rains in East Africa, while Long Rains (MAM) modulation is weaker and sub-basin response varies markedly by topography and local convection.',
  };

  try {
    const resp = await fetch(NOAA_ONI_URL, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) {
      throw new Error(`NOAA CPC ONI returned HTTP ${resp.status}`);
    }
    const text = await resp.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('SEAS'));

    const records: EnsoSeasonRecord[] = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;
      const seasonCode = parts[0];
      const year = parseInt(parts[1], 10);
      const sstTotalC = parseFloat(parts[2]);
      const oniAnomalyC = parseFloat(parts[3]);
      if (!Number.isFinite(year) || !Number.isFinite(oniAnomalyC)) continue;
      const phase: EnsoSeasonRecord['phase'] =
        oniAnomalyC >= 0.5 ? 'El Niño' : oniAnomalyC <= -0.5 ? 'La Niña' : 'Neutral';
      records.push({
        seasonCode,
        year,
        sstTotalC: Number(sstTotalC.toFixed(2)),
        oniAnomalyC: Number(oniAnomalyC.toFixed(2)),
        phase,
      });
    }

    const latestSeason = records.length > 0 ? records[records.length - 1] : null;
    const recentSeasons = records.slice(-12);

    const result: EnsoStatusResponse = {
      ...basePayload,
      latestSeason,
      recentSeasons,
      status: 'available',
      retrievedAt: new Date().toISOString(),
    };
    setCached('noaa-oni', result, TTL_6H);
    return result;
  } catch (err) {
    return {
      ...basePayload,
      latestSeason: null,
      recentSeasons: [],
      status: 'error',
      errorMessage: err instanceof Error ? err.message : 'NOAA CPC ONI feed unavailable',
      retrievedAt: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// 4. Verified GEOGLOWS Reach Analysis (Percentiles, HRES Separation, RP Duration)
// ---------------------------------------------------------------------------
function empiricalQuantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return Number((sorted[base] + rest * (sorted[base + 1] - sorted[base])).toFixed(2));
  }
  return Number(sorted[base].toFixed(2));
}

export async function getGeoglowsReachAnalysis(
  linkno: number,
  issueDate?: string | null
): Promise<StreamflowAnalysisResult> {
  const cleanDate = issueDate && /^\d{10}$/.test(issueDate) ? issueDate : null;
  const cacheKey = `analysis:${linkno}:${cleanDate || 'latest'}`;
  const cached = getCached<StreamflowAnalysisResult>(cacheKey);
  if (cached) return cached;

  const [forecast, histMonthly, rp] = await Promise.all([
    getGeoglowsForecast(linkno, cleanDate),
    getGeoglowsHistorical(linkno, 'monthly', '19400101', '20261231'),
    getGeoglowsReturnPeriods(linkno),
  ]);

  const sortedHist = histMonthly.points
    .map((p) => p.flowM3s)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  // Identify calendar month of peak median forecast (or start date)
  const peakTimeStr =
    forecast.peakStats.peakMedianTime || forecast.metadata.start_date || '';
  const monthNum = parseInt(peakTimeStr.slice(5, 7), 10);
  const forecastMonth = Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthNum : 1;
  const monthPadded = String(forecastMonth).padStart(2, '0');

  const sameMonthSorted = histMonthly.points
    .filter((p) => p.date.slice(5, 7) === monthPadded)
    .map((p) => p.flowM3s)
    .sort((a, b) => a - b);

  const matchedMonthMedian = empiricalQuantile(sameMonthSorted, 0.5);
  const matchedMonthMean =
    sameMonthSorted.length > 0
      ? Number(
          (
            sameMonthSorted.reduce((s, v) => s + v, 0) / sameMonthSorted.length
          ).toFixed(2)
        )
      : null;

  const peakMed = forecast.peakStats.peakMedianM3s;
  const peakMedianHistoricalPercentile =
    peakMed !== null && sortedHist.length > 0
      ? Math.round(
          (sortedHist.filter((v) => v <= peakMed).length / sortedHist.length) * 100
        )
      : null;

  const peakMedianVsMatchedMonthRatio =
    peakMed !== null && matchedMonthMedian && matchedMonthMedian > 0
      ? Number((peakMed / matchedMonthMedian).toFixed(2))
      : null;

  // Compute IQR at peak median index (51-member statistics strictly isolated from HRES)
  let peakIdx = 0;
  let bestMed = -Infinity;
  forecast.stats.flow_med.forEach((v, i) => {
    if (typeof v === 'number' && v > bestMed) {
      bestMed = v;
      peakIdx = i;
    }
  });
  const q25AtPeak = forecast.stats.flow_25p[peakIdx];
  const q75AtPeak = forecast.stats.flow_75p[peakIdx];
  const peakIqrWidthM3s =
    typeof q25AtPeak === 'number' && typeof q75AtPeak === 'number'
      ? Number((q75AtPeak - q25AtPeak).toFixed(2))
      : null;

  const peakSpreadRatio =
    peakIqrWidthM3s !== null && peakMed !== null && peakMed > 0.05
      ? Number((peakIqrWidthM3s / peakMed).toFixed(2))
      : null;

  const uncertaintyLevel: StreamflowAnalysisResult['forecastMetrics']['uncertaintyLevel'] =
    peakSpreadRatio === null
      ? 'Unavailable'
      : peakSpreadRatio < 0.35
      ? 'Low'
      : peakSpreadRatio < 0.85
      ? 'Moderate'
      : 'Substantial';

  // Separate 52nd deterministic High-Res member (days 1-10)
  const hresVals = forecast.stats.high_res.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  const peakHresM3s = hresVals.length > 0 ? Number(Math.max(...hresVals).toFixed(2)) : null;

  let hresDiffSum = 0;
  let hresCount = 0;
  forecast.stats.high_res.forEach((hr, i) => {
    const med = forecast.stats.flow_med[i];
    if (typeof hr === 'number' && typeof med === 'number' && med > 0.05) {
      hresDiffSum += ((hr - med) / med) * 100;
      hresCount++;
    }
  });
  const hresVsMedianDivergencePct =
    hresCount > 0 ? Number((hresDiffSum / hresCount).toFixed(1)) : null;

  // Return-period exceedance duration (each forecast step is 3 hours)
  const t = rp.thresholds;
  const validSteps = forecast.stats.flow_med.filter((v) => typeof v === 'number').length || 1;
  const countAbove = (arr: Array<number | null>, thresh: number | null) => {
    if (!thresh || thresh <= 0) return 0;
    return arr.filter((v) => typeof v === 'number' && v >= thresh).length * 3;
  };
  const classifyRp = (val: number | null) => {
    if (val === null) return 'Unavailable';
    if (t.rp100 && val >= t.rp100) return 'Exceeds 100-yr RP';
    if (t.rp50 && val >= t.rp50) return 'Exceeds 50-yr RP';
    if (t.rp25 && val >= t.rp25) return 'Exceeds 25-yr RP';
    if (t.rp10 && val >= t.rp10) return 'Exceeds 10-yr RP';
    if (t.rp5 && val >= t.rp5) return 'Exceeds 5-yr RP';
    if (t.rp2 && val >= t.rp2) return 'Exceeds 2-yr RP';
    if (t.rp2 && val >= t.rp2 * 0.8) return 'Approaching 2-yr RP (80–99%)';
    return 'Below 2-yr RP';
  };

  const hoursAboveRp2Median = countAbove(forecast.stats.flow_med, t.rp2);
  const hoursAboveRp5Median = countAbove(forecast.stats.flow_med, t.rp5);
  const hoursAboveRp10Median = countAbove(forecast.stats.flow_med, t.rp10);
  const hoursAboveRp2MaxEnsemble = countAbove(forecast.stats.flow_max, t.rp2);
  const pctHorizonAboveRp2Median = Math.round(
    ((hoursAboveRp2Median / 3) / validSteps) * 100
  );

  // Careful non-alarmist signal classification
  let signalClass: StreamflowSignalClass = 'Insufficient data';
  if (peakMed !== null) {
    if ((t.rp5 && peakMed >= t.rp5) || (hoursAboveRp2Median >= 24 && (peakMedianHistoricalPercentile ?? 0) >= 92)) {
      signalClass = 'Potential high-flow concern';
    } else if (
      (t.rp2 && peakMed >= t.rp2 * 0.8) ||
      (peakMedianHistoricalPercentile !== null && peakMedianHistoricalPercentile >= 80)
    ) {
      signalClass = 'Elevated forecast flow';
    } else if (
      peakMedianHistoricalPercentile !== null &&
      peakMedianHistoricalPercentile <= 15
    ) {
      signalClass = 'Potential low-flow concern';
    } else if (
      peakMedianHistoricalPercentile !== null &&
      peakMedianHistoricalPercentile <= 30
    ) {
      signalClass = 'Below-normal modelled flow';
    } else {
      signalClass = 'Near-normal modelled flow';
    }
  }

  const interpretationBullets: string[] = [];
  if (peakMed !== null && matchedMonthMedian !== null) {
    interpretationBullets.push(
      `Forecast 51-member median peaks at ${peakMed.toFixed(1)} m³/s, ranking at the ${
        peakMedianHistoricalPercentile ?? '—'
      }th percentile of 1940–present monthly modelled flows (${
        peakMedianVsMatchedMonthRatio ?? '—'
      }× the calendar-month median of ${matchedMonthMedian.toFixed(1)} m³/s).`
    );
  }
  if (hoursAboveRp2Median > 0) {
    interpretationBullets.push(
      `Ensemble median remains at or above the 2-year Gumbel threshold (${
        t.rp2?.toFixed(1) ?? '—'
      } m³/s) for ${hoursAboveRp2Median} hours (${pctHorizonAboveRp2Median}% of the 15-day forecast window).`
    );
  } else if (hoursAboveRp2MaxEnsemble > 0) {
    interpretationBullets.push(
      `Ensemble median stays below the 2-year RP threshold, though upper ensemble tail reaches/exceeds RP2 for ${hoursAboveRp2MaxEnsemble} hours.`
    );
  } else {
    interpretationBullets.push(
      `Both ensemble median and maximum members stay below the 2-year Gumbel reference (${
        t.rp2?.toFixed(1) ?? '—'
      } m³/s) throughout the forecast horizon.`
    );
  }
  if (peakSpreadRatio !== null) {
    interpretationBullets.push(
      `Ensemble uncertainty is ${uncertaintyLevel} (peak IQR ${peakIqrWidthM3s?.toFixed(
        1
      )} m³/s, IQR/median ratio ${peakSpreadRatio.toFixed(2)}).`
    );
  }

  const result: StreamflowAnalysisResult = {
    linkno,
    issueDate: forecast.metadata.gen_date || cleanDate || 'Latest',
    forecastMonth,
    historicalSampleSize: sortedHist.length,
    historicalPeriodLabel: '1940–present ERA5-forced retrospective monthly simulation',
    historicalPercentiles: {
      p10: empiricalQuantile(sortedHist, 0.1),
      p25: empiricalQuantile(sortedHist, 0.25),
      p50: empiricalQuantile(sortedHist, 0.5),
      p75: empiricalQuantile(sortedHist, 0.75),
      p90: empiricalQuantile(sortedHist, 0.9),
      matchedMonthMedian,
      matchedMonthMean,
    },
    forecastMetrics: {
      initialMedianM3s: forecast.stats.flow_med[0] ?? null,
      peakMedianM3s: peakMed !== null ? Number(peakMed.toFixed(2)) : null,
      peakMeanM3s:
        forecast.peakStats.peakMeanM3s !== null
          ? Number(forecast.peakStats.peakMeanM3s.toFixed(2))
          : null,
      peakMaxEnsembleM3s:
        forecast.peakStats.peakMaxEnsembleM3s !== null
          ? Number(forecast.peakStats.peakMaxEnsembleM3s.toFixed(2))
          : null,
      peakHresM3s,
      peakMedianHistoricalPercentile,
      peakMedianVsMatchedMonthRatio,
      peakIqrWidthM3s,
      peakSpreadRatio,
      uncertaintyLevel,
      hresVsMedianDivergencePct,
    },
    exceedance: {
      highestExceededRpByMedian: classifyRp(peakMed),
      highestExceededRpByMaxEnsemble: classifyRp(forecast.peakStats.peakMaxEnsembleM3s),
      hoursAboveRp2Median,
      hoursAboveRp5Median,
      hoursAboveRp10Median,
      hoursAboveRp2MaxEnsemble,
      pctHorizonAboveRp2Median,
    },
    signalClass,
    interpretationBullets,
    limitations: [
      'GEOGLOWS v2 forecasts represent global ECMWF runoff routing without local KenGen Masinga / Seven Forks reservoir gate rule curves.',
      'Historical percentiles and Gumbel return periods are benchmarked against 1940–present ERA5-forced modelled discharge, not local Kenyan WRA station gauges.',
      'The 51-member ensemble statistics (min, P25, median, mean, P75, max) are analyzed separately from the deterministic 10-day HRES trajectory.',
    ],
    computedAt: new Date().toISOString(),
  };

  setCached(cacheKey, result, TTL_15M);
  return result;
}

// ---------------------------------------------------------------------------
// 5. River Corridor Proximity Exposure & Infrastructure Screening
// ---------------------------------------------------------------------------
async function extractWindowedCorridorValues(
  itemId: string,
  reachBbox: [number, number, number, number],
  utmSegs: Array<[number, number, number, number]>,
  bufferMeters: number,
  maxWindowDim = 800
): Promise<{
  values: number[];
  resolutionMeters: number;
  cellCountInBuffer: number;
  nodataVal: number | null;
}> {
  const tiff = await fromUrl(`${PORTAL_ITEMS_BASE}/${itemId}/data`);
  const baseImg = await tiff.getImage(0);
  const [xmin, ymin, xmax, ymax] = baseImg.getBoundingBox();
  const nodataVal = baseImg.getGDALNoData();

  const padDeg = bufferMeters / 111000 + 0.008;
  const wXmin = Math.max(xmin, reachBbox[0] - padDeg);
  const wYmin = Math.max(ymin, reachBbox[1] - padDeg);
  const wXmax = Math.min(xmax, reachBbox[2] + padDeg);
  const wYmax = Math.min(ymax, reachBbox[3] + padDeg);

  if (wXmin >= wXmax || wYmin >= wYmax) {
    return { values: [], resolutionMeters: 100, cellCountInBuffer: 0, nodataVal };
  }

  // Pick finest overview where the clipped window fits within maxWindowDim
  const imgCount = await tiff.getImageCount();
  let chosen = baseImg;
  for (let i = 0; i < imgCount; i++) {
    const cand = await tiff.getImage(i);
    const cw = cand.getWidth();
    const ch = cand.getHeight();
    const winW = Math.ceil(((wXmax - wXmin) / (xmax - xmin)) * cw);
    const winH = Math.ceil(((wYmax - wYmin) / (ymax - ymin)) * ch);
    chosen = cand;
    if (Math.max(winW, winH) <= maxWindowDim) {
      break;
    }
  }

  const w = chosen.getWidth();
  const h = chosen.getHeight();
  const dx = (xmax - xmin) / w;
  const dy = (ymax - ymin) / h;

  const px0 = Math.max(0, Math.floor((wXmin - xmin) / dx));
  const px1 = Math.min(w, Math.ceil((wXmax - xmin) / dx));
  const py0 = Math.max(0, Math.floor((ymax - wYmax) / dy));
  const py1 = Math.min(h, Math.ceil((ymax - wYmin) / dy));

  if (px1 <= px0 || py1 <= py0) {
    return {
      values: [],
      resolutionMeters: Math.round(dx * 111320),
      cellCountInBuffer: 0,
      nodataVal,
    };
  }

  const rasters = await chosen.readRasters({ window: [px0, py0, px1, py1], samples: [0] });
  const arr = rasters[0] as ArrayLike<number>;
  const winW = px1 - px0;
  const winH = py1 - py0;

  const values: number[] = [];
  let cellCountInBuffer = 0;

  // Iterate unique pixel indices once: zero double-counting
  for (let r = 0; r < winH; r++) {
    const lat = ymax - (py0 + r + 0.5) * dy;
    for (let c = 0; c < winW; c++) {
      const lon = xmin + (px0 + c + 0.5) * dx;
      const [ux, uy] = toUtm(lon, lat);
      const dist = minDistToUtmSegments(ux, uy, utmSegs);
      if (dist <= bufferMeters) {
        cellCountInBuffer++;
        const v = Number(arr[r * winW + c]);
        if (!isNoData(v, nodataVal)) {
          values.push(v);
        }
      }
    }
  }

  return {
    values,
    resolutionMeters: Math.max(10, Math.round(dx * 111320)),
    cellCountInBuffer,
    nodataVal,
  };
}

async function queryNearbyPoints(
  layerUrl: string,
  bbox: [number, number, number, number],
  utmSegs: Array<[number, number, number, number]>,
  bufferMeters: number,
  outFields: string,
  mapFeature: (attrs: Record<string, unknown>, lon: number, lat: number, dist: number) => NearbyVectorFeature
): Promise<{ status: 'available' | 'error'; items: NearbyVectorFeature[] }> {
  try {
    const padDeg = bufferMeters / 111000 + 0.015;
    const env = [
      bbox[0] - padDeg,
      bbox[1] - padDeg,
      bbox[2] + padDeg,
      bbox[3] + padDeg,
    ].join(',');
    const qs = new URLSearchParams({
      geometry: env,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields,
      returnGeometry: 'true',
      resultRecordCount: '500',
      f: 'json',
    });
    const resp = await fetch(`${layerUrl}/query?${qs.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return { status: 'error', items: [] };
    const json = (await resp.json()) as {
      features?: Array<{
        attributes: Record<string, unknown>;
        geometry?: { x?: number; y?: number };
      }>;
      error?: { message: string };
    };
    if (json.error) return { status: 'error', items: [] };

    const items: NearbyVectorFeature[] = [];
    for (const f of json.features || []) {
      const lon = Number(f.geometry?.x);
      const lat = Number(f.geometry?.y);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const [ux, uy] = toUtm(lon, lat);
      const dist = minDistToUtmSegments(ux, uy, utmSegs);
      if (dist <= bufferMeters) {
        items.push(mapFeature(f.attributes, lon, lat, Math.round(dist)));
      }
    }
    items.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return { status: 'available', items };
  } catch {
    return { status: 'error', items: [] };
  }
}

const WORLDCOVER_NAMES: Record<number, string> = {
  10: 'Tree cover',
  20: 'Shrubland',
  30: 'Grassland',
  40: 'Cropland',
  50: 'Built-up',
  60: 'Bare / sparse vegetation',
  80: 'Permanent water bodies',
  90: 'Herbaceous wetland',
};

export async function screenReachExposure(
  linkno: number,
  bufferMeters = 2000
): Promise<ExposureScreeningResult> {
  const safeBuffer = [500, 1000, 2000, 5000].includes(bufferMeters) ? bufferMeters : 2000;
  const cacheKey = `screen:${linkno}:${safeBuffer}`;
  const cached = getCached<ExposureScreeningResult>(cacheKey);
  if (cached) return cached;

  const reach = await validateLinknoInBasin(linkno);
  if (!reach) {
    throw new Error(`LINKNO ${linkno} is not a verified reach in the Upper Tana Basin.`);
  }

  const utmSegs: Array<[number, number, number, number]> = [];
  for (const path of reach.paths) {
    const utm = path.map(([x, y]) => toUtm(x, y));
    for (let i = 0; i + 1 < utm.length; i++) {
      utmSegs.push([utm[i][0], utm[i][1], utm[i + 1][0], utm[i + 1][1]]);
    }
  }

  const [pop, built, hand, dem, slope, lc, jrcOcc, jrcSeas, townsRes, healthRes, schoolsRes] =
    await Promise.all([
      extractWindowedCorridorValues('8eb142a239f34993a72180478bb6c9f3', reach.bbox, utmSegs, safeBuffer, 900),
      extractWindowedCorridorValues('728dfadc55264d899e84dfc42255a5ab', reach.bbox, utmSegs, safeBuffer, 900),
      extractWindowedCorridorValues('69c37b1d239f49b9aa6daf3126b36fe9', reach.bbox, utmSegs, safeBuffer, 900),
      extractWindowedCorridorValues('7d997cccb0754d1bad502d99b6a03698', reach.bbox, utmSegs, safeBuffer, 650),
      extractWindowedCorridorValues('4004c9ec8ec14b13bbcee3a19c2694c5', reach.bbox, utmSegs, safeBuffer, 650),
      extractWindowedCorridorValues('85dee424a76a43ca96d1657f8f4e28bf', reach.bbox, utmSegs, safeBuffer, 550),
      extractWindowedCorridorValues('1a4acb0eaad34c3ba6ed0804eae7be15', reach.bbox, utmSegs, safeBuffer, 650),
      extractWindowedCorridorValues('1a07d48e59044dc7b7e19d9ac9a75683', reach.bbox, utmSegs, safeBuffer, 650),
      queryNearbyPoints(
        KENYA_TOWNS_LAYER_URL,
        reach.bbox,
        utmSegs,
        safeBuffer,
        'FID,TOWN_NAME,TOWN_TYPE',
        (a, lon, lat, dist) => ({
          id: Number(a.FID || 0),
          name: String(a.TOWN_NAME || `Settlement #${a.FID}`),
          category: String(a.TOWN_TYPE || 'Settlement'),
          distanceMeters: dist,
          lon,
          lat,
          attributes: a,
        })
      ),
      queryNearbyPoints(
        KENYA_HEALTH_LAYER_URL,
        reach.bbox,
        utmSegs,
        safeBuffer,
        'FID,MOH_DHIS2_,Facility_t,Facility_O,Operationa',
        (a, lon, lat, dist) => ({
          id: Number(a.FID || 0),
          name: String(a.MOH_DHIS2_ || `Health Facility #${a.FID}`),
          category: String(a.Facility_t || 'Health Facility'),
          distanceMeters: dist,
          lon,
          lat,
          attributes: a,
        })
      ),
      queryNearbyPoints(
        KENYA_SCHOOLS_LAYER_URL,
        reach.bbox,
        utmSegs,
        safeBuffer,
        'FID,Name_of_Sc,Level_,Status',
        (a, lon, lat, dist) => ({
          id: Number(a.FID || 0),
          name: String(a.Name_of_Sc || `School #${a.FID}`),
          category: String(a.Level_ || 'Primary School'),
          distanceMeters: dist,
          lon,
          lat,
          attributes: a,
        })
      ),
    ]);

  const popTotal =
    pop.values.length > 0
      ? Math.round(pop.values.reduce((s, v) => s + Math.max(0, v), 0))
      : null;

  const builtMean =
    built.values.length > 0
      ? Number((built.values.reduce((s, v) => s + v, 0) / built.values.length).toFixed(2))
      : null;
  const cellsWithBuiltUp = built.values.filter((v) => v > 0).length;

  const sortedHand = [...hand.values].sort((a, b) => a - b);
  const handMedian =
    sortedHand.length > 0 ? Number(sortedHand[Math.floor(sortedHand.length / 2)].toFixed(1)) : null;
  const handMean =
    sortedHand.length > 0
      ? Number((sortedHand.reduce((s, v) => s + v, 0) / sortedHand.length).toFixed(1))
      : null;
  const pctUnder5m =
    sortedHand.length > 0
      ? Number(((sortedHand.filter((v) => v < 5).length / sortedHand.length) * 100).toFixed(1))
      : null;
  const pct5to15m =
    sortedHand.length > 0
      ? Number(
          (
            (sortedHand.filter((v) => v >= 5 && v <= 15).length / sortedHand.length) *
            100
          ).toFixed(1)
        )
      : null;
  const pctOver15m =
    sortedHand.length > 0
      ? Number(((sortedHand.filter((v) => v > 15).length / sortedHand.length) * 100).toFixed(1))
      : null;

  const meanElevationM =
    dem.values.length > 0
      ? Number((dem.values.reduce((s, v) => s + v, 0) / dem.values.length).toFixed(0))
      : null;
  const meanSlopeDeg =
    slope.values.length > 0
      ? Number((slope.values.reduce((s, v) => s + v, 0) / slope.values.length).toFixed(1))
      : null;

  const lcCounts = new Map<number, number>();
  for (const v of lc.values) {
    const code = Math.round(v);
    lcCounts.set(code, (lcCounts.get(code) || 0) + 1);
  }
  const lcClasses = Array.from(lcCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([code, cnt]) => ({
      code,
      label: WORLDCOVER_NAMES[code] || `Class ${code}`,
      pct: lc.values.length > 0 ? Number(((cnt / lc.values.length) * 100).toFixed(1)) : 0,
    }));

  const meanOcc =
    jrcOcc.values.length > 0
      ? Number((jrcOcc.values.reduce((s, v) => s + v, 0) / jrcOcc.values.length).toFixed(1))
      : null;
  const maxOcc =
    jrcOcc.values.length > 0 ? Number(Math.max(...jrcOcc.values).toFixed(0)) : null;
  const nonZeroSeas = jrcSeas.values.filter((v) => v > 0);
  const meanSeas =
    nonZeroSeas.length > 0
      ? Number((nonZeroSeas.reduce((s, v) => s + v, 0) / nonZeroSeas.length).toFixed(1))
      : null;

  const corridorAreaKm2Approx = Number(
    ((pop.cellCountInBuffer * pop.resolutionMeters * pop.resolutionMeters) / 1e6).toFixed(1)
  );

  const priorityNotes: string[] = [];
  if ((pctUnder5m ?? 0) >= 35 && (popTotal ?? 0) >= 1000) {
    priorityNotes.push(
      `${pctUnder5m}% of screened corridor terrain is <5 m HAND alongside ~${popTotal?.toLocaleString()} proximity-screened residents; prioritize local elevation & channel inspection if streamflow rises.`
    );
  } else if (popTotal !== null) {
    priorityNotes.push(
      `Corridor proximity screening identifies ~${popTotal.toLocaleString()} people (2025 grid) and ${townsRes.items.length} named settlement point(s) within ${safeBuffer.toLocaleString()} m of reach ${linkno}.`
    );
  }
  if (healthRes.items.length > 0) {
    priorityNotes.push(
      `${healthRes.items.length} MOH DHIS2 health facility point(s) lie within ${safeBuffer.toLocaleString()} m proximity of this reach (nearest: ${healthRes.items[0].name} at ${healthRes.items[0].distanceMeters} m).`
    );
  }

  const result: ExposureScreeningResult = {
    linkno,
    reachName: reach.displayName,
    bufferMeters: safeBuffer,
    corridorAreaKm2Approx,
    retrievedAt: new Date().toISOString(),
    population2025: {
      estimatedTotal: popTotal,
      validCells: pop.values.length,
      cellCountInBuffer: pop.cellCountInBuffer,
      resolutionNote: `Native ~${pop.resolutionMeters} m Population 2025 GeoTIFF grid`,
      year: 2025,
      nodataTreatment: 'NoData pixels (-9999 / NaN) strictly excluded prior to summation',
      aggregationMethod:
        'Unique cell-center distance inclusion in EPSG:32737 (zero double-counting)',
      isEstimate: true,
    },
    builtUp2020: {
      meanBuiltUpPct: builtMean,
      cellsWithBuiltUp,
      validCells: built.values.length,
      resolutionNote: `Native ~${built.resolutionMeters} m Built-Up 2020 epoch`,
    },
    handTerrain: {
      medianHandM: handMedian,
      meanHandM: handMean,
      pctUnder5m,
      pct5to15m,
      pctOver15m,
      meanElevationM,
      meanSlopeDeg,
      validCells: sortedHand.length,
      caveat:
        'HAND indicates relative vertical height above nearest drainage cell, NOT calibrated hydraulic flood depth or overbank inundation extent.',
    },
    landCover: {
      resolutionNote: `ESA WorldCover sampled at ~${lc.resolutionMeters} m grid spacing inside corridor`,
      classes: lcClasses,
    },
    surfaceWater: {
      meanOccurrencePct: meanOcc,
      maxOccurrencePct: maxOcc,
      meanSeasonalityMonths: meanSeas,
      caveat:
        'EC JRC Global Surface Water (1984–2021) summarizes historical water persistence, not active 2026 floodwater.',
    },
    nearbySettlements: townsRes.items.slice(0, 40),
    nearbyHealthFacilities: healthRes.items.slice(0, 40),
    nearbySchoolsCount: schoolsRes.items.length,
    nearbySchoolsSample: schoolsRes.items.slice(0, 20),
    settlementsServiceStatus: townsRes.status,
    facilitiesServiceStatus: healthRes.status,
    priorityInvestigationNotes: priorityNotes,
    limitations: [
      `This ${safeBuffer.toLocaleString()} m corridor is a spatial proximity screening distance around reach ${linkno}, NOT a hydraulic flood inundation boundary.`,
      'Population 2025 totals are gridded screening estimates (~100 m cell centers), not census household surveys or flood-affected headcounts.',
      'Built-up cover uses the 2020 epoch and may under-represent post-2020 peri-urban development.',
    ],
  };

  setCached(cacheKey, result, TTL_15M);
  return result;
}
