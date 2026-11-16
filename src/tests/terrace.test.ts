import { describe, expect, it } from 'vitest';
import { FEATURES, visibleMaterials } from '../config/features';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { TERRACE_MATERIALS, withTerraceMaterials } from '../data/terraceMaterials';
import { isTerraceModel, TERRACE_MODEL_LIST, YARD_MODEL_LIST } from '../domain/models/catalog';
import { allFenceModels } from '../domain/models/customRegistry';
import { isTerraceMaterial, materialShape, sectionFace } from '../domain/models/materialShape';

describe('materijali za ograde za terase', () => {
  it('svaki materijal je u grupi za terase, šifre i ID-evi se ne ponavljaju', () => {
    for (const m of TERRACE_MATERIALS) {
      expect(isTerraceMaterial(m), m.sku).toBe(true);
      expect(materialShape(m).group.startsWith('t_'), `${m.sku} ${m.name}`).toBe(true);
    }
    expect(new Set(TERRACE_MATERIALS.map((m) => m.id)).size).toBe(TERRACE_MATERIALS.length);
    expect(new Set(TERRACE_MATERIALS.map((m) => m.sku)).size).toBe(TERRACE_MATERIALS.length);
  });

  it('oblik po nazivu: okrugla cev, rukohvat, staklo, U kanal i okov', () => {
    const by = (sku: string) => TERRACE_MATERIALS.find((m) => m.sku === sku)!;
    const rail = materialShape(by('P-1388'));
    expect(rail.type === 'linear' && rail.section.round && rail.section.w).toBe(50);
    expect(rail.group).toBe('t_rukohvati');
    const flat = materialShape(by('P-1072'));
    expect(flat.type === 'linear' && sectionFace(flat.section, 0).face).toBe(60);
    const glass = materialShape(by('TER-VSG-88'));
    expect(glass.type === 'sheet' && glass.thick).toBe(17.52);
    expect(glass.group).toBe('t_staklo');
    const channel = materialShape(by('P-1358'));
    expect(channel.type === 'linear' && channel.u?.a).toBe(46);
    expect(channel.group).toBe('t_staklo');
    for (const [sku, group] of [['AK-5126', 't_veze'], ['AK-5020S', 't_kolena'], ['AK-5011', 't_drzaci'], ['AK-5025X', 't_drzaci'], ['AK-5036', 't_montaza'], ['AK-65031U', 't_montaza'], ['AK-5104', 't_zavrseci'], ['P-1057', 't_stubovi'], ['P-1336', 't_ispuna']] as const) {
      expect(materialShape(by(sku)).group, sku).toBe(group);
    }
    expect(materialShape(by('AK-5025X')).type).toBe('piece'); // stezaljka stakla nije ploča
  });

  it('BTS materijali modela RL10 su za terase; dvorišni nisu', () => {
    expect(MODEL_MATERIALS.filter((m) => m.id.startsWith('mat_bts_')).every(isTerraceMaterial)).toBe(true);
    expect(isTerraceMaterial(MODEL_MATERIALS.find((m) => m.id === 'mat_kv_30x20')!)).toBe(false);
    const rod = materialShape(MODEL_MATERIALS.find((m) => m.id === 'mat_bts_p1146')!);
    expect(rod.type === 'linear' && rod.section.round && rod.section.w).toBe(16);
  });

  it('dodavanje u cenovnik: bez duplikata po šifri, stari nazivi dobijaju mere, drugi put nema izmena', () => {
    const old = [{ id: 'mat_bts_p1033', sku: 'P-1033', name: 'Rukohvat', category: 'profil' as const, unit: 'm' as const, unitPrice: 1700, wastePercent: 3, demo: false },
      { id: 'moj_p1072', sku: 'p-1072', name: 'Moj rukohvat', category: 'profil' as const, unit: 'm' as const, unitPrice: 900, wastePercent: 3, demo: false }];
    const next = withTerraceMaterials(old)!;
    expect(next.find((m) => m.id === 'mat_bts_p1033')).toMatchObject({ name: 'Rukohvat okrugli Ø50×2', terrace: true, unitPrice: 1700 });
    expect(next.filter((m) => m.sku.toLowerCase() === 'p-1072')).toHaveLength(1);
    expect(withTerraceMaterials(next)).toBeNull();
  });
});

describe('modeli ograda za terase', () => {
  it('terasni modeli su odvojeni od dvorišnih', () => {
    expect(TERRACE_MODEL_LIST.map((m) => m.id).sort()).toEqual(['rail_black', 'rail_inox']);
    expect(YARD_MODEL_LIST.some((m) => m.terrace)).toBe(false);
    expect(isTerraceModel('rail_inox')).toBe(true);
    expect(isTerraceModel('h_narrow')).toBe(false);
  });

  it('izbor modela u editoru nudi samo modele iste vrste (ograde za terase uključene)', () => {
    const flags = FEATURES as { terraceFences: boolean };
    const before = flags.terraceFences;
    flags.terraceFences = true;
    try {
      expect(allFenceModels('rail_inox').every((m) => m.terrace)).toBe(true);
      expect(allFenceModels('h_narrow').some((m) => m.terrace)).toBe(false);
      expect(allFenceModels().length).toBe(allFenceModels('rail_inox').length + allFenceModels('h_narrow').length);
    } finally { flags.terraceFences = before; }
  });

  it('ograde za terase isključene: ne nude se za izbor, osim modela koji projekat već koristi; materijali za terase se ne prikazuju', () => {
    const flags = FEATURES as { terraceFences: boolean };
    const before = flags.terraceFences;
    flags.terraceFences = false;
    try {
      expect(allFenceModels().some((m) => m.terrace)).toBe(false);
      expect(allFenceModels('h_narrow').some((m) => m.terrace)).toBe(false);
      const ids = allFenceModels('rail_inox').filter((m) => m.terrace).map((m) => m.id);
      expect(ids).toEqual(['rail_inox']); // projekat koji ga već koristi ga zadržava, a može da pređe na ostale
      const mats = withTerraceMaterials(MODEL_MATERIALS)!;
      const shown = visibleMaterials(mats);
      expect(shown.some(isTerraceMaterial)).toBe(false);
      expect(shown.length).toBeLessThan(mats.length);
      expect(visibleMaterials(mats, ['mat_bts_p1033']).some((m) => m.id === 'mat_bts_p1033')).toBe(true); // izabran materijal dela ostaje
      flags.terraceFences = true;
      expect(visibleMaterials(mats)).toHaveLength(mats.length);
    } finally { flags.terraceFences = before; }
  });
});
