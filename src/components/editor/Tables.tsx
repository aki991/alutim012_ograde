import { useMemo } from 'react';
import { computeLayout, isSpacer, railingWidthMm } from '../../domain/geometry/layout';
import { FENCE_MODELS, GATE_LABELS, MOUNTING_LABELS, POST_LABELS } from '../../domain/models/catalog';
import type { Project } from '../../domain/models/types';
import { buildBom } from '../../domain/pricing/calc';
import { useAppStore } from '../../store/useAppStore';
import { itemLabel, itemNumber } from '../../utils/labels';
import { fmtMoney, fmtNum } from '../../utils/units';
import { isProductionPost, modelProductionPosts, productionPostCount } from '../../domain/models/productionPosts';
import { IncompletePriceNotice } from './IncompletePriceNotice';

export function DimensionsTable({ project }: { project: Project }) {
  const layout = computeLayout(project);
  const specs = useAppStore((s) => s.settings.modelSpecs);
  const materials = useAppStore((s) => s.materials);
  const modelPosts = modelProductionPosts(project, layout, specs);
  const advanced = useAppStore((st) => Boolean(st.settings.advancedLengths));
  const select = useAppStore((s) => s.select);
  const selection = useAppStore((s) => s.editor.selection);
  return (
    <div className="p-3">
      <table className="w-full min-w-[640px]" data-testid="dims-table">
        <thead>
          <tr><th className="th">#</th><th className="th">Element</th><th className="th">Model</th><th className="th text-right">Dužina</th>{advanced && <><th className="th text-right">Modul (osa–osa)</th><th className="th text-right">Svetli otvor</th></>}<th className="th text-right">Visina</th></tr>
        </thead>
        <tbody>
          {layout.items.filter((li) => !isSpacer(li.item)).map((li) => (
            <tr key={li.item.id} className={`cursor-pointer hover:bg-slate-50 ${selection?.id === li.item.id ? 'bg-primary-50' : ''}`} onClick={() => { select({ type: 'item', id: li.item.id }); window.dispatchEvent(new CustomEvent('open-props')); }}>
              <td className="td">{itemNumber(project.items, li.index)}</td>
              <td className="td font-medium">{itemLabel(project.items, li.index)}</td>
              <td className="td text-slate-600">{li.item.kind === 'fence' ? FENCE_MODELS[li.item.modelId].name : li.item.kind === 'gate' ? `${GATE_LABELS[li.item.gateType]} · ${FENCE_MODELS[li.item.infillModelId].name}` : 'Prazan otvor'}</td>
              <td className="td text-right tabular-nums">{fmtNum(railingWidthMm(project, li.index), 0)} mm</td>
              {advanced && <><td className="td text-right tabular-nums">{fmtNum(li.item.widthMm, 0)} mm</td><td className="td text-right tabular-nums">{fmtNum(li.clearWidth, 0)} mm</td></>}
              <td className="td text-right tabular-nums">{fmtNum(li.item.heightMm, 0)} mm</td>
            </tr>
          ))}
          <tr className="font-semibold bg-slate-50">
            <td className="td" colSpan={3}>Ukupno</td>
            <td className="td text-right tabular-nums">{fmtNum(layout.railingLengthMm, 0)} mm</td>
            {advanced && <><td className="td text-right tabular-nums">{fmtNum(layout.totalModularMm, 0)} mm</td><td className="td text-right tabular-nums">{fmtNum(layout.totalClearMm, 0)} mm</td></>}
            <td className="td" />
          </tr>
        </tbody>
      </table>
      <div className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600">
        <div>Ukupna dužina: <b className="text-ink">{fmtNum(layout.railingLengthMm, 0)} mm</b></div>
        {advanced && <div>Modularna dužina (osa–osa): <b className="text-ink">{fmtNum(layout.totalModularMm, 0)} mm</b></div>}
        <div>Stubova za izradu: <b className="text-ink" data-testid="dimensions-post-count">{productionPostCount(project, layout, specs)}</b></div>
      </div>
      {modelPosts.length > 0 && <>
        <h3 className="font-semibold mt-5 mb-2">Stubovi u modelima ograde</h3>
        <table className="w-full min-w-[560px]" data-testid="model-posts-table">
          <thead><tr><th className="th">Element</th><th className="th">Profil</th><th className="th text-right">Kom.</th><th className="th text-right">Dužina stuba</th></tr></thead>
          <tbody>{modelPosts.map((p, i) => <tr key={i}><td className="td">{itemLabel(project.items, p.index)}</td><td className="td">{materials.find((m) => m.id === p.materialId)?.name ?? p.name}</td><td className="td text-right">{p.qty}</td><td className="td text-right">{fmtNum(p.lengthMm, 0)} mm</td></tr>)}</tbody>
        </table>
      </>}
      <h3 className="font-semibold mt-5 mb-2">Zasebni stubovi za izradu</h3>
      {!layout.posts.some((p) => !p.hidden && isProductionPost(p.post)) ? <p className="text-sm text-muted">Nema zasebnih stubova za izradu.{modelPosts.length > 0 ? ' Stubovi su deo modela ograde i navedeni su iznad.' : ''}</p> :
      <table className="w-full min-w-[640px]">
        <thead><tr><th className="th">Stub</th><th className="th">Uloga</th><th className="th">Tip</th><th className="th text-right">Pozicija (osa)</th><th className="th text-right">Presek</th><th className="th">Montaža</th></tr></thead>
        <tbody>
          {layout.posts.filter((lp) => !lp.hidden && isProductionPost(lp.post)).map((lp) => (
            <tr key={lp.post.id} className={`cursor-pointer hover:bg-slate-50 ${selection?.id === lp.post.id ? 'bg-primary-50' : ''}`} onClick={() => { select({ type: 'post', id: lp.post.id }); window.dispatchEvent(new CustomEvent('open-props')); }}>
              <td className="td">S{lp.index + 1}</td>
              <td className="td">{lp.role === 'end' ? 'Krajnji' : lp.role === 'gate' ? 'Stub kapije' : 'Međustub'}</td>
              <td className="td">{POST_LABELS[lp.post.type]}</td>
              <td className="td text-right tabular-nums">{fmtNum(lp.x, 0)} mm</td>
              <td className="td text-right tabular-nums">{lp.post.widthMm}×{lp.post.widthMm} mm</td>
              <td className="td">{MOUNTING_LABELS[lp.post.mounting]}</td>
            </tr>
          ))}
        </tbody>
      </table>}
    </div>
  );
}

export function BomTable({ project, compact }: { project: Project; compact?: boolean }) {
  const materials = useAppStore((s) => s.materials);
  const specs = useAppStore((s) => s.settings.modelSpecs);
  const settings = useAppStore((s) => s.settings);
  const bom = useMemo(() => buildBom(project, materials, specs), [project, materials, specs]);
  const total = bom.reduce((s, l) => s + l.total, 0);
  const rows = compact ? bom.slice(0, 6) : bom;
  return (
    <div className={compact ? '' : 'p-3'}>
      <IncompletePriceNotice count={bom.filter((l) => l.group !== 'Dodatni materijal' && (l.missingPrice || l.unitPriceNet <= 0)).length} />
      <table className="w-full min-w-[560px]" data-testid="bom-table">
        <thead>
          <tr>
            <th className="th">Stavka</th><th className="th">Opis</th>
            <th className="th text-right">Količina</th><th className="th">Jedinica</th>
            {!compact && <th className="th text-right">Nabavna kol.</th>}
            {!compact && <th className="th text-right">Ukupno</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.key}>
              <td className="td text-slate-600">{l.group}</td>
              <td className="td">{l.name}{l.group !== 'Dodatni materijal' && (l.missingPrice || l.unitPriceNet <= 0) && <span className="block text-[12px] text-amber-800">{l.missingPrice ? 'Materijal nije u cenovniku' : 'Cena 0 — proveriti'}</span>}</td>
              <td className="td text-right tabular-nums" title="Geometrijska količina iz crteža">{fmtNum(l.geometricQty, l.unit === 'kom' ? 0 : 2)}</td>
              <td className="td">{l.unit}</td>
              {!compact && <td className="td text-right tabular-nums" title="Sa otpadom / zaokruženo">{fmtNum(l.purchaseQty, l.unit === 'kom' ? 0 : 2)}</td>}
              {!compact && <td className="td text-right tabular-nums">{fmtMoney(l.total, settings.currency, settings.currencyRateToEur)}</td>}
            </tr>
          ))}
          {!compact && (
            <tr className="font-semibold bg-slate-50"><td className="td" colSpan={5}>Ukupno materijal (neto)</td><td className="td text-right tabular-nums">{fmtMoney(total, settings.currency, settings.currencyRateToEur)}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
