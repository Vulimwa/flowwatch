import {
  CalciteAction,
  CalciteButton,
  CalciteCard,
  CalciteChip,
  CalciteLoader,
  CalciteNotice,
} from '@esri/calcite-components-react';
import { DATA_REGISTRY } from '../../config/dataRegistry';
import { RAMP_GRADIENTS } from '../../config/theme';
import type { LayerRuntimeState } from '../../hooks/useFlowWatchState';
import type {
  DatasetDefinition,
  DiscoveredServiceMetadata,
  GeoglowsMapServerMeta,
  IdentifyResult,
} from '../../types/geospatial';

interface LegendPanelProps {
  visibleDatasets: DatasetDefinition[];
  layersState: Record<string, LayerRuntimeState>;
  geoglowsMapMeta?: GeoglowsMapServerMeta | null;
  geoglowsForecastTimeMs?: number | null;
  onOpenDatasetInfo: (id: string) => void;
}

export function LegendPanel({
  visibleDatasets,
  layersState,
  geoglowsMapMeta,
  geoglowsForecastTimeMs,
  onOpenDatasetInfo,
}: LegendPanelProps) {
  if (visibleDatasets.length === 0) {
    return (
      <div className="p-3">
        <CalciteNotice open kind="info" scale="s" icon="legend">
          <div slot="title">No active layers</div>
          <div slot="message">
            Turn on any rainfall, soil moisture, terrain, surface water, or river layer to inspect its legend.
          </div>
        </CalciteNotice>
      </div>
    );
  }

  return (
    <div className="p-3 flex flex-col gap-3">
      {visibleDatasets.map((ds) => {
        const st = layersState[ds.id];
        const bandDef = ds.bands?.find((b) => b.index === st?.band);
        const rampKey = bandDef?.rampOverride || ds.rampType;
        const rampInfo = RAMP_GRADIENTS[rampKey];
        const stats = st?.render?.stats;
        const units = bandDef?.units || ds.units;

        return (
          <CalciteCard key={ds.id} scale="s">
            <span slot="heading">{ds.shortTitle}</span>
            <span slot="description">{bandDef ? bandDef.label : ds.period}</span>
            <CalciteAction
              slot="footer-end"
              scale="s"
              icon="information"
              text={`Metadata for ${ds.shortTitle}`}
              onClick={() => onOpenDatasetInfo(ds.id)}
            />

            {ds.nature === 'feature_service' && (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
                <span
                  className="inline-block w-6 h-0.5 shrink-0"
                  style={{ backgroundColor: 'var(--calcite-color-brand)' }}
                />
                <span>Local Tana River Network polyline reach</span>
              </div>
            )}

            {ds.nature === 'map_service' && (
              <div className="flex flex-col gap-2">
                {geoglowsForecastTimeMs && (
                  <div
                    className="text-xs tabular-nums"
                    style={{ fontFamily: 'var(--calcite-code-family)', color: 'var(--calcite-color-text-2)' }}
                  >
                    Map time: {new Date(geoglowsForecastTimeMs).toISOString().slice(0, 16).replace('T', ' ')}Z
                  </div>
                )}
                {geoglowsMapMeta?.legend && geoglowsMapMeta.legend.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {geoglowsMapMeta.legend.map((item, idx) => (
                      <div key={`${item.label}-${idx}`} className="flex items-center gap-2 text-xs">
                        <img
                          src={`data:${item.contentType};base64,${item.imageData}`}
                          alt={item.label}
                          className="w-5 h-5 shrink-0 object-contain"
                        />
                        <span style={{ color: 'var(--calcite-color-text-1)' }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
                    Loading GEOGLOWS MapServer legend symbols...
                  </div>
                )}
                <div className="text-xs leading-snug" style={{ color: 'var(--calcite-color-text-3)' }}>
                  {geoglowsMapMeta?.attribution ||
                    'GEOGLOWS / ECMWF / Esri Living Atlas (GlobalWaterModel_Medium)'}
                </div>
              </div>
            )}

            {ds.nature === 'visualization_raster' && (
              <div className="text-xs leading-relaxed" style={{ color: 'var(--calcite-color-text-2)' }}>
                Pre-rendered RGBA cartographic product preserving original source colours. Switch to the companion analytical raster for numeric scale bounds and pixel probing.
              </div>
            )}

            {ds.nature === 'analytical_raster' && ds.categoricalSwatches && (
              <div className="grid grid-cols-1 gap-1.5">
                {ds.categoricalSwatches.map((sw) => (
                  <div key={sw.label} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-3.5 h-3.5 rounded-sm border shrink-0"
                      style={{
                        backgroundColor: sw.color,
                        borderColor: 'var(--calcite-color-border-2)',
                      }}
                    />
                    <span className="truncate" style={{ color: 'var(--calcite-color-text-1)' }}>
                      {sw.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {ds.nature === 'analytical_raster' && !ds.categoricalSwatches && (
              <div className="flex flex-col gap-1.5">
                {rampInfo.stops.length > 1 ? (
                  <>
                    <div
                      className="h-3 w-full rounded-sm border"
                      style={{
                        background: `linear-gradient(to right, ${rampInfo.stops.join(', ')})`,
                        borderColor: 'var(--calcite-color-border-2)',
                      }}
                    />
                    {stats ? (
                      <div
                        className="flex items-center justify-between text-xs tabular-nums"
                        style={{
                          fontFamily: 'var(--calcite-code-family)',
                          color: 'var(--calcite-color-text-2)',
                        }}
                      >
                        <span>
                          {rampKey === 'anomaly_dry_wet'
                            ? (-Math.max(Math.abs(stats.min), Math.abs(stats.max))).toFixed(1)
                            : stats.p05.toFixed(Math.abs(stats.p05) < 1 ? 3 : 1)}
                        </span>
                        <span style={{ color: 'var(--calcite-color-text-3)' }}>
                          {rampKey === 'anomaly_dry_wet'
                            ? '0'
                            : `mean ${stats.mean.toFixed(Math.abs(stats.mean) < 1 ? 3 : 1)}`}
                        </span>
                        <span>
                          {rampKey === 'anomaly_dry_wet'
                            ? `+${Math.max(Math.abs(stats.min), Math.abs(stats.max)).toFixed(1)}`
                            : stats.p95.toFixed(Math.abs(stats.p95) < 1 ? 3 : 1)}
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs" style={{ color: 'var(--calcite-color-text-3)' }}>
                        {st?.status === 'loading' ? 'Computing raster scale...' : rampInfo.label}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
                    <span
                      className="w-3.5 h-3.5 rounded-sm inline-block"
                      style={{ backgroundColor: rampInfo.stops[0] }}
                    />
                    <span>{rampInfo.label}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-1 pt-0.5">
                  <CalciteChip scale="s" kind="neutral" appearance="outline-fill">
                    {units}
                  </CalciteChip>
                  <CalciteChip scale="s" kind="neutral" appearance="outline">
                    {ds.source.split('(')[0].trim()}
                  </CalciteChip>
                </div>
              </div>
            )}
          </CalciteCard>
        );
      })}
    </div>
  );
}

interface IdentifyInspectorProps {
  identifyResult: IdentifyResult | null;
  identifying: boolean;
  onZoomToStream: (fid: number) => void;
  onZoomToGeoglowsReach?: (linkno: number) => void;
  onInspectInRivers?: (linkno: number) => void;
}

export function IdentifyInspector({
  identifyResult,
  identifying,
  onZoomToStream,
  onZoomToGeoglowsReach,
  onInspectInRivers,
}: IdentifyInspectorProps) {
  if (identifying) {
    return (
      <div className="p-4 flex flex-col items-center gap-2">
        <CalciteLoader
          scale="m"
          label="Sampling raster pixels, local streams, and GEOGLOWS reaches"
          text="Querying active GeoTIFF pixels, local network, and GEOGLOWS reaches..."
        />
      </div>
    );
  }

  if (!identifyResult) {
    return (
      <div className="p-3">
        <CalciteNotice open kind="info" scale="s" icon="cursor-click">
          <div slot="title">Click anywhere on the map</div>
          <div slot="message">
            Clicking the Tana Basin map inspects the nearest vector river reach, checks verified GEOGLOWS LINKNO correspondence, and samples real pixel values across all active analytical GeoTIFF layers.
          </div>
        </CalciteNotice>
      </div>
    );
  }

  const gReach = identifyResult.geoglowsReach;
  const tMatch = identifyResult.tanaMatch;

  return (
    <div className="p-3 flex flex-col gap-3">
      <CalciteCard scale="s">
        <span slot="heading">Sampled Location</span>
        <span
          slot="description"
          style={{ fontFamily: 'var(--calcite-code-family)' }}
        >
          Lat {identifyResult.latitude.toFixed(5)}°, Lon {identifyResult.longitude.toFixed(5)}°
          {identifyResult.elevationMeters != null
            ? ` · Ground ${Math.round(identifyResult.elevationMeters).toLocaleString()} m ASL`
            : ''}
        </span>
      </CalciteCard>

      {identifyResult.streamHit && (
        <CalciteCard scale="s">
          <span slot="heading">Local Vector Segment: {identifyResult.streamHit.name}</span>
          <span
            slot="description"
            style={{ fontFamily: 'var(--calcite-code-family)' }}
          >
            FID #{identifyResult.streamHit.fid} · {(identifyResult.streamHit.lengthMeters / 1000).toFixed(2)} km
          </span>
          <CalciteButton
            slot="footer-end"
            scale="s"
            appearance="outline"
            iconStart="zoom-to-object"
            onClick={() => onZoomToStream(identifyResult.streamHit!.fid)}
          >
            Zoom
          </CalciteButton>
        </CalciteCard>
      )}

      {identifyResult.geoglowsVerifyMessage ? (
        <CalciteNotice open kind="warning" scale="s" icon="exclamation-mark-triangle">
          <div slot="title">{identifyResult.geoglowsVerifyMessage}</div>
          <div slot="message">
            {tMatch?.reason ||
              'Local segment could not be verified to a unique GEOGLOWS TDX-Hydro reach within tolerance; GEOGLOWS API queries are blocked to prevent misattribution.'}
          </div>
        </CalciteNotice>
      ) : gReach ? (
        <CalciteCard scale="s">
          <span slot="heading">GEOGLOWS Reach: {gReach.displayName}</span>
          <span
            slot="description"
            style={{ fontFamily: 'var(--calcite-code-family)' }}
          >
            LINKNO {gReach.linkno} · VPU {gReach.vpu ?? 103} · Order {gReach.streamOrder}
          </span>
          <div className="flex flex-col gap-1.5 text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
            <div className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
              Upstream area: {gReach.upstreamAreaKm2.toFixed(1)} km² · Length:{' '}
              {(gReach.geodesicLengthMeters / 1000).toFixed(2)} km
            </div>
            {tMatch && (
              <div>
                Match: {tMatch.match_confidence.toUpperCase()} ({tMatch.match_distance_m ?? '—'} m ·{' '}
                {tMatch.match_method})
              </div>
            )}
          </div>
          {onZoomToGeoglowsReach && (
            <CalciteButton
              slot="footer-start"
              scale="s"
              appearance="outline"
              iconStart="zoom-to-object"
              onClick={() => onZoomToGeoglowsReach(gReach.linkno)}
            >
              Zoom
            </CalciteButton>
          )}
          {onInspectInRivers && (
            <CalciteButton
              slot="footer-end"
              scale="s"
              kind="brand"
              iconStart="layer-stream"
              onClick={() => onInspectInRivers(gReach.linkno)}
            >
              GEOGLOWS Hydrograph
            </CalciteButton>
          )}
        </CalciteCard>
      ) : null}

      {identifyResult.rasterProbes.length === 0 ? (
        <CalciteNotice open kind="info" scale="s" icon="layers">
          <div slot="title">No analytical raster pixel at point</div>
          <div slot="message">
            Activate an analytical raster layer (e.g. CHIRPS Anomaly, ERA5 Soil Moisture, DEM, HAND, or Surface Water) to inspect numeric values at clicked coordinates.
          </div>
        </CalciteNotice>
      ) : (
        <div className="flex flex-col gap-2">
          {identifyResult.rasterProbes.map((probe) => (
            <CalciteCard key={probe.datasetId} scale="s">
              <span slot="heading">{probe.title}</span>
              <span slot="description">{probe.bandName}</span>
              <div
                className="text-base font-semibold tabular-nums"
                style={{
                  fontFamily: 'var(--calcite-code-family)',
                  color: 'var(--calcite-color-brand)',
                }}
              >
                {probe.formattedValue}{' '}
                <span className="text-xs font-normal" style={{ color: 'var(--calcite-color-text-2)' }}>
                  {probe.value !== null ? probe.units : ''}
                </span>
              </div>
            </CalciteCard>
          ))}
        </div>
      )}
    </div>
  );
}

interface QuickTransparencyPanelProps {
  visibleDatasets: DatasetDefinition[];
  metadataById: Record<string, DiscoveredServiceMetadata>;
  onOpenDatasetInfo: (id: string) => void;
  onOpenRegistryModule: () => void;
}

export function QuickTransparencyPanel({
  visibleDatasets,
  metadataById,
  onOpenDatasetInfo,
  onOpenRegistryModule,
}: QuickTransparencyPanelProps) {
  return (
    <div className="p-3 flex flex-col gap-3">
      <CalciteNotice open kind="info" scale="s" icon="information">
        <div slot="message">
          Every dataset retains its native spatial resolution, period, and category (Analytical Raster, Rendered Visualisation, Feature Service, or Map Service).
        </div>
      </CalciteNotice>

      {visibleDatasets.map((ds) => {
        const meta = metadataById[ds.id];
        return (
          <CalciteCard key={ds.id} scale="s">
            <span slot="heading">{ds.shortTitle}</span>
            <span slot="description">{ds.period}</span>
            <div className="flex flex-col gap-1 text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
              <div>Resolution: {meta?.approxResolutionLabel || 'Inspecting...'}</div>
              <div>Type: {ds.nature.replace('_', ' ')}</div>
            </div>
            <CalciteButton
              slot="footer-end"
              scale="s"
              appearance="outline"
              onClick={() => onOpenDatasetInfo(ds.id)}
            >
              Full Provenance
            </CalciteButton>
          </CalciteCard>
        );
      })}

      <CalciteButton scale="s" width="full" kind="brand" onClick={onOpenRegistryModule}>
        Open Full {DATA_REGISTRY.length}-Dataset Quality Registry
      </CalciteButton>
    </div>
  );
}
