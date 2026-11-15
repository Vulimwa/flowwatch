import type {
  CatchmentSignalConsistency,
  StreamflowAnalysisResult,
  SubBasinZonalStats,
} from '../types/geospatial';

export function evaluateCatchmentSignalConsistency(
  subBasin: SubBasinZonalStats | null,
  streamflow: StreamflowAnalysisResult | null,
  reachName?: string | null
): CatchmentSignalConsistency {
  if (!subBasin) {
    return {
      classification: 'Insufficient for interpretation',
      summary: 'Sub-basin polygon zonal statistics are not yet available.',
      checks: [],
      explanation: ['Select or load an Upper Tana sub-basin to evaluate cross-variable signal consistency.'],
    };
  }

  const pAnomPct = subBasin.chirpsAnomPct.mean;
  const pZ = subBasin.chirpsAnomZ.mean;
  const smAnom = subBasin.era5SmRootZoneAnom.mean;
  const smZ = subBasin.era5SmRootZoneZ.mean;
  const petRecent = subBasin.era5Pet2026MmDay.mean;
  const petBase = subBasin.era5PetBaseMmDay.mean;
  const flowPct = streamflow?.forecastMetrics.peakMedianHistoricalPercentile ?? null;

  const rainDir: 'wet / elevated' | 'dry / deficit' | 'neutral' | 'unavailable' =
    pAnomPct === null
      ? 'unavailable'
      : pAnomPct >= 10
      ? 'wet / elevated'
      : pAnomPct <= -10
      ? 'dry / deficit'
      : 'neutral';

  const smDir: 'wet / elevated' | 'dry / deficit' | 'neutral' | 'unavailable' =
    smZ === null && smAnom === null
      ? 'unavailable'
      : (smZ ?? 0) >= 0.4 || (smAnom ?? 0) >= 0.015
      ? 'wet / elevated'
      : (smZ ?? 0) <= -0.4 || (smAnom ?? 0) <= -0.015
      ? 'dry / deficit'
      : 'neutral';

  const petDiff = petRecent !== null && petBase !== null ? petRecent - petBase : null;
  const petNote =
    petDiff === null
      ? 'PET baseline unavailable.'
      : petDiff > 0.15
      ? `Atmospheric evaporative demand is +${petDiff.toFixed(2)} mm/d above 2001–2025 baseline (can accelerate surface drying when rainfall is weak).`
      : petDiff < -0.15
      ? `Atmospheric demand is ${petDiff.toFixed(2)} mm/d below baseline.`
      : 'Atmospheric demand is near the 2001–2025 climatological mean.';

  const flowDir: 'wet / elevated' | 'dry / deficit' | 'neutral' | 'unavailable' =
    flowPct === null
      ? 'unavailable'
      : flowPct >= 75
      ? 'wet / elevated'
      : flowPct <= 25
      ? 'dry / deficit'
      : 'neutral';

  const checks: CatchmentSignalConsistency['checks'] = [
    {
      indicator: 'CHIRPS YTD Precipitation Anomaly (Jan–Sep 2026)',
      signalDirection: rainDir,
      observedValue:
        pAnomPct !== null
          ? `${pAnomPct >= 0 ? '+' : ''}${pAnomPct.toFixed(1)}% (${pZ !== null ? `z = ${pZ.toFixed(2)}` : '—'})`
          : 'Unavailable',
      note: '2026 Jan–Sep rainfall vs matched 2001–2025 baseline.',
    },
    {
      indicator: 'ERA5-Land Root-Zone Soil Moisture (0–100 cm)',
      signalDirection: smDir,
      observedValue:
        smAnom !== null
          ? `${smAnom >= 0 ? '+' : ''}${smAnom.toFixed(4)} m³/m³ (${smZ !== null ? `z = ${smZ.toFixed(2)}` : '—'})`
          : 'Unavailable',
      note: 'Antecedent catchment storage at 0.10° (~11 km) resolution.',
    },
    {
      indicator: 'ERA5-Land Potential Evapotranspiration (PET)',
      signalDirection:
        petDiff === null ? 'unavailable' : petDiff > 0.25 ? 'dry / deficit' : 'neutral',
      observedValue:
        petRecent !== null
          ? `${petRecent.toFixed(2)} mm/d (Base ${petBase?.toFixed(2) ?? '—'})`
          : 'Unavailable',
      note: petNote,
    },
    {
      indicator: `GEOGLOWS Reach Forecast (${reachName || (streamflow ? `LINKNO ${streamflow.linkno}` : 'No reach')})`,
      signalDirection: flowDir,
      observedValue:
        streamflow && flowPct !== null
          ? `${streamflow.forecastMetrics.peakMedianM3s?.toFixed(1) ?? '—'} m³/s (${flowPct}th hist. %ile)`
          : 'Unavailable',
      note: streamflow
        ? `${streamflow.signalClass} (${streamflow.exceedance.highestExceededRpByMedian}).`
        : 'Select a verified reach to compare river response.',
    },
  ];

  const coreSignals = [rainDir, smDir, flowDir].filter((d) => d !== 'unavailable');
  if (coreSignals.length < 2) {
    return {
      classification: 'Insufficient for interpretation',
      summary: 'Fewer than two core hydrological indicators have valid data for this comparison.',
      checks,
      explanation: [
        'At least two core signals (rainfall, root-zone soil moisture, and GEOGLOWS discharge) are needed to cross-check physical consistency.',
      ],
    };
  }

  const wetCount = coreSignals.filter((d) => d === 'wet / elevated').length;
  const dryCount = coreSignals.filter((d) => d === 'dry / deficit').length;
  const neutralCount = coreSignals.filter((d) => d === 'neutral').length;

  let classification: CatchmentSignalConsistency['classification'] = 'Partially consistent';
  let summary = '';
  const explanation: string[] = [];

  if (wetCount > 0 && dryCount > 0) {
    classification = 'Contradictory';
    summary =
      'Catchment EO wetness/rainfall and modelled river discharge point in opposite directions.';
    explanation.push(
      'CHIRPS YTD (Jan–Sep 2026) and ERA5 soil moisture reflect seasonal conditions over the selected sub-basin, whereas GEOGLOWS reflects the active 15-day weather forecast routed from the entire upstream contributing drainage.'
    );
    explanation.push(
      'Operational reservoir regulation (e.g., Masinga and Seven Forks) or localized short-term storm events can also cause divergence between sub-basin averages and reach discharge.'
    );
  } else if (
    (wetCount === coreSignals.length) ||
    (dryCount === coreSignals.length) ||
    (neutralCount === coreSignals.length)
  ) {
    classification = 'Consistent';
    summary =
      wetCount === coreSignals.length
        ? 'Rainfall, root-zone soil moisture, and GEOGLOWS streamflow align toward wetter / elevated conditions.'
        : dryCount === coreSignals.length
        ? 'Rainfall, soil moisture, and GEOGLOWS streamflow consistently point toward below-normal / drier conditions.'
        : 'Precipitation, soil wetness, and river discharge all remain near normal climatological ranges.';
    explanation.push(
      'Multi-source hydrological evidence shows coherent direction across meteorological input, land-surface wetness, and routed streamflow.'
    );
  } else {
    classification = 'Partially consistent';
    summary =
      'At least one indicator shows an anomaly while other catchment signals remain near neutral.';
    explanation.push(
      'Lag times between rainfall accumulation, soil moisture storage recharge, and downstream channel routing frequently produce transitional or mixed signals.'
    );
  }

  if (rainDir === 'dry / deficit' && petDiff !== null && petDiff > 0.15) {
    explanation.push(
      'Elevated atmospheric demand (PET) reinforces moisture stress during below-average rainfall.'
    );
  }

  return { classification, summary, checks, explanation };
}
