import { ArrowRight, Calculator, FileText, FolderOpen, PencilRuler, Plus, Settings2, Users, Wallet, CheckCircle2, ClipboardList } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PHOTOS } from '../../assets/photos';
import { ActionsMenu, ModelThumb, ProjectThumb, StatusPill } from '../../components/ui/Common';
import { ConfirmDialog } from '../../components/ui/Modal';
import { computePrice } from '../../domain/pricing/calc';
import type { FenceModelId, GateType } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { fmtDate, fmtMoney } from '../../utils/units';

const POPULAR: { name: string; modelId: FenceModelId; photo: string | null; gate?: GateType }[] = [
  { name: 'Crna — uske letvice', modelId: 'h_narrow', photo: null },
  { name: 'Antracit — žaluzine', modelId: 'louver_dark', photo: null },
  { name: 'Braon — zaobljeni vrhovi', modelId: 'picket_brown', photo: null },
  { name: 'Panel sa srebrnim linijama', modelId: 'panel_lines', photo: null },
  { name: 'Inox i staklo', modelId: 'glass_inox', photo: null },
  { name: 'Kapija sa lamelama', modelId: 'louver_dark', photo: 'kapija-lamele', gate: 'sliding' },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const projects = useAppStore((s) => s.projects);
  const customers = useAppStore((s) => s.customers);
  const materials = useAppStore((s) => s.materials);
  const specs = useAppStore((s) => s.settings.modelSpecs);
  const settings = useAppStore((s) => s.settings);
  const newProject = useAppStore((s) => s.newProject);
  const copyProject = useAppStore((s) => s.copyProject);
  const removeProject = useAppStore((s) => s.removeProject);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [period, setPeriod] = useState<'month' | 'all'>('all');

  const stats = useMemo(() => {
    const since = Date.now() - 31 * 86_400_000;
    const scope = period === 'all' ? projects : projects.filter((p) => new Date(p.updatedAt).getTime() >= since);
    const offers = scope.filter((p) => p.status === 'ponuda');
    return {
      active: scope.filter((p) => p.status !== 'zavrseno').length,
      customers: customers.length,
      offersValue: offers.reduce((s, p) => s + computePrice(p, materials, specs).grossTotal, 0),
      done: scope.filter((p) => p.status === 'zavrseno').length,
    };
  }, [projects, customers, materials, period]);

  const recent = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const customerName = (id: string | null) => customers.find((c) => c.id === id)?.name ?? '—';
  const startNew = (opts?: Parameters<typeof newProject>[0]) => navigate(`/editor/${newProject(opts)}`);
  const lastProject = recent[0];

  const features = [
    { icon: PencilRuler, color: 'bg-blue-50 text-blue-600', title: 'Projektovanje', text: 'Unos dimenzija i automatski 2D crtež ograde ili kapije.', onClick: () => (lastProject ? navigate(`/editor/${lastProject.id}`) : startNew()) },
    { icon: Calculator, color: 'bg-green-50 text-green-600', title: 'Kalkulacija', text: 'Automatski obračun materijala i cene.', onClick: () => { if (lastProject) { navigate(`/editor/${lastProject.id}`); setTimeout(() => window.dispatchEvent(new CustomEvent('open-calc')), 400); } else startNew(); } },
    { icon: FileText, color: 'bg-orange-50 text-orange-500', title: 'Ponuda', text: 'Generisanje PDF ponude za kupca.', onClick: () => navigate('/ponude') },
    { icon: Settings2, color: 'bg-violet-50 text-violet-600', title: 'Proizvodnja', text: 'Specifikacija za radionicu i dimenzije za sečenje.', onClick: () => navigate('/proizvodnja') },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-6">
      {/* hero */}
      <section className="relative overflow-hidden rounded-[18px] card min-h-[260px] sm:min-h-[318px]" data-testid="hero">
        <img src={PHOTOS['horizontal-02'].full} alt="" className="absolute inset-0 w-full h-full object-cover object-[70%_40%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/92 to-white/10 sm:via-white/80" />
        <div className="relative p-6 sm:p-12 max-w-[720px]">
          <h1 className="text-[34px] sm:text-[46px] leading-[1.08] font-extrabold tracking-tight">Projektujte ogradu<br />brzo i jednostavno</h1>
          <p className="text-[15px] sm:text-lg text-slate-600 mt-4 max-w-[520px]">Unesite dimenzije, izaberite model i automatski dobijte crtež, obračun materijala i cenu.</p>
          <div className="flex flex-wrap gap-3 mt-7">
            <button className="btn btn-primary !px-6 !py-3.5 text-[15px]" data-testid="hero-new" onClick={() => startNew()}><Plus size={19} />Novi projekat</button>
            <button className="btn !px-6 !py-3.5 text-[15px] bg-white" data-testid="hero-projects" onClick={() => navigate('/projekti')}><FolderOpen size={19} />Pogledaj projekte</button>
          </div>
        </div>
      </section>

      {/* funkcionalne kartice */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {features.map((f) => (
          <button key={f.title} onClick={f.onClick} className="card p-5 text-left flex gap-4 items-start hover:shadow-lg transition-shadow relative min-h-[112px]">
            <span className={`w-14 h-14 rounded-2xl grid place-items-center shrink-0 ${f.color}`}><f.icon size={28} strokeWidth={1.7} /></span>
            <span className="pr-6">
              <span className="block font-bold text-[16px]">{f.title}</span>
              <span className="block text-sm text-muted mt-1 leading-snug">{f.text}</span>
            </span>
            <ArrowRight size={18} className="absolute right-4 bottom-4" />
          </button>
        ))}
      </section>

      {/* popularni modeli */}
      <section>
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-xl font-bold">Popularni modeli ograda</h2>
          <Link to="/modeli" className="text-sm font-medium text-primary inline-flex items-center gap-1">Pogledaj sve modele <ArrowRight size={14} /></Link>
        </div>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {POPULAR.map((m) => (
            <button key={m.name} data-testid="popular-model" className="text-left group" onClick={() => startNew({ modelId: m.modelId, name: m.name, startGate: m.gate })}>
              <div className="relative aspect-[4/2.7] rounded-xl overflow-hidden border border-line bg-slate-100"><div className="absolute inset-0"><ModelThumb photo={m.photo} modelId={m.modelId} className="group-hover:scale-[1.03] transition-transform duration-300" /></div></div>
              <div className="text-[13px] font-semibold mt-2">{m.name}</div>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        {/* nedavni projekti */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Nedavni projekti</h2>
            <Link to="/projekti" className="text-sm font-medium text-primary inline-flex items-center gap-1">Svi projekti <ArrowRight size={14} /></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr><th className="th rounded-l-lg">Naziv projekta</th><th className="th">Kupac</th><th className="th">Status</th><th className="th">Datum</th><th className="th rounded-r-lg w-12"><span className="sr-only">Akcije</span></th></tr></thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id} data-testid="recent-row">
                    <td className="td">
                      <Link to={`/editor/${p.id}`} className="flex items-center gap-3 font-medium hover:text-primary min-w-0">
                        <ProjectThumb project={p} width={44} /><span className="truncate">{p.name}</span>
                      </Link>
                    </td>
                    <td className="td text-slate-600">{customerName(p.customerId)}</td>
                    <td className="td"><StatusPill status={p.status} /></td>
                    <td className="td text-slate-600">{fmtDate(p.updatedAt)}</td>
                    <td className="td"><ActionsMenu actions={[{ label: 'Otvori', onClick: () => navigate(`/editor/${p.id}`) }, { label: 'Dupliraj', onClick: () => { const id = copyProject(p.id); if (id) navigate(`/editor/${id}`); } }, { label: 'Obriši', danger: true, onClick: () => setToDelete(p.id) }]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* statistika */}
        <section className="card p-5" data-testid="stats">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Brzi statistički pregled</h2>
            <select className="input !w-auto !py-1.5 text-[13px]" aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as 'month' | 'all')}>
              <option value="all">Svi projekti</option><option value="month">Ovaj mesec</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: ClipboardList, tint: 'bg-blue-50 text-blue-600', v: String(stats.active), l: 'Aktivnih projekata', id: 'stat-active' },
              { icon: Users, tint: 'bg-blue-50 text-blue-600', v: String(stats.customers), l: 'Kupaca', id: 'stat-customers' },
              { icon: Wallet, tint: 'bg-green-50 text-green-600', v: fmtMoney(stats.offersValue, settings.currency, settings.currencyRateToEur), l: 'Vrednost ponuda', id: 'stat-offers' },
              { icon: CheckCircle2, tint: 'bg-blue-50 text-blue-600', v: String(stats.done), l: 'Završenih projekata', id: 'stat-done' },
            ].map((s) => (
              <div key={s.l} className="border border-line rounded-xl p-4 flex items-center gap-3 min-w-0">
                <span className={`w-12 h-12 rounded-xl grid place-items-center shrink-0 ${s.tint}`}><s.icon size={24} strokeWidth={1.7} /></span>
                <div className="min-w-0"><div className="text-[22px] font-bold leading-tight truncate" data-testid={s.id}>{s.v}</div><div className="text-[13px] text-muted">{s.l}</div></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {toDelete && (
        <ConfirmDialog title="Brisanje projekta" danger confirmLabel="Obriši" message="Projekat će biti trajno obrisan iz lokalne baze. Nastaviti?" onCancel={() => setToDelete(null)} onConfirm={() => { removeProject(toDelete); setToDelete(null); }} />
      )}
    </div>
  );
}
