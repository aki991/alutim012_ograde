import { useMemo } from 'react';
import { resolveParts, type CustomModel } from '../../domain/models/custom';
import { scaledModel } from '../../domain/models/customRegistry';
import { PROBE_SIZES } from '../../domain/models/sizeCheck';
import type { Material } from '../../domain/models/types';
import { PartSvg } from './PartsSvg';

/**
 * Proba veličina: isti model prikazan na nekoliko uobičajenih veličina polja (usko, uobičajeno, visoko, široko), računat po istim
 * pravilima kao u projektu. Radnik odmah vidi kako se model ponaša kad se polje poveća ili smanji, pre čuvanja.
 */
export function SizeProbe({ model, materials, onClose, highlightId }: { model: CustomModel; materials: Material[]; onClose: () => void; /** izabrani deo crteža: u probi je istaknut (i kopije koje se od njega prave) */ highlightId?: string | null }) {
  const probes = useMemo(() => PROBE_SIZES.map(([w, h]) => {
    const m = scaledModel(model, w, h);
    return { w, h, parts: resolveParts(m, materials) };
  }), [model, materials]);
  const maxW = Math.max(...probes.map((p) => p.w)); const maxH = Math.max(...probes.map((p) => p.h));
  return (
    <div className="px-3 py-2 border-b border-line bg-white" data-testid="size-probe">
      <div className="flex items-center gap-2 mb-1">
        <b className="text-[13px] flex-1">Proba veličina — isti model na različitim poljima (crteži su u istoj razmeri){highlightId ? ' — izabrani deo je istaknut' : ''}</b>
        <button className="btn btn-sm" onClick={onClose} data-testid="size-probe-close">Zatvori</button>
      </div>
      <div className="flex gap-3 overflow-x-auto scroll-thin items-end pb-1">
        {probes.map((p) => (
          <figure key={`${p.w}x${p.h}`} className="m-0 shrink-0" data-testid="size-probe-item">
            <svg width={Math.max(60, (p.w / maxW) * 300)} height={Math.max(60, (p.h / maxH) * 200)} viewBox={`${-20} ${-20} ${p.w + 40} ${p.h + 40}`} role="img" aria-label={`Model na polju ${p.w} × ${p.h} mm`}>
              <g transform={`translate(0 ${p.h}) scale(1,-1)`} style={{ pointerEvents: 'none' }}>
                <rect x={0} y={0} width={p.w} height={p.h} fill="#cdd7d0" fillOpacity="0.25" stroke="#94a3b8" strokeWidth={Math.max(2, p.w / 300)} strokeDasharray="12 8" />
                {p.parts.map((r) => <PartSvg key={r.part.id} part={r.part} shape={r.shape} hex={r.hex} selected={!!highlightId && (r.part.id === highlightId || r.part.id.startsWith(`${highlightId}_r`))} />)}
              </g>
            </svg>
            <figcaption className="text-[12px] text-muted text-center">{p.w} × {p.h} mm</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
