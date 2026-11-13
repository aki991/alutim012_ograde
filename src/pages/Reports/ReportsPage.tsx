import { useMemo } from 'react';
import { Page, PageHeader } from '../../components/ui/Common';
import { STATUS_LABELS } from '../../domain/models/catalog';
import { computeLayout } from '../../domain/geometry/layout';
import type { ProjectStatus } from '../../domain/models/types';
import { computePrice } from '../../domain/pricing/calc';
import { useAppStore } from '../../store/useAppStore';
import { fmtMoney, fmtNum } from '../../utils/units';

const COLORS: Record<ProjectStatus, string> = { nacrt: '#94a3b8', ponuda: '#7a0d14', u_izradi: '#f59e0b', zavrseno: '#16a34a' };

export default function ReportsPage() {
  const projects = useAppStore((s) => s.projects);
  const customers = useAppStore((s) => s.customers);
  const materials = useAppStore((s) => s.materials);
  const specs = useAppStore((s) => s.settings.modelSpecs);
  const settings = useAppStore((s) => s.settings);
  const money = (n: number) => fmtMoney(n, settings.currency, settings.currencyRateToEur);

  const data = useMemo(() => {
    const rows = projects.map((p) => ({ p, price: computePrice(p, materials, specs), len: computeLayout(p).totalModularMm / 1000 }));
    const byStatus = (Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => {
      const r = rows.filter((x) => x.p.status === s);
      return { status: s, count: r.length, value: r.reduce((a, b) => a + b.price.grossTotal, 0) };
    });
    const byCustomer = customers.map((c) => ({ c, value: rows.filter((x) => x.p.customerId === c.id).reduce((a, b) => a + b.price.grossTotal, 0), n: rows.filter((x) => x.p.customerId === c.id).length })).filter((x) => x.n > 0).sort((a, b) => b.value - a.value);
    return { rows, byStatus, byCustomer, totalValue: rows.reduce((a, b) => a + b.price.grossTotal, 0), totalLen: rows.reduce((a, b) => a + b.len, 0) };
  }, [projects, customers, materials]);

  const maxCount = Math.max(1, ...data.byStatus.map((s) => s.count));
  const maxCust = Math.max(1, ...data.byCustomer.map((c) => c.value));

  return (
    <Page>
      <PageHeader title="Izveštaji" subtitle="Vrednost, dužina i status svih projekata." />
      <div className="grid gap-4 sm:grid-cols-3 mb-5">
        {[['Ukupna vrednost projekata', money(data.totalValue)], ['Ukupna dužina ograda', `${fmtNum(data.totalLen, 1)} m`], ['Broj projekata', String(projects.length)]].map(([l, v]) => (
          <div key={l} className="card p-5"><div className="text-sm text-muted">{l}</div><div className="text-2xl font-bold mt-1 tabular-nums">{v}</div></div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold mb-4">Projekti po statusu</h2>
          <svg viewBox="0 0 420 200" className="w-full" role="img" aria-label="Broj projekata po statusu">
            {data.byStatus.map((s, i) => {
              const h = (s.count / maxCount) * 120;
              return <g key={s.status}><rect x={30 + i * 100} y={150 - h} width="60" height={h} rx="6" fill={COLORS[s.status]} /><text x={60 + i * 100} y={142 - h} textAnchor="middle" fontSize="14" fontWeight="700">{s.count}</text><text x={60 + i * 100} y={172} textAnchor="middle" fontSize="12" fill="#64748b">{STATUS_LABELS[s.status]}</text></g>;
            })}
            <line x1="20" y1="150" x2="410" y2="150" stroke="#e2e8f0" />
          </svg>
        </section>
        <section className="card p-5">
          <h2 className="font-bold mb-4">Vrednost po kupcu</h2>
          <ul className="space-y-3">
            {data.byCustomer.map((c) => (
              <li key={c.c.id}><div className="flex justify-between text-sm mb-1"><span className="font-medium truncate">{c.c.name}</span><span className="tabular-nums">{money(c.value)}</span></div><div className="h-2.5 bg-slate-100 rounded-full"><div className="h-full rounded-full bg-primary" style={{ width: `${(c.value / maxCust) * 100}%` }} /></div></li>
            ))}
            {data.byCustomer.length === 0 && <li className="text-sm text-muted">Nema podataka.</li>}
          </ul>
        </section>
      </div>
      <section className="card p-5 mt-5 overflow-x-auto">
        <h2 className="font-bold mb-2">Vrednost po projektu</h2>
        <table className="w-full min-w-[520px]"><thead><tr><th className="th">Projekat</th><th className="th">Status</th><th className="th text-right">Dužina</th><th className="th text-right">Materijal</th><th className="th text-right">Ukupno sa PDV-om</th></tr></thead>
          <tbody>{data.rows.map(({ p, price, len }) => <tr key={p.id}><td className="td">{p.name}</td><td className="td">{STATUS_LABELS[p.status]}</td><td className="td text-right tabular-nums">{fmtNum(len, 1)} m</td><td className="td text-right tabular-nums">{money(price.materialTotal)}</td><td className="td text-right tabular-nums font-medium">{money(price.grossTotal)}</td></tr>)}</tbody></table>
      </section>
    </Page>
  );
}
