import { createDemoProject, createFence, createGate, createProject, DEFAULT_PRICING, applyPostRoles } from '../domain/models/factories';
import type { AppSettings, Customer, Project } from '../domain/models/types';
import { SEED_MATERIALS } from './materials';

export const DEMO_PROJECT_ID = 'proj_demo_petrovic';

const daysAgo = (d: number): string => new Date(Date.now() - d * 86_400_000).toISOString();

export const SEED_CUSTOMERS: Customer[] = [
  { id: 'cust_petrovic', name: 'Marko Petrović', phone: '063 123 45 67', email: 'marko.petrovic@gmail.com', address: 'Cara Dušana 12, Požarevac', note: 'Demonstracioni kupac.' },
  { id: 'cust_stanic', name: 'Jelena Stanić', phone: '064 222 33 44', email: 'jelena.stanic@example.com', address: 'Kneza Miloša 5, Smederevo', note: '' },
  { id: 'cust_jovanovic', name: 'Milan Jovanović', phone: '062 555 12 90', email: 'milan.j@example.com', address: 'Vojvode Putnika 31, Požarevac', note: 'Poziva pre dolaska.' },
  { id: 'cust_eurostil', name: 'Euro Stil d.o.o.', phone: '012 555 000', email: 'office@eurostil.example', address: 'Industrijska zona bb, Požarevac', note: 'Pravno lice (demo podaci).' },
  { id: 'cust_ilic', name: 'Dragana Ilić', phone: '065 700 80 90', email: 'dragana.ilic@example.com', address: 'Svetosavska 8, Kostolac', note: '' },
  { id: 'cust_nikolic', name: 'Stefan Nikolić', phone: '061 321 99 11', email: 'stefan.n@example.com', address: 'Dunavska 44, Smederevo', note: '' },
  { id: 'cust_markovic', name: 'Građevinar Marković', phone: '060 400 50 60', email: 'markovic.gradnja@example.com', address: 'Braće Ribnikar 3, Petrovac', note: '' },
  { id: 'cust_pavlovic', name: 'Ana Pavlović', phone: '063 888 22 77', email: 'ana.pavlovic@example.com', address: 'Mlavska 19, Požarevac', note: '' },
];

export const SEED_SETTINGS: AppSettings = {
  companyName: 'ALU TIM 012',
  currency: 'RSD',
  currencyRateToEur: 117.2,
  userName: 'Nikola Đ.',
  pricing: { ...DEFAULT_PRICING },
};

const dated = (p: Project, daysBack: number, quoteNo: string, status: Project['status']): Project => ({
  ...p, status, quoteNo, createdAt: daysAgo(daysBack + 3), updatedAt: daysAgo(daysBack),
});

export function createSeedProjects(): Project[] {
  const petrovic = dated(createDemoProject('cust_petrovic', DEMO_PROJECT_ID), 1, 'P-2026-001', 'ponuda');

  const stanic = dated(
    applyPostRoles(createProject('Kapija i ograda', [createGate('double', { widthMm: 3500 }), createFence({ widthMm: 2500, modelId: 'v_framed' }), createFence({ widthMm: 2500, modelId: 'v_framed' })], 'cust_stanic')),
    3, 'P-2026-002', 'u_izradi',
  );
  const jovanovic = dated(
    createProject('Ograda oko dvorišta', [createFence({ widthMm: 2000, modelId: 'louver_dark', color: 'RAL 9005' }), createFence({ widthMm: 2000, modelId: 'louver_dark', color: 'RAL 9005' }), createFence({ widthMm: 2000, modelId: 'louver_dark', color: 'RAL 9005' }), createGate('pedestrian', { color: 'RAL 9005', infillModelId: 'louver_dark' }), createFence({ widthMm: 2000, modelId: 'louver_dark', color: 'RAL 9005' })], 'cust_jovanovic'),
    10, 'P-2026-003', 'zavrseno',
  );
  const eurostil = dated(
    createProject('Poslovni objekat', [createFence({ widthMm: 3000, modelId: 'panel_lines', heightMm: 1800 }), createGate('sliding', { widthMm: 5000, heightMm: 1800, infillModelId: 'panel_lines' }), createGate('pedestrian', { heightMm: 1800, infillModelId: 'panel_lines' }), createFence({ widthMm: 3000, modelId: 'panel_lines', heightMm: 1800 })], 'cust_eurostil'),
    14, 'P-2026-004', 'nacrt',
  );
  const ilic = dated(
    createProject('Ograda sa zaobljenim letvicama', [createFence({ widthMm: 2000, modelId: 'picket_narrow' }), createFence({ widthMm: 2000, modelId: 'picket_narrow' }), createGate('single', { widthMm: 1500, infillModelId: 'picket_narrow' })], 'cust_ilic'),
    20, 'P-2026-005', 'zavrseno',
  );
  const nikolic = dated(
    createProject('Staklena terasa', [createFence({ widthMm: 1500, modelId: 'glass_inox', heightMm: 1100 }), createFence({ widthMm: 1500, modelId: 'glass_inox', heightMm: 1100 }), createFence({ widthMm: 1500, modelId: 'glass_inox', heightMm: 1100 })], 'cust_nikolic'),
    26, 'P-2026-006', 'ponuda',
  );
  return [petrovic, stanic, jovanovic, eurostil, ilic, nikolic];
}

export function createSeedData() {
  return {
    projects: createSeedProjects(),
    customers: SEED_CUSTOMERS.map((c) => ({ ...c })),
    materials: SEED_MATERIALS.map((m) => ({ ...m })),
    settings: { ...SEED_SETTINGS, pricing: { ...SEED_SETTINGS.pricing } },
  };
}
