import {
  CalciteButton,
  CalciteCard,
  CalciteDialog,
  CalciteList,
  CalciteListItem,
  CalciteNotice,
  CalciteTile,
  CalciteTileGroup,
} from '@esri/calcite-components-react';
import { DATASET_BY_ID } from '../../config/dataRegistry';
import type { LayerRuntimeState } from '../../hooks/useFlowWatchState';
import type { DiscoveredServiceMetadata } from '../../types/geospatial';

interface DatasetInfoDialogProps {
  datasetId: string | null;
  metadataById: Record<string, DiscoveredServiceMetadata>;
  layersState: Record<string, LayerRuntimeState>;
  onClose: () => void;
}

export function DatasetInfoDialog({
  datasetId,
  metadataById,
  layersState,
  onClose,
}: DatasetInfoDialogProps) {
  const ds = datasetId ? DATASET_BY_ID[datasetId] : null;
  const meta = datasetId ? metadataById[datasetId] : null;
  const st = datasetId ? layersState[datasetId] : null;

  const metadataRows = ds
    ? [
        {
          label: 'Category Classification',
          value:
            ds.nature === 'analytical_raster'
              ? 'Original Analytical Raster (GeoTIFF)'
              : ds.nature === 'visualization_raster'
              ? 'Rendered RGBA Visualisation Product'
              : ds.nature === 'map_service'
              ? 'ArcGIS Time-Enabled Map Service (GEOGLOWS)'
              : 'ArcGIS Hosted Feature Service',
        },
        { label: 'Source & Provider', value: ds.source },
        { label: 'Temporal Period', value: ds.period },
        { label: 'Baseline Reference', value: ds.baseline || 'N/A (static / standalone)' },
        { label: 'Native Spatial Resolution', value: meta?.approxResolutionLabel || 'Inspecting...' },
        { label: 'Units', value: ds.units },
        {
          label: 'Dimensions / Geometry',
          value: meta?.dimensions
            ? `${meta.dimensions.width} × ${meta.dimensions.height} px · ${meta.bandCount} band(s)`
            : meta?.pixelType || 'Vector Polyline',
        },
        {
          label: 'Data Type & NoData',
          value: `${meta?.pixelType || 'Polyline'} · NoData: ${meta?.nodata ?? 'None / N/A'}`,
        },
        { label: 'Spatial Reference', value: meta?.spatialReference || 'EPSG:4326' },
        {
          label: 'Service Status',
          value:
            meta?.status === 'available'
              ? 'Verified & Publicly Accessible'
              : meta?.status === 'error'
              ? `Unavailable (${meta.errorMessage})`
              : 'Checking...',
        },
      ]
    : [];

  return (
    <CalciteDialog
      open={Boolean(ds)}
      heading={ds?.title || 'Dataset Provenance'}
      description={ds?.category}
      modal
      width="m"
      onCalciteDialogClose={onClose}
    >
      {ds && (
        <div className="flex flex-col gap-3 text-sm" style={{ color: 'var(--calcite-color-text-1)' }}>
          <p className="m-0 leading-relaxed" style={{ color: 'var(--calcite-color-text-2)' }}>
            {ds.description}
          </p>

          {ds.isIncompletePeriod && (
            <CalciteNotice open kind="warning" scale="s" icon="clock">
              <div slot="title">Incomplete 2026 Temporal Window</div>
              <div slot="message">
                2026 observations cover a partial year only. Compare only against matched baseline windows, not full 12-month climatologies.
              </div>
            </CalciteNotice>
          )}

          <CalciteList selectionMode="none" scale="s">
            {metadataRows.map((row) => (
              <CalciteListItem
                key={row.label}
                label={row.label}
                description={row.value}
              />
            ))}
          </CalciteList>

          {st?.render?.stats && (
            <CalciteCard scale="s">
              <span slot="heading">Computed Band Summary</span>
              <span slot="description">{st.render.bandName}</span>
              <CalciteTileGroup label="Band statistics" layout="horizontal" scale="s">
                <CalciteTile heading={st.render.stats.min.toFixed(2)} description="Min" scale="s" />
                <CalciteTile heading={st.render.stats.mean.toFixed(2)} description="Mean" scale="s" />
                <CalciteTile heading={st.render.stats.max.toFixed(2)} description="Max" scale="s" />
                <CalciteTile heading={st.render.stats.validCount.toLocaleString()} description="Valid px" scale="s" />
              </CalciteTileGroup>
            </CalciteCard>
          )}

          <CalciteNotice open kind="info" scale="s" icon="information">
            <div slot="title">Processing Notes</div>
            <div slot="message">{ds.processingNotes}</div>
          </CalciteNotice>
        </div>
      )}

      <CalciteButton slot="footer-end" onClick={onClose}>
        Close
      </CalciteButton>
    </CalciteDialog>
  );
}

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const caveats = [
    {
      label: '1. Rainfall anomalies are not flood events',
      description:
        'Positive CHIRPS precipitation anomalies indicate wetter-than-normal atmospheric inputs, not verified inundation or river overflow.',
    },
    {
      label: '2. Flow accumulation is not discharge',
      description:
        'Terrain-derived upstream contributing area (km²) indicates topographic drainage convergence, not measured streamflow (m³/s).',
    },
    {
      label: '3. HAND is not an inundation forecast',
      description:
        'Height Above Nearest Drainage describes relative terrain elevation above channels; actual flooding depends on storm intensity, hydraulic routing, and reservoir operations.',
    },
    {
      label: '4. PET is atmospheric demand',
      description:
        'ERA5 Potential Evapotranspiration represents atmospheric evaporative demand, not actual water transpired by vegetation.',
    },
    {
      label: '5. Reservoir simulation is illustrative',
      description:
        "The Dam Operator's Dilemma module uses transparent mass-balance equations with user-selected hypothetical inputs, not live KenGen Masinga SCADA telemetry.",
    },
    {
      label: '6. GEOGLOWS streamflow & return periods are model-derived',
      description:
        'GEOGLOWS v2 forecasts, retrospective simulations (1940–present), and Gumbel return-period thresholds come from ECMWF global runoff routing over TDX-Hydro reaches (LINKNO); they complement but do not replace local Kenyan WRA gauges.',
    },
  ];

  return (
    <CalciteDialog
      open={open}
      heading="About FlowWatch Africa — Scientific Methodology & Caveats"
      description="Tana River Basin Decision-Support & Catchment Intelligence"
      modal
      width="m"
      onCalciteDialogClose={onClose}
    >
      <div className="flex flex-col gap-3 text-sm leading-relaxed" style={{ color: 'var(--calcite-color-text-1)' }}>
        <p className="m-0">
          <strong>FlowWatch Africa</strong> integrates multi-source satellite precipitation (CHIRPS), land-surface reanalysis (ERA5-Land), terrain hydrography (DEM, slope, HAND, flow accumulation), JRC surface water records, and vector river networks across the Upper Tana River Basin, Kenya.
        </p>

        <CalciteNotice open kind="info" scale="s" icon="lightbulb">
          <div slot="title">Hydrological Causal Chain</div>
          <div slot="message">
            El Niño &amp; rainfall variability → soil moisture &amp; catchment wetness → terrain routing &amp; river response → reservoir &amp; surface water availability → downstream flood or drought implications.
          </div>
        </CalciteNotice>

        <CalciteList selectionMode="none" scale="s">
          {caveats.map((c) => (
            <CalciteListItem
              key={c.label}
              label={c.label}
              description={c.description}
            />
          ))}
        </CalciteList>
      </div>

      <CalciteButton slot="footer-end" onClick={onClose}>
        Got It
      </CalciteButton>
    </CalciteDialog>
  );
}
