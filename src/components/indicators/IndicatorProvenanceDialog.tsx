import { useMemo, useState } from 'react';
import {
  CalciteButton,
  CalciteCard,
  CalciteChip,
  CalciteDialog,
  CalciteInput,
  CalciteList,
  CalciteListItem,
  CalciteNotice,
} from '@esri/calcite-components-react';
import { INDICATOR_BY_ID, INDICATOR_REGISTRY } from '../../data/indicatorRegistry';
import type { IndicatorDefinition } from '../../types/geospatial';

interface IndicatorProvenanceDialogProps {
  indicatorId: string | null;
  onClose: () => void;
}

export function IndicatorProvenanceDialog({
  indicatorId,
  onClose,
}: IndicatorProvenanceDialogProps) {
  const ind: IndicatorDefinition | null = indicatorId
    ? INDICATOR_BY_ID[indicatorId] || null
    : null;

  return (
    <CalciteDialog
      open={Boolean(ind)}
      heading={ind?.name || 'Indicator Provenance'}
      description={ind ? `Confidence Class: ${ind.confidenceStatus} · Units: ${ind.units}` : ''}
      modal
      width="m"
      onCalciteDialogClose={onClose}
    >
      {ind && (
        <div className="flex flex-col gap-3 text-sm" style={{ color: 'var(--calcite-color-text-1)' }}>
          <p className="m-0 leading-relaxed" style={{ color: 'var(--calcite-color-text-2)' }}>
            {ind.scientificDefinition}
          </p>

          <div
            className="p-2.5 rounded text-xs"
            style={{
              backgroundColor: 'var(--calcite-color-foreground-2)',
              border: '1px solid var(--calcite-color-border-3)',
              fontFamily: 'var(--calcite-code-family)',
            }}
          >
            <strong>Method / Formula:</strong> {ind.formulaOrMethod}
          </div>

          <CalciteList selectionMode="none" scale="s">
            <CalciteListItem label="Temporal Aggregation" description={ind.temporalAggregation} />
            <CalciteListItem label="Spatial Aggregation" description={ind.spatialAggregation} />
            <CalciteListItem label="Validity Checks" description={ind.validityRequirements} />
            <CalciteListItem label="Input Datasets" description={ind.inputDatasetIds.join(', ')} />
          </CalciteList>

          <CalciteCard scale="s">
            <span slot="heading">Interpretation Rules</span>
            <ul className="m-0 pl-4 text-xs flex flex-col gap-1" style={{ color: 'var(--calcite-color-text-2)' }}>
              {ind.interpretationRules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </CalciteCard>

          <CalciteNotice open kind="warning" scale="s" icon="exclamation-mark-triangle">
            <div slot="title">Known Limitations</div>
            <div slot="message">
              {ind.limitations.join(' ')}
            </div>
          </CalciteNotice>
        </div>
      )}
      <CalciteButton slot="footer-end" onClick={onClose}>
        Close
      </CalciteButton>
    </CalciteDialog>
  );
}

interface IndicatorRegistryPanelProps {
  onSelectIndicator?: (id: string) => void;
}

export function IndicatorRegistryPanel({ onSelectIndicator }: IndicatorRegistryPanelProps) {
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return INDICATOR_REGISTRY;
    return INDICATOR_REGISTRY.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.scientificDefinition.toLowerCase().includes(q) ||
        i.workspace.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="p-3 flex flex-col gap-3">
      <CalciteNotice open kind="info" scale="s" icon="information">
        <div slot="message">
          Every analytical metric in FlowWatch Africa is registered below with its exact formula, input datasets, spatial/temporal rules, and confidence classification.
        </div>
      </CalciteNotice>

      <CalciteInput
        scale="s"
        type="search"
        clearable
        placeholder="Filter indicators (e.g. CHIRPS, HAND, GEOGLOWS)..."
        value={search}
        onCalciteInputInput={(e) =>
          setSearch(String((e.target as HTMLCalciteInputElement).value || ''))
        }
      />

      <div className="flex flex-col gap-2">
        {filtered.map((ind) => (
          <CalciteCard key={ind.id} scale="s">
            <span slot="heading">{ind.name}</span>
            <span slot="description">{ind.workspace.replace('_', ' ')} · {ind.units}</span>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex flex-wrap gap-1">
                <CalciteChip
                  scale="s"
                  kind={ind.confidenceStatus === 'Verified' ? 'brand' : 'neutral'}
                  appearance="outline-fill"
                >
                  {ind.confidenceStatus}
                </CalciteChip>
              </div>
              <p className="m-0 leading-relaxed" style={{ color: 'var(--calcite-color-text-2)' }}>
                {ind.scientificDefinition}
              </p>
            </div>
            <CalciteButton
              slot="footer-end"
              scale="s"
              appearance="outline"
              onClick={() => {
                if (onSelectIndicator) onSelectIndicator(ind.id);
                else setActiveId(ind.id);
              }}
            >
              Method &amp; Formula
            </CalciteButton>
          </CalciteCard>
        ))}
      </div>

      <IndicatorProvenanceDialog indicatorId={activeId} onClose={() => setActiveId(null)} />
    </div>
  );
}
