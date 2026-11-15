import type {
  BasinZonalStatsResponse,
  CatchmentSignalConsistency,
  DamScenarioResult,
  EnsoStatusResponse,
  ExposureScreeningResult,
  GeoglowsReachRecord,
  SituationAssessmentReport,
  StreamflowAnalysisResult,
  SubBasinPolygon,
  SubBasinZonalStats,
} from '../types/geospatial';

export interface ReportBuilderInputs {
  selectedSubBasin: SubBasinPolygon | null;
  zonalStats: BasinZonalStatsResponse | null;
  activeSubBasinZonal: SubBasinZonalStats | null;
  enso: EnsoStatusResponse | null;
  selectedReach: GeoglowsReachRecord | null;
  streamflowAnalysis: StreamflowAnalysisResult | null;
  signalConsistency: CatchmentSignalConsistency | null;
  exposureScreening: ExposureScreeningResult | null;
  damScenarioResult: DamScenarioResult | null;
  damIsHypothetical: true;
}

export function buildSituationAssessmentReport(
  inputs: ReportBuilderInputs
): SituationAssessmentReport {
  const {
    selectedSubBasin,
    zonalStats,
    activeSubBasinZonal,
    enso,
    selectedReach,
    streamflowAnalysis,
    signalConsistency,
    exposureScreening,
    damScenarioResult,
  } = inputs;

  const targetZonal = activeSubBasinZonal || zonalStats?.basinWide || null;
  const subName = selectedSubBasin
    ? selectedSubBasin.name
    : 'All 5 Upper Tana Sub-Basins (AOI Union)';

  const ensoContext =
    enso?.status === 'available' && enso.latestSeason
      ? `Observed NOAA CPC ONI (${enso.latestSeason.seasonCode} ${enso.latestSeason.year}): ${
          enso.latestSeason.oniAnomalyC >= 0 ? '+' : ''
        }${enso.latestSeason.oniAnomalyC.toFixed(2)} °C (${enso.latestSeason.phase}, threshold ±0.5 °C). Caveat: ${
          enso.tanaSeasonCaveat
        }`
      : 'NOAA CPC ONI feed status unavailable at report generation time.';

  const rainfallConditions = targetZonal
    ? `2026 Jan–Sep YTD CHIRPS rainfall over ${targetZonal.name} averages ${
        targetZonal.chirpsYtd2026Mm.mean?.toFixed(0) ?? '—'
      } mm versus ${
        targetZonal.chirpsYtdBaselineMm.mean?.toFixed(0) ?? '—'
      } mm for the matched 2001–2025 Jan–Sep baseline (${
        targetZonal.chirpsAnomMm.mean !== null
          ? `${targetZonal.chirpsAnomMm.mean >= 0 ? '+' : ''}${targetZonal.chirpsAnomMm.mean.toFixed(0)} mm`
          : '—'
      }, ${
        targetZonal.chirpsAnomPct.mean !== null
          ? `${targetZonal.chirpsAnomPct.mean >= 0 ? '+' : ''}${targetZonal.chirpsAnomPct.mean.toFixed(1)}%`
          : '—'
      }, z = ${targetZonal.chirpsAnomZ.mean?.toFixed(2) ?? '—'}). Note: Oct–Dec 2026 data are absent (incomplete year).`
    : 'CHIRPS polygon-masked zonal statistics not loaded.';

  const catchmentWetnessAndPet = targetZonal
    ? `ERA5-Land root-zone (0–100 cm) soil moisture averages ${
        targetZonal.era5SmRootZone2026.mean?.toFixed(4) ?? '—'
      } m³/m³ (baseline ${
        targetZonal.era5SmRootZoneBaseline.mean?.toFixed(4) ?? '—'
      } m³/m³, anomaly ${
        targetZonal.era5SmRootZoneAnom.mean !== null
          ? `${targetZonal.era5SmRootZoneAnom.mean >= 0 ? '+' : ''}${targetZonal.era5SmRootZoneAnom.mean.toFixed(4)}`
          : '—'
      } m³/m³). Potential Evapotranspiration (atmospheric demand, not actual ET) averages ${
        targetZonal.era5Pet2026MmDay.mean?.toFixed(2) ?? '—'
      } mm/day.`
    : 'ERA5-Land soil moisture and PET zonal summaries not loaded.';

  const streamflowConditions =
    selectedReach && streamflowAnalysis
      ? `Verified GEOGLOWS reach ${selectedReach.displayName} (LINKNO ${selectedReach.linkno}, UPA ${selectedReach.upstreamAreaKm2.toFixed(
          0
        )} km²) shows signal "${streamflowAnalysis.signalClass}". Initial 51-member median is ${
          streamflowAnalysis.forecastMetrics.initialMedianM3s?.toFixed(1) ?? '—'
        } m³/s, peaking at ${
          streamflowAnalysis.forecastMetrics.peakMedianM3s?.toFixed(1) ?? '—'
        } m³/s (IQR width ${
          streamflowAnalysis.forecastMetrics.peakIqrWidthM3s?.toFixed(1) ?? '—'
        } m³/s, uncertainty: ${
          streamflowAnalysis.forecastMetrics.uncertaintyLevel
        }). Separate 10-day deterministic HRES peaks at ${
          streamflowAnalysis.forecastMetrics.peakHresM3s?.toFixed(1) ?? '—'
        } m³/s.`
      : 'No verified GEOGLOWS reach forecast loaded at export time.';

  const forecastVsHistorical = streamflowAnalysis
    ? `Peak 51-member median ranks at the ${
        streamflowAnalysis.forecastMetrics.peakMedianHistoricalPercentile ?? '—'
      }th percentile of ${streamflowAnalysis.historicalSampleSize} monthly retrospective simulated records (1940–present) and is ${
        streamflowAnalysis.forecastMetrics.peakMedianVsMatchedMonthRatio ?? '—'
      }× the matched calendar-month median (${
        streamflowAnalysis.historicalPercentiles.matchedMonthMedian?.toFixed(1) ?? '—'
      } m³/s).`
    : 'Historical percentile comparison unavailable.';

  const returnPeriodInterpretation = streamflowAnalysis
    ? `Model-derived Gumbel reference: Median peak = ${streamflowAnalysis.exceedance.highestExceededRpByMedian}; Max ensemble peak = ${streamflowAnalysis.exceedance.highestExceededRpByMaxEnsemble}. Ensemble median exceeds 2-yr RP for ${streamflowAnalysis.exceedance.hoursAboveRp2Median} hours (${streamflowAnalysis.exceedance.pctHorizonAboveRp2Median}% of forecast steps).`
    : 'Return-period exceedance analysis unavailable.';

  const signalConsistencyText = signalConsistency
    ? `${signalConsistency.classification}: ${signalConsistency.summary}`
    : 'Signal consistency evaluation unavailable.';

  const potentiallyExposedAreas = exposureScreening
    ? `Proximity screening (${exposureScreening.bufferMeters.toLocaleString()} m distance buffer around LINKNO ${
        exposureScreening.linkno
      }, NOT a flood boundary) contains an estimated ${
        exposureScreening.population2025.estimatedTotal?.toLocaleString() ?? '—'
      } residents (2025 ~100 m grid, zero double-counting), ${
        exposureScreening.builtUp2020.meanBuiltUpPct?.toFixed(1) ?? '—'
      }% mean Built-Up (2020), ${
        exposureScreening.handTerrain.pctUnder5m?.toFixed(1) ?? '—'
      }% corridor terrain <5 m HAND, ${exposureScreening.nearbySettlements.length} named town points, and ${
        exposureScreening.nearbyHealthFacilities.length
      } MOH health facilities.`
    : 'Run Impact & Exposure proximity screening on a reach to populate corridor estimates.';

  const waterManagementConsiderations = damScenarioResult
    ? `Hypothetical Scenario ("${damScenarioResult.params.name}", ${damScenarioResult.params.days} days — NOT live KenGen SCADA): Starting ${damScenarioResult.params.initialStorageMcm} MCM with hypothetical inflow ${damScenarioResult.params.inflowM3s} m³/s and release ${damScenarioResult.params.proposedReleaseM3s} m³/s yields end storage ${damScenarioResult.remainingStorageMcm.toFixed(
        1
      )} MCM (${damScenarioResult.fillPct.toFixed(1)}%, status: ${
        damScenarioResult.storageRiskStatus
      }), spill ${damScenarioResult.spillMcm.toFixed(1)} MCM, and combined downstream flow ${damScenarioResult.downstreamAtOutletM3s.toFixed(
        1
      )} m³/s.`
    : 'Hypothetical reservoir scenario not evaluated.';

  return {
    title: 'FlowWatch Africa — Upper Tana Basin Situation & River Intelligence Report',
    generatedAt: new Date().toISOString(),
    analysisWindow: zonalStats?.analysisWindow || '2026 YTD (Jan–Sep; incomplete year)',
    selectedSubBasinName: subName,
    selectedLinkno: selectedReach?.linkno ?? null,
    selectedReachName: selectedReach?.displayName ?? 'None selected',
    ensoContext,
    rainfallConditions,
    catchmentWetnessAndPet,
    streamflowConditions,
    forecastVsHistorical,
    returnPeriodInterpretation,
    signalConsistency: signalConsistencyText,
    potentiallyExposedAreas,
    waterManagementConsiderations,
    uncertaintyAndLimitations: [
      'GEOGLOWS v2 forecasts and 1940–present historical simulations are ECMWF global runoff-routed models without live KenGen reservoir rule curves or Kenyan WRA station gauge assimilation.',
      '2026 CHIRPS datasets end in September (Jan–Sep); Oct–Dec Short Rains are absent.',
      'PET measures atmospheric evaporative demand, not actual evapotranspiration.',
      'Proximity buffers (500 m–5 km) and HAND <5 m classes are screening tools, NOT calibrated hydraulic flood inundation maps.',
      'Reservoir simulation outputs reflect user-configured hypothetical inputs, not KenGen SCADA telemetry.',
    ],
    dataSourcesAndMethodology: [
      'NOAA Climate Prediction Center Oceanic Niño Index (ERSST.v5)',
      'UCSB CHIRPS v2.0 Rainfall (0.05° GeoTIFFs, 2001–2025 baseline vs Jan–Sep 2026)',
      'ECMWF ERA5-Land Soil Moisture, 2m Temperature, and PET (0.10° GeoTIFFs)',
      'HydroBASINS Pfafstetter Level-7 Africa Polygons (MAIN_BAS 1070008470)',
      'GEOGLOWS ECMWF REST API v2, Living Atlas GlobalWaterModel_Medium MapServer & S3 Gumbel Return Periods Zarr',
      'SRTM/Copernicus DEM (~30 m), Slope, Flow Accumulation, HAND (~90 m), EC JRC Surface Water, ESA WorldCover (10 m), WorldPop/GHSL 2025 (~100 m), Built-Up 2020 (~100 m)',
      'Africa GeoPortal Vector Services: tanariverstreams, Kenya_Towns, KenyaHealthFacilities2026, Kenya_Primary_Schools',
    ],
  };
}

export function reportToMarkdown(report: SituationAssessmentReport): string {
  return [
    `# ${report.title}`,
    `- **Generated (UTC):** ${report.generatedAt}`,
    `- **Analysis Window:** ${report.analysisWindow}`,
    `- **Selected Sub-Basin:** ${report.selectedSubBasinName}`,
    `- **Selected River Reach:** ${report.selectedReachName} (LINKNO: ${report.selectedLinkno ?? 'None'})`,
    '',
    '## 1. ENSO Context (Observed Global Index)',
    report.ensoContext,
    '',
    '## 2. Catchment Rainfall Conditions (Observed Satellite/Gauge)',
    report.rainfallConditions,
    '',
    '## 3. Catchment Wetness & Atmospheric Demand (Modelled Reanalysis)',
    report.catchmentWetnessAndPet,
    '',
    '## 4. Modelled Streamflow Conditions (GEOGLOWS ECMWF)',
    report.streamflowConditions,
    '',
    '## 5. Forecast vs. Historical Distribution',
    report.forecastVsHistorical,
    '',
    '## 6. Return-Period Reference Interpretation',
    report.returnPeriodInterpretation,
    '',
    '## 7. Multi-Signal Consistency Assessment',
    report.signalConsistency,
    '',
    '## 8. Proximity Screening & Potentially Exposed Corridors (Estimated)',
    report.potentiallyExposedAreas,
    '',
    '## 9. Hypothetical Water Operations Exploration',
    report.waterManagementConsiderations,
    '',
    '## 10. Key Uncertainties & Scientific Limitations',
    ...report.uncertaintyAndLimitations.map((l) => `- ${l}`),
    '',
    '## 11. Data Sources & Provenance',
    ...report.dataSourcesAndMethodology.map((s) => `- ${s}`),
    '',
  ].join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
