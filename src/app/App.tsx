import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { FEATURES } from '../config/features';
import { Topbar } from '../components/layout/Topbar';
import { UpdateBanner } from '../components/layout/UpdateBanner';
import CustomersPage from '../pages/Customers/CustomersPage';
import DashboardPage from '../pages/Dashboard/DashboardPage';
import EditorPage from '../pages/Editor/EditorPage';
import HelpPage from '../pages/Settings/HelpPage';
import LoginPage from '../pages/Login/LoginPage';
import MaterialsPage from '../pages/Materials/MaterialsPage';
import ModelDesignerPage from '../pages/Models/ModelDesignerPage';
import ModelsPage from '../pages/Models/ModelsPage';
import GateModelsPage from '../pages/GateModels/GateModelsPage';
import ProductionPage from '../pages/Production/ProductionPage';
import ProjectsPage from '../pages/Projects/ProjectsPage';
import QuotesPage from '../pages/Quotes/QuotesPage';
import ReportsPage from '../pages/Reports/ReportsPage';
import SettingsPage from '../pages/Settings/SettingsPage';
import StockPage from '../pages/Stock/StockPage';
import { useAuth } from '../services/auth';
import { startCloudSync, useCloudStatus } from '../services/cloudSync';
import { startAutosave } from '../services/persistence';
import { useAppStore } from '../store/useAppStore';

export default function App() {
  const ready = useAppStore((s) => s.ready);
  const loadError = useAppStore((s) => s.loadError);
  const [menu, setMenu] = useState(false);
  const [navigationExpanded, setNavigationExpanded] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const drawing = pathname.startsWith('/editor') || pathname.includes('/crtanje');
  const auth = useAuth();

  useEffect(() => {
    void useAppStore.getState().init().then(() => startAutosave());
  }, []);
  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [pathname]);

  // prijavljen korisnik: podaci se usklađuju sa bazom (lokalna kopija ostaje za rad bez interneta)
  const userId = auth.session?.user.id ?? null;
  const cloudFirstDone = useCloudStatus((s) => s.firstDone);
  useEffect(() => {
    if (!userId || !ready) return;
    return startCloudSync();
  }, [userId, ready]);

  // prijava je uključena (Supabase podešen): bez sesije se vidi samo stranica za prijavu, na istoj adresi
  if (auth.enabled && auth.loading) return <div className="h-full grid place-items-center text-muted" data-testid="loading">Provera prijave...</div>;
  if (auth.enabled && !auth.session && !auth.guest) return <LoginPage />;
  if (!auth.enabled && pathname === '/prijava') return <LoginPage />;

  if (!ready || (auth.session && !cloudFirstDone)) {
    return <div className="h-full grid place-items-center text-muted" data-testid="loading">{ready ? 'Usklađivanje podataka...' : 'Učitavanje aplikacije...'}</div>;
  }

  return (
    <div className="h-full flex overflow-hidden">
      <div className="hidden lg:block h-full"><Sidebar compact={drawing && !navigationExpanded} onToggle={drawing ? () => setNavigationExpanded((v) => !v) : undefined} /></div>
      {menu && (
        <div className="lg:hidden fixed inset-0 z-[90] flex" data-testid="mobile-menu">
          <div className="h-full shadow-2xl"><Sidebar onNavigate={() => setMenu(false)} /></div>
          <button className="flex-1 bg-black/40" aria-label="Zatvori meni" onClick={() => setMenu(false)} />
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        <Topbar onMenu={() => setMenu(true)} />
        {loadError && <div className="bg-[#fef3f2] text-[#b42318] text-sm px-6 py-2" role="alert">{loadError}</div>}
        <main ref={mainRef} className="flex-1 min-h-0 overflow-auto scroll-thin">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/editor/:id" element={<EditorPage />} />
            <Route path="/projekti" element={<ProjectsPage />} />
            <Route path="/modeli" element={<ModelsPage key="yard" />} />
            <Route path="/modeli-kapija" element={<GateModelsPage />} />
            <Route path="/modeli/crtanje" element={<ModelDesignerPage />} />
            <Route path="/modeli/crtanje/:id" element={<ModelDesignerPage />} />
            {/* ograde za terase: posebna stranica i posebno crtanje (samo materijali za terase), bez veze sa dvorišnim ogradama */}
            {FEATURES.terraceFences && <>
              <Route path="/modeli-terasa" element={<ModelsPage key="terrace" terrace />} />
              <Route path="/modeli-terasa/crtanje" element={<ModelDesignerPage terrace />} />
              <Route path="/modeli-terasa/crtanje/:id" element={<ModelDesignerPage terrace />} />
            </>}
            <Route path="/materijali" element={<MaterialsPage />} />
            <Route path="/magacin" element={<StockPage />} />
            <Route path="/kupci" element={<CustomersPage />} />
            <Route path="/ponude" element={<QuotesPage />} />
            <Route path="/ponude/:id" element={<QuotesPage />} />
            <Route path="/proizvodnja" element={<ProductionPage />} />
            <Route path="/izvestaji" element={<ReportsPage />} />
            <Route path="/podesavanja" element={<SettingsPage />} />
            <Route path="/pomoc" element={<HelpPage />} />
            <Route path="/prijava" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <UpdateBanner />
    </div>
  );
}
