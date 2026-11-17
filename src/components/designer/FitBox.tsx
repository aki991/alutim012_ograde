import { useMemo } from 'react';
import type { CustomModel, CustomPart, PartFit } from '../../domain/models/custom';
import { autoFit } from '../../domain/models/anchored';
import { groupMembers } from '../../domain/models/gateRefill';
import type { MatShape } from '../../domain/models/materialShape';
import type { Material } from '../../domain/models/types';

const H_LABEL: Record<NonNullable<PartFit['h']>, string> = {
  auto: 'Automatski', left: 'Prati levu ivicu', right: 'Prati desnu ivicu', center: 'Ostaje na sredini', stretch: 'Proteže se od ivice do ivice', scale: 'Menja se srazmerno',
};
const V_LABEL: Record<NonNullable<PartFit['v']>, string> = {
  auto: 'Automatski', bottom: 'Prati dno', top: 'Prati vrh', center: 'Ostaje na sredini', stretch: 'Proteže se od dna do vrha', scale: 'Menja se srazmerno',
};

/**
 * Pravilo promene veličine izabranog dela: šta se s njim dešava kad se polje ili krilo poveća ili smanji. „Automatski“ je ono što je
 * program sam prepoznao (uz svaki izbor piše šta je prepoznato); radnik menja samo ako je pogrešno prepoznato. Deo koji pripada nizu
 * letvica ili prečki može da se isključi iz preračuna broja i razmaka.
 */
export function FitBox({ model, part, shape, materials, onChange, onRepeat, onShowProbe }: { model: CustomModel; part: CustomPart; shape: MatShape; materials: Material[]; onChange: (fit: PartFit | undefined) => void; /** uključuje ili isključuje preračun za ceo niz (sve letvice i čepovi na njima, ili sve prečke) */ onRepeat: (ids: string[], off: boolean) => void; onShowProbe: () => void }) {
  const auto = useMemo(() => autoFit(model, part, shape), [model, part, shape]);
  const group = useMemo(() => groupMembers(model, materials, part.id), [model, materials, part.id]);
  const repeating = group.length > 1;
  const off = repeating && group.some((id) => model.parts.find((p) => p.id === id)?.fit?.repeat === 'off');
  const fit = part.fit ?? {};
  const set = (patch: PartFit) => {
    const next: PartFit = { ...fit, ...patch };
    if (!next.h || next.h === 'auto') delete next.h;
    if (!next.v || next.v === 'auto') delete next.v;
    if (!next.repeat) delete next.repeat;
    onChange(Object.keys(next).length ? next : undefined);
  };
  const row = (label: string, testId: string, value: string, options: [string, string][], onPick: (v: string) => void) => (
    <label className="flex items-center justify-between gap-2 text-[13px] py-0.5">
      <span className="text-slate-600">{label}</span>
      <select className="input !py-1 !text-[12.5px] max-w-[190px]" data-testid={testId} value={value} onChange={(e) => onPick(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  const hOpts = (Object.keys(H_LABEL) as (keyof typeof H_LABEL)[]).map((k): [string, string] => [k, k === 'auto' ? `Automatski (${H_LABEL[auto.h].toLowerCase()})` : H_LABEL[k]]);
  const vOpts = (Object.keys(V_LABEL) as (keyof typeof V_LABEL)[]).map((k): [string, string] => [k, k === 'auto' ? `Automatski (${V_LABEL[auto.v].toLowerCase()})` : V_LABEL[k]]);
  return (
    <div className="mt-2 rounded-lg border border-line p-2" data-testid="fit-box">
      <div className="text-[12.5px] font-semibold mb-1">Pri promeni veličine polja</div>
      {row('Po širini', 'fit-h', fit.h ?? 'auto', hOpts, (v) => set({ h: v as PartFit['h'] }))}
      {row('Po visini', 'fit-v', fit.v ?? 'auto', vOpts, (v) => set({ v: v as PartFit['v'] }))}
      {repeating && (
        <label className="flex items-start gap-2 text-[13px] mt-1">
          <input type="checkbox" className="mt-0.5" data-testid="fit-repeat" checked={!off} onChange={(e) => onRepeat(group, !e.target.checked)} />
          <span>Broj i razmak se računaju za veličinu polja <span className="text-muted">(ovaj deo je u nizu od {group.length} delova (letvice i čepovi na njima); izbor važi za ceo niz — isključite da broj ostane kao na crtežu)</span></span>
        </label>
      )}
      <p className="text-[11.5px] text-muted mt-1">„Automatski“ vezuje svaki kraj dela za bližu ivicu polja. Crtež ovde je u veličini u kojoj je nacrtan, pa se pravilo ne vidi na njemu: vidi se kad se polje u projektu poveća ili smanji, a odmah u <b>Probi veličina</b>.</p>
      <button type="button" className="btn btn-sm w-full mt-1" data-testid="fit-show-probe" onClick={onShowProbe}>Prikaži probu veličina</button>
    </div>
  );
}
