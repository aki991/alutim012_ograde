import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TextField } from '../../components/forms/Fields';
import { EmptyState, Page, PageHeader, StatusPill } from '../../components/ui/Common';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import type { Customer } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { uid } from '../../utils/id';
import { fmtDate } from '../../utils/units';

const blank = (): Customer => ({ id: uid('cust'), name: '', phone: '', email: '', address: '', note: '' });

export default function CustomersPage() {
  const customers = useAppStore((s) => s.customers);
  const projects = useAppStore((s) => s.projects);
  const { upsertCustomer, removeCustomer } = useAppStore.getState();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Customer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [del, setDel] = useState<Customer | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return customers.filter((c) => !t || [c.name, c.phone, c.email, c.address].some((x) => x.toLowerCase().includes(t)));
  }, [customers, q]);
  const emailOk = !form?.email || /^\S+@\S+\.\S+$/.test(form.email);
  const valid = form && form.name.trim().length > 0 && emailOk;
  const linked = (id: string) => projects.filter((p) => p.customerId === id);

  return (
    <Page>
      <PageHeader title="Kupci" subtitle="Kupci i njihovi kontakt podaci. Klik na ime kupca prikazuje njegove projekte." actions={<button className="btn btn-primary" data-testid="btn-add-customer" onClick={() => { setIsNew(true); setForm(blank()); }}><Plus size={17} />Dodaj kupca</button>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card p-4">
          <div className="relative max-w-[380px] mb-4"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-10" placeholder="Pretraga kupaca" aria-label="Pretraga kupaca" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {list.length === 0 ? <EmptyState title="Nema kupaca" text="Nijedan kupac ne odgovara pretrazi." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]" data-testid="customers-table">
                <thead><tr><th className="th">Ime / naziv</th><th className="th">Telefon</th><th className="th">Email</th><th className="th">Projekata</th><th className="th" /></tr></thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id} className={openId === c.id ? 'bg-primary-50' : ''} data-testid="customer-row">
                      <td className="td"><button className="font-medium text-left hover:text-primary" onClick={() => setOpenId(openId === c.id ? null : c.id)}>{c.name}</button><div className="text-xs text-muted">{c.address}</div></td>
                      <td className="td text-slate-600 whitespace-nowrap">{c.phone}</td><td className="td text-slate-600 whitespace-nowrap">{c.email}</td><td className="td">{linked(c.id).length}</td>
                      <td className="td text-right whitespace-nowrap"><button className="btn btn-sm" onClick={() => { setIsNew(false); setForm(c); }}>Izmeni</button> <button className="btn btn-sm btn-danger" onClick={() => setDel(c)}>Obriši</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <aside className="card p-4 self-start" data-testid="customer-projects">
          <h2 className="font-bold mb-2">Povezani projekti</h2>
          {!openId ? <p className="text-sm text-muted">Kliknite na kupca da vidite njegove projekte.</p> : (
            linked(openId).length === 0 ? <p className="text-sm text-muted">Kupac nema povezanih projekata.</p> : (
              <ul className="divide-y divide-line">{linked(openId).map((p) => <li key={p.id} className="py-2 flex items-center justify-between gap-2"><Link className="font-medium hover:text-primary truncate" to={`/editor/${p.id}`}>{p.name}</Link><span className="flex items-center gap-2 shrink-0"><StatusPill status={p.status} /><span className="text-xs text-muted">{fmtDate(p.updatedAt)}</span></span></li>)}</ul>
            )
          )}
        </aside>
      </div>
      {form && (
        <Modal title={isNew ? 'Novi kupac' : 'Izmena kupca'} onClose={() => setForm(null)} footer={<><button className="btn" onClick={() => setForm(null)}>Otkaži</button><button className="btn btn-primary" disabled={!valid} data-testid="customer-save" onClick={() => { upsertCustomer({ ...form, name: form.name.trim() }); setForm(null); }}>Sačuvaj</button></>}>
          <TextField label="Ime ili naziv firme" testId="customer-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <TextField label="Telefon" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <TextField label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          {!emailOk && <div role="alert" className="text-xs text-[#b42318] pb-1">Email adresa nije ispravna.</div>}
          <TextField label="Adresa" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
          <TextField label="Napomena" multiline value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
        </Modal>
      )}
      {del && <ConfirmDialog title="Brisanje kupca" danger confirmLabel="Obriši" message={<>Obrisati kupca <b>{del.name}</b>? {linked(del.id).length > 0 ? `Povezani projekti (${linked(del.id).length}) ostaju, ali bez kupca.` : ''}</>} onCancel={() => setDel(null)} onConfirm={() => { removeCustomer(del.id); if (openId === del.id) setOpenId(null); setDel(null); }} />}
    </Page>
  );
}
