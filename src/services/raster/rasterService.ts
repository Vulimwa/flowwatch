import type {
  ColorRampType,
  DatasetDefinition,
  ProbeLayerValue,
  RasterRenderResult,
  RasterTimeSeriesResult,
} from '../../types/geospatial';

const clientRenderCache = new Map<string, RasterRenderResult>();
const clientTimeseriesCache = new Map<string, RasterTimeSeriesResult>();

export async function renderGeoTiffLayer(
  dataset: DatasetDefinition,
  bandIndex?: number
): Promise<RasterRenderResult> {
  const band = bandIndex ?? dataset.defaultBand ?? 0;
  const bandDef = dataset.bands?.find((b) => b.index === band);
  const ramp: ColorRampType = bandDef?.rampOverride || dataset.rampType;
  const isViz = dataset.nature === 'visualization_raster';

  const key = `${dataset.itemId}:${band}:${ramp}:${isViz}`;
  const cached = clientRenderCache.get(key);
  if (cached) return cached;

  const url = `/api/arcgis/raster/${dataset.itemId}/render?band=${band}&ramp=${encodeURIComponent(
    ramp
  )}&isViz=${isViz}&maxDim=768`;

  const resp = await fetch(url);
  const data = (await resp.json()) as RasterRenderResult & { error?: string };
  if (!resp.ok || data.error) {
    throw new Error(data.error || `Failed to render ${dataset.shortTitle}`);
  }
  clientRenderCache.set(key, data);
  return data;
}

export async function fetchGeoTiffTimeSeries(
  itemId: string
): Promise<RasterTimeSeriesResult> {
  const cached = clientTimeseriesCache.get(itemId);
  if (cached) return cached;

  const resp = await fetch(`/api/arcgis/raster/${itemId}/timeseries`);
  const data = (await resp.json()) as RasterTimeSeriesResult & { error?: string };
  if (!resp.ok || data.error) {
    throw new Error(data.error || `Failed to compute band summary for ${itemId}`);
  }
  clientTimeseriesCache.set(itemId, data);
  return data;
}

export async function probeVisibleRasters(
  datasets: Array<{ dataset: DatasetDefinition; activeBand: number }>,
  lon: number,
  lat: number
): Promise<ProbeLayerValue[]> {
  const analyticalOrSw = datasets.filter(
    ({ dataset }) => dataset.nature === 'analytical_raster'
  );

  const settled = await Promise.allSettled(
    analyticalOrSw.map(async ({ dataset, activeBand }): Promise<ProbeLayerValue | null> => {
      const resp = await fetch(
        `/api/arcgis/raster/${dataset.itemId}/probe?lon=${lon}&lat=${lat}`
      );
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        insideBounds: boolean;
        values: Array<{ band: number; name: string; value: number | null }>;
      };
      if (!data.insideBounds || !data.values?.length) return null;

      const target = data.values[activeBand] || data.values[0];
      const bandMeta = dataset.bands?.find((b) => b.index === target.band);
      const units = bandMeta?.units || dataset.units;

      const formattedValue =
        target.value === null
          ? 'NoData / Outside mask'
          : Number.isInteger(target.value)
          ? String(target.value)
          : target.value.toFixed(Math.abs(target.value) < 1 ? 3 : 2);

      return {
        datasetId: dataset.id,
        title: dataset.shortTitle,
        nature: dataset.nature,
        band: target.band,
        bandName: bandMeta?.label || target.name,
        value: target.value,
        formattedValue,
        units,
        allBands: data.values.map((v) => ({ name: v.name, value: v.value })),
      };
    })
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<ProbeLayerValue | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is ProbeLayerValue => v !== null);
}
