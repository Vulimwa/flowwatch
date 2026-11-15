import ElevationLayer from '@arcgis/core/layers/ElevationLayer';
import Multipoint from '@arcgis/core/geometry/Multipoint';
import Point from '@arcgis/core/geometry/Point';
import type { RiverJourneySample } from '../../utils/riverJourney';

const TERRAIN3D_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';

let terrainLayer: ElevationLayer | null = null;
const pointElevationCache = new Map<string, number | null>();

export interface RiverTerrainProfileSample {
  longitude: number;
  latitude: number;
  distanceMeters: number;
  linkno: number;
  elevationMeters: number | null;
  resolutionMeters: number | null;
}

export interface RiverTerrainProfile {
  samples: RiverTerrainProfileSample[];
  source: string;
  samplingIntervalMeters: number;
  resolutionRangeMeters: [number, number] | null;
  missingCount: number;
  noDataValue: number | null;
}

export async function queryTrueTerrainElevation(
  longitude: number,
  latitude: number,
  signal?: AbortSignal
): Promise<number | null> {
  const key = `${longitude.toFixed(4)}:${latitude.toFixed(4)}`;
  if (pointElevationCache.has(key)) return pointElevationCache.get(key) ?? null;

  terrainLayer ??= new ElevationLayer({ url: TERRAIN3D_URL });
  const result = await terrainLayer.queryElevation(
    new Point({
      longitude,
      latitude,
      spatialReference: { wkid: 4326 },
    }),
    { demResolution: 'auto', signal }
  );
  const elevation = result.geometry.z;
  const value =
    typeof elevation === 'number' &&
    Number.isFinite(elevation) &&
    (result.noDataValue == null || Math.abs(elevation - result.noDataValue) > 1e-6)
      ? elevation
      : null;
  pointElevationCache.set(key, value);
  if (pointElevationCache.size > 2048) {
    const oldestKey = pointElevationCache.keys().next().value;
    if (oldestKey) pointElevationCache.delete(oldestKey);
  }
  return value;
}

export async function queryRiverTerrainProfile(
  routeSamples: RiverJourneySample[],
  signal?: AbortSignal
): Promise<RiverTerrainProfile> {
  if (routeSamples.length < 2) {
    throw new Error('At least two connected river locations are required for an elevation profile.');
  }

  terrainLayer ??= new ElevationLayer({ url: TERRAIN3D_URL });
  const result = await terrainLayer.queryElevation(
    new Multipoint({
      points: routeSamples.map((sample) => [sample.longitude, sample.latitude]),
      spatialReference: { wkid: 4326 },
    }),
    {
      demResolution: 'auto',
      returnSampleInfo: true,
      signal,
    }
  );

  const points = result.geometry.points;
  const samples = routeSamples.map((sample, index) => {
    const elevation = points[index]?.[2];
    const resolution = result.sampleInfo?.[index]?.demResolution;
    const hasElevation =
      typeof elevation === 'number' &&
      Number.isFinite(elevation) &&
      (result.noDataValue == null || Math.abs(elevation - result.noDataValue) > 1e-6) &&
      resolution !== -1;
    return {
      longitude: sample.longitude,
      latitude: sample.latitude,
      distanceMeters: sample.distanceMeters,
      linkno: sample.linkno,
      elevationMeters: hasElevation ? elevation : null,
      resolutionMeters:
        typeof resolution === 'number' && resolution > 0 ? resolution : null,
    };
  });

  const validResolutions = samples
    .map((sample) => sample.resolutionMeters)
    .filter((resolution): resolution is number => resolution !== null);
  const distances = samples.map((sample) => sample.distanceMeters);
  let samplingIntervalMeters = 0;
  for (let i = 1; i < distances.length; i++) {
    const interval = distances[i] - distances[i - 1];
    if (interval > 0 && (samplingIntervalMeters === 0 || interval < samplingIntervalMeters)) {
      samplingIntervalMeters = interval;
    }
  }

  return {
    samples,
    source: TERRAIN3D_URL,
    samplingIntervalMeters,
    resolutionRangeMeters:
      validResolutions.length > 0
        ? [Math.min(...validResolutions), Math.max(...validResolutions)]
        : null,
    missingCount: samples.filter((sample) => sample.elevationMeters === null).length,
    noDataValue: result.noDataValue ?? null,
  };
}
