import { useMemo, useState } from 'react';
import {
  CalciteAccordion,
  CalciteAccordionItem,
  CalciteAction,
  CalciteButton,
  CalciteCard,
  CalciteChip,
  CalciteInput,
  CalciteLabel,
  CalciteLink,
  CalciteList,
  CalciteListItem,
  CalciteLoader,
  CalciteNotice,
  CalciteOption,
  CalciteSegmentedControl,
  CalciteSegmentedControlItem,
  CalciteSelect,
  CalciteSlider,
  CalciteSwitch,
} from '@esri/calcite-components-react';

import { DATA_REGISTRY, LAYER_CATEGORIES } from '../../config/dataRegistry';
import type { LayerRuntimeState } from '../../hooks/useFlowWatchState';
import type {
  DatasetDefinition,
  DiscoveredServiceMetadata,
  GeoglowsMapServerMeta,
} from '../../types/geospatial';

interface LayerExplorerProps {
  layersState: Record<string, LayerRuntimeState>;
  metadataById: Record<string, DiscoveredServiceMetadata>;
  mapLayersEnabled: boolean;
  onToggleMapLayersEnabled: (enabled: boolean) => void;
  onClearAllLayers: () => void;
  onShowAllLayers: () => void;
  onQueueAllLayers: () => void;
  geoglowsMapMeta?: GeoglowsMapServerMeta | null;
  geoglowsForecastTimeMs?: number | null;
  onChangeGeoglowsTimeMs?: (ms: number | null) => void;
  onToggleVisible: (id: string, visible: boolean) => void;
  onChangeOpacity: (id: string, opacity: number) => void;
  onChangeBand: (id: string, band: number) => void;
  onMoveOrder: (id: string, dir: 'up' | 'down') => void;
  onZoomToLayer: (id: string) => void;
  onOpenDatasetInfo: (id: string) => void;
}

export function LayerExplorer({
  layersState,
  metadataById,
  mapLayersEnabled,
  onToggleMapLayersEnabled,
  onClearAllLayers,
  onShowAllLayers,
  onQueueAllLayers,
  geoglowsMapMeta,
  geoglowsForecastTimeMs,
  onChangeGeoglowsTimeMs,
  onToggleVisible,
  onChangeOpacity,
  onChangeBand,
  onMoveOrder,
  onZoomToLayer,
  onOpenDatasetInfo,
}: LayerExplorerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [natureFilter, setNatureFilter] = useState<'all' | 'analytical' | 'visualization'>('analytical');

  const counts = useMemo(() => {
    const viz = DATA_REGISTRY.filter((d) => d.nature === 'visualization_raster').length;
    const analyticalAndServices = DATA_REGISTRY.length - viz;
    return { total: DATA_REGISTRY.length, viz, analyticalAndServices };
  }, []);

  const filteredByCategory = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return LAYER_CATEGORIES.map((category) => {
      const items = DATA_REGISTRY.filter((ds) => {
        if (ds.category !== category) return false;
        if (natureFilter === 'analytical' && ds.nature === 'visualization_raster') return false;
        if (natureFilter === 'visualization' && ds.nature !== 'visualization_raster') return false;
        if (q) {
          return (
            ds.title.toLowerCase().includes(q) ||
            ds.shortTitle.toLowerCase().includes(q) ||
            ds.description.toLowerCase().includes(q)
          );
        }
        return true;
      });
      return { category, items };
    }).filter((g) => g.items.length > 0);
  }, [searchTerm, natureFilter]);

  const activeCount = DATA_REGISTRY.filter((d) => layersState[d.id]?.visible).length;
  const inactiveLayerCount = DATA_REGISTRY.filter((ds) => !layersState[ds.id]?.visible).length;

  const renderDatasetItem = (ds: DatasetDefinition) => {
    const st = layersState[ds.id];
    const meta = metadataById[ds.id];
    const isError = st?.status === 'error' || meta?.status === 'error';
    const isLoading = st?.status === 'loading';
    const natureLabel =
      ds.nature === 'map_service'
        ? 'Map Service'
        : ds.nature === 'feature_service'
        ? 'Feature Service'
        : ds.nature === 'visualization_raster'
        ? 'Visualisation'
        : 'Analytical';

    const timeExtent = ds.id === 'geoglows_forecast' ? geoglowsMapMeta?.timeExtent : null;
    const stepMs = (geoglowsMapMeta?.timeIntervalHours || 3) * 3600 * 1000;

    return (
      <CalciteListItem
        key={ds.id}
        label={ds.shortTitle}
        description={`${ds.period} · ${meta?.approxResolutionLabel || 'Inspecting...'}`}
        selected={Boolean(st?.visible)}
      >
        <div slot="actions-end" className="flex items-center gap-1.5 pr-1">
          {isLoading && <CalciteLoader inline scale="s" label={`Loading ${ds.shortTitle}`} />}
          <CalciteSwitch
            scale="s"
            checked={Boolean(st?.visible)}
            disabled={isError}
            label={`Toggle ${ds.shortTitle}`}
            onCalciteSwitchChange={(e) => {
              const target = e.target as HTMLCalciteSwitchElement;
              onToggleVisible(ds.id, Boolean(target.checked));
            }}
          />
        </div>

        <div slot="content-bottom" className="flex flex-col gap-2 pt-1 pb-1">
          <div className="flex items-center justify-between gap-2">
            <CalciteChip
              scale="s"
              kind={ds.nature === 'analytical_raster' || ds.nature === 'map_service' ? 'brand' : 'neutral'}
              appearance="outline-fill"
              label={natureLabel}
            >
              {natureLabel}
            </CalciteChip>

            {!st?.visible && (
              <CalciteLink onClick={() => onOpenDatasetInfo(ds.id)}>
                Metadata &amp; source
              </CalciteLink>
            )}
          </div>

          {/* Time-Aware Stepper for GEOGLOWS MapServer */}
          {st?.visible && ds.id === 'geoglows_forecast' && timeExtent && onChangeGeoglowsTimeMs && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--calcite-color-text-2)' }}>Forecast UTC Step</span>
                <span
                  className="tabular-nums"
                  style={{ fontFamily: 'var(--calcite-code-family)', color: 'var(--calcite-color-text-1)' }}
                >
                  {geoglowsForecastTimeMs
                    ? new Date(geoglowsForecastTimeMs).toISOString().slice(0, 16).replace('T', ' ') + 'Z'
                    : 'All / Latest'}
                </span>
              </div>
              <CalciteSlider
                min={timeExtent[0]}
                max={timeExtent[1]}
                step={stepMs}
                value={geoglowsForecastTimeMs ?? timeExtent[0]}
                labelHandles={false}
                label="GEOGLOWS MapServer forecast UTC step"
                onCalciteSliderInput={(e) => {
                  const v = Number((e.target as HTMLCalciteSliderElement).value);
                  onChangeGeoglowsTimeMs(v);
                }}
              />
            </div>
          )}

          {/* Band Selector for Multi-Band Analytical GeoTIFFs */}
          {st?.visible && ds.bands && ds.bands.length > 1 && (
            <CalciteLabel scale="s" className="mb-0">
              Active Band / Period
              <CalciteSelect
                scale="s"
                label={`Band for ${ds.shortTitle}`}
                value={String(st.band)}
                onCalciteSelectChange={(e) => {
                  const val = Number((e.target as HTMLCalciteSelectElement).value);
                  onChangeBand(ds.id, val);
                }}
              >
                {ds.bands.map((b) => (
                  <CalciteOption key={b.code} value={String(b.index)} selected={b.index === st.band}>
                    {b.label}
                  </CalciteOption>
                ))}
              </CalciteSelect>
            </CalciteLabel>
          )}

          {/* Opacity + Ordering + Zoom + Info when active */}
          {st?.visible && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
                  Opacity: {Math.round(st.opacity * 100)}%
                </span>
                <div className="flex items-center">
                  <CalciteAction
                    icon="arrow-up"
                    text="Move layer up"
                    scale="s"
                    onClick={() => onMoveOrder(ds.id, 'up')}
                  />
                  <CalciteAction
                    icon="arrow-down"
                    text="Move layer down"
                    scale="s"
                    onClick={() => onMoveOrder(ds.id, 'down')}
                  />
                  <CalciteAction
                    icon="zoom-to-object"
                    text="Zoom to layer"
                    scale="s"
                    onClick={() => onZoomToLayer(ds.id)}
                  />
                  <CalciteAction
                    icon="information"
                    text="Dataset metadata"
                    scale="s"
                    onClick={() => onOpenDatasetInfo(ds.id)}
                  />
                </div>
              </div>
              <CalciteSlider
                min={0.1}
                max={1}
                step={0.05}
                value={st.opacity}
                labelHandles={false}
                label={`Opacity for ${ds.shortTitle}`}
                onCalciteSliderInput={(e) => {
                  const v = Number((e.target as HTMLCalciteSliderElement).value);
                  onChangeOpacity(ds.id, v);
                }}
              />
            </div>
          )}

          {isError && (
            <CalciteNotice open kind="danger" scale="s" icon="exclamation-mark-triangle">
              <div slot="message">{st?.error || meta?.errorMessage || 'Service unavailable'}</div>
            </CalciteNotice>
          )}
        </div>
      </CalciteListItem>
    );
  };

  return (
    <div className="flex flex-col gap-2.5 p-3">
      <CalciteCard scale="s">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-xs font-semibold" style={{ color: 'var(--calcite-color-text-1)' }}>
              Display Map Overlays
            </span>
            <span className="text-xs" style={{ color: 'var(--calcite-color-text-3)' }}>
              {mapLayersEnabled
                ? 'Selected overlays render on the 2D/3D map'
                : 'Selected overlays are queued; analysis continues'}
            </span>
          </div>
          <CalciteSwitch
            scale="m"
            checked={mapLayersEnabled}
            label="Load map layers onto 2D/3D view"
            onCalciteSwitchChange={(e) => {
              onToggleMapLayersEnabled(Boolean((e.target as HTMLCalciteSwitchElement).checked));
            }}
          />
        </div>
      </CalciteCard>

      {!mapLayersEnabled && (
        <CalciteNotice open kind="info" scale="s" icon="layers">
          <div slot="title">Compute-Only Mode Active</div>
          <div slot="message">
            Map overlays are unloaded. GEOGLOWS forecasts, zonal stats, exposure screening, dam simulations, and click pixel probing continue running normally.
          </div>
        </CalciteNotice>
      )}

      <CalciteNotice open kind="info" scale="s" icon="lightbulb">
        <div slot="message">
          Use each layer switch to build a focused map. Turn display off to queue selected layers without drawing them.
          Showing every layer can make the map busy.
        </div>
      </CalciteNotice>

      <div className="flex items-center justify-between gap-2">
        <CalciteChip scale="s" kind={mapLayersEnabled ? 'brand' : 'neutral'} appearance="outline-fill" icon="layers">
          {mapLayersEnabled ? `${activeCount} active` : `${activeCount} queued`}
        </CalciteChip>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <CalciteButton
            scale="s"
            appearance="outline"
            kind="neutral"
            disabled={inactiveLayerCount === 0 && mapLayersEnabled}
            onClick={onShowAllLayers}
          >
            Show All Layers
          </CalciteButton>
          <CalciteButton
            scale="s"
            appearance="outline"
            kind="neutral"
            disabled={inactiveLayerCount === 0 && !mapLayersEnabled}
            onClick={onQueueAllLayers}
          >
            Queue All
          </CalciteButton>
          <CalciteButton
            scale="s"
            appearance="outline"
            kind="neutral"
            disabled={activeCount === 0}
            onClick={onClearAllLayers}
          >
            Clear All
          </CalciteButton>
        </div>
      </div>

      <CalciteInput
        scale="s"
        type="search"
        clearable
        placeholder="Filter layers by name or variable..."
        value={searchTerm}
        onCalciteInputInput={(e) =>
          setSearchTerm(String((e.target as HTMLCalciteInputElement).value || ''))
        }
      />

      <CalciteSegmentedControl
        scale="s"
        width="full"
        onCalciteSegmentedControlChange={(e) => {
          const val = (e.target as HTMLCalciteSegmentedControlElement).value as
            | 'all'
            | 'analytical'
            | 'visualization';
          setNatureFilter(val);
        }}
      >
        <CalciteSegmentedControlItem value="analytical" checked={natureFilter === 'analytical'}>
          Analytical ({counts.analyticalAndServices})
        </CalciteSegmentedControlItem>
        <CalciteSegmentedControlItem value="visualization" checked={natureFilter === 'visualization'}>
          Visualisation ({counts.viz})
        </CalciteSegmentedControlItem>
        <CalciteSegmentedControlItem value="all" checked={natureFilter === 'all'}>
          All ({counts.total})
        </CalciteSegmentedControlItem>
      </CalciteSegmentedControl>

      {filteredByCategory.length === 0 ? (
        <CalciteNotice open kind="info" scale="s" icon="search">
          <div slot="title">No matching layers</div>
          <div slot="message">Clear or broaden your filter query to inspect basin datasets.</div>
        </CalciteNotice>
      ) : (
        <CalciteAccordion scale="s" selectionMode="multiple">
          {filteredByCategory.map(({ category, items }, idx) => {
            const visibleInGroup = items.filter((d) => layersState[d.id]?.visible).length;
            return (
              <CalciteAccordionItem
                key={category}
                heading={`${category} (${items.length})`}
                description={visibleInGroup > 0 ? `${visibleInGroup} active` : undefined}
                expanded={idx < 3 || visibleInGroup > 0 || Boolean(searchTerm)}
              >
                <CalciteList selectionMode="none" scale="s">
                  {items.map(renderDatasetItem)}
                </CalciteList>
              </CalciteAccordionItem>
            );
          })}
        </CalciteAccordion>
      )}
    </div>
  );
}
