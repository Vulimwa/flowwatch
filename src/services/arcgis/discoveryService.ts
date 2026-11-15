import { DATA_REGISTRY, TANA_STREAMS_SERVICE_URL } from '../../config/dataRegistry';
import type {
  DatasetDefinition,
  DiscoveredServiceMetadata,
  GeoglowsMapServerMeta,
} from '../../types/geospatial';

const inFlight = new Map<string, Promise<DiscoveredServiceMetadata>>();

export async function discoverDatasetMetadata(
  dataset: DatasetDefinition
): Promise<DiscoveredServiceMetadata> {
  const existing = inFlight.get(dataset.id);
  if (existing) return existing;

  const promise = (async (): Promise<DiscoveredServiceMetadata> => {
    try {
      if (dataset.nature === 'map_service') {
        const resp = await fetch('/api/geoglows/mapserver-meta');
        const gm = (await resp.json()) as GeoglowsMapServerMeta;
        if (!resp.ok || gm.status === 'error') {
          return {
            itemId: dataset.itemId,
            itemTitle: gm.layerName || dataset.title,
            itemName: 'GEOGLOWS/GlobalWaterModel_Medium/MapServer/0',
            itemType: 'Map Service',
            access: 'public',
            sizeBytes: null,
            dimensions: null,
            bandCount: null,
            bandNames: [],
            overviews: null,
            bbox: [36.55, -1.25, 38.65, 0.45],
            pixelSizeDeg: null,
            approxResolutionLabel: 'Vector Reach Network (Global Water Model)',
            pixelType: 'MapServer Layer 0',
            nodata: null,
            spatialReference: 'EPSG:3857 (Web Mercator)',
            featureFields: gm.fields || [],
            status: 'error',
            errorMessage: gm.errorMessage || `HTTP ${resp.status}`,
            checkedAt: gm.checkedAt || new Date().toISOString(),
          };
        }
        return {
          itemId: dataset.itemId,
          itemTitle: gm.layerName,
          itemName: 'GEOGLOWS/GlobalWaterModel_Medium/MapServer/0',
          itemType: 'Map Service',
          access: 'public',
          sizeBytes: null,
          dimensions: null,
          bandCount: null,
          bandNames: [],
          overviews: null,
          bbox: [36.55, -1.25, 38.65, 0.45],
          pixelSizeDeg: null,
          approxResolutionLabel: `Time-enabled (${gm.timeIntervalHours}h UTC)`,
          pixelType: 'MapServer Layer 0 (Polyline)',
          nodata: null,
          spatialReference: 'EPSG:3857 (Web Mercator)',
          featureFields: gm.fields,
          status: 'available',
          checkedAt: gm.checkedAt,
        };
      }

      const endpoint =
        dataset.nature === 'feature_service'
          ? `/api/arcgis/feature-meta?id=${encodeURIComponent(dataset.id)}`
          : `/api/arcgis/item/${dataset.itemId}`;
      const resp = await fetch(endpoint);
      const data = (await resp.json()) as DiscoveredServiceMetadata;
      if (!resp.ok || data.status === 'error') {
        return {
          ...data,
          itemId: dataset.itemId,
          status: 'error',
          errorMessage: data.errorMessage || `HTTP ${resp.status}`,
          checkedAt: new Date().toISOString(),
        };
      }
      return data;
    } catch (err) {
      return {
        itemId: dataset.itemId,
        itemTitle: null,
        itemName: null,
        itemType: null,
        access: null,
        sizeBytes: null,
        dimensions: null,
        bandCount: null,
        bandNames: [],
        overviews: null,
        bbox: null,
        pixelSizeDeg: null,
        approxResolutionLabel: 'Unavailable',
        pixelType: null,
        nodata: null,
        spatialReference: null,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Discovery request failed',
        checkedAt: new Date().toISOString(),
      };
    } finally {
      inFlight.delete(dataset.id);
    }
  })();

  inFlight.set(dataset.id, promise);
  return promise;
}

export async function discoverAllRegistryMetadata(
  onItemResolved?: (id: string, meta: DiscoveredServiceMetadata) => void
): Promise<Record<string, DiscoveredServiceMetadata>> {
  const results: Record<string, DiscoveredServiceMetadata> = {};
  const concurrency = 6;
  let index = 0;

  async function worker() {
    while (index < DATA_REGISTRY.length) {
      const current = DATA_REGISTRY[index++];
      const meta = await discoverDatasetMetadata(current);
      results[current.id] = meta;
      onItemResolved?.(current.id, meta);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

export interface StreamSearchRecord {
  fid: number;
  name: string;
  lengthMeters: number;
}

export async function queryNamedStreams(searchText = ''): Promise<StreamSearchRecord[]> {
  const trimmed = searchText.trim().replace(/'/g, "''");
  const where = trimmed
    ? `UPPER(NAME) LIKE UPPER('%${trimmed}%')`
    : `NAME IS NOT NULL AND NAME <> ' '`;
  const url = `${TANA_STREAMS_SERVICE_URL}/0/query?where=${encodeURIComponent(
    where
  )}&outFields=FID,NAME,Shape__Length&returnGeometry=false&orderByFields=Shape__Length DESC&resultRecordCount=150&f=pjson`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Stream query failed (${resp.status})`);
  const json = (await resp.json()) as {
    features?: Array<{ attributes: { FID: number; NAME: string; Shape__Length: number } }>;
    error?: { message: string };
  };
  if (json.error) throw new Error(json.error.message);
  return (json.features || []).map((f) => ({
    fid: f.attributes.FID,
    name: (f.attributes.NAME || '').trim() || `Unnamed Reach #${f.attributes.FID}`,
    lengthMeters: Number(f.attributes.Shape__Length) || 0,
  }));
}
