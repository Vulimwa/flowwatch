import type {
  BasinZonalStatsResponse,
  EnsoStatusResponse,
  ExposureScreeningResult,
  StreamflowAnalysisResult,
  SubBasinsResponse,
} from '../../types/geospatial';

const clientCache = new Map<string, unknown>();

async function fetchCached<T>(
  url: string,
  cacheKey?: string,
  signal?: AbortSignal,
  validate?: (body: unknown) => body is T
): Promise<T> {
  if (cacheKey && clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey) as T;
  }
  const resp = await fetch(url, { signal });
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    throw new Error(`Analytics service returned a non-JSON response for ${url} (HTTP ${resp.status}).`);
  }
  if (!resp.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : `Analytics service error (HTTP ${resp.status})`;
    throw new Error(message);
  }
  if (validate && !validate(body)) {
    throw new Error(`Analytics service returned invalid data for ${url}.`);
  }
  if (cacheKey) {
    clientCache.set(cacheKey, body);
  }
  return body as T;
}

function isBasinZonalStatsResponse(body: unknown): body is BasinZonalStatsResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'retrievedAt' in body &&
    typeof body.retrievedAt === 'string' &&
    'analysisWindow' in body &&
    typeof body.analysisWindow === 'string' &&
    'baselinePeriod' in body &&
    typeof body.baselinePeriod === 'string' &&
    'basinWide' in body &&
    typeof body.basinWide === 'object' &&
    body.basinWide !== null &&
    'bySubBasin' in body &&
    Array.isArray(body.bySubBasin) &&
    body.bySubBasin.length === 5
  );
}

export async function fetchTanaSubBasins(
  refresh = false,
  signal?: AbortSignal
): Promise<SubBasinsResponse> {
  if (refresh) clientCache.delete('subbasins');
  return fetchCached<SubBasinsResponse>(
    `/api/basin/subbasins${refresh ? '?refresh=1' : ''}`,
    refresh ? undefined : 'subbasins',
    signal
  );
}

export async function fetchBasinZonalStats(
  refresh = false,
  signal?: AbortSignal
): Promise<BasinZonalStatsResponse> {
  if (refresh) clientCache.delete('zonal-stats');
  return fetchCached<BasinZonalStatsResponse>(
    `/api/basin/zonal-stats${refresh ? '?refresh=1' : ''}`,
    refresh ? undefined : 'zonal-stats',
    signal,
    isBasinZonalStatsResponse
  );
}

export async function fetchEnsoStatus(signal?: AbortSignal): Promise<EnsoStatusResponse> {
  return fetchCached<EnsoStatusResponse>('/api/climate/enso', 'enso-oni', signal);
}

export async function fetchGeoglowsReachAnalysis(
  linkno: number,
  date?: string | null,
  signal?: AbortSignal
): Promise<StreamflowAnalysisResult> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return fetchCached<StreamflowAnalysisResult>(
    `/api/geoglows/river/${linkno}/analysis${qs}`,
    `analysis:${linkno}:${date || 'latest'}`,
    signal
  );
}

export async function fetchExposureScreening(
  linkno: number,
  bufferMeters = 2000,
  signal?: AbortSignal
): Promise<ExposureScreeningResult> {
  return fetchCached<ExposureScreeningResult>(
    `/api/exposure/screen?linkno=${linkno}&bufferMeters=${bufferMeters}`,
    `screen:${linkno}:${bufferMeters}`,
    signal
  );
}
