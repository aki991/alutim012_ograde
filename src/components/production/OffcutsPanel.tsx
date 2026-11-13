import { PackageOpen, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Material, Offcut, Project, StockItem } from '../../domain/models/types';
import { materialIdForName } from '../../domain/models/spec';
import { fmtNum } from '../../utils/units';

/**
 * Ostaci materijala za krojnu listu projekta. Pre krojne liste poslovođa odgovara: nema ostataka, ili unosi komade koje ima
 * (ručno ili iz magacina). Krojna lista ih koristi prve, pa tek onda otvara nove šipke.
 */
export function OffcutsPanel({ project, materials, stock, profiles, onChange }: {
  project: Project; materials: Material[]; stock: StockItem[];
  /** nazivi profila koji se seku u ovom projektu (materijali van ovog spiska nemaju gde da se iskoriste) */
  profiles: string[];
  onChange: (offcuts: Offcut[] | undefined) => void;
}) {
  const offcuts = project.offcuts;
  const [form, setForm] = useState({ materialId: '', lengthMm: '', qty: '1' });
  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const used = useMemo(() => new Set(profiles), [profiles]);
  const inProject = (m: Material) => used.has(m.name);
  // izbor materijala = tačno profili ove krojne liste; profil koga nema u cenovniku ostaje pod svojim ID-em iz modela
  // (krojna lista ostatak upari po nazivu, a `materialName` za taj ID daje isti čitljiv naziv)
  const options = useMemo(() => profiles.map((name) => {
    const m = materials.find((x) => x.name === name);
    return { id: m?.id ?? materialIdForName(materials, name), label: m ? `${m.name}${m.sku ? ` (${m.sku})` : ''}` : `${name} (nije u cenovniku)` };
  }).sort((a, b) => a.label.localeCompare(b.label, 'sr', { numeric: true })), [profiles, materials]);
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? byId.get(id)?.name;
  const len = Number(form.lengthMm.replace(',', '.')); const qty = Number(form.qty);
  const valid = !!form.materialId && Number.isFinite(len) && len > 0 && len <= 20000 && Number.isInteger(qty) && qty > 0;

  const addOffcut = (o: Offcut) => {
    const list = offcuts ?? [];
    const same = list.find((x) => x.materialId === o.materialId && x.lengthMm === o.lengthMm);
    onChange(same ? list.map((x) => (x === same ? { ...x, qty: x.qty + o.qty } : x)) : [...list, o]);
  };
  // iz magacina se nude komadi profila koji se seku u ovom projektu, kojih još nema u spisku u punoj količini
  const fromStock = stock.filter((s) => s.qty > 0 && byId.has(s.materialId) && inProject(byId.get(s.materialId)!));
  const taken = (s: StockItem) => (offcuts ?? []).find((o) => o.materialId === s.materialId && o.lengthMm === s.lengthMm)?.qty ?? 0;

  if (offcuts === undefined) {
    return (
      <div className="rounded-xl border border-[#fedf89] bg-[#fffaeb] p-4 mb-4" data-testid="offcuts-ask">
        <div className="font-bold flex items-center gap-2"><PackageOpen size={18} />Imate li ostatke materijala koje treba prvo iskoristiti?</div>
        <p className="text-sm text-slate-700 mt-1">Pre krojne liste: ako imate komade (npr. par cevi od 3,3 m umesto cele šipke od 6 m), unesite ih i krojna lista će ih iskoristiti pre novih šipki.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button className="btn btn-primary" data-testid="offcuts-none" onClick={() => onChange([])}>Nema ostataka</button>
          <button className="btn" data-testid="offcuts-enter" onClick={() => onChange([])}>Unesi ostatke</button>
        </div>
        <p className="text-xs text-muted mt-2">Krojna lista se prikazuje posle odgovora. U magacinu ima {fromStock.reduce((n, s) => n + s.qty, 0)} komada profila koji se koriste u ovom projektu.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-bg p-3 mb-4" data-testid="offcuts-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-bold flex items-center gap-2"><PackageOpen size={17} />Ostaci materijala (koriste se prvi)</div>
        <button className="text-[12.5px] text-primary font-semibold" data-testid="offcuts-reset" onClick={() => onChange(undefined)}>Pitaj ponovo</button>
      </div>
      {offcuts.length === 0 ? <p className="text-sm text-muted mt-1" data-testid="offcuts-empty">Nema ostataka: sve se seče iz novih šipki. Ako ipak imate neki komad, dodajte ga ispod.</p> : (
        <table className="w-full mt-2 text-sm" data-testid="offcuts-table">
          <tbody>
            {offcuts.map((o, i) => {
              const m = byId.get(o.materialId);
              return (
                <tr key={`${o.materialId}-${o.lengthMm}`} className="border-t border-line" data-testid="offcut-row">
                  <td className="py-1.5 pr-2">{labelOf(o.materialId) ?? 'Materijal je obrisan iz cenovnika'}{m && !inProject(m) && <span className="ml-2 text-[11.5px] text-[#b45309] font-semibold">ne koristi se u ovom projektu</span>}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-semibold whitespace-nowrap">{fmtNum(o.lengthMm, 0)} mm</td>
                  <td className="py-1.5 w-[90px]"><input aria-label="Komada" type="number" min={1} className="input !py-1 text-right tabular-nums" value={o.qty} onChange={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v > 0) onChange(offcuts.map((x, k) => (k === i ? { ...x, qty: v } : x))); }} /></td>
                  <td className="py-1.5 pl-2 w-10 text-right"><button className="btn btn-sm btn-icon btn-danger" aria-label="Ukloni ostatak" onClick={() => onChange(offcuts.filter((_, k) => k !== i))}><Trash2 size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_120px_90px_auto] items-end mt-3">
        <label className="grid gap-1"><span className="label">Materijal</span><select className="input" data-testid="offcut-material" value={form.materialId} onChange={(e) => setForm({ ...form, materialId: e.target.value })}>
          <option value="">— izaberite materijal —</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select></label>
        <label className="grid gap-1"><span className="label">Dužina (mm)</span><input className="input tabular-nums" inputMode="numeric" data-testid="offcut-length" placeholder="npr. 3300" value={form.lengthMm} onChange={(e) => setForm({ ...form, lengthMm: e.target.value })} /></label>
        <label className="grid gap-1"><span className="label">Komada</span><input className="input tabular-nums" inputMode="numeric" data-testid="offcut-qty" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></label>
        <button className="btn" data-testid="offcut-add" disabled={!valid} onClick={() => { addOffcut({ materialId: form.materialId, lengthMm: Math.round(len), qty }); setForm({ ...form, lengthMm: '', qty: '1' }); }}><Plus size={16} />Dodaj ostatak</button>
      </div>
      {fromStock.length > 0 && (
        <div className="mt-3" data-testid="offcuts-stock">
          <div className="label mb-1">Iz magacina (profili ovog projekta)</div>
          <div className="flex flex-wrap gap-1.5">
            {fromStock.map((s) => {
              const left = s.qty - taken(s);
              return (
                <button key={s.id} className="btn btn-sm" disabled={left <= 0} title={byId.get(s.materialId)?.name} onClick={() => addOffcut({ materialId: s.materialId, lengthMm: s.lengthMm, qty: 1 })}>
                  <Plus size={13} />{byId.get(s.materialId)?.sku} · {fmtNum(s.lengthMm, 0)} mm <span className="text-muted">({left} na stanju)</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {stock.length === 0 && <p className="text-xs text-muted mt-2">Magacin je prazan. Stanje se vodi na strani <Link className="text-primary font-semibold" to="/magacin">Magacin</Link>.</p>}
    </div>
  );
}
