import { computeLayout, isSpacer, outerWidthMm } from '../../domain/geometry/layout';
import { FileDown, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FrontView } from '../../components/editor/FrontView';
import { DemoBadge, EmptyState, Page, PageHeader, StatusPill } from '../../components/ui/Common';
import { colorText } from '../../domain/models/catalog';
import { buildBom, computePrice } from '../../domain/pricing/calc';
import { describeItem } from '../../domain/pricing/production';
import { downloadQuotePdf } from '../../services/pdf';
import { useAppStore, useListedProjects } from '../../store/useAppStore';
import { itemLabel, itemNumber } from '../../utils/labels';
import { fmtDate, fmtMoney, fmtNum } from '../../utils/units';

export default function QuotesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const projects = useListedProjects();
  const customers = useAppStore((s) => s.customers);
  const materials = useAppStore((s) => s.materials);
  const specs = useAppStore((s) => s.settings.modelSpecs);
  const settings = useAppStore((s) => s.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const money = (n: number) => fmtMoney(n, settings.currency, settings.currencyRateToEur);

  const sorted = useMemo(() => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [projects]);
  const project = projects.find((p) => p.id === id) ?? sorted[0];
  const customer = customers.find((c) => c.id === project?.customerId) ?? null;
  const price = useMemo(() => (project ? computePrice(project, materials, specs) : null), [project, materials, specs]);
  const bom = useMemo(() => (project ? buildBom(project, materials, specs) : []), [project, materials, specs]);

  if (!project || !price) return <Page><PageHeader title="Ponude" /><EmptyState title="Nema projekata" text="Napravite projekat da biste videli ponudu." /></Page>;
  const demo = materials.some((m) => m.demo);

  const pdf = async () => {
    setBusy(true); setError(null);
    try { await downloadQuotePdf(project, customer, materials, settings); } catch (e) { setError(`PDF nije generisan: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  return (
    <Page>
      <PageHeader title="Ponude" subtitle="Pregled ponude za izabrani projekat" actions={
        <button className="btn btn-primary" data-testid="quote-pdf" disabled={busy} onClick={() => void pdf()}>{busy ? <Loader2 size={17} className="animate-spin" /> : <FileDown size={17} />}Preuzmi PDF ponudu</button>
      } />
      {error && <div role="alert" className="mb-3 rounded-lg bg-[#fef3f2] text-[#b42318] px-4 py-2.5 text-sm">{error}</div>}
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <div className="card p-2 self-start max-h-[70vh] overflow-auto" data-testid="quote-list">
          {sorted.map((p) => (
            <button key={p.id} onClick={() => navigate(`/ponude/${p.id}`)} className={`w-full text-left px-3 py-2.5 rounded-lg ${p.id === project.id ? 'bg-primary-50' : 'hover:bg-slate-50'}`}>
              <div className="flex items-center justify-between gap-2"><span className="font-medium truncate">{p.name}</span><StatusPill status={p.status} /></div>
              <div className="text-xs text-muted">{p.quoteNo || 'bez broja'} · {customers.find((c) => c.id === p.customerId)?.name ?? 'bez kupca'}</div>
            </button>
          ))}
        </div>

        <article className="card p-6 sm:p-8 min-w-0" data-testid="quote-preview">
          <header className="flex flex-wrap justify-between gap-4 border-b border-line pb-4">
            <div><div className="text-2xl font-extrabold">{settings.companyName}</div><div className="text-sm text-muted">Ograde i kapije po meri</div></div>
            <div className="text-right"><div className="text-xl font-bold text-primary">PONUDA</div><div className="text-sm">Broj: <b>{project.quoteNo || '—'}</b></div><div className="text-sm">Datum: {fmtDate(new Date().toISOString())}</div></div>
          </header>
          {demo && <div className="mt-3"><DemoBadge>Demonstraciona ponuda — ilustrativni podaci</DemoBadge></div>}
          <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
            <div><div className="label uppercase text-[11px] font-semibold">Kupac</div><div className="font-semibold">{customer?.name ?? 'Nije izabran'}</div><div className="text-muted">{customer?.address}</div><div className="text-muted">{[customer?.phone, customer?.email].filter(Boolean).join(' · ')}</div></div>
            <div><div className="label uppercase text-[11px] font-semibold">Projekat</div><div className="font-semibold">{project.name}</div><div className="text-muted">Ukupna dužina {fmtNum(computeLayout(project).occupiedMm, 0)} mm · {project.items.filter((i) => !isSpacer(i)).length} elemenata</div></div>
          </div>
          <div className="mt-5 border border-line rounded-xl bg-white p-2"><FrontView project={project} scale={0.075} className="block w-full h-auto max-h-[340px]" /></div>
          <h3 className="font-bold mt-6 mb-2">Lista elemenata</h3>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px]">
            <thead><tr><th className="th">#</th><th className="th">Element</th><th className="th">Model</th><th className="th text-right">Širina</th><th className="th text-right">Visina</th><th className="th">Boja</th></tr></thead>
            <tbody>{project.items.map((it, i) => isSpacer(it) ? null : <tr key={it.id}><td className="td">{itemNumber(project.items, i)}</td><td className="td">{itemLabel(project.items, i)}</td><td className="td text-slate-600">{describeItem(project, i)}</td><td className="td text-right tabular-nums whitespace-nowrap">{fmtNum(outerWidthMm(project, i), 0)} mm</td><td className="td text-right tabular-nums whitespace-nowrap">{fmtNum(it.heightMm, 0)} mm</td><td className="td whitespace-nowrap">{it.kind === 'opening' ? '—' : colorText(it.color, it.finish)}</td></tr>)}</tbody>
          </table></div>
          <h3 className="font-bold mt-6 mb-2">Materijal ({bom.length} stavki)</h3>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px]">
            <thead><tr><th className="th">Naziv</th><th className="th text-right">Količina</th><th className="th">JM</th><th className="th text-right">Ukupno</th></tr></thead>
            <tbody>{bom.map((l) => <tr key={l.key}><td className="td">{l.name}</td><td className="td text-right tabular-nums">{fmtNum(l.purchaseQty, l.unit === 'kom' ? 0 : 2)}</td><td className="td">{l.unit}</td><td className="td text-right tabular-nums">{money(l.total)}</td></tr>)}</tbody>
          </table></div>
          <h3 className="font-bold mt-6 mb-2">Obračun</h3>
          <table className="w-full max-w-[640px]" data-testid="quote-breakdown"><tbody>
            {price.rows.map((r) => <tr key={r.label} className={r.emphasis ? 'bg-slate-50 font-semibold' : ''}><td className="td">{r.label}<div className="text-[11px] text-muted font-normal">{r.base}</div></td><td className="td text-right tabular-nums">{money(r.amount)}</td></tr>)}
          </tbody></table>
          <div className="mt-3 rounded-xl bg-primary-50 px-4 py-3 flex justify-between items-baseline max-w-[640px]"><b>UKUPNO ZA UPLATU</b><b className="text-xl tabular-nums" data-testid="quote-total">{money(price.grossTotal)}</b></div>
          {project.notes && <p className="text-sm mt-4"><b>Napomena:</b> {project.notes}</p>}
          <p className="text-xs text-muted mt-4">Širine su modularni rasponi (osa–osa stubova); stvarne proizvodne mere zavise od sistema profila. Ova ponuda ne sadrži PIB, matični broj ni bankovni račun jer stvarni podaci firme nisu uneti.</p>
        </article>
      </div>
    </Page>
  );
}
