import type {
  GeoglowsEnsembleBundle,
  GeoglowsForecastBundle,
  GeoglowsHistoricalResponse,
  GeoglowsMapServerMeta,
  GeoglowsReachContextResponse,
  GeoglowsReachIndexResponse,
  GeoglowsReachRecord,
  GeoglowsReturnPeriodsResponse,
} from '../../types/geospatial';

const responseCache = new Map<string, unknown>();

async function fetchJson<T>(url: string, signal?: AbortSignal, cacheKey?: string): Promise<T> {
  if (cacheKey && responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey) as T;
  }
  const resp = await fetch(url, { signal });
  const responseText = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    if (!resp.ok) {
      throw new Error(`GEOGLOWS service error (HTTP ${resp.status})`);
    }
    throw new Error(`Expected a JSON response from ${url}.`);
  }

  if (!resp.ok) {
    const errorMessage =
      parsed !== null &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof parsed.error === 'string'
        ? parsed.error
        : null;
    throw new Error(errorMessage || `GEOGLOWS service error (HTTP ${resp.status})`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object from ${url}.`);
  }

  const body = parsed as { error?: string } & T;
  if (cacheKey) {
    responseCache.set(cacheKey, body);
  }
  return body;
}

export async function fetchGeoglowsMapServerMeta(signal?: AbortSignal): Promise<GeoglowsMapServerMeta> {
  return fetchJson<GeoglowsMapServerMeta>('/api/geoglows/mapserver-meta', signal, 'mapserver-meta');
}

export async function fetchTanaGeoglowsReachIndex(
  refresh = false,
  signal?: AbortSignal
): Promise<GeoglowsReachIndexResponse> {
  if (refresh) responseCache.delete('reach-index');
  const cacheKey = refresh ? undefined : 'reach-index';
  const index = await fetchJson<GeoglowsReachIndexResponse>(
    `/api/geoglows/reaches${refresh ? '?refresh=1' : ''}`,
    signal,
    cacheKey
  );
  if (!Array.isArray(index.reaches) || !Array.isArray(index.tanaMatches)) {
    if (cacheKey) responseCache.delete(cacheKey);
    throw new Error('The GEOGLOWS reach-index response is missing its reach arrays.');
  }
  return index;
}

export async function identifyGeoglowsReachAtPoint(
  lon: number,
  lat: number,
  signal?: AbortSignal
): Promise<{
  reach: GeoglowsReachRecord | null;
  distanceMeters: number | null;
  apiNearestRiverId: number | null;
}> {
  return fetchJson(
    `/api/geoglows/identify?lon=${encodeURIComponent(lon)}&lat=${encodeURIComponent(lat)}`,
    signal
  );
}

export async function fetchGeoglowsForecast(
  linkno: number,
  date?: string | null,
  signal?: AbortSignal
): Promise<GeoglowsForecastBundle> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return fetchJson<GeoglowsForecastBundle>(
    `/api/geoglows/river/${linkno}/forecast${qs}`,
    signal,
    `forecast:${linkno}:${date || 'latest'}`
  );
}

export async function fetchGeoglowsEnsembles(
  linkno: number,
  date?: string | null,
  signal?: AbortSignal
): Promise<GeoglowsEnsembleBundle> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return fetchJson<GeoglowsEnsembleBundle>(
    `/api/geoglows/river/${linkno}/ensembles${qs}`,
    signal,
    `ensembles:${linkno}:${date || 'latest'}`
  );
}

export async function fetchGeoglowsHistorical(
  linkno: number,
  mode: 'daily' | 'monthly' | 'annual' | 'monthly_climatology' | 'daily_climatology',
  startDate?: string,
  endDate?: string,
  signal?: AbortSignal
): Promise<GeoglowsHistoricalResponse> {
  const params = new URLSearchParams({ mode });
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const key = `hist:${linkno}:${mode}:${startDate || ''}:${endDate || ''}`;
  return fetchJson<GeoglowsHistoricalResponse>(
    `/api/geoglows/river/${linkno}/historical?${params.toString()}`,
    signal,
    key
  );
}

export async function fetchGeoglowsReturnPeriods(
  linkno: number,
  signal?: AbortSignal
): Promise<GeoglowsReturnPeriodsResponse> {
  return fetchJson<GeoglowsReturnPeriodsResponse>(
    `/api/geoglows/river/${linkno}/return-periods`,
    signal,
    `rp:${linkno}`
  );
}

export async function fetchGeoglowsReachContext(
  linkno: number,
  lon?: number,
  lat?: number,
  signal?: AbortSignal
): Promise<GeoglowsReachContextResponse> {
  const params = new URLSearchParams();
  if (typeof lon === 'number' && Number.isFinite(lon)) params.set('lon', String(lon));
  if (typeof lat === 'number' && Number.isFinite(lat)) params.set('lat', String(lat));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return fetchJson<GeoglowsReachContextResponse>(
    `/api/geoglows/river/${linkno}/context${qs}`,
    signal,
    `ctx:${linkno}:${lon?.toFixed(4) || ''}:${lat?.toFixed(4) || ''}`
  );
}
