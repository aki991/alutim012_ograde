import type { Material } from '../domain/models/types';

/**
 * Materijali za ograde za terase, stepeništa i galerije (BTS Aluminium sistemi koje u Srbiji prodaje Lyctum, i staklo).
 * Šifre i mase (kg/m) su iz kataloga BTS „Aluminium Railing Systems“ V8.0 i „Frameless Glass Railing Systems“ V11;
 * analiza je u docs/analiza-ograde-za-terase.md. Cene nisu poznate (0): upisuju se na strani Materijali i cene.
 * Naziv je vrsta pa mere, da crtanje iz naziva dobije presek (Ø50×2 je okrugla cev, 60×25×1,5 pravougaona, staklo je ploča).
 * Debljine zida kanala za staklo nisu u katalogu: procenjene su iz mase po metru i menjaju se u „Izmeni“.
 */
const slug = (code: string): string => code.toLowerCase().replace(/[^a-z0-9]+/g, '');
const base = (code: string, name: string): Pick<Material, 'id' | 'sku' | 'name' | 'unitPrice' | 'demo' | 'terrace'> => ({
  id: `mat_ter_${slug(code)}`, sku: code, name, unitPrice: 0, demo: false, terrace: true,
});
/** profil (m) */
const prof = (code: string, name: string, kgPerM?: number, category: Material['category'] = 'profil', extra: Partial<Material> = {}): Material => ({
  ...base(code, name), category, unit: 'm', wastePercent: 3, ...(kgPerM ? { kgPerM } : {}), ...extra,
});
/** komad okova */
const kom = (code: string, name: string, unit: Material['unit'] = 'kom'): Material => ({ ...base(code, name), category: 'okov', unit, wastePercent: 0 });
/** staklo (m²) */
const glass = (code: string, name: string): Material => ({ ...base(code, name), category: 'staklo', unit: 'm2', wastePercent: 0 });

export const TERRACE_MATERIALS: Material[] = [
  // stubovi i maskice kanala
  prof('P-1073', 'Stub okrugli Ø40 sa kanalom, lakši', 0.976, 'stub'),
  prof('P-1057', 'Stub kvadratni 40×40×1,3 sa kanalom', 1.09, 'stub'),
  prof('P-1633', 'Stub kvadratni 40×40×1,5 sa kanalom', 1.027, 'stub'),
  prof('P-1632', 'Stub kvadratni 40×40×1,8, ojačan', 1.187, 'stub'),
  prof('P-1070', 'Stub pravougaoni 50×25×1,5 sa kanalom', 0.938, 'stub'),
  prof('P-1238', 'Stub pravougaoni 50×25×2,5, ojačan', 1.2, 'stub'),
  prof('P-1637', 'Početni stub okrugli Ø60,3×3', 1.504, 'stub'),
  prof('P-1638', 'Početni stub kvadratni 70×70×2,5', 2.425, 'stub'),
  prof('P-1604', 'SlimLine stub 65×15×2', 1.331, 'stub'),
  prof('P-AL6505', 'Maskica 11,9×7,6 za kvadratni stub', 0.068),
  prof('P-AL7588', 'Maskica 14,8×9,6 za stub 50×25', 0.098),
  // rukohvati
  prof('P-1388', 'Rukohvat okrugli Ø50×2,5', 1.011),
  prof('P-1344', 'Rukohvat okrugli Ø50×1,5', 0.621),
  prof('P-1560', 'Rukohvat okrugli Ø40×2,5', 0.798),
  prof('P-1037','Rukohvat okrugli Ø40×2', 0.648),
  prof('P-1072', 'Rukohvat 60×25×1,5', 0.783),
  prof('P-1634', 'Rukohvat 60×25×2', 0.943),
  prof('P-1071', 'Rukohvat 80×30×1,5', 1.108),
  prof('P-1081', 'Rukohvat 80×30×2', 1.521),
  prof('P-1600', 'Rukohvat SlimLine 65×13×1,2', 0.343),
  prof('P-1030', 'Rukohvat okrugli Ø42,5 sa žlebom', 0.721),
  prof('P-AL7798', 'Rukohvat okrugli Ø50 sa žlebom 12', 0.872),
  prof('P-AL8735', 'Rukohvat 60×25 sa žlebom', 1.626),
  // prečke i profili ispune
  prof('P-1055', 'Prečka okrugla Ø16×2', 0.233),
  prof('P-1336', 'Prečka kvadratna 14×14×2', 0.257),
  prof('P-AL3879', 'Prečka okrugla Ø26×1,5', 0.312),
  prof('P-1074', 'Prečka okrugla Ø30×2', 0.477),
  prof('P-1322', 'Profil ispune okrugli Ø30×1,3', 0.412),
  prof('P-1631', 'Vodoravni profil ispune 32×25×1,8', 0.547),
  prof('P-AL10243', 'Maskica 15×7 za profil ispune 32×25', 0.086),
  prof('P-1400', 'Vodoravni profil ispune 22×23,6×1,7', 0.351),
  prof('P-1602', 'SlimLine vodoravni profil 65×10×2', 0.64),
  prof('P-1603', 'SlimLine vertikalna ispuna 65×15×1,3', 0.698),
  prof('TER-LAMELA-40x10', 'Pljosnata traka 40×10 (lamela)'),
  // staklo i kanali za staklo
  prof('P-1075', 'Donji profil za staklo 32,8×27×1,3', 0.531),
  prof('P-1076', 'Donji profil za staklo 30×23,6×1,8', 0.555),
  prof('P-AL7619', 'Profil ispune okrugli Ø26 sa žlebom za staklo', 0.4),
  prof('P-1358', 'U profil za staklo 46×125', 5.83, 'profil', { wallMm: 6 }),
  prof('P-1518', 'U profil za staklo 65×145', 7.1, 'profil', { wallMm: 7 }),
  prof('P-1210', 'U profil za staklo 80×106', 4.22, 'profil', { wallMm: 5 }),
  prof('P-1082', 'U profil za staklo 44×65, monoblok baza', 1.525, 'profil', { wallMm: 2.8 }),
  prof('AK-FT10', 'Gumena traka EPDM 8×4', undefined, 'ostalo'),
  kom('U50-KM16', 'Set klinova za kanal, 17,52 mm', 'set'),
  kom('U50-1358K', 'Završna kapa U profila 46×125'),
  glass('TER-VSG-44', 'Staklo kaljeno laminirano 8,76 mm (4+4)'),
  glass('TER-VSG-55', 'Staklo kaljeno laminirano 10,76 mm (5+5)'),
  glass('TER-VSG-66', 'Staklo kaljeno laminirano 12,76 mm (6+6)'),
  glass('TER-VSG-88', 'Staklo kaljeno laminirano 17,52 mm (8+8)'),
  glass('TER-VSG-1010', 'Staklo kaljeno laminirano 21,52 mm (10+10)'),
  glass('TER-VSG-88-SAT', 'Staklo kaljeno laminirano satinirano 17,52 mm (8+8)'),
  glass('TER-VSG-66-DIM', 'Staklo kaljeno laminirano dimljeno 12,76 mm (6+6)'),
  // veze stuba i rukohvata
  kom('AK-5039-40', 'Veza stub Ø40 – rukohvat Ø40, fiksna'),
  kom('AK-5237', 'Veza stub Ø40 – cev Ø40, fiksna'),
  kom('AK-5039', 'Veza stub Ø40 – rukohvat Ø50, fiksna kratka'),
  kom('AK-5066', 'Veza stub Ø40 – rukohvat Ø50, podesiva sa zglobom'),
  kom('AK-65039Y', 'Veza stub 40×40 – rukohvat Ø50, fiksna'),
  kom('AK-65001', 'Veza stub 40×40 – rukohvat Ø50, podesiva'),
  kom('AK-5126', 'Veza stub 40×40 – rukohvat 60×25, fiksna'),
  kom('AK-5125', 'Veza stub 40×40 – rukohvat 60×25, podesiva'),
  kom('AK-5128', 'Veza stub Ø40 – rukohvat 60×25, podesiva'),
  kom('AK-5137', 'Veza stub 50×25 – rukohvat 80×30, fiksna'),
  kom('AK-5255', 'Veza stub 50×25 – rukohvat 80×30, podesiva'),
  kom('AK-5017', 'L veza rukohvata Ø50, podesiva'),
  kom('AK-5135', 'L veza rukohvata 60×25, podesiva'),
  // kolena, zglobovi i spojnice
  kom('AK-5020S', 'Koleno rukohvata Ø50, 90° sa bilezikom'),
  kom('AK-5020SA', 'Koleno rukohvata Ø50, 135° sa bilezikom'),
  kom('AK-5020X', 'Koleno rukohvata Ø50, stezno'),
  kom('AK-5020NX', 'Koleno rukohvata Ø50, oštro'),
  kom('AK-5164', 'Zglob rukohvata Ø40, kuglasti podesiv ugao'),
  kom('AK-5020K-40', 'Zglob rukohvata Ø40, kuglasti (AK-5020K-40)'),
  kom('AK-5020NX-40', 'Koleno rukohvata Ø40, oštro'),
  kom('AK-5007-40', 'Spojnica rukohvata Ø40, bilezik'),
  kom('AK-5165', 'Koleno rukohvata 60×25, zavareno'),
  kom('AK-5129', 'Koleno rukohvata 60×25, podesivo gore–dole'),
  kom('AK-5138', 'Koleno rukohvata 80×30, zavareno'),
  { ...kom('AK-5022A', 'Koleno prečke Ø16, 90°'), id: 'mat_bts_ak5022a' },
  kom('AK-5022B', 'Koleno prečke Ø16, 135°'),
  kom('AK-5253', 'Koleno prečke 14×14, 90°'),
  kom('AK-5245', 'Zglob prečke 14×14, podesiv ugao'),
  kom('AK-5007', 'Spojnica rukohvata Ø50, spoljni bilezik'),
  kom('AK-5007NX', 'Spojnica rukohvata Ø50, unutrašnja'),
  kom('AK-5111', 'Spojnica rukohvata 60×25'),
  kom('AK-5158', 'Spojnica rukohvata 80×30'),
  kom('AK-5022', 'Spojnica prečke Ø16'),
  kom('AK-5246', 'Spojnica prečke 14×14, unutrašnja'),
  // držači prečki, profila ispune i stezaljke stakla
  kom('AK-5011', 'Prsten za prečku Ø16 na stub Ø40'),
  kom('AK-5011A', 'Prsten za prečku Ø16 na stub Ø40, dugi'),
  kom('AK-5120', 'Držač prečke Ø16 za kvadratni stub, podesiv'),
  kom('AK-5247', 'Držač prečke 14×14'),
  kom('AK-5276', 'Držač prečke 14×14, podesiv'),
  kom('AK-5035', 'Veza stub Ø40 – profil ispune Ø30'),
  kom('AK-5035-26', 'Veza stub Ø40 – profil ispune Ø26'),
  kom('AK-5124', 'Veza stub 40×40 – profil ispune Ø30, podesiva'),
  kom('AK-5596', 'Veza stub 40×40 – profil ispune 32×25'),
  kom('AK-5133', 'Veza stub 40×40 – profil ispune 22×25'),
  kom('AK-5025X', 'Stezaljka stakla za stub Ø40, podesiva'),
  kom('AK-5127', 'Stezaljka stakla za stub Ø40, velika'),
  kom('AK-5105', 'Stezaljka stakla za kvadratni stub, podesiva'),
  kom('AK-5205', 'Stezaljka stakla za stub 40×40, sa poklopcem'),
  kom('AK-5121', 'Stezaljka stakla na prečki, vodoravna'),
  kom('AK-5010', 'Graničnik stakla'),
  // flanše, maske i montaža
  kom('AK-5036', 'Podna i zidna flanša Ø40 sa maskom'),
  kom('AK-5186', 'Flanša stuba Ø40, spoljna'),
  kom('AK-5089', 'Flanša Ø40 sa pločom i ankerom, unutrašnja'),
  kom('AK-5196', 'Flanša Ø40 sa pločom Ø80, unutrašnja'),
  kom('AK-5037', 'Podna i zidna flanša Ø50 sa maskom'),
  kom('AK-5008', 'Podna i zidna flanša Ø50'),
  kom('AK-5200', 'Flanša stuba 40×40, spoljna'),
  kom('AK-5141', 'Flanša stuba 40×40 sa ankerom'),
  kom('AK-5002', 'Maska flanše Ø40'),
  kom('AK-5107', 'Maska flanše 40×40'),
  kom('AK-5136', 'Maska flanše 50×25'),
  kom('AK-5093', 'Zidna flanša rukohvata 60×25'),
  kom('AK-5094', 'Zidna flanša rukohvata 80×30'),
  kom('AK-5031U', 'Bočna obujmica stuba Ø40'),
  kom('AK-65031U', 'Bočna obujmica stuba 40×40'),
  kom('AK-65031U-15', 'Bočna obujmica stuba 40×40, 15 cm'),
  kom('AK-5161', 'Zidni nosač rukohvata Ø50'),
  kom('AK-5163', 'Zidni nosač rukohvata Ø40'),
  kom('AK-5019', 'L zidni nosač rukohvata Ø50'),
  kom('AK-5059', 'Veza rukohvata Ø50 u zid ili plafon'),
  kom('AK-5003/30', 'Ankerno gvožđe 30 cm'),
  kom('BTS-VT75100', 'Vijak za beton 7,5×100'),
  kom('BTS-VP4219', 'Vijak samobušivi 4,2×19'),
  kom('BTS-VP4238', 'Vijak samobušivi 4,2×38'),
  kom('V330', 'Spigot za staklo 50×140'),
  kom('AK-5417', 'Podna stopa SlimLine'),
  // završeci i kape
  kom('AK-5009Y', 'Završetak rukohvata Ø50, spoljni'),
  kom('AK-5013', 'Završetak cevi Ø40'),
  kom('AK-3062Y', 'Završetak cevi Ø30'),
  kom('AK-5154', 'Završetak cevi Ø26'),
  kom('AK-5244', 'Završetak prečke 14×14'),
  kom('AK-5058', 'Kapa vertikalne prečke Ø16'),
  kom('AK-5104', 'Završetak rukohvata 60×25'),
  kom('AK-5142', 'Završetak rukohvata 80×30'),
  kom('AK-5134', 'Kapa stuba 40×40'),
  kom('AK-5144', 'Završetak donjeg profila 32,8×27, levi i desni', 'set'),
  kom('AK-5051', 'Ukrasna kugla Ø50'),
  // ostali okov
  kom('AK-5448', 'Ugaona skretnica 90° SlimLine'),
  kom('AK-5061', 'Šarka kapijice ograde za terasu'),
  kom('AK-5060', 'Reza kapijice ograde za terasu'),
  kom('J100BG', 'Juliet set J100, montaža na špaletu', 'set'),
  kom('J120BG', 'Juliet set J120, montaža na štok', 'set'),
];

/** Komplet za crtanje staklene ograde sa kvadratnim stubovima i ravnim rukohvatom; staklo se bira iz postojećeg cenovnika. */
const SQUARE_GLASS_SKUS = new Set(['P-1057', 'P-1633', 'P-1072', 'P-1634', 'AK-5126', 'AK-5125', 'AK-5105', 'AK-5205', 'AK-5200', 'AK-5141', 'AK-5107', 'AK-5134', 'AK-5104', 'AK-5111', 'AK-5165', 'AK-5129', 'BTS-VT75100', 'BTS-VP4219']);
export const SQUARE_GLASS_MATERIALS = TERRACE_MATERIALS.filter((m) => SQUARE_GLASS_SKUS.has(m.sku));

/** Dopunjava samo ovaj komplet, po šifri ili ID-u; postojeće mere, nazivi i cene ostaju sačuvani. */
export function withSquareGlassMaterials(existing: Material[]): Material[] | null {
  let changed = false;
  const ids = new Set(SQUARE_GLASS_MATERIALS.map((m) => m.id));
  const list = existing.map((m) => {
    if ((!ids.has(m.id) && !SQUARE_GLASS_SKUS.has(m.sku.trim().toUpperCase())) || m.terrace === true) return m;
    changed = true;
    return { ...m, terrace: true };
  });
  const haveIds = new Set(list.map((m) => m.id));
  const haveSkus = new Set(list.map((m) => m.sku.trim().toUpperCase()));
  const add = SQUARE_GLASS_MATERIALS.filter((m) => !haveIds.has(m.id) && !haveSkus.has(m.sku.toUpperCase())).map((m) => ({ ...m }));
  return changed || add.length ? [...list, ...add] : null;
}

/**
 * Stari nazivi BTS materijala modela RL10 (bez mera, pa ih crtanje nije prepoznavalo kao okrugle cevi): zamenjuju se jednom
 * nazivom sa merama, samo ako korisnik naziv nije menjao.
 */
export const TERRACE_RENAMES: Readonly<Record<string, { from: string; to: string }>> = {
  mat_bts_p1033: { from: 'Rukohvat', to: 'Rukohvat okrugli Ø50×2' },
  mat_bts_p1054: { from: 'Stub', to: 'Stub okrugli Ø40×2 sa kanalom' },
  mat_bts_p1146: { from: 'Prečka', to: 'Prečka okrugla Ø16×1,5' },
  mat_bts_pal2647: { from: 'Pokrivna lajsna kanala stuba', to: 'Maskica 11,9×8 za okrugli stub' },
};

/**
 * Materijali za terase kojih još nema u cenovniku (po ID-u ili šifri), i stari BTS materijali sa novim nazivom i oznakom „za terase“.
 * Vraća null kad nema šta da se menja.
 */
export function withTerraceMaterials(existing: Material[]): Material[] | null {
  let changed = false;
  const list = existing.map((m) => {
    const rn = TERRACE_RENAMES[m.id];
    const name = rn && m.name.trim() === rn.from ? rn.to : m.name;
    const terrace = m.terrace ?? (/^mat_(bts|ter)_/.test(m.id) ? true : undefined);
    if (name === m.name && terrace === m.terrace) return m;
    changed = true;
    return { ...m, name, ...(terrace !== undefined ? { terrace } : {}) };
  });
  const ids = new Set(list.map((x) => x.id));
  const skus = new Set(list.map((x) => x.sku.trim().toLowerCase()).filter(Boolean));
  const add = TERRACE_MATERIALS.filter((x) => !ids.has(x.id) && !skus.has(x.sku.trim().toLowerCase())).map((x) => ({ ...x }));
  return changed || add.length ? [...list, ...add] : null;
}
