import { NumInput } from '../forms/NumInput';
import { Modal } from '../ui/Modal';
import { DEFAULT_POST_SPACING_MM, type CustomModel, type PostLayout } from '../../domain/models/custom';
import { DEFAULT_HW_DIMS, hwDimsOf, type HwDims } from '../../domain/models/materialShape';

interface Field { key: keyof HwDims; label: string; unit: string; hint: string; auto?: string }

const SECTIONS: { title: string; fields: Field[] }[] = [
  { title: 'Veza stub – rukohvat', fields: [
    { key: 'connectorH', label: 'Visina veze', unit: 'mm', hint: 'Od vrha stuba (ili kape) do donje ivice rukohvata. Rukohvat se sam podiže na ovu visinu.' },
    { key: 'connectorNeckD', label: 'Prečnik vrata veze', unit: 'mm', hint: 'Uži deo veze između stuba i ploče pod rukohvatom (samo izgled).' },
    { key: 'connectorPlateLen', label: 'Dužina ploče veze', unit: 'mm', hint: 'Ploča pod rukohvatom, mereno duž rukohvata (samo izgled).' },
    { key: 'connectorPlateT', label: 'Debljina ploče veze', unit: 'mm', hint: 'Ploča pod rukohvatom (samo izgled).' },
  ] },
  { title: 'Flanša na dnu stuba', fields: [
    { key: 'plateH', label: 'Podizanje stuba zbog flanše', unit: 'mm', hint: 'Debljina ploče flanše: za toliko je stub iznad poda, pa je ukupna visina ograde veća.' },
    { key: 'plateOver', label: 'Prepust ploče oko stuba', unit: 'mm', hint: 'Poluprečnik ploče flanše = poluprečnik stuba + prepust (samo izgled).' },
    { key: 'sleeveH', label: 'Visina čaure flanše', unit: 'mm', hint: 'Čaura koja obuhvata stub iznad ploče (samo izgled).' },
  ] },
  { title: 'Kapa na vrhu stuba', fields: [
    { key: 'capH', label: 'Visina kape', unit: 'mm', hint: 'Kapa ispod veze podiže rukohvat za svoju visinu.' },
  ] },
  { title: 'Koleno na uglu', fields: [
    { key: 'elbowArm', label: 'Krak kolena', unit: 'mm', hint: 'Samo kad je spoj na uglu koleno: za toliko se skraćuje svaka cev (prečka i rukohvat) uz koleno.' },
    { key: 'ballArm', label: 'Krak kuglastog zgloba', unit: 'mm', hint: 'Od ose spoja do kraja cevi, po stvarnoj osi cevi. 0 = prema prečniku. Upišite meru okova koji koristite.' },
  ] },
  { title: 'Prsten i kapice prečke', fields: [
    { key: 'rodOffset', label: 'Osa prečke ispred stuba', unit: 'mm', auto: 'poluprečnik prečke + 7', hint: 'Rastojanje ose prečke od prednje ivice stuba. Prazno = prema prečniku prečke. Prečke se same postavljaju na ovo rastojanje.' },
    { key: 'endCapLen', label: 'Dužina kapice na kraju cevi', unit: 'mm', hint: 'Kapica prečke i završetak rukohvata (samo izgled).' },
  ] },
  { title: 'Zavrtnji po komadu okova (idu u spisak materijala)', fields: [
    { key: 'screwsHolder', label: 'Po prstenu prečke', unit: 'kom', hint: 'BTS-VP4238.' },
    { key: 'screwsConnector', label: 'Po vezi stub – rukohvat', unit: 'kom', hint: 'BTS-VP4219.' },
    { key: 'screwsFlange', label: 'Po flanši', unit: 'kom', hint: 'BTS-VT75100.' },
  ] },
];

/**
 * „Mere ograde“ (ograda za terasu): mere okova koje aplikacija koristi pri postavljanju (visina veze stub–rukohvat, podizanje stuba zbog flanše,
 * visina kape, rastojanje prečke od stuba, zavrtnji po komadu). Zavise od okova koje radionica nabavlja, pa se podešavaju po modelu.
 */
export function TerraceMeasuresModal({ model, onChange, onClose }: { model: CustomModel; onChange: (fn: (m: CustomModel) => CustomModel) => void; onClose: () => void }) {
  const dims = hwDimsOf(model.hw);
  const set = (key: keyof HwDims, v: number | null) => onChange((m) => {
    const hw: Partial<HwDims> = { ...(m.hw ?? {}) };
    // prazno polje ili podrazumevana vrednost = bez izmene
    if (v === null || v < 0 || v === DEFAULT_HW_DIMS[key]) delete hw[key]; else hw[key] = v;
    return { ...m, hw: Object.keys(hw).length ? hw : undefined };
  });
  return (
    <Modal title="Mere ograde" width={620} onClose={onClose}
      footer={<><button className="btn" data-testid="terrace-measures-reset" disabled={!model.hw} onClick={() => onChange((m) => ({ ...m, hw: undefined }))}>Vrati podrazumevane mere</button><button className="btn btn-primary" data-testid="terrace-measures-close" onClick={onClose}>Gotovo</button></>}>
      <p className="text-[12.5px] text-muted mb-3">Mere okova zavise od materijala koje koristite. Promena se odmah primenjuje na crtež: rukohvat se podiže na visinu veze, stub na debljinu flanše, a prečke se pomeraju na zadato rastojanje od stuba.</p>
      <section className="mb-3" data-testid="terrace-corner-joint">
        <h3 className="font-bold text-[13.5px] mb-1">Spoj prečki i rukohvata na uglu</h3>
        <p className="text-[11.5px] text-muted leading-snug mb-1">Spoj određuje krajeve obe cevi. Kuglasti zglob ima telo i priključke, a koleno neprekinut luk. Krak se meri duž stvarne ose cevi, uključujući stepenište, i odbija se u krojnoj listi.</p>
        <div className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Spoj na uglu">
          {([['ball', 'Kuglasti zglob'], ['elbow', 'Koleno']] as const).map(([v, label]) => (
            <button key={v} type="button" data-testid={`corner-joint-${v}`} aria-pressed={(model.cornerJoint ?? 'ball') === v} className={`px-3 py-1.5 text-sm ${(model.cornerJoint ?? 'ball') === v ? 'bg-primary text-white' : 'bg-white hover:bg-slate-50'}`}
              onClick={() => onChange((m) => ({ ...m, cornerJoint: v === 'ball' ? undefined : v }))}>{label}</button>
          ))}
        </div>
      </section>
      <section className="mb-3" data-testid="terrace-post-layout">
        <h3 className="font-bold text-[13.5px] mb-1">Raspored stubova</h3>
        <p className="text-[11.5px] text-muted leading-snug mb-1">U projektu se stubovi postavljaju sami: na jednakom razmaku od najviše zadatog (podrazumevano {DEFAULT_POST_SPACING_MM} mm), a prvi i poslednji stub na zadatom odstojanju od krajeva polja (osa stuba od ivice polja). Prazno = kao na crtežu modela. Važi za svako polje ovog modela.</p>
        {([['spacingMm', 'Najveći razmak stubova', String(DEFAULT_POST_SPACING_MM)], ['leftMm', 'Prvi stub od levog kraja', 'kao na crtežu'], ['rightMm', 'Poslednji stub od desnog kraja (uz stepenice)', 'kao na crtežu']] as [keyof PostLayout, string, string][]).map(([k, label, ph]) => (
          <div key={k} className="grid grid-cols-[minmax(0,1fr)_110px_36px] items-center gap-x-2 py-1 border-b border-line/60 last:border-0">
            <label className="text-[13px] text-slate-800">{label}</label>
            <NumInput testId={`terrace-post-${k}`} ariaLabel={label} value={model.postLayout?.[k]} placeholder={ph} onCommit={(v) => onChange((m) => {
              const pl: PostLayout = { ...(m.postLayout ?? {}) };
              if (v === null || v < 0 || (k === 'spacingMm' && v === 0)) delete pl[k]; else pl[k] = v;
              return { ...m, postLayout: Object.keys(pl).length ? pl : undefined };
            })} />
            <span className="text-[12px] text-muted">mm</span>
          </div>
        ))}
      </section>
      {SECTIONS.map((s) => (
        <section key={s.title} className="mb-3" data-testid="terrace-measures-section">
          <h3 className="font-bold text-[13.5px] mb-1">{s.title}</h3>
          {s.fields.map((f) => {
            const changed = model.hw?.[f.key] !== undefined;
            return (
              <div key={f.key} className="grid grid-cols-[minmax(0,1fr)_110px_36px] items-center gap-x-2 py-1 border-b border-line/60 last:border-0">
                <div>
                  <label className="text-[13px] text-slate-800">{f.label}{changed && <span className="ml-1.5 text-[11px] font-semibold text-primary">izmenjeno</span>}</label>
                  <p className="text-[11.5px] text-muted leading-snug">{f.hint} Podrazumevano: {f.auto ?? DEFAULT_HW_DIMS[f.key]}{f.auto ? '' : ` ${f.unit}`}.</p>
                </div>
                <NumInput testId={`terrace-dim-${f.key}`} ariaLabel={f.label} value={f.key === 'rodOffset' ? model.hw?.rodOffset : (dims[f.key] as number)} placeholder={f.auto ? 'prema prečki' : undefined} onCommit={(v) => set(f.key, v)} />
                <span className="text-[12px] text-muted">{f.unit}</span>
              </div>
            );
          })}
        </section>
      ))}
    </Modal>
  );
}
