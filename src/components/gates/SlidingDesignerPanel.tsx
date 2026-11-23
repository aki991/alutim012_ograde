import { ChoiceGroup } from '../ui/ChoiceGroup';
import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Plus } from 'lucide-react';
import { resolveSliding, slidingBom, type CheckLevel, type SlidingActuation, type SlidingSpec, type SlidingSupport } from '../../domain/gates/slidingAssembly';
import { isPartOn, partDef, partsFor, PART_GROUP_LABELS, type PartGroup } from '../../domain/gates/slidingParts';
import { useAppStore } from '../../store/useAppStore';
import { NumInput } from '../forms/NumInput';
import { SlidingPartBody, withPartOn } from './SlidingForm';

const LEVEL_TONE: Record<CheckLevel, string> = { ok: 'text-emerald-700', warn: 'text-amber-800', error: 'text-[#b42318]', pending: 'text-slate-600' };
const LEVEL_ICON = { ok: CheckCircle2, warn: AlertTriangle, error: AlertTriangle, pending: Clock } as const;
const fmt = (n: number) => `${Math.round(n).toLocaleString('sr-RS')} mm`;

function Seg<T extends string>({ value, options, onChange, testId }: { value: T; options: [T, string][]; onChange: (v: T) => void; testId: string }) {
  const label = testId === 'sl-support' ? 'Oslonac kapije' : testId === 'sl-actuation' ? 'Pogon kapije' : 'Smer otvaranja';
  return <ChoiceGroup label={label} value={value} onChange={onChange} testId={testId} className="w-full"
    options={options.map(([v, label]) => ({ value: v, label, testId: `${testId}-${v}` }))} />;
}

/** Dugmad za postavljanje kliznog okova na kapiju: postavljen deo se bira, nepostavljen se postavlja klikom. */
export function SlidingPartButtons({ spec, selected, onSpec, onSelect }: { spec: SlidingSpec; selected: string | null; onSpec: (p: Partial<SlidingSpec>) => void; onSelect: (k: string | null) => void }) {
  const parts = partsFor(spec.support, spec.actuation).filter((p) => !p.leaf);
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="sliding-part-buttons">
      {parts.map((p) => {
        const on = isPartOn(spec, p.key);
        return (
          <button key={p.key} type="button" data-testid={`sl-add-${p.key}`} aria-pressed={on} title={on ? `${p.label}: podešavanja` : `Postavi: ${p.label}`}
            className={`btn btn-sm ${selected === p.key ? '!border-brand-red !bg-[#fef3f2]' : on ? 'btn-dark' : ''}`}
            onClick={() => { if (!on) onSpec(withPartOn(spec, p.key, true)); onSelect(p.key); }}>
            {!on && <Plus size={13} />}{p.button ?? p.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Podešavanja klizne kapije u crtanju modela: oslonac i pogon, hod, odstojanje krila od tla, postavljanje delova okova (točkići, šina,
 * valjci, graničnici …), podešavanja izabranog dela (veličina, položaj, razmak, broj, okov iz cenovnika), provere i okov u sastavnici.
 * Ram, U-profili i prečke su sam crtež modela (materijali iz cenovnika), kao kod ostalih kapija.
 */
export function SlidingDesignerPanel({ spec, W, leafH, onSpec, selected, onSelect, slideId }: { slideId: string; spec: SlidingSpec; W: number; leafH: number; onSpec: (p: Partial<SlidingSpec>) => void; selected: string | null; onSelect: (k: string | null) => void }) {
  const materials = useAppStore((s) => s.materials);
  const H = leafH + spec.frameBottomY;
  const res = useMemo(() => resolveSliding(spec, W, H), [spec, W, H]);
  const bom = useMemo(() => slidingBom(res), [res]);
  const sel = selected ? partDef(selected) : undefined;
  const groups: PartGroup[] = ['oslonac', 'vodjenje', 'pogon'];
  const placed = partsFor(spec.support, spec.actuation).filter((p) => !p.leaf && isPartOn(spec, p.key));
  const checks = res.checks.filter((c) => c.key !== 'passage' && c.key !== 'side');
  return (
    <div className="space-y-2.5 mb-4" data-testid="sliding-designer-panel">
      <h2 className="font-bold text-[15px]">Klizna kapija</h2>
      {sel ? (
        <div className="rounded-lg border border-brand-red p-2.5" data-testid="sliding-designer-part">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-semibold text-[14px] flex-1">{sel.label}</span>
            <button className="btn btn-sm" data-testid="sliding-designer-part-close" onClick={() => onSelect(null)}>Zatvori</button>
          </div>
          <SlidingPartBody part={sel} spec={spec} res={res} bom={bom} onSpec={onSpec} slideId={slideId} onRemove={() => { onSpec(withPartOn(spec, sel.key, false)); onSelect(null); }} />
        </div>
      ) : (
        <>
          <div className="grid gap-1 text-[13px]"><span>Oslonac</span>
            <Seg<SlidingSupport> testId="sl-support" value={spec.support} options={[['ground_rail', 'Na donjoj šini'], ['cantilever', 'Samonoseća']]} onChange={(v) => onSpec({ support: v })} />
          </div>
          <div className="grid gap-1 text-[13px]"><span>Pogon</span>
            <Seg<SlidingActuation> testId="sl-actuation" value={spec.actuation} options={[['manual', 'Ručna'], ['motor', 'Motorna']]} onChange={(v) => onSpec({ actuation: v })} />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 items-center text-[13px]">
            <span>Hod<span className="block text-[11px] text-muted">{spec.travelSet ? 'zadato ručno; prazno = prati širinu' : 'prati širinu krila'}</span></span>
            <NumInput value={res.spec.travel} testId="sl-travel" ariaLabel="Hod" placeholder="auto" onCommit={(v) => onSpec(v === null ? { travelSet: false } : { travel: Math.round(v), travelSet: true })} />
            <span>Donja ivica krila od tla</span>
            <NumInput value={spec.frameBottomY} testId="sl-frameBottomY" ariaLabel="Donja ivica krila od tla" onCommit={(v) => { if (v !== null && v >= 0) onSpec({ frameBottomY: Math.round(v) }); }} />
            <span>Rezerva za provere</span>
            <NumInput value={spec.reserve} testId="sl-reserve" ariaLabel="Rezerva za provere" onCommit={(v) => onSpec({ reserve: v ?? 0 })} />
          </div>
          <div>
            <div className="text-[12px] font-bold uppercase text-muted mb-1">Postavi na kapiju</div>
            {groups.map((g) => {
              const list = partsFor(spec.support, spec.actuation).filter((p) => !p.leaf && p.group === g);
              if (!list.length) return null;
              return (
                <div key={g} className="mb-1.5">
                  <div className="text-[11.5px] text-slate-600 mb-0.5">{PART_GROUP_LABELS[g]}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((p) => {
                      const on = isPartOn(spec, p.key);
                      return (
                        <button key={p.key} type="button" data-testid={`sl-panel-add-${p.key}`} aria-pressed={on} className={`btn btn-sm ${on ? 'btn-dark' : ''}`}
                          onClick={() => { if (!on) onSpec(withPartOn(spec, p.key, true)); onSelect(p.key); }}>{!on && <Plus size={13} />}{p.button ?? p.label}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p className="text-[11.5px] text-muted">Klik na postavljen deo (dugme ili na crtežu) otvara njegova podešavanja: veličinu, položaj od početka krila, razmak i broj, i okov iz cenovnika.</p>
          </div>
          {checks.length > 0 && (
            <div className="space-y-1" data-testid="sl-checks">
              <div className="text-[12px] font-bold uppercase text-muted">Provere</div>
              {checks.map((c) => { const I = LEVEL_ICON[c.level]; return (
                <div key={c.key} className={`flex gap-1.5 text-[12.5px] ${LEVEL_TONE[c.level]}`} data-testid={`sl-check-${c.key}`} data-level={c.level}>
                  <I size={14} className="shrink-0 mt-0.5" /><span><b>{c.title}:</b> {c.msg}</span>
                </div>
              ); })}
            </div>
          )}
          <div data-testid="sl-hw-bom">
            <div className="text-[12px] font-bold uppercase text-muted mb-1">Klizni okov u sastavnici</div>
            {placed.length === 0 && <p className="text-[12px] text-muted">Još nijedan deo okova nije postavljen.</p>}
            {bom.map((b) => {
              const mat = b.materialId ? materials.find((m) => m.id === b.materialId) : undefined;
              return (
                <div key={b.key} className="flex gap-2 text-[12px] py-0.5 border-b border-line last:border-0" data-testid={`sl-hw-bom-${b.key}`}>
                  <span className="flex-1">{b.name}<span className={`block ${mat || b.materialText ? 'text-muted' : 'text-amber-800'}`}>{mat ? mat.name : b.materialText ? `${b.materialText} (ručno)` : 'nije definisano'}</span></span>
                  <span className="tabular-nums whitespace-nowrap">{b.shownMm && (b.key === 'rail' || b.key === 'carrier' || b.make === 'izrada') ? fmt(b.shownMm) + ' · ' : ''}{b.qty} {b.unit}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
