import express from 'express';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { Express } from 'express';
import { fromUrl, type GeoTIFF, type GeoTIFFImage } from 'geotiff';
import {
  getGeoglowsDates,
  getGeoglowsEnsembles,
  getGeoglowsForecast,
  getGeoglowsHistorical,
  getGeoglowsMapServerMeta,
  getGeoglowsReachContext,
  getGeoglowsReturnPeriods,
  getTanaGeoglowsReachIndex,
  identifyGeoglowsAtPoint,
  validateLinknoInBasin,
} from './src/server/geoglowsService.ts';
import {
  getEnsoStatus,
  getGeoglowsReachAnalysis,
  getSubBasinZonalStats,
  getTanaSubBasins,
  screenReachExposure,
} from './src/server/basinAnalyticsService.ts';
import {
  KENYA_HEALTH_FACILITIES_SERVICE_URL,
  KENYA_PRIMARY_SCHOOLS_SERVICE_URL,
  KENYA_TOWNS_SERVICE_URL,
  TANA_STREAMS_SERVICE_URL,
} from './src/config/dataRegistry.ts';

const PROJECT_ROOT = process.cwd();

const PORT = Number(process.env.PORT) || 3000;
const HOST =
  process.env.HOST ||
  (process.env.NODE_ENV === 'production' || process.env.K_SERVICE ? '0.0.0.0' : 'localhost');
const PORTAL_ITEMS_BASE = 'https://africageoportal.maps.arcgis.com/sharing/rest/content/items';
const STREAMS_FS_URL = TANA_STREAMS_SERVICE_URL;

const FEATURE_SERVICE_MAP: Record<string, { itemId: string; url: string; itemName: string }> = {
  tana_river_streams: {
    itemId: 'tanariverstreams-feature',
    url: TANA_STREAMS_SERVICE_URL,
    itemName: 'tanariverstreams/FeatureServer/0',
  },
  kenya_towns: {
    itemId: 'kenya-towns-feature',
    url: KENYA_TOWNS_SERVICE_URL,
    itemName: 'Kenya_Towns/FeatureServer/0',
  },
  kenya_health_facilities: {
    itemId: 'kenya-health-facilities-2026-feature',
    url: KENYA_HEALTH_FACILITIES_SERVICE_URL,
    itemName: 'KenyaHealthFacilities2026/FeatureServer/0',
  },
  kenya_primary_schools: {
    itemId: 'kenya-primary-schools-feature',
    url: KENYA_PRIMARY_SCHOOLS_SERVICE_URL,
    itemName: 'Kenya_Primary_Schools/FeatureServer/0',
  },
};

// In-memory caches to keep GeoTIFF inspection & rendering fast
const metadataCache = new Map<string, { data: unknown; ts: number }>();
const renderCache = new Map<string, { data: unknown; ts: number }>();
const timeseriesCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

// ---------------------------------------------------------------------------
// Minimal Pure-Node PNG Encoder (RGBA8)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodeRgbaPngDataUrl(rgba: Uint8Array, width: number, height: number): string {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // Filter type 0 (None)
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), rowStart + 1);
  }
  const compressed = zlib.deflateSync(raw, { level: 4 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Scientific Color Ramps
// ---------------------------------------------------------------------------
type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function interpolateStops(t: number, stops: RGB[]): RGB {
  const clamped = Math.max(0, Math.min(1, t));
  if (stops.length === 1) return stops[0];
  const scaled = clamped * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const a = stops[idx];
  const b = stops[idx + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

const RAMPS: Record<string, RGB[]> = {
  precipitation: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'].map(hexToRgb),
  anomaly_dry_wet: ['#8c510a', '#d8b365', '#f5f5f5', '#5ab4ac', '#01665e'].map(hexToRgb),
  soil_moisture: ['#f6e8c3', '#c7eae5', '#5ab4ac', '#2166ac', '#053061'].map(hexToRgb),
  temperature: ['#3288bd', '#abdda4', '#fee08b', '#f46d43', '#9e0142'].map(hexToRgb),
  pet: ['#edf8b1', '#7fcdbb', '#fecc5c', '#fd8d3c', '#bd0026'].map(hexToRgb),
  elevation: ['#2c7bb6', '#74add1', '#abd9e9', '#fee090', '#d73027', '#7f2704'].map(hexToRgb),
  slope: ['#f7f7f7', '#d9f0a3', '#addd8e', '#fe9929', '#cc4c02', '#662506'].map(hexToRgb),
  flow_accumulation: ['#e6eef5', '#9ecae1', '#4292c6', '#08519c', '#081d58'].map(hexToRgb),
  hand: ['#08306b', '#2171b5', '#6baed6', '#fed976', '#fd8d3c', '#f0f0f0'].map(hexToRgb),
  surface_water_occurrence: ['#f0f7ff', '#9ecae1', '#3182bd', '#08306b'].map(hexToRgb),
  surface_water_seasonality: ['#deebf7', '#9ecae1', '#4292c6', '#084594'].map(hexToRgb),
  population: ['#f7f4f9', '#d4b9da', '#9e9ac8', '#6a51a3', '#3f007d'].map(hexToRgb),
  built_up: ['#f7f7f7', '#fdbb84', '#ef6548', '#b30000'].map(hexToRgb),
};

const LAND_COVER_MAP: Record<number, RGB> = {
  10: hexToRgb('#006400'),
  20: hexToRgb('#ffbb22'),
  30: hexToRgb('#ffff4c'),
  40: hexToRgb('#f096ff'),
  50: hexToRgb('#fa0000'),
  60: hexToRgb('#b4b4b4'),
  70: hexToRgb('#f0f0f0'),
  80: hexToRgb('#0064c8'),
  90: hexToRgb('#0096a0'),
  95: hexToRgb('#00cf75'),
  100: hexToRgb('#fae6a0'),
};

const FLOW_DIR_MAP: Record<number, RGB> = {
  1: hexToRgb('#e41a1c'),
  2: hexToRgb('#ff7f00'),
  4: hexToRgb('#ffff33'),
  8: hexToRgb('#4daf4a'),
  16: hexToRgb('#377eb8'),
  32: hexToRgb('#984ea3'),
  64: hexToRgb('#a65628'),
  128: hexToRgb('#f781bf'),
};

const SW_TRANSITION_MAP: Record<number, RGB> = {
  1: hexToRgb('#08306b'),
  2: hexToRgb('#22c55e'),
  3: hexToRgb('#dc2626'),
  4: hexToRgb('#38bdf8'),
  5: hexToRgb('#34d399'),
  6: hexToRgb('#f97316'),
  7: hexToRgb('#0284c7'),
  8: hexToRgb('#eab308'),
  9: hexToRgb('#a855f7'),
  10: hexToRgb('#c084fc'),
};

function isNoData(val: number, nodata: number | null): boolean {
  if (!Number.isFinite(val)) return true;
  if (nodata === null || nodata === undefined) return false;
  if (Number.isNaN(nodata)) return Number.isNaN(val);
  return Math.abs(val - nodata) < 1e-6;
}

function computeStats(arr: ArrayLike<number>, nodata: number | null) {
  const valid: number[] = [];
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (isNoData(v, nodata)) continue;
    valid.push(v);
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  if (valid.length === 0) return null;
  const mean = sum / valid.length;
  let sqSum = 0;
  for (let i = 0; i < valid.length; i++) {
    const d = valid[i] - mean;
    sqSum += d * d;
  }
  const stdDev = Math.sqrt(sqSum / valid.length);
  valid.sort((a, b) => a - b);
  const p05 = valid[Math.floor(valid.length * 0.05)];
  const p95 = valid[Math.min(valid.length - 1, Math.floor(valid.length * 0.95))];

  return {
    min,
    max,
    mean,
    stdDev,
    p05,
    p95,
    validCount: valid.length,
    totalCount: arr.length,
  };
}

async function openGeoTiff(itemId: string): Promise<GeoTIFF> {
  const dataUrl = `${PORTAL_ITEMS_BASE}/${itemId}/data`;
  return fromUrl(dataUrl);
}

async function extractBandNames(img: GeoTIFFImage, spp: number): Promise<string[]> {
  const names: string[] = [];
  for (let s = 0; s < spp; s++) {
    try {
      const m = (await img.getGDALMetadata(s)) as Record<string, string> | null;
      names.push(m?.DESCRIPTION || `Band ${s + 1}`);
    } catch {
      names.push(`Band ${s + 1}`);
    }
  }
  return names;
}

function formatResolutionLabel(resDeg: [number, number]): string {
  const absDeg = Math.abs(resDeg[0]);
  const meters = Math.round(absDeg * 111320);
  if (meters >= 1000) {
    return `${absDeg.toFixed(3)}° (~${(meters / 1000).toFixed(1)} km)`;
  }
  return `${absDeg.toFixed(6)}° (~${meters} m)`;
}

function formatPixelType(sf: number | number[], bps: number | number[]): string {
  const s = Array.isArray(sf) ? sf[0] : sf;
  const b = Array.isArray(bps) ? bps[0] : bps;
  const kind = s === 3 ? 'Float' : s === 2 ? 'Int' : 'Uint';
  return `${kind}${b}`;
}

async function selectBestOverview(tiff: GeoTIFF, targetMaxDim: number): Promise<GeoTIFFImage> {
  const count = await tiff.getImageCount();
  let chosen = await tiff.getImage(0);
  if (count === 1) return chosen;

  // Iterate overviews from coarsest to finest, picking finest that fits <= targetMaxDim*1.2
  for (let i = 0; i < count; i++) {
    const candidate = await tiff.getImage(i);
    const maxDim = Math.max(candidate.getWidth(), candidate.getHeight());
    chosen = candidate;
    if (maxDim <= targetMaxDim * 1.25) {
      return candidate;
    }
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Express App Setup
// ---------------------------------------------------------------------------
async function createApp(): Promise<Express> {
  const app = express();
  app.use(express.json());

  // Serve Calcite and ArcGIS static assets locally
  app.use(
    '/calcite-assets',
    express.static(path.join(PROJECT_ROOT, 'node_modules/@esri/calcite-components/dist/cdn'))
  );
  app.use(
    '/arcgis-assets',
    express.static(path.join(PROJECT_ROOT, 'node_modules/@arcgis/core/assets'))
  );

  // 1. Item & GeoTIFF Discovery Endpoint
  app.get('/api/arcgis/item/:itemId', async (req, res) => {
    const { itemId } = req.params;
    const cached = metadataCache.get(itemId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const itemResp = await fetch(`${PORTAL_ITEMS_BASE}/${itemId}?f=pjson`);
      if (!itemResp.ok) {
        return res.status(502).json({
          itemId,
          status: 'error',
          errorMessage: `ArcGIS Portal HTTP ${itemResp.status}`,
          checkedAt: new Date().toISOString(),
        });
      }
      const itemJson = (await itemResp.json()) as Record<string, unknown>;
      if (itemJson.error) {
        return res.status(404).json({
          itemId,
          status: 'error',
          errorMessage: String((itemJson.error as Record<string, unknown>).message || 'Item unavailable'),
          checkedAt: new Date().toISOString(),
        });
      }

      const tiff = await openGeoTiff(itemId);
      const overviews = await tiff.getImageCount();
      const baseImg = await tiff.getImage(0);
      const spp = baseImg.getSamplesPerPixel();
      const bandNames = await extractBandNames(baseImg, spp);
      const bbox = baseImg.getBoundingBox() as [number, number, number, number];
      const resRaw = baseImg.getResolution();
      const pixelSizeDeg: [number, number] = [Math.abs(resRaw[0]), Math.abs(resRaw[1])];
      const geoKeys = baseImg.getGeoKeys() as Record<string, unknown>;
      const epsg = geoKeys?.ProjectedCSTypeGeoKey || geoKeys?.GeographicTypeGeoKey || 4326;

      const payload = {
        itemId,
        itemTitle: itemJson.title ?? null,
        itemName: itemJson.name ?? null,
        itemType: itemJson.type ?? null,
        access: itemJson.access ?? null,
        sizeBytes: typeof itemJson.size === 'number' ? itemJson.size : null,
        dimensions: { width: baseImg.getWidth(), height: baseImg.getHeight() },
        bandCount: spp,
        bandNames,
        overviews,
        bbox,
        pixelSizeDeg,
        approxResolutionLabel: formatResolutionLabel(pixelSizeDeg),
        pixelType: formatPixelType(baseImg.getSampleFormat(), baseImg.getBitsPerSample()),
        nodata: baseImg.getGDALNoData(),
        spatialReference: `EPSG:${epsg}`,
        status: 'available',
        checkedAt: new Date().toISOString(),
      };

      metadataCache.set(itemId, { data: payload, ts: Date.now() });
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        itemId,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Failed to inspect item',
        checkedAt: new Date().toISOString(),
      });
    }
  });

  // 2b. Unified FeatureServer Discovery Endpoint (Streams, Towns, Health Facilities, Schools)
  app.get('/api/arcgis/feature-meta', async (req, res) => {
    const id = String(req.query.id || 'tana_river_streams');
    const entry = FEATURE_SERVICE_MAP[id];
    if (!entry) {
      return res.status(404).json({ itemId: id, status: 'error', errorMessage: `Unknown feature service ${id}` });
    }
    const cacheKey = `feature-meta:${id}`;
    const cached = metadataCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const aoiEnv = '36.55,-1.25,38.65,0.45';
      const countUrl =
        id === 'tana_river_streams'
          ? `${entry.url}/0/query?where=1%3D1&returnCountOnly=true&f=pjson`
          : `${entry.url}/0/query?geometry=${encodeURIComponent(aoiEnv)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=pjson`;

      const [layerResp, countResp] = await Promise.all([
        fetch(`${entry.url}/0?f=pjson`, { signal: AbortSignal.timeout(12000) }),
        fetch(countUrl, { signal: AbortSignal.timeout(12000) }),
      ]);
      if (!layerResp.ok) {
        throw new Error(`FeatureServer HTTP ${layerResp.status}`);
      }
      const layerJson = (await layerResp.json()) as Record<string, unknown>;
      const countJson = countResp.ok ? ((await countResp.json()) as { count?: number }) : {};

      const fields = Array.isArray(layerJson.fields)
        ? (layerJson.fields as Array<{ name: string; type: string; alias: string }>).map((f) => ({
            name: f.name,
            type: f.type,
            alias: f.alias,
          }))
        : [];

      const geomType = String(layerJson.geometryType || 'esriGeometryPoint');
      const payload = {
        itemId: entry.itemId,
        itemTitle: String(layerJson.name || id),
        itemName: entry.itemName,
        itemType: 'Feature Service',
        access: 'public',
        sizeBytes: null,
        dimensions: null,
        bandCount: null,
        bandNames: [],
        overviews: null,
        bbox: [36.55, -1.25, 38.65, 0.45] as [number, number, number, number],
        pixelSizeDeg: null,
        approxResolutionLabel: geomType.includes('Polyline') ? 'Vector Polyline' : 'Vector Points (AOI filtered)',
        pixelType: geomType,
        nodata: null,
        spatialReference: 'EPSG:3857 (Web Mercator)',
        featureFields: fields,
        featureCount: countJson.count ?? null,
        status: 'available',
        checkedAt: new Date().toISOString(),
      };

      metadataCache.set(cacheKey, { data: payload, ts: Date.now() });
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        itemId: entry.itemId,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'FeatureServer inspection failed',
        checkedAt: new Date().toISOString(),
      });
    }
  });

  // 2. Tana River Streams FeatureServer Discovery Endpoint
  app.get('/api/arcgis/streams-meta', async (_req, res) => {
    const cached = metadataCache.get('streams-meta');
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const [rootResp, layerResp, countResp] = await Promise.all([
        fetch(`${STREAMS_FS_URL}?f=pjson`),
        fetch(`${STREAMS_FS_URL}/0?f=pjson`),
        fetch(`${STREAMS_FS_URL}/0/query?where=1%3D1&returnCountOnly=true&f=pjson`),
      ]);
      if (!rootResp.ok || !layerResp.ok) {
        throw new Error(`FeatureServer HTTP ${layerResp.status}`);
      }
      const rootJson = (await rootResp.json()) as Record<string, unknown>;
      const layerJson = (await layerResp.json()) as Record<string, unknown>;
      const countJson = countResp.ok ? ((await countResp.json()) as { count?: number }) : {};

      const fields = Array.isArray(layerJson.fields)
        ? (layerJson.fields as Array<{ name: string; type: string; alias: string }>).map((f) => ({
            name: f.name,
            type: f.type,
            alias: f.alias,
          }))
        : [];

      const payload = {
        itemId: 'tanariverstreams-feature',
        itemTitle: String(layerJson.name || 'tanariverstreams'),
        itemName: 'tanariverstreams/FeatureServer/0',
        itemType: 'Feature Service',
        access: 'public',
        sizeBytes: null,
        dimensions: null,
        bandCount: null,
        bandNames: [],
        overviews: null,
        bbox: [36.58, -1.2, 38.56, 0.3],
        pixelSizeDeg: null,
        approxResolutionLabel: 'Vector Polyline',
        pixelType: String(layerJson.geometryType || 'esriGeometryPolyline'),
        nodata: null,
        spatialReference: 'EPSG:3857 (Web Mercator)',
        featureFields: fields,
        featureCount: countJson.count ?? null,
        sublayers: rootJson.layers ?? [],
        status: 'available',
        checkedAt: new Date().toISOString(),
      };

      metadataCache.set('streams-meta', { data: payload, ts: Date.now() });
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        itemId: 'tanariverstreams-feature',
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'FeatureServer inspection failed',
        checkedAt: new Date().toISOString(),
      });
    }
  });

  // 3. GeoTIFF Raster Render Endpoint (returns PNG data URL + real stats)
  app.get('/api/arcgis/raster/:itemId/render', async (req, res) => {
    const { itemId } = req.params;
    const band = Math.max(0, parseInt(String(req.query.band ?? '0'), 10) || 0);
    const ramp = String(req.query.ramp || 'precipitation');
    const isViz = req.query.isViz === 'true';
    const maxDim = Math.min(1024, Math.max(256, parseInt(String(req.query.maxDim ?? '720'), 10) || 720));

    const cacheKey = `${itemId}:${band}:${ramp}:${isViz}:${maxDim}`;
    const cached = renderCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const tiff = await openGeoTiff(itemId);
      const baseImg = await tiff.getImage(0);
      const nativeW = baseImg.getWidth();
      const nativeH = baseImg.getHeight();
      const spp = baseImg.getSamplesPerPixel();
      const safeBand = Math.min(band, Math.max(0, spp - 1));
      const bandNames = await extractBandNames(baseImg, spp);
      const bbox = baseImg.getBoundingBox() as [number, number, number, number];
      const resRaw = baseImg.getResolution();
      const nodata = baseImg.getGDALNoData();

      const img = await selectBestOverview(tiff, maxDim);
      let outW = img.getWidth();
      let outH = img.getHeight();

      // Downsample if overview still exceeds maxDim
      if (Math.max(outW, outH) > maxDim) {
        const scale = maxDim / Math.max(outW, outH);
        outW = Math.max(1, Math.round(outW * scale));
        outH = Math.max(1, Math.round(outH * scale));
      }

      if (isViz && spp >= 3) {
        // Preserve original RGB / RGBA visualization raster verbatim
        const rasters = await img.readRasters({ width: outW, height: outH });
        const rArr = rasters[0] as ArrayLike<number>;
        const gArr = rasters[1] as ArrayLike<number>;
        const bArr = rasters[2] as ArrayLike<number>;
        const aArr = spp >= 4 ? (rasters[3] as ArrayLike<number>) : null;
        const rgba = new Uint8Array(outW * outH * 4);

        for (let i = 0; i < outW * outH; i++) {
          const r = rArr[i];
          const g = gArr[i];
          const b = bArr[i];
          const a = aArr ? aArr[i] : r === 0 && g === 0 && b === 0 ? 0 : 255;
          rgba[i * 4] = r;
          rgba[i * 4 + 1] = g;
          rgba[i * 4 + 2] = b;
          rgba[i * 4 + 3] = a;
        }

        const pngDataUrl = encodeRgbaPngDataUrl(rgba, outW, outH);
        const result = {
          itemId,
          band: 0,
          bandName: 'Rendered RGBA',
          bandCount: spp,
          bandNames,
          bbox,
          pngDataUrl,
          stats: null,
          nodata,
          isVisualization: true,
          width: outW,
          height: outH,
          nativeDimensions: { width: nativeW, height: nativeH },
          nativeResolutionDeg: [Math.abs(resRaw[0]), Math.abs(resRaw[1])],
          rampUsed: 'rgb_visualization',
        };
        renderCache.set(cacheKey, { data: result, ts: Date.now() });
        return res.json(result);
      }

      // Analytical raster band read
      const rasters = await img.readRasters({
        width: outW,
        height: outH,
        samples: [safeBand],
      });
      const data = rasters[0] as ArrayLike<number>;
      const stats = computeStats(data, nodata);

      // Upscale coarse meteorological grids (e.g., 41x33 or 21x17) by integer nearest-neighbor
      // so ArcGIS MapView renders crisp grid cells without fuzzy edge bleeding
      const upscale = Math.max(outW, outH) < 160 ? Math.max(1, Math.floor(240 / Math.max(outW, outH))) : 1;
      const finalW = outW * upscale;
      const finalH = outH * upscale;
      const rgba = new Uint8Array(finalW * finalH * 4);

      const minVal = stats ? stats.p05 : 0;
      const maxVal = stats ? stats.p95 : 1;
      const absMax = stats ? Math.max(Math.abs(stats.min), Math.abs(stats.max), 1e-6) : 1;
      const span = Math.max(1e-6, maxVal - minVal);

      for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
          const val = data[y * outW + x];
          let r = 0,
            g = 0,
            b = 0,
            a = 0;

          if (!isNoData(val, nodata)) {
            if (ramp === 'land_cover') {
              const c = LAND_COVER_MAP[Math.round(val)];
              if (c) {
                [r, g, b] = c;
                a = 235;
              }
            } else if (ramp === 'flow_direction') {
              const c = FLOW_DIR_MAP[Math.round(val)];
              if (c) {
                [r, g, b] = c;
                a = 225;
              }
            } else if (ramp === 'surface_water_transition') {
              const code = Math.round(val);
              if (code > 0 && SW_TRANSITION_MAP[code]) {
                [r, g, b] = SW_TRANSITION_MAP[code];
                a = 240;
              }
            } else if (ramp === 'stream_mask') {
              if (val > 0) {
                r = 23;
                g = 107;
                b = 135;
                a = 245;
              }
            } else if (ramp === 'surface_water_occurrence' || ramp === 'surface_water_seasonality') {
              if (val > 0) {
                const denom = ramp === 'surface_water_seasonality' ? 12 : 100;
                [r, g, b] = interpolateStops(val / denom, RAMPS[ramp]);
                a = 240;
              }
            } else if (ramp === 'built_up') {
              if (val > 0) {
                [r, g, b] = interpolateStops(val / 100, RAMPS.built_up);
                a = 235;
              }
            } else if (ramp === 'flow_accumulation') {
              if (val > 0.1) {
                const logVal = Math.log10(Math.max(1, val));
                const logMax = Math.log10(Math.max(10, stats?.max ?? 10000));
                [r, g, b] = interpolateStops(logVal / logMax, RAMPS.flow_accumulation);
                a = Math.min(245, Math.round(130 + (logVal / logMax) * 115));
              }
            } else if (ramp === 'population') {
              if (val > 0.05) {
                const logVal = Math.log10(1 + val);
                const logMax = Math.log10(1 + (stats?.p95 || stats?.max || 100));
                [r, g, b] = interpolateStops(logVal / Math.max(0.1, logMax), RAMPS.population);
                a = 230;
              }
            } else if (ramp === 'anomaly_dry_wet') {
              const t = 0.5 + (val / (2 * absMax));
              [r, g, b] = interpolateStops(t, RAMPS.anomaly_dry_wet);
              a = 228;
            } else if (ramp === 'hand') {
              // Invert emphasis slightly so low HAND (0-15m) is high contrast blue
              const cap = Math.min(Math.max(maxVal, 25), 80);
              const t = Math.min(1, Math.max(0, val / cap));
              [r, g, b] = interpolateStops(t, RAMPS.hand);
              a = 225;
            } else {
              const stops = RAMPS[ramp] || RAMPS.precipitation;
              const t = (val - minVal) / span;
              [r, g, b] = interpolateStops(t, stops);
              a = 228;
            }
          }

          for (let dy = 0; dy < upscale; dy++) {
            for (let dx = 0; dx < upscale; dx++) {
              const px = ((y * upscale + dy) * finalW + (x * upscale + dx)) * 4;
              rgba[px] = r;
              rgba[px + 1] = g;
              rgba[px + 2] = b;
              rgba[px + 3] = a;
            }
          }
        }
      }

      const pngDataUrl = encodeRgbaPngDataUrl(rgba, finalW, finalH);
      const result = {
        itemId,
        band: safeBand,
        bandName: bandNames[safeBand] || `Band ${safeBand + 1}`,
        bandCount: spp,
        bandNames,
        bbox,
        pngDataUrl,
        stats,
        nodata,
        isVisualization: false,
        width: finalW,
        height: finalH,
        nativeDimensions: { width: nativeW, height: nativeH },
        nativeResolutionDeg: [Math.abs(resRaw[0]), Math.abs(resRaw[1])],
        rampUsed: ramp,
      };
      renderCache.set(cacheKey, { data: result, ts: Date.now() });
      res.json(result);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to render raster',
      });
    }
  });

  // 4. Multi-Band Spatial Summary / Time Series Endpoint (for CHIRPS & ERA5 charts)
  app.get('/api/arcgis/raster/:itemId/timeseries', async (req, res) => {
    const { itemId } = req.params;
    const cached = timeseriesCache.get(itemId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const tiff = await openGeoTiff(itemId);
      const img = await selectBestOverview(tiff, 400);
      const spp = img.getSamplesPerPixel();
      const bandNames = await extractBandNames(await tiff.getImage(0), spp);
      const nodata = img.getGDALNoData();
      const rasters = await img.readRasters();

      const bands = [];
      for (let b = 0; b < spp; b++) {
        const stats = computeStats(rasters[b] as ArrayLike<number>, nodata);
        bands.push({
          band: b,
          code: bandNames[b] || `Band ${b + 1}`,
          stats,
        });
      }

      const payload = { itemId, bandCount: spp, bands };
      timeseriesCache.set(itemId, { data: payload, ts: Date.now() });
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to compute band summary',
      });
    }
  });

  // 5. Pixel Identify / Probe Endpoint at (lon, lat)
  app.get('/api/arcgis/raster/:itemId/probe', async (req, res) => {
    const { itemId } = req.params;
    const lon = parseFloat(String(req.query.lon));
    const lat = parseFloat(String(req.query.lat));
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return res.status(400).json({ error: 'Invalid lon/lat parameters' });
    }

    try {
      const tiff = await openGeoTiff(itemId);
      const img = await tiff.getImage(0);
      const [xmin, ymin, xmax, ymax] = img.getBoundingBox();
      if (lon < xmin || lon > xmax || lat < ymin || lat > ymax) {
        return res.json({ itemId, insideBounds: false, values: [] });
      }

      const w = img.getWidth();
      const h = img.getHeight();
      const px = Math.min(w - 1, Math.max(0, Math.floor(((lon - xmin) / (xmax - xmin)) * w)));
      const py = Math.min(h - 1, Math.max(0, Math.floor(((ymax - lat) / (ymax - ymin)) * h)));
      const spp = img.getSamplesPerPixel();
      const nodata = img.getGDALNoData();
      const bandNames = await extractBandNames(img, spp);

      const rasters = await img.readRasters({ window: [px, py, px + 1, py + 1] });
      const values = [];
      for (let b = 0; b < spp; b++) {
        const rawVal = (rasters[b] as ArrayLike<number>)[0];
        values.push({
          band: b,
          name: bandNames[b] || `Band ${b + 1}`,
          value: isNoData(rawVal, nodata) ? null : Number(rawVal),
        });
      }

      res.json({ itemId, insideBounds: true, px, py, values });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Pixel probe failed',
      });
    }
  });

  // -------------------------------------------------------------------------
  // 6. GEOGLOWS ECMWF Streamflow & Reach Index Endpoints
  // -------------------------------------------------------------------------
  app.get('/api/geoglows/mapserver-meta', async (_req, res) => {
    const meta = await getGeoglowsMapServerMeta();
    res.status(meta.status === 'available' ? 200 : 502).json(meta);
  });

  app.get('/api/geoglows/reaches', async (req, res) => {
    try {
      const refresh = req.query.refresh === '1';
      const index = await getTanaGeoglowsReachIndex(refresh);
      res.json(index);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to build Tana GEOGLOWS reach index',
      });
    }
  });

  app.get('/api/geoglows/identify', async (req, res) => {
    const lon = parseFloat(String(req.query.lon));
    const lat = parseFloat(String(req.query.lat));
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return res.status(400).json({ error: 'Invalid lon/lat parameters' });
    }
    try {
      const result = await identifyGeoglowsAtPoint(lon, lat);
      res.json(result);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'GEOGLOWS identify failed',
      });
    }
  });

  app.get('/api/geoglows/dates', async (_req, res) => {
    try {
      const dates = await getGeoglowsDates();
      res.json({ dates });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to fetch GEOGLOWS forecast dates',
      });
    }
  });

  app.get('/api/geoglows/river/:linkno/forecast', async (req, res) => {
    const linkno = parseInt(req.params.linkno, 10);
    const verified = await validateLinknoInBasin(linkno).catch(() => null);
    if (!verified) {
      return res.status(400).json({
        error: `LINKNO ${req.params.linkno} is not a verified GEOGLOWS reach inside the Upper Tana Basin AOI.`,
      });
    }
    try {
      const date = typeof req.query.date === 'string' ? req.query.date : null;
      const forecast = await getGeoglowsForecast(linkno, date);
      res.json(forecast);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'GEOGLOWS forecast retrieval failed',
      });
    }
  });

  app.get('/api/geoglows/river/:linkno/ensembles', async (req, res) => {
    const linkno = parseInt(req.params.linkno, 10);
    const verified = await validateLinknoInBasin(linkno).catch(() => null);
    if (!verified) {
      return res.status(400).json({
        error: `LINKNO ${req.params.linkno} is not a verified GEOGLOWS reach inside the Upper Tana Basin AOI.`,
      });
    }
    try {
      const date = typeof req.query.date === 'string' ? req.query.date : null;
      const ensembles = await getGeoglowsEnsembles(linkno, date);
      res.json(ensembles);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'GEOGLOWS ensemble retrieval failed',
      });
    }
  });

  app.get('/api/geoglows/river/:linkno/historical', async (req, res) => {
    const linkno = parseInt(req.params.linkno, 10);
    const verified = await validateLinknoInBasin(linkno).catch(() => null);
    if (!verified) {
      return res.status(400).json({
        error: `LINKNO ${req.params.linkno} is not a verified GEOGLOWS reach inside the Upper Tana Basin AOI.`,
      });
    }
    const modeRaw = String(req.query.mode || 'monthly');
    const allowedModes = ['daily', 'monthly', 'annual', 'monthly_climatology', 'daily_climatology'] as const;
    const mode = allowedModes.includes(modeRaw as (typeof allowedModes)[number])
      ? (modeRaw as (typeof allowedModes)[number])
      : 'monthly';
    const startDate = typeof req.query.start_date === 'string' ? req.query.start_date : undefined;
    const endDate = typeof req.query.end_date === 'string' ? req.query.end_date : undefined;

    try {
      const hist = await getGeoglowsHistorical(linkno, mode, startDate, endDate);
      res.json(hist);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'GEOGLOWS historical retrieval failed',
      });
    }
  });

  app.get('/api/geoglows/river/:linkno/return-periods', async (req, res) => {
    const linkno = parseInt(req.params.linkno, 10);
    const verified = await validateLinknoInBasin(linkno).catch(() => null);
    if (!verified) {
      return res.status(400).json({
        error: `LINKNO ${req.params.linkno} is not a verified GEOGLOWS reach inside the Upper Tana Basin AOI.`,
      });
    }
    try {
      const rp = await getGeoglowsReturnPeriods(linkno);
      res.json(rp);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'GEOGLOWS return periods retrieval failed',
      });
    }
  });

  app.get('/api/geoglows/river/:linkno/context', async (req, res) => {
    const linkno = parseInt(req.params.linkno, 10);
    const verified = await validateLinknoInBasin(linkno).catch(() => null);
    if (!verified) {
      return res.status(400).json({
        error: `LINKNO ${req.params.linkno} is not a verified GEOGLOWS reach inside the Upper Tana Basin AOI.`,
      });
    }
    const lon = Number.isFinite(Number(req.query.lon))
      ? Number(req.query.lon)
      : verified.centroid[0];
    const lat = Number.isFinite(Number(req.query.lat))
      ? Number(req.query.lat)
      : verified.centroid[1];
    try {
      const ctx = await getGeoglowsReachContext(linkno, lon, lat);
      res.json(ctx);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Reach context probe failed',
      });
    }
  });

  // -------------------------------------------------------------------------
  // 7. Basin Decision-Support Analytics Endpoints (Sub-basins, Zonal, ENSO, Screening)
  // -------------------------------------------------------------------------
  app.get('/api/basin/subbasins', async (req, res) => {
    try {
      const refresh = req.query.refresh === '1';
      const data = await getTanaSubBasins(refresh);
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load Upper Tana sub-basins',
      });
    }
  });

  app.get('/api/basin/zonal-stats', async (req, res) => {
    try {
      const refresh = req.query.refresh === '1';
      const data = await getSubBasinZonalStats(refresh);
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to compute polygon-masked zonal statistics',
      });
    }
  });

  app.get('/api/climate/enso', async (_req, res) => {
    const data = await getEnsoStatus();
    res.status(data.status === 'available' ? 200 : 502).json(data);
  });

  app.get('/api/geoglows/river/:linkno/analysis', async (req, res) => {
    const linkno = parseInt(req.params.linkno, 10);
    const verified = await validateLinknoInBasin(linkno).catch(() => null);
    if (!verified) {
      return res.status(400).json({
        error: `LINKNO ${req.params.linkno} is not a verified GEOGLOWS reach inside the Upper Tana Basin AOI.`,
      });
    }
    try {
      const date = typeof req.query.date === 'string' ? req.query.date : null;
      const analysis = await getGeoglowsReachAnalysis(linkno, date);
      res.json(analysis);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'GEOGLOWS reach analysis failed',
      });
    }
  });

  app.get('/api/exposure/screen', async (req, res) => {
    const linkno = parseInt(String(req.query.linkno || ''), 10);
    const bufferMeters = parseInt(String(req.query.bufferMeters || '2000'), 10);
    if (!Number.isInteger(linkno) || linkno <= 0) {
      return res.status(400).json({ error: 'Valid linkno parameter required.' });
    }
    try {
      const result = await screenReachExposure(linkno, bufferMeters);
      res.json(result);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Corridor exposure screening failed',
      });
    }
  });

  // Vite Dev Middleware or Static Production Build
  if (process.env.VERCEL) {
    return app;
  }

  const distDir = path.join(PROJECT_ROOT, 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const isProduction =
    process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);

  if (isProduction) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(distIndex);
    });
  } else {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      if (fs.existsSync(distIndex)) {
        app.use(express.static(distDir));
        app.get('*', (_req, res) => {
          res.sendFile(distIndex);
        });
      } else {
        throw err;
      }
    }
  }

  return app;
}

export const appPromise = createApp();

if (!process.env.VERCEL) {
  void appPromise
    .then((app) => {
      app.listen(PORT, HOST, () => {
        console.log(`FlowWatch Africa server running at http://${HOST}:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Fatal server startup error:', err);
      process.exit(1);
    });
}
