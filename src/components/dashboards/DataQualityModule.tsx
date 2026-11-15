import { useMemo, useState } from 'react';
import {
  CalciteButton,
  CalciteChip,
  CalciteInput,
  CalciteNotice,
  CalciteSegmentedControl,
  CalciteSegmentedControlItem,
  CalciteTable,
  CalciteTableCell,
  CalciteTableHeader,
  CalciteTableRow,
} from '@esri/calcite-components-react';
import { DATA_REGISTRY } from '../../config/dataRegistry';
import type { DiscoveredServiceMetadata } from '../../types/geospatial';

interface DataQualityModuleProps {
  metadataById: Record<string, DiscoveredServiceMetadata>;
  onOpenDatasetInfo: (id: string) => void;
  onActivateLayer: (id: string) => void;
}

export function DataQualityModule({
  metadataById,
  onOpenDatasetInfo,
  onActivateLayer,
}: DataQualityModuleProps) {
  const [query, setQuery] = useState('');
  const [natureFilter, setNatureFilter] = useState<string>('all');

  const counts = useMemo(() => {
    const analytical = DATA_REGISTRY.filter((d) => d.nature === 'analytical_raster').length;
    const viz = DATA_REGISTRY.filter((d) => d.nature === 'visualization_raster').length;
    const services = DATA_REGISTRY.filter(
      (d) => d.nature === 'feature_service' || d.nature === 'map_service'
    ).length;
    return { total: DATA_REGISTRY.length, analytical, viz, services };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DATA_REGISTRY.filter((ds) => {
      if (natureFilter === 'services') {
        if (ds.nature !== 'feature_service' && ds.nature !== 'map_service') return false;
      } else if (natureFilter !== 'all' && ds.nature !== natureFilter) {
        return false;
      }
      if (q) {
        return (
          ds.title.toLowerCase().includes(q) ||
          ds.category.toLowerCase().includes(q) ||
          ds.source.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [query, natureFilter]);

  return (
    <div className="p-3 flex flex-col gap-3">
      <CalciteNotice open kind="info" scale="s" icon="information">
        <div slot="message">
          Complete provenance ledger across all {counts.total} datasets: distinguishing analytical rasters (GeoTIFF numeric values), rendered RGBA visualisations, hosted vector feature services, and GEOGLOWS time-enabled MapServer forecasts. Native spatial resolutions vary by source and are never homogenised.
        </div>
      </CalciteNotice>

      <CalciteInput
        scale="s"
        type="search"
        clearable
        placeholder="Search dataset, source, or category..."
        value={query}
        onCalciteInputInput={(e) =>
          setQuery(String((e.target as HTMLCalciteInputElement).value || ''))
        }
      />

      <CalciteSegmentedControl
        scale="s"
        width="full"
        onCalciteSegmentedControlChange={(e) =>
          setNatureFilter(String((e.target as HTMLCalciteSegmentedControlElement).value))
        }
      >
        <CalciteSegmentedControlItem value="all" checked={natureFilter === 'all'}>
          All ({counts.total})
        </CalciteSegmentedControlItem>
        <CalciteSegmentedControlItem
          value="analytical_raster"
          checked={natureFilter === 'analytical_raster'}
        >
          Analytical ({counts.analytical})
        </CalciteSegmentedControlItem>
        <CalciteSegmentedControlItem
          value="visualization_raster"
          checked={natureFilter === 'visualization_raster'}
        >
          Visualisation ({counts.viz})
        </CalciteSegmentedControlItem>
        <CalciteSegmentedControlItem value="services" checked={natureFilter === 'services'}>
          River Services ({counts.services})
        </CalciteSegmentedControlItem>
      </CalciteSegmentedControl>

      <div className="overflow-x-auto">
        <CalciteTable caption="FlowWatch Africa Dataset Provenance Registry" scale="s" bordered striped>
          <CalciteTableRow slot="table-header">
            <CalciteTableHeader heading="Dataset" />
            <CalciteTableHeader heading="Resolution" />
            <CalciteTableHeader heading="Status" />
            <CalciteTableHeader heading="Actions" />
          </CalciteTableRow>
          {filtered.map((ds) => {
            const meta = metadataById[ds.id];
            return (
              <CalciteTableRow key={ds.id}>
                <CalciteTableCell>
                  <div className="font-medium text-xs" style={{ color: 'var(--calcite-color-text-1)' }}>
                    {ds.shortTitle}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--calcite-color-text-3)' }}>
                    {ds.nature.replace('_', ' ')} · {ds.period}
                  </div>
                </CalciteTableCell>
                <CalciteTableCell>
                  <span
                    className="tabular-nums text-xs"
                    style={{ fontFamily: 'var(--calcite-code-family)' }}
                  >
                    {meta?.approxResolutionLabel || 'Checking...'}
                  </span>
                </CalciteTableCell>
                <CalciteTableCell>
                  <CalciteChip
                    scale="s"
                    kind={meta?.status === 'available' ? 'brand' : 'neutral'}
                    appearance="outline-fill"
                    icon={
                      meta?.status === 'available'
                        ? 'check-circle'
                        : meta?.status === 'error'
                        ? 'exclamation-mark-triangle'
                        : 'clock'
                    }
                    style={
                      meta?.status === 'error'
                        ? ({
                            '--calcite-chip-border-color': 'var(--calcite-color-status-danger)',
                            '--calcite-chip-icon-color': 'var(--calcite-color-status-danger)',
                          } as React.CSSProperties)
                        : meta?.status === 'available'
                        ? ({
                            '--calcite-chip-border-color': 'var(--calcite-color-status-success)',
                            '--calcite-chip-icon-color': 'var(--calcite-color-status-success)',
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {meta?.status === 'available'
                      ? 'Verified'
                      : meta?.status === 'error'
                      ? 'Error'
                      : 'Checking'}
                  </CalciteChip>
                </CalciteTableCell>
                <CalciteTableCell>
                  <div className="flex gap-1">
                    <CalciteButton
                      scale="s"
                      appearance="outline"
                      onClick={() => onOpenDatasetInfo(ds.id)}
                    >
                      Details
                    </CalciteButton>
                    <CalciteButton
                      scale="s"
                      appearance="transparent"
                      onClick={() => onActivateLayer(ds.id)}
                    >
                      Map
                    </CalciteButton>
                  </div>
                </CalciteTableCell>
              </CalciteTableRow>
            );
          })}
        </CalciteTable>
      </div>
    </div>
  );
}
