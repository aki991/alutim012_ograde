import { PackageOpen, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Material, Offcut, Project, StockItem } from '../../domain/models/types';
import { materialIdForName, materialName } from '../../domain/models/spec';
import { compareMaterials } from '../../domain/models/materialShape';
import { SearchSelect } from '../ui/SearchSelect';
import { stockReservations } from '../../domain/pricing/stockBooking';
import { useAppStore } from '../../store/useAppStore';
import { fmtNum } from '../../utils/units';

/**
 * Ostaci materijala za krojnu listu projekta: poslovođa odmah unosi komade koje ima (ručno ili iz magacina), bez prethodnog pitanja.
 * Nude se samo profili koji se seku u ovoj krojnoj listi (po izabranom obimu štampe), prikazani po nazivu.
 * Krojna lista ih koristi prve, pa tek onda otvara nove šipke.
 */
export function OffcutsPanel({ project, materials, stock, profiles, onChange }: {
  project: Project; materials: Material[]; stock: StockItem[];
  /** nazivi profila koji se seku u ovom projektu (materijali van ovog spiska nemaju gde da se iskoriste) */
  profiles: string[];
  onChange: (offcuts: Offcut[]) => void;
}) {
  const offcuts = project.offcuts ?? [];
  const [form, setForm] = useState({ materialId: '', lengthMm: '', qty: '1' });
  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const used = useMemo(() => new Set(profiles), [profiles]);
  const inProject = (m: Material) => used.has(m.name);
  // izbor materijala = tačno profili ove krojne liste; profil koga nema u cenovniku ostaje pod svojim ID-em iz modela
  // (krojna lista ostatak upari po nazivu, a `materialName` za taj ID daje isti čitljiv naziv)
  const options = useMemo(() => profiles.map((name) => {
    const m = materials.find((x) => x.name === name);
    return { id: m?.id ?? materialIdForName(materials, name), label: m ? m.name : `${name} (nije u cenovniku)` };
  }).sort((a, b) => {
    // grupe pa mere od najmanje do najveće; profil koji nije u cenovniku ide po nazivu
    const ma = materials.find((x) => x.id === a.id); const mb = materials.find((x) => x.id === b.id);
    return ma && mb ? compareMaterials(ma, mb) : a.label.localeCompare(b.label, 'sr', { numeric: true });
  }), [profiles, materials]);
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? byId.get(id)?.name;
  const len = Number(form.lengthMm.replace(',', '.')); const qty = Number(form.qty);
  const valid = !!form.materialId && Number.isFinite(len) && len > 0 && len <= 20000 && Number.isInteger(qty) && qty > 0;

  const addOffcut = (o: Offcut) => {
    // ručni komad i komad iz magacina se ne spajaju (komad iz magacina je vezan za svoju stavku)
    const same = offcuts.find((x) => x.materialId === o.materialId && x.lengthMm === o.lengthMm && x.stockId === o.stockId);
    onChange(same ? offcuts.map((x) => (x === same ? { ...x, qty: x.qty + o.qty } : x)) : [...offcuts, o]);
  };
  // rezervacije drugih projekata (izabrali su komad, a još nisu „U izradi“) i ono što je ovaj projekat već skinuo sa stanja
  const projects = useAppStore((s) => s.projects);
  const bookings = useAppStore((s) => s.settings.stockBookings);
  const booking = bookings?.[project.id];
  const others = useMemo(() => stockReservations(projects, project.id, bookings), [projects, project.id, bookings]);
  const consumedHere = (id: string) => (booking?.removed ?? []).filter((r) => r.stockId === id).reduce((n, r) => n + r.qty, 0);
  const takenHere = (id: string) => offcuts.filter((o) => o.stockId === id).reduce((n, o) => n + o.qty, 0);
  /** koliko komada ove stavke ovaj projekat sme da uzme ukupno */
  const capacity = (s: StockItem) => Math.max(0, s.qty + consumedHere(s.id) - (others.get(s.id)?.qty ?? 0));
  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  // iz magacina se nude komadi profila koji se seku u ovom projektu
  // (i profili koji nisu u cenovniku: ostatak knjižen pri prelasku u „U izradi“ vodi se pod ugrađenim ID-em)
  const fromStock = stock.filter((s) => s.qty > 0 && used.has(materialName(materials, s.materialId)));

  return (
    <div className="rounded-xl border border-line bg-bg p-3 mb-4" data-testid="offcuts-panel">
      <div className="font-bold flex items-center gap-2"><PackageOpen size={17} />Ostaci materijala (koriste se prvi)</div>
      {offcuts.length === 0 ? <p className="text-sm text-muted mt-1" data-testid="offcuts-empty">Nema unetih ostataka: sve se seče iz novih šipki. Ako imate komad, izaberite ga iz magacina ili ga unesite ispod.</p> : (
        <table className="w-full mt-2 text-sm" data-testid="offcuts-table">
          <tbody>
            {offcuts.map((o, i) => {
              const m = byId.get(o.materialId);
              const src = o.stockId ? stockById.get(o.stockId) : undefined;
              // komad iz magacina: najviše koliko ova stavka ima (bez komada koje su rezervisali drugi projekti)
              const max = o.stockId ? (src ? capacity(src) : consumedHere(o.stockId)) : undefined;
              return (
                <tr key={`${o.materialId}-${o.lengthMm}-${o.stockId ?? ''}`} className="border-t border-line" data-testid="offcut-row">
                  <td className="py-1.5 pr-2">{labelOf(o.materialId) ?? 'Materijal je obrisan iz cenovnika'}
                    {o.stockId && <span className="ml-2 text-[11.5px] text-primary font-semibold" data-testid="offcut-from-stock">{!booking ? 'iz magacina, rezervisano' : consumedHere(o.stockId) > 0 ? 'iz magacina, skinuto sa stanja' : 'iz magacina, nije iskorišćen (ostaje na stanju)'}</span>}
                    {m && !inProject(m) && <span className="ml-2 text-[11.5px] text-[#b45309] font-semibold">ne koristi se u ovom projektu</span>}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-semibold whitespace-nowrap">{fmtNum(o.lengthMm, 0)} mm</td>
                  <td className="py-1.5 w-[90px]"><input aria-label="Komada" type="number" min={1} max={max} className="input !py-1 text-right tabular-nums" value={o.qty} onChange={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v > 0 && (max === undefined || v <= max)) onChange(offcuts.map((x, k) => (k === i ? { ...x, qty: v } : x))); }} /></td>
                  <td className="py-1.5 pl-2 w-10 text-right"><button className="btn btn-sm btn-icon btn-danger" aria-label="Ukloni ostatak" onClick={() => onChange(offcuts.filter((_, k) => k !== i))}><Trash2 size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_120px_90px_auto] items-end mt-3">
        <label className="grid gap-1"><span className="label">Materijal</span><SearchSelect testId="offcut-material" value={form.materialId} onChange={(v) => setForm({ ...form, materialId: v })} placeholder="— izaberite materijal —" searchPlaceholder="Kucajte naziv materijala…" groups={[{ items: options.map((o) => ({ value: o.id, label: o.label })) }]} /></label>
        <label className="grid gap-1"><span className="label">Dužina (mm)</span><input className="input tabular-nums" inputMode="numeric" data-testid="offcut-length" placeholder="npr. 3300" value={form.lengthMm} onChange={(e) => setForm({ ...form, lengthMm: e.target.value })} /></label>
        <label className="grid gap-1"><span className="label">Komada</span><input className="input tabular-nums" inputMode="numeric" data-testid="offcut-qty" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></label>
        <button className="btn" data-testid="offcut-add" disabled={!valid} onClick={() => { addOffcut({ materialId: form.materialId, lengthMm: Math.round(len), qty }); setForm({ ...form, lengthMm: '', qty: '1' }); }}><Plus size={16} />Dodaj ostatak</button>
      </div>
      {fromStock.length > 0 && (
        <div className="mt-3" data-testid="offcuts-stock">
          <div className="label mb-1">Iz magacina (profili ovog projekta)</div>
          <p className="text-xs text-muted mb-1.5">Izabran komad je rezervisan za ovaj projekat i drugi projekti ga ne nude. Kad kliknete „Potvrdi sečenje“ (ili projekat pređe u „U izradi“), skida se sa stanja.</p>
          <div className="flex flex-wrap gap-1.5">
            {fromStock.map((s) => {
              const left = capacity(s) - takenHere(s.id);
              const res = others.get(s.id);
              const title = res ? `Rezervisano: ${res.projects.map((p) => `${p.name} (${p.qty})`).join(', ')}` : undefined;
              return (
                <button key={s.id} className="btn btn-sm" data-testid="offcut-stock-item" disabled={left <= 0} title={title} onClick={() => addOffcut({ materialId: s.materialId, lengthMm: s.lengthMm, qty: 1, stockId: s.id })}>
                  <Plus size={13} />{materialName(materials, s.materialId)} · {fmtNum(s.lengthMm, 0)} mm <span className="text-muted">({Math.max(0, left)} slobodno{res ? `, ${res.qty} rezervisano` : ''})</span>
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
