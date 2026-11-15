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
  signal?: AbortSignal
): Promise<T> {
  if (cacheKey && clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey) as T;
  }
  const resp = await fetch(url, { signal });
  const body = (await resp.json().catch(() => ({}))) as { error?: string } & T;
  if (!resp.ok) {
    throw new Error(body.error || `Analytics service error (HTTP ${resp.status})`);
  }
  if (cacheKey) {
    clientCache.set(cacheKey, body);
  }
  return body;
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
    signal
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
