import type {
  GeoglowsReachRecord,
  RiverJourneyCameraTarget,
  SubBasinPolygon,
} from '../types/geospatial';

const EARTH_RADIUS_METERS = 6_371_008.8;
const MAX_TOPOLOGY_GAP_METERS = 150;
const MAX_JOURNEY_REACHES = 256;

export interface RiverJourneySegment {
  linkno: number;
  coordinates: Array<[number, number]>;
  connectionGapMeters: number | null;
  localMatchVerified: boolean;
}

export interface RiverJourney {
  segments: RiverJourneySegment[];
  stopReason: string;
  distanceMeters: number;
  downstreamDirectionVerified: boolean;
}

export interface RiverJourneySample {
  longitude: number;
  latitude: number;
  distanceMeters: number;
  linkno: number;
  heading: number;
  localMatchVerified: boolean;
}

function distanceMeters(a: [number, number], b: [number, number]): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(b[0] - a[0]);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function longestPath(reach: GeoglowsReachRecord): Array<[number, number]> | null {
  let longest: Array<[number, number]> | null = null;
  let longestLength = 0;
  for (const rawPath of reach.paths) {
    const path = rawPath
      .filter(
        (coordinate) =>
          Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])
      )
      .map(([longitude, latitude]) => [longitude, latitude] as [number, number]);
    let length = 0;
    for (let i = 1; i < path.length; i++) {
      length += distanceMeters(path[i - 1], path[i]);
    }
    if (path.length >= 2 && length > longestLength) {
      longest = path;
      longestLength = length;
    }
  }
  return longest;
}

function reversePath(path: Array<[number, number]>): Array<[number, number]> {
  return [...path].reverse();
}

function pointInRing(longitude: number, latitude: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi + 1e-12) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointInSubBasin(
  longitude: number,
  latitude: number,
  subBasin: SubBasinPolygon
): boolean {
  let containingRings = 0;
  for (const ring of subBasin.rings) {
    if (pointInRing(longitude, latitude, ring)) containingRings++;
  }
  return containingRings % 2 === 1;
}

interface DownstreamConnection {
  upstreamLinkno: number;
  downstreamLinkno: number;
  upstreamEndpoint: 0 | 1;
  downstreamEndpoint: 0 | 1;
  gapMeters: number;
}

interface ReachEndpoint {
  linkno: number;
  endpoint: 0 | 1;
  coordinate: [number, number];
  upstreamAreaKm2: number;
}

const downstreamConnectionCache = new WeakMap<
  GeoglowsReachRecord[],
  Map<number, DownstreamConnection[]>
>();

function getDownstreamConnections(
  reaches: GeoglowsReachRecord[]
): Map<number, DownstreamConnection[]> {
  const cached = downstreamConnectionCache.get(reaches);
  if (cached) return cached;

  const bins = new Map<string, ReachEndpoint[]>();
  const cellSize = 0.0008;
  const cellKey = (longitude: number, latitude: number) =>
    `${Math.floor(longitude / cellSize)}:${Math.floor(latitude / cellSize)}`;

  for (const reach of reaches) {
    const path = longestPath(reach);
    if (!path || !Number.isFinite(reach.upstreamAreaKm2) || reach.upstreamAreaKm2 < 0) {
      continue;
    }
    for (const endpoint of [0, 1] as const) {
      const coordinate = endpoint === 0 ? path[0] : path[path.length - 1];
      const key = cellKey(coordinate[0], coordinate[1]);
      const bucket = bins.get(key) || [];
      bucket.push({
        linkno: reach.linkno,
        endpoint,
        coordinate,
        upstreamAreaKm2: reach.upstreamAreaKm2,
      });
      bins.set(key, bucket);
    }
  }

  const connectionByPair = new Map<string, DownstreamConnection>();
  for (const bucket of bins.values()) {
    for (const endpoint of bucket) {
      const [cellX, cellY] = cellKey(endpoint.coordinate[0], endpoint.coordinate[1])
        .split(':')
        .map(Number);
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const candidates = bins.get(`${cellX + dx}:${cellY + dy}`) || [];
          for (const candidate of candidates) {
            if (
              candidate.linkno === endpoint.linkno ||
              candidate.upstreamAreaKm2 <= endpoint.upstreamAreaKm2
            ) {
              continue;
            }
            const gapMeters = distanceMeters(endpoint.coordinate, candidate.coordinate);
            if (gapMeters > MAX_TOPOLOGY_GAP_METERS) continue;
            const key = `${endpoint.linkno}:${candidate.linkno}`;
            const current = connectionByPair.get(key);
            if (!current || gapMeters < current.gapMeters) {
              connectionByPair.set(key, {
                upstreamLinkno: endpoint.linkno,
                downstreamLinkno: candidate.linkno,
                upstreamEndpoint: endpoint.endpoint,
                downstreamEndpoint: candidate.endpoint,
                gapMeters,
              });
            }
          }
        }
      }
    }
  }

  const connections = new Map<number, DownstreamConnection[]>();
  for (const connection of connectionByPair.values()) {
    const outgoing = connections.get(connection.upstreamLinkno) || [];
    outgoing.push(connection);
    connections.set(connection.upstreamLinkno, outgoing);
  }
  downstreamConnectionCache.set(reaches, connections);
  return connections;
}

export function buildDownstreamRiverJourney(
  startLinkno: number,
  studyAreaReaches: GeoglowsReachRecord[]
): RiverJourney {
  const byLinkno = new Map(
    studyAreaReaches.map((reach) => [reach.linkno, reach])
  );
  const connections = getDownstreamConnections(studyAreaReaches);
  const start = byLinkno.get(startLinkno);
  if (!start || start.matchedFids.length === 0) {
    return {
      segments: [],
      stopReason: 'The selected reach has no verified local Tana River match.',
      distanceMeters: 0,
      downstreamDirectionVerified: false,
    };
  }

  const visited = new Set<number>();
  const segments: RiverJourneySegment[] = [];
  let current = start;
  let currentPath = longestPath(current);
  let firstSegment = true;
  let downstreamDirectionVerified = false;
  let stopReason = 'The downstream journey reached the configured reach limit.';

  while (segments.length < MAX_JOURNEY_REACHES) {
    if (visited.has(current.linkno)) {
      stopReason = `Journey stopped because geometry connectivity returned to LINKNO ${current.linkno}.`;
      break;
    }
    visited.add(current.linkno);

    if (!currentPath) {
      stopReason = `Journey stopped: no usable river geometry is available for LINKNO ${current.linkno}.`;
      break;
    }

    const outgoing = (connections.get(current.linkno) || []).filter(
      (connection) => !visited.has(connection.downstreamLinkno)
    );
    if (outgoing.length === 0) {
      segments.push({
        linkno: current.linkno,
        coordinates: currentPath,
        connectionGapMeters: null,
        localMatchVerified: current.matchedFids.length > 0,
      });
      stopReason =
        segments.length === 1
          ? `No qualifying downstream geometry connection was verified for LINKNO ${current.linkno}; outletcomid is not treated as an immediate next reach.`
          : `Journey stopped at LINKNO ${current.linkno}: no geometry-connected reach with larger upstream area was found inside the selected study area.`;
      break;
    }

    if (outgoing.length > 1) {
      segments.push({
        linkno: current.linkno,
        coordinates: currentPath,
        connectionGapMeters: null,
        localMatchVerified: current.matchedFids.length > 0,
      });
      stopReason = `Journey interrupted at LINKNO ${current.linkno}: ${outgoing.length} possible downstream reaches meet the geometry and upstream-area tests.`;
      break;
    }

    const connection = outgoing[0];
    const downstream = byLinkno.get(connection.downstreamLinkno);
    const downstreamPath = downstream ? longestPath(downstream) : null;
    if (!downstream || !downstreamPath) {
      segments.push({
        linkno: current.linkno,
        coordinates: currentPath,
        connectionGapMeters: null,
        localMatchVerified: current.matchedFids.length > 0,
      });
      stopReason = `Journey stopped: no usable geometry is available for downstream LINKNO ${connection.downstreamLinkno}.`;
      break;
    }

    if (firstSegment) {
      if (connection.upstreamEndpoint === 0) currentPath = reversePath(currentPath);
      downstreamDirectionVerified = true;
    } else if (connection.upstreamEndpoint !== 1) {
      segments.push({
        linkno: current.linkno,
        coordinates: currentPath,
        connectionGapMeters: null,
        localMatchVerified: current.matchedFids.length > 0,
      });
      stopReason = `Journey interrupted at LINKNO ${current.linkno}: geometry direction conflicts with increasing upstream area.`;
      break;
    }

    const orientedDownstream = connection.downstreamEndpoint === 1
      ? reversePath(downstreamPath)
      : downstreamPath;
    segments.push({
      linkno: current.linkno,
      coordinates: currentPath,
      connectionGapMeters: connection.gapMeters,
      localMatchVerified: current.matchedFids.length > 0,
    });
    current = downstream;
    currentPath = orientedDownstream;
    firstSegment = false;
    stopReason = `Connected downstream route continues for ${MAX_JOURNEY_REACHES} reaches; further travel is capped for performance.`;
  }

  if (segments.length === 0 && currentPath) {
    segments.push({
      linkno: current.linkno,
      coordinates: currentPath,
      connectionGapMeters: null,
      localMatchVerified: current.matchedFids.length > 0,
    });
  }

  const distance = segments.reduce((total, segment, segmentIndex) => {
    let segmentLength = 0;
    for (let i = 1; i < segment.coordinates.length; i++) {
      segmentLength += distanceMeters(segment.coordinates[i - 1], segment.coordinates[i]);
    }
    if (segmentIndex > 0) {
      segmentLength += distanceMeters(
        segments[segmentIndex - 1].coordinates.at(-1)!,
        segment.coordinates[0]
      );
    }
    return total + segmentLength;
  }, 0);

  return {
    segments,
    stopReason,
    distanceMeters: distance,
    downstreamDirectionVerified,
  };
}

function headingDegrees(from: [number, number], to: [number, number]): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const toDegrees = (radians: number) => (radians * 180) / Math.PI;
  const lat1 = toRadians(from[1]);
  const lat2 = toRadians(to[1]);
  const deltaLon = toRadians(to[0] - from[0]);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function sampleRiverJourney(
  journey: RiverJourney,
  maxSamples = 400
): RiverJourneySample[] {
  const vertices: Array<{ coordinate: [number, number]; linkno: number }> = [];
  for (const segment of journey.segments) {
    for (const coordinate of segment.coordinates) {
      vertices.push({ coordinate, linkno: segment.linkno });
    }
  }
  if (vertices.length < 2) return [];

  let totalDistance = 0;
  for (let i = 1; i < vertices.length; i++) {
    totalDistance += distanceMeters(vertices[i - 1].coordinate, vertices[i].coordinate);
  }
  const interval = Math.max(250, totalDistance / Math.max(1, maxSamples - 1));
  const samples: RiverJourneySample[] = [
    {
      longitude: vertices[0].coordinate[0],
      latitude: vertices[0].coordinate[1],
      distanceMeters: 0,
      linkno: vertices[0].linkno,
      heading: 0,
      localMatchVerified: journey.segments[0].localMatchVerified,
    },
  ];

  let travelled = 0;
  let nextSampleDistance = interval;
  for (let i = 1; i < vertices.length; i++) {
    const from = vertices[i - 1].coordinate;
    const to = vertices[i].coordinate;
    const segmentLength = distanceMeters(from, to);
    if (segmentLength === 0) continue;

    while (nextSampleDistance <= travelled + segmentLength) {
      const fraction = (nextSampleDistance - travelled) / segmentLength;
      samples.push({
        longitude: from[0] + (to[0] - from[0]) * fraction,
        latitude: from[1] + (to[1] - from[1]) * fraction,
        distanceMeters: nextSampleDistance,
        linkno: vertices[i].linkno,
        heading: headingDegrees(from, to),
        localMatchVerified:
          journey.segments.find((segment) => segment.linkno === vertices[i].linkno)
            ?.localMatchVerified ?? false,
      });
      nextSampleDistance += interval;
    }
    travelled += segmentLength;
  }

  const lastVertex = vertices[vertices.length - 1];
  const lastSample = samples[samples.length - 1];
  if (
    lastSample.longitude !== lastVertex.coordinate[0] ||
    lastSample.latitude !== lastVertex.coordinate[1]
  ) {
    const previous = vertices[vertices.length - 2].coordinate;
    samples.push({
      longitude: lastVertex.coordinate[0],
      latitude: lastVertex.coordinate[1],
      distanceMeters: totalDistance,
      linkno: lastVertex.linkno,
      heading: headingDegrees(previous, lastVertex.coordinate),
      localMatchVerified:
        journey.segments.find((segment) => segment.linkno === lastVertex.linkno)
          ?.localMatchVerified ?? false,
    });
  }

  return samples;
}

export function cameraTargetForJourneySample(
  sample: RiverJourneySample,
  durationMs: number,
  nonce: number
): RiverJourneyCameraTarget {
  return {
    longitude: sample.longitude,
    latitude: sample.latitude,
    heading: sample.heading,
    durationMs,
    nonce,
    linkno: sample.linkno,
    localMatchVerified: sample.localMatchVerified,
  };
}
