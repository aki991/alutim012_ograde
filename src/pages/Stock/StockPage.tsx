import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, PageHeader } from '../../components/ui/Common';
import { ConfirmDialog } from '../../components/ui/Modal';
import { compareMaterials, MATERIAL_GROUPS, materialShape } from '../../domain/models/materialShape';
import { cutOptions } from '../../domain/pricing/cutting';
import type { Material, StockItem } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { uid } from '../../utils/id';
import { fmtNum } from '../../utils/units';

/** Izbor materijala razvrstan po grupama (kao u crtanju modela). */
export function MaterialSelect({ materials, value, onChange, testId, only }: { materials: Material[]; value: string; onChange: (id: string) => void; testId?: string; only?: (m: Material) => boolean }) {
  const groups = useMemo(() => {
    const list = only ? materials.filter(only) : materials;
    return MATERIAL_GROUPS.map((g) => ({ ...g, items: list.filter((m) => materialShape(m).group === g.id).sort(compareMaterials) })).filter((g) => g.items.length);
  }, [materials, only]);
  return (
    <select className="input" data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— izaberite materijal —</option>
      {groups.map((g) => <optgroup key={g.id} label={g.label}>{g.items.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.sku})</option>)}</optgroup>)}
    </select>
  );
}

const isLinear = (m: Material): boolean => materialShape(m).type === 'linear';

/** Magacin: materijal na stanju (cele šipke i ostaci). Odavde se ostaci biraju pre pravljenja krojne liste. */
export default function StockPage() {
  const materials = useAppStore((s) => s.materials);
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const stock = settings.stock ?? [];
  const full = cutOptions(settings).stockMm;
  const [form, setForm] = useState({ materialId: '', lengthMm: String(full), qty: '1', note: '' });
  const [del, setDel] = useState<StockItem | null>(null);
  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const len = Number(form.lengthMm.replace(',', '.')); const qty = Number(form.qty);
  const valid = !!form.materialId && Number.isFinite(len) && len > 0 && len <= 20000 && Number.isInteger(qty) && qty > 0;

  const add = () => {
    if (!valid) return;
    const L = Math.round(len);
    // ista vrsta i dužina se sabira u jednu stavku
    const same = stock.find((s) => s.materialId === form.materialId && s.lengthMm === L && (s.note ?? '') === form.note.trim());
    update({ stock: same ? stock.map((s) => (s === same ? { ...s, qty: s.qty + qty } : s)) : [...stock, { id: uid('stk'), materialId: form.materialId, lengthMm: L, qty, note: form.note.trim() || undefined }] });
    setForm({ ...form, qty: '1', note: '' });
  };
  const setQty = (item: StockItem, q: number) => update({ stock: stock.map((s) => (s.id === item.id ? { ...s, qty: q } : s)) });

  const rows = [...stock].sort((a, b) => (byId.get(a.materialId)?.name ?? '').localeCompare(byId.get(b.materialId)?.name ?? '', 'sr', { numeric: true }) || b.lengthMm - a.lengthMm);
  const totalM = stock.reduce((s, i) => s + (i.lengthMm * i.qty) / 1000, 0);

  return (
    <Page>
      <PageHeader title="Magacin" subtitle="Materijal na stanju: cele šipke i ostaci. Ostaci se odavde biraju pre pravljenja krojne liste, da se prvo iskoriste." />
      <section className="card p-4 mb-5" data-testid="stock-add">
        <h2 className="font-bold mb-2">Dodaj na stanje</h2>
        {materials.length === 0 ? (
          <p className="text-sm text-muted">Cenovnik je prazan. Prvo uvezite materijale na strani <Link className="text-primary font-semibold" to="/materijali">Materijali i cene</Link>.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-[minmax(0,2.2fr)_130px_100px_minmax(0,1fr)_auto] items-end">
            <label className="grid gap-1"><span className="label">Materijal</span><MaterialSelect materials={materials} only={isLinear} value={form.materialId} testId="stock-material" onChange={(v) => setForm({ ...form, materialId: v })} /></label>
            <label className="grid gap-1"><span className="label">Dužina (mm)</span><input className="input tabular-nums" inputMode="numeric" data-testid="stock-length" value={form.lengthMm} onChange={(e) => setForm({ ...form, lengthMm: e.target.value })} /></label>
            <label className="grid gap-1"><span className="label">Komada</span><input className="input tabular-nums" inputMode="numeric" data-testid="stock-qty" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} /></label>
            <label className="grid gap-1"><span className="label">Napomena</span><input className="input" data-testid="stock-note" placeholder="npr. polica 3" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} /></label>
            <button className="btn btn-primary" data-testid="stock-add-btn" disabled={!valid} onClick={add}><Plus size={17} />Dodaj</button>
          </div>
        )}
        <p className="text-xs text-muted mt-2">Cela šipka je {fmtNum(full, 0)} mm (menja se u Podešavanjima). Kraći komad je ostatak.</p>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 className="font-bold">Stanje</h2>
          <span className="text-sm text-muted" data-testid="stock-total">{stock.reduce((s, i) => s + i.qty, 0)} komada · {fmtNum(totalM, 2)} m</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]" data-testid="stock-table">
            <thead><tr><th className="th">Šifra</th><th className="th">Materijal</th><th className="th text-right">Dužina (mm)</th><th className="th">Vrsta</th><th className="th text-right w-[110px]">Komada</th><th className="th text-right">Ukupno (m)</th><th className="th">Napomena</th><th className="th w-12" /></tr></thead>
            <tbody>
              {rows.map((s) => {
                const m = byId.get(s.materialId);
                return (
                  <tr key={s.id} data-testid="stock-row">
                    <td className="td text-xs text-muted">{m?.sku ?? '—'}</td>
                    <td className="td font-medium">{m?.name ?? 'Materijal je obrisan iz cenovnika'}</td>
                    <td className="td text-right tabular-nums font-semibold">{fmtNum(s.lengthMm, 0)}</td>
                    <td className="td">{s.lengthMm >= full ? 'cela šipka' : <span className="text-[#b45309] font-semibold">ostatak</span>}</td>
                    <td className="td"><input aria-label={`Komada: ${m?.name ?? ''} ${s.lengthMm}`} type="number" min={0} className="input !py-1 text-right tabular-nums" value={s.qty} onChange={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 0) setQty(s, v); }} /></td>
                    <td className="td text-right tabular-nums">{fmtNum((s.lengthMm * s.qty) / 1000, 2)}</td>
                    <td className="td text-slate-600">{s.note ?? ''}</td>
                    <td className="td text-right"><button className="btn btn-sm btn-icon btn-danger" aria-label="Obriši stavku" onClick={() => setDel(s)}><Trash2 size={14} /></button></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td className="td text-muted" colSpan={8}>Magacin je prazan. Dodajte šipke i ostatke koje imate na stanju.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {del && <ConfirmDialog title="Brisanje sa stanja" danger confirmLabel="Obriši" message={<>Obrisati <b>{byId.get(del.materialId)?.name ?? 'stavku'}</b> ({del.lengthMm} mm × {del.qty})?</>} onCancel={() => setDel(null)} onConfirm={() => { update({ stock: stock.filter((s) => s.id !== del.id) }); setDel(null); }} />}
    </Page>
  );
}
