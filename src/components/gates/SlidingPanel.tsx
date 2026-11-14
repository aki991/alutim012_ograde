import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, RotateCcw, Save } from 'lucide-react';
import { computeLayout, postHalfSum } from '../../domain/geometry/layout';
import {
  POS_LABELS, posKeysFor, resolveSliding, slidingBom, variantTitle, type CheckLevel, type PosKey, type SlidingActuation, type SlidingSpec, type SlidingSupport,
} from '../../domain/gates/slidingAssembly';
import type { Gate, Project } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { NumInput } from '../forms/NumInput';
import refRailManual from '../../assets/gates/klizna_sina_rucna.svg?url';
import refRailMotor from '../../assets/gates/klizna_sina_motorna.svg?url';
import refCantManual from '../../assets/gates/samonoseca_rucna.svg?url';
import refCantMotor from '../../assets/gates/samonoseca_motorna.svg?url';

const REF: Record<string, string> = { 'ground_rail|manual': refRailManual, 'ground_rail|motor': refRailMotor, 'cantilever|manual': refCantManual, 'cantilever|motor': refCantMotor };
const fmt = (n: number) => `${Math.round(n).toLocaleString('sr-RS')} mm`;
const LEVEL_TONE: Record<CheckLevel, string> = { ok: 'text-emerald-700', warn: 'text-amber-800', error: 'text-[#b42318]', pending: 'text-slate-600' };
const LEVEL_ICON = { ok: CheckCircle2, warn: AlertTriangle, error: AlertTriangle, pending: Clock } as const;


function Seg<T extends string>({ value, options, onChange, testId }: { value: T; options: [T, string][]; onChange: (v: T) => void; testId: string }) {
  return (
    <span className="grid rounded-lg border border-line overflow-hidden" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} data-testid={testId}>
      {options.map(([v, l]) => (
        <button key={v} type="button" data-testid={`${testId}-${v}`} aria-pressed={value === v} className={`py-1.5 text-[12.5px] font-semibold ${value === v ? 'bg-brand-black text-white' : 'bg-white hover:bg-slate-50'}`} onClick={() => onChange(v)}>{l}</button>
      ))}
    </span>
  );
}

/**
 * Panel klizne kapije (sklop): kratka obavezna polja, proba hoda, provere uz polja, napredne pozicije (računske ili ručne),
 * sastavnica sa prikazanom, krojnom i nabavnom merom i čuvanje kao šablon.
 */
export function SlidingPanel({ project, gate }: { project: Project; gate: Gate }) {
  const st = useAppStore.getState();
  const spec = gate.sliding!;
  const index = project.items.findIndex((i) => i.id === gate.id);
  const li = useMemo(() => computeLayout(project).items[index], [project, index]);
  const W = li.clearWidth;
  const res = useMemo(() => resolveSliding(spec, W, gate.heightMm), [spec, W, gate.heightMm]);
  const bom = useMemo(() => slidingBom(res), [res]);
  const pct = useAppStore((s) => s.editor.slideTest[gate.id] ?? 0);
  const [tplName, setTplName] = useState('');
  const [tplMsg, setTplMsg] = useState('');
  const patch = (p: Partial<SlidingSpec>, key?: string) => st.patchSliding(gate.id, p, key);
  const half = postHalfSum(project, index);
  const issues = (field: string) => res.checks.filter((c) => c.field === field && c.level !== 'ok' && c.level !== 'pending');
  const fieldNote = (field: string) => issues(field).map((c) => <div key={c.key} className={`text-[11.5px] ${LEVEL_TONE[c.level]}`} data-testid={`sl-issue-${field}`}>{c.msg}</div>);
  const round = (v: number | null) => (v === null ? null : Math.round(v));
  const row = (label: string, field: string, value: number | null, onCommit: (v: number | null) => void, opts: { unit?: string; allowEmpty?: boolean; hint?: string } = {}) => (
    <div className="py-1" key={field}>
      <div className="grid grid-cols-[minmax(0,1fr)_110px_24px] gap-2 items-center">
        <span className="text-[13px] leading-tight">{label}{opts.hint && <span className="block text-[11px] text-muted">{opts.hint}</span>}</span>
        <NumInput value={value} testId={`sl-${field}`} ariaLabel={label} placeholder={opts.allowEmpty ? 'nije izmereno' : '—'}
          onCommit={(v) => { if (v === null && !opts.allowEmpty) return; onCommit(round(v)); }} />
        <span className="text-[11px] text-muted">{opts.unit ?? 'mm'}</span>
      </div>
      {fieldNote(field)}
    </div>
  );
  const cant = spec.support === 'cantilever';
  const keys = posKeysFor(spec.support, spec.actuation);
  const ref = REF[`${spec.support}|${spec.actuation}`];

  return (
    <div className="space-y-2" data-testid="sliding-panel">
      <div className="rounded-lg bg-slate-50 border border-line px-3 py-2 text-[12.5px]">
        <div className="font-semibold" data-testid="sl-variant">{variantTitle(spec)}</div>
        <div className="text-muted">{spec.confirmed ? 'Mere potvrđene na terenu.' : 'Radni nacrt: ilustrativna geometrija — svetli otvor, okov, graničnike i montažne mere potvrditi za stvarni posao.'}</div>
      </div>
      <label className="flex flex-col gap-1 text-[13px]">Naziv varijante
        <input className="input !py-1" data-testid="sl-name" value={spec.name} onChange={(e) => patch({ name: e.target.value }, 'name')} />
      </label>
      <div className="grid gap-1 text-[13px]"><span>Oslonac</span>
        <Seg<SlidingSupport> testId="sl-support" value={spec.support} options={[['ground_rail', 'Na donjoj šini'], ['cantilever', 'Samonoseća']]} onChange={(v) => patch({ support: v })} />
      </div>
      <div className="grid gap-1 text-[13px]"><span>Pogon</span>
        <Seg<SlidingActuation> testId="sl-actuation" value={spec.actuation} options={[['manual', 'Ručna'], ['motor', 'Motorna']]} onChange={(v) => patch({ actuation: v })} />
      </div>
      <div className="grid gap-1 text-[13px]"><span>Smer otvaranja (gledano iz dvorišta)</span>
        <Seg<'left' | 'right'> testId="sl-opening" value={gate.opening} options={[['left', 'Ulevo'], ['right', 'Udesno']]} onChange={(v) => st.patchItem(gate.id, { opening: v })} />
      </div>

      <div className="pt-1" data-testid="sl-main">
        <div className="text-[12px] font-bold uppercase text-muted">Mere</div>
        {row('Spoljna širina rama', 'width', Math.round(W), (v) => { if (v !== null && v >= 300) st.setWidth(gate.id, v + 2 * half, `w:${gate.id}`); })}
        {row('Spoljna visina rama', 'height', Math.round(res.frameHeight), (v) => { if (v !== null && v >= 300) st.patchItem(gate.id, { heightMm: v + spec.frameBottomY }, 'h'); }, { hint: `vrh rama ${fmt(gate.heightMm)} od tla` })}
        {row('Hod', 'travel', spec.travel, (v) => patch({ travel: v ?? spec.travel }, 'travel'), { hint: 'uzdužno pomeranje krila, zatvoreno → otvoreno' })}
        {cant && row('Rep', 'tailLength', spec.tailLength, (v) => patch({ tailLength: v ?? spec.tailLength }, 'tail'))}
        {row('Svetli otvor (izmereno)', 'clearOpening', spec.clearOpening, (v) => patch({ clearOpening: v }, 'clear'), { allowEmpty: true, hint: 'između prepreka; prazno = nije izmereno' })}
        {row('Slobodan prostor na strani otvaranja', 'sideSpace', spec.sideSpace, (v) => patch({ sideSpace: v }, 'side'), { allowEmpty: true, hint: 'od kraja prolaza do prepreke' })}
        {spec.actuation === 'motor' && row('Dužina zupčaste letve', 'rackLength', spec.rackLength, (v) => patch({ rackLength: v ?? spec.rackLength }, 'rack'), { hint: 'zadaje se prema kompletu, ne računa se iz širine krila' })}
        {spec.actuation === 'motor' && fieldNote('rackStart')}
      </div>

      <div className="rounded-lg border border-line p-2" data-testid="sl-travel-test">
        <div className="flex items-center justify-between text-[13px]"><b>Proba hoda</b><span className="tabular-nums" data-testid="sl-pct">{pct} % · {fmt((spec.travel * pct) / 100)}</span></div>
        <input type="range" min={0} max={100} step={1} value={pct} className="w-full" aria-label="Proba hoda" data-testid="sl-slider" onChange={(e) => st.setSlideTest(gate.id, Number(e.target.value))} />
        <div className="flex gap-1.5">
          <button className="btn btn-sm flex-1" data-testid="sl-closed" onClick={() => st.setSlideTest(gate.id, 0)}>Zatvoreno</button>
          <button className="btn btn-sm flex-1" data-testid="sl-half" onClick={() => st.setSlideTest(gate.id, 50)}>50 %</button>
          <button className="btn btn-sm flex-1" data-testid="sl-open" onClick={() => st.setSlideTest(gate.id, 100)}>Otvoreno</button>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] mt-1.5"><input type="checkbox" checked={spec.showOpenOutline} data-testid="sl-outline" onChange={(e) => patch({ showOpenOutline: e.target.checked })} />Isprekidan otvoren položaj</label>
        <p className="text-[11.5px] text-muted mt-1">Proba pomera samo pokretne delove; prihvati, vođica, {cant ? 'kolica' : 'šina'}, graničnik i motor stoje. Prikaz nije radionička mera.</p>
      </div>

      <div className="space-y-1" data-testid="sl-checks">
        <div className="text-[12px] font-bold uppercase text-muted">Provere</div>
        {res.checks.map((c) => { const I = LEVEL_ICON[c.level]; return (
          <div key={c.key} className={`flex gap-1.5 text-[12.5px] ${LEVEL_TONE[c.level]}`} data-testid={`sl-check-${c.key}`} data-level={c.level}>
            <I size={14} className="shrink-0 mt-0.5" />
            <span><b>{c.title}:</b> {c.msg}{c.basis && <span className="block text-[11px] text-muted">Proverava se: {c.basis}</span>}</span>
          </div>
        ); })}
      </div>

      <details className="rounded-lg border border-line p-2" data-testid="sl-advanced">
        <summary className="cursor-pointer text-[13px] font-semibold">Napredno: profili, okov i pozicije</summary>
        {row('Ram od tla (donja ivica)', 'frameBottomY', spec.frameBottomY, (v) => { if (v !== null) { patch({ frameBottomY: v }); st.patchItem(gate.id, { heightMm: res.frameHeight + v }); } })}
        {row('Profil rama (vidljiva širina)', 'frameFace', spec.frameFace, (v) => patch({ frameFace: v ?? spec.frameFace }))}
        {row('Bočni U-profil (vidljiva širina)', 'channelFace', spec.channelFace, (v) => patch({ channelFace: v ?? spec.channelFace }))}
        {row('Broj prečki', 'infillCount', spec.infillCount, (v) => patch({ infillCount: Math.max(1, v ?? spec.infillCount) }), { unit: 'kom' })}
        {row('Presek prečke (kvadratna cev)', 'infillSection', spec.infillSection, (v) => patch({ infillSection: v ?? spec.infillSection }))}
        {!cant && row('Prečnik donjih točkića', 'wheelDiameter', spec.wheelDiameter, (v) => patch({ wheelDiameter: v ?? spec.wheelDiameter }))}
        {row('Rezerva za provere', 'reserve', spec.reserve, (v) => patch({ reserve: v ?? 0 }), { hint: 'točkići na šini, kolica u C-profilu, zupčanik na letvi' })}
        <div className="text-[12px] font-bold uppercase text-muted mt-2">Pozicije (lokalna osa X ka strani otvaranja, 0 = zatvorena prednja ivica)</div>
        {keys.map((k: PosKey) => {
          const p = res.pos[k];
          return (
            <div key={k} className="py-1" data-testid={`sl-posrow-${k}`}>
              <div className="grid grid-cols-[minmax(0,1fr)_100px_28px] gap-2 items-center">
                <span className="text-[12.5px] leading-tight">{POS_LABELS[k]}
                  <span className={`block text-[11px] ${p.manual ? 'text-violet-700' : 'text-muted'}`} data-testid={`sl-pos-state-${k}`}>{p.manual ? `ručno · računski ${fmt(p.auto)}${Math.abs(p.value - p.auto) > 0.5 ? ` (razlika ${p.value - p.auto > 0 ? '+' : ''}${Math.round(p.value - p.auto)} mm)` : ''}` : 'računski'}</span>
                </span>
                <NumInput value={Math.round(p.value)} testId={`sl-pos-${k}`} ariaLabel={POS_LABELS[k]} onCommit={(v) => { if (v === null) return; patch({ manual: { ...spec.manual, [k]: Math.round(v) } }); }} />
                <button className="btn btn-icon !w-7 !h-7" title="Vrati računsku vrednost" aria-label={`Vrati računsku vrednost: ${POS_LABELS[k]}`} data-testid={`sl-pos-reset-${k}`} disabled={!p.manual}
                  onClick={() => { const m = { ...spec.manual }; delete m[k]; patch({ manual: m }); }}><RotateCcw size={13} /></button>
              </div>
              {fieldNote(k)}{fieldNote(`pos-${k}`)}
            </div>
          );
        })}
      </details>

      <details className="rounded-lg border border-line p-2" data-testid="sl-bom">
        <summary className="cursor-pointer text-[13px] font-semibold">Sastavnica kapije ({bom.length} stavki)</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] mt-1">
            <thead className="text-muted text-left"><tr><th className="py-0.5 pr-1">Stavka</th><th className="pr-1 text-right">Kol.</th><th className="pr-1 text-right">Prikazana</th><th className="pr-1 text-right">Krojna</th><th className="text-right">Nabavna</th></tr></thead>
            <tbody>
              {bom.map((b) => (
                <tr key={b.key} className="border-t border-line align-top" data-testid={`sl-bom-${b.key}`}>
                  <td className="py-0.5 pr-1">{b.name}<span className="block text-muted">{b.make}{b.kit ? ' · deo kompleta motora' : ''}{b.confirm ? ' · potvrditi' : ''}{b.note ? ` · ${b.note}` : ''}</span></td>
                  <td className="pr-1 text-right whitespace-nowrap">{b.qty} {b.unit}</td>
                  <td className="pr-1 text-right">{b.shownMm ?? '—'}</td>
                  <td className="pr-1 text-right w-[74px]">{b.make === 'izrada' || b.key === 'rail' || b.key === 'carrier'
                    ? <NumInput value={b.cutMm} testId={`sl-cut-${b.key}`} placeholder="potvrditi" ariaLabel={`Krojna mera: ${b.name}`} onCommit={(v) => { const c = { ...spec.cuts }; if (v === null) delete c[b.key]; else c[b.key] = Math.round(v); patch({ cuts: c }); }} />
                    : '—'}</td>
                  <td className="text-right">{b.buyMm ?? (b.make === 'kupovina' && b.unit === 'kom' && b.shownMm ? 'po dobavljaču' : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted mt-1">Krojna mera bez upisa čeka potvrdu (zavisi od spoja ili dubine ulaska u kanal) i ne ulazi u krojnu listu dok se ne upiše.</p>
      </details>

      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={spec.confirmed} data-testid="sl-confirmed" onChange={(e) => patch({ confirmed: e.target.checked })} />Mere potvrđene na terenu</label>

      <div className="rounded-lg border border-line p-2 space-y-1.5" data-testid="sl-template">
        <div className="text-[13px] font-semibold">Sačuvaj kao šablon</div>
        <div className="flex gap-1.5">
          <input className="input !py-1 flex-1" placeholder={spec.name} aria-label="Naziv šablona" data-testid="sl-tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value)} />
          <button className="btn btn-sm" data-testid="sl-tpl-save" onClick={() => { const id = st.saveSlidingTemplate(gate.id, tplName || spec.name); if (id) { setTplMsg(`Šablon „${tplName || spec.name}“ je sačuvan u katalogu.`); setTplName(''); } }}><Save size={14} />Sačuvaj</button>
        </div>
        {tplMsg && <p className="text-[12px] text-emerald-700" data-testid="sl-tpl-msg">{tplMsg}</p>}
        <p className="text-[11px] text-muted">Šablon čuva mere, smer, profile, ručne pozicije, oslonac i pogon i stanje potvrde. Ubacivanje šablona pravi nezavisnu kopiju.</p>
      </div>

      {ref && (
        <details className="rounded-lg border border-line p-2">
          <summary className="cursor-pointer text-[13px] font-semibold">Referentni crtež (ilustracija)</summary>
          <img src={ref} alt={`Referentni crtež: ${variantTitle(spec)}`} className="w-full mt-1 rounded" />
        </details>
      )}
    </div>
  );
}
