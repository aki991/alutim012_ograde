import { Scissors } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Customer, Material, Project } from '../../domain/models/types';
import { buildCuttingList, cutOptions, groupBars } from '../../domain/pricing/cutting';
import { barSvg, positionColors } from '../../services/cutlistSvg';
import { useAppStore } from '../../store/useAppStore';
import { fmtNum } from '../../utils/units';
import { NumberField } from '../forms/Fields';
import { PdfPreviewModal } from '../editor/PdfPreviewModal';

const posTag = (k: string) => (/^\d/.test(k) ? `P${k}` : k);

/** Krojna lista izabranog projekta: raspored komada na nabavne šipke (testera i ostatak), pregled na ekranu i PDF. */
export function CutlistSection({ project, customer, materials }: { project: Project; customer: Customer | null; materials: Material[] }) {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const [open, setOpen] = useState(false);
  const opts = cutOptions(settings);
  const list = useMemo(() => buildCuttingList(project, settings.modelSpecs, materials, opts), [project, settings.modelSpecs, materials, opts.stockMm, opts.kerfMm]); // eslint-disable-line react-hooks/exhaustive-deps
  const colors = useMemo(() => positionColors(list.positions), [list.positions]);
  const t = list.totals;
  const setCutting = (patch: Partial<typeof opts>) => update({ cutting: { ...opts, ...patch } });

  return (
    <section className="card p-4 mt-5" data-testid="cutlist">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-bold">Krojna lista</h2>
          <p className="text-sm text-muted">Raspored komada na nabavne šipke za projekat „{project.name}": svaki komad je u boji svoje pozicije, razmak je rez testere, šrafirani deo je ostatak.</p>
        </div>
        <button className="btn btn-primary" data-testid="cutlist-pdf" disabled={t.pieces === 0} onClick={() => setOpen(true)}><Scissors size={17} />Krojna lista PDF</button>
      </div>

      <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-4 mb-3">
        <NumberField label="Dužina šipke" testId="cut-stock" value={opts.stockMm} range={{ min: 500, max: 20000 }} onCommit={(v) => setCutting({ stockMm: v })} />
        <NumberField label="Širina testere" testId="cut-kerf" value={opts.kerfMm} range={{ min: 0, max: 50 }} allowZero step={1} onCommit={(v) => setCutting({ kerfMm: v })} />
      </div>

      {t.pieces === 0 ? (
        <p className="text-sm text-muted" data-testid="cutlist-empty">Projekat nema šipkastih profila za sečenje. Dodajte ogradu ili kapiju.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4" data-testid="cutlist-totals">
            {[
              ['Vrsta profila', String(t.profiles)],
              ['Šipki za nabavku', String(t.bars)],
              ['Komada za sečenje', String(t.pieces)],
              ['Iskorišćenje', `${fmtNum(t.efficiencyPct, 1)} %`],
              ['Ukupan ostatak', `${fmtNum(t.leftoverMm / 1000, 2)} m`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-bg px-3 py-2.5"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{k}</div><div className="text-[20px] font-extrabold tabular-nums" data-testid={k === 'Šipki za nabavku' ? 'cutlist-bars' : undefined}>{v}</div></div>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 text-[13px]" data-testid="cutlist-legend">
            {list.positions.map((p) => (
              <span key={p.key} className="inline-flex items-center gap-1.5" title={p.detail}>
                <span className="w-3 h-3 rounded-[3px]" style={{ background: colors.get(p.key) }} />
                <b style={{ color: colors.get(p.key) }}>{posTag(p.key)}</b>
                <span className="text-slate-700">{p.label}</span>
              </span>
            ))}
          </div>

          <div className="space-y-5">
            {list.profiles.map((p, pi) => (
              <div key={p.profile} data-testid="cutlist-profile">
                <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-bg px-3 py-2 mb-1">
                  <div><b>{p.profile}</b> <span className="text-sm text-muted">· {p.pieceCount} komada · {fmtNum(p.pieceTotalMm / 1000, 2)} m</span></div>
                  <div className="text-sm"><b className="text-primary">{p.bars.length} {p.bars.length === 1 ? 'šipka' : 'šipke'}</b> <span className="text-muted">· iskorišćenje</span> <b>{fmtNum(p.efficiencyPct, 1)} %</b></div>
                </div>
                {p.oversize.length > 0 && <p className="text-sm font-semibold text-[#b42318] mb-1" role="alert">{p.oversize.length} kom duži od šipke ({fmtNum(Math.max(...p.oversize.map((o) => o.lengthMm)), 0)} mm) nije raspoređeno.</p>}
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    {groupBars(p.bars).map((g) => (
                      <div key={g.from} className="grid grid-cols-[64px_minmax(0,1fr)_90px] items-center gap-2 border-b border-line py-1" data-testid="cutlist-bar">
                        <span className="leading-tight"><span className="block text-[12px] font-bold">{g.count > 1 ? `Šipke ${g.from}–${g.to}` : `Šipka ${g.from}`}</span>{g.count > 1 && <b className="text-primary text-[14px]" data-testid="cutlist-bar-count">× {g.count}</b>}</span>
                        <div className="[&>svg]:w-full [&>svg]:h-auto" dangerouslySetInnerHTML={{ __html: barSvg(g.bar, list.stockMm, list.kerfMm, colors, `${pi}-${g.from}`) }} />
                        <span className="text-right leading-tight"><span className="block text-[10px] text-muted">Ostatak</span><b className={`text-[13px] tabular-nums ${g.bar.leftoverMm === 0 ? 'text-[#15803d]' : ''}`}>{fmtNum(g.bar.leftoverMm, 0)} mm</b></span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-0.5 text-[12.5px] text-slate-600">
                  {p.summary.map((s) => <span key={s.lengthMm}><b className="tabular-nums">{fmtNum(s.lengthMm, 0)}</b> × {s.qty} <span className="text-muted">({s.positions.map(posTag).join(', ')})</span></span>)}
                </div>
              </div>
            ))}
          </div>
          <ul className="list-disc pl-5 mt-4 space-y-0.5 text-[12.5px] text-muted">{list.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
      {open && <PdfPreviewModal kind="cutlist" project={project} customer={customer} materials={materials} settings={settings} onClose={() => setOpen(false)} />}
    </section>
  );
}
