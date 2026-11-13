import type { Material } from '../domain/models/types';

/**
 * Materijali na koje se pozivaju specifikacije ugrađenih modela (profili, stubovi, kape, okov, brave, automatika).
 * Cene su proizvoljne (okvirne, nisu stvarne) — korisnik ih menja u listi materijala. Dodaju se u cenovnik jednom,
 * ali samo oni kojih tamo još nema (po ID-u ili šifri); posle toga su obični materijali korisnika.
 */
const m = (id: string, sku: string, name: string, category: Material['category'], unit: Material['unit'], unitPrice: number, wastePercent = 0): Material => ({
  id, sku, name, category, unit, unitPrice, wastePercent, demo: false,
});

export const MODEL_MATERIALS: Material[] = [
  m('mat_alu_profil', 'DEMO-HP-100', 'Aluminijumski profil 100×20', 'profil', 'm', 520, 6),
  m('mat_alu_panel', 'DEMO-PP-250', 'Aluminijumski panel-profil 250×20', 'profil', 'm', 1150, 5),
  m('mat_alu_vertical', 'DEMO-VP-060', 'Aluminijumski profil 60×20', 'profil', 'm', 340, 6),
  m('mat_wpc_daska', 'DEMO-WD-300', 'Aluminijumska daska 300×20 sa dekorom drveta', 'profil', 'm', 1450, 5),
  m('mat_alu_picket', 'DEMO-PK-110', 'Aluminijumska letvica sa zaobljenim vrhom', 'profil', 'm', 610, 6),
  m('mat_inox_cev', 'DEMO-IC-025', 'Okrugla prečka Ø25–30', 'profil', 'm', 780, 4),
  m('mat_rukohvat', 'DEMO-RH-050', 'Rukohvat Ø50', 'profil', 'm', 1850, 4),
  m('mat_inox_traka', 'DEMO-IT-030', 'Inox traka 30×3', 'profil', 'm', 690, 4),
  m('mat_alu_lamela', 'DEMO-LP-120', 'Aluminijumska lamela 120×20', 'profil', 'm', 640, 6),
  m('mat_alu_frame', 'DEMO-RM-040', 'Ramovski profil 40×40', 'profil', 'm', 690, 4),
  m('mat_glass_clamp', 'DEMO-GK-001', 'Nosač stakla', 'okov', 'kom', 780, 0),
  m('mat_post_alu', 'DEMO-ST-AL', 'Aluminijumski stub', 'stub', 'kom', 5200, 0),
  m('mat_post_concrete', 'DEMO-ST-BT', 'Betonski stub', 'stub', 'kom', 7400, 0),
  m('mat_post_decorative', 'DEMO-ST-DK', 'Dekorativni stub', 'stub', 'kom', 9600, 0),
  m('mat_post_gate', 'DEMO-ST-KP', 'Stub kapije', 'stub', 'kom', 8900, 0),
  m('mat_ek_kv000007', 'KV000007', 'Pravougaona cev 80×20×1 mm, sirovo', 'profil', 'm', 318, 3),
  m('mat_ek_kv000016', 'KV000016', 'Pravougaona cev 80×20×1,4 mm, sirovo', 'profil', 'm', 407, 3),
  m('mat_ek_kz000003', 'KZ000003', 'Zakošena letvica 80×20×1 mm, sirovo', 'profil', 'm', 338, 3),
  m('mat_ek_kz000004', 'KZ000004', 'Zakošena letvica 80×20×1 mm, boja 7016', 'profil', 'm', 460, 3),
  m('mat_ek_ku000002', 'KU000002', 'U 60×20×2 mm, sirovo', 'profil', 'm', 275, 3),
  m('mat_u_60x28', 'U 60×28', 'U 60×28', 'profil', 'm', 480, 3),
  m('mat_ek_ktwm3899', 'KTWM3899', 'Kvadratna cev 30×30×2 mm, sirovo', 'profil', 'm', 420, 3),
  m('mat_ek_ktf808030', 'KTF808030', 'Kvadratna cev 80×80×3 mm, sirovo', 'stub', 'm', 1350, 3),
  m('mat_ek_ktf10010020', 'KTF10010020', 'Kvadratna cev 100×100×2 mm, sirovo', 'stub', 'm', 1500, 3),
  m('mat_ek_k100018', 'K100018', 'Čep tarabice pun 80×20 mm', 'okov', 'kom', 120, 0),
  m('mat_ek_k100013', 'K100013', 'Kapa ravna 80×80 mm', 'okov', 'kom', 180, 0),
  m('mat_ram_cev', 'RAM-40', 'Kvadratna cev za ram', 'profil', 'm', 900, 3),
  m('mat_u_20x20', 'U-20x20', 'U profil 20×20×1,35 mm', 'profil', 'm', 260, 3),
  m('mat_kv_30x20', 'KV-30x20', 'Kvadratna cev 30×20×1 mm', 'profil', 'm', 310, 3),
  m('mat_bts_p1033', 'P-1033', 'Rukohvat', 'profil', 'm', 1700, 3),
  m('mat_bts_p1054', 'P-1054', 'Stub', 'stub', 'm', 1300, 3),
  m('mat_bts_pal2647', 'P-AL2647', 'Pokrivna lajsna kanala stuba', 'profil', 'm', 390, 3),
  m('mat_bts_p1146', 'P-1146', 'Prečka', 'profil', 'm', 480, 3),
  m('mat_bts_ak5039n', 'AK-5039N', 'Veza stub Ø40 – rukohvat Ø50, fiksna', 'okov', 'kom', 380, 0),
  m('mat_bts_ak5001', 'AK-5001', 'Veza stub Ø40 – rukohvat Ø50, podesiva', 'okov', 'kom', 520, 0),
  m('mat_bts_ak5020k', 'AK-5020K', 'Zglob rukohvata Ø50, kuglasti podesiv ugao', 'okov', 'kom', 640, 0),
  m('mat_bts_ak5022y', 'AK-5022Y', 'Zglob prečke Ø16, podesiv ugao', 'okov', 'kom', 410, 0),
  m('mat_bts_ak5062', 'AK-5062', 'Prsten na vrhu stuba Ø40', 'okov', 'kom', 230, 0),
  m('mat_bts_ak5036x', 'AK-5036X', 'Stopa stuba Ø40, spoljna prirubnica', 'okov', 'kom', 560, 0),
  m('mat_bts_ak5027k', 'AK-5027K', 'Hemijsko sidro', 'okov', 'kom', 340, 0),
  m('mat_bts_ak5011y', 'AK-5011Y', 'Nosač prečke Ø16, podesivi', 'okov', 'kom', 260, 0),
  m('mat_bts_ak5009', 'AK-5009', 'Završetak rukohvata Ø50', 'okov', 'kom', 210, 0),
  m('mat_bts_ak5012a', 'AK-5012A', 'Završetak prečke Ø16', 'okov', 'kom', 70, 0),
  m('mat_ek_k100014', 'K100014', 'Kapa ravna 100×100 mm', 'okov', 'kom', 260, 0),
  m('mat_ek_k100010', 'K100010', 'Kapa pismo 80×80 mm', 'okov', 'kom', 220, 0),
  m('mat_ek_k100011', 'K100011', 'Kapa pismo 100×100 mm', 'okov', 'kom', 300, 0),
  m('mat_ek_k100007', 'K100007', 'Rozetna 80×80 mm', 'okov', 'kom', 160, 0),
  m('mat_ek_k100008', 'K100008', 'Rozetna 100×100 mm', 'okov', 'kom', 210, 0),
  m('mat_pega_06', 'PEGA 06', 'Stubni profil Ø40, srebrni', 'stub', 'm', 1450, 3),
  m('mat_pega_04', 'PEGA 04', 'Gornji profil Ø50, crni', 'profil', 'm', 1650, 3),
  m('mat_pega_2275_1', 'PEGA 2275/1', 'Profil prečke Ø16, crni', 'profil', 'm', 480, 3),
  m('mat_pega_09', 'PEGA 09', 'Lajsna za kanale stubova', 'profil', 'm', 390, 5),
  m('mat_pega_eco_11', 'PEGA ECO 11', 'Donji deo nosača rukohvata', 'okov', 'kom', 420, 0),
  m('mat_pega_eco_12', 'PEGA ECO 12', 'Gornji deo nosača rukohvata', 'okov', 'kom', 380, 0),
  m('mat_pega_eco_97', 'PEGA ECO 97', 'Nosač prečke Ø16', 'okov', 'kom', 260, 0),
  m('mat_pega_97_8', 'PEGA 97/8', 'Podloška nosača prečke', 'okov', 'kom', 35, 0),
  m('mat_pega_eco_46', 'PEGA ECO 46', 'Završetak rukohvata Ø50, crni', 'okov', 'kom', 210, 0),
  m('mat_pega_sks_51_2', 'PEGA SKS 51/2', 'Završetak prečke, crni', 'okov', 'kom', 70, 0),
  m('mat_pega_eco_10', 'PEGA ECO 10', 'Donja ukrasna maska stuba, srebrna', 'okov', 'kom', 520, 0),
  m('mat_pipe_bend', 'DEMO-SV-001', 'Savijanje cevi pod uglom', 'ostalo', 'kom', 450, 0),
  m('mat_anchor', 'DEMO-SD-001', 'Sidrenje stuba', 'okov', 'set', 950, 0),
  m('mat_bracket', 'DEMO-NS-001', 'Nosač / spojnica profila', 'okov', 'kom', 85, 0),
  m('mat_screw', 'DEMO-VJ-001', 'Inox vijak sa podloškom', 'okov', 'kom', 9, 0),
  m('mat_hinge_standard', 'DEMO-SR-ST', 'Šarka standardna', 'okov', 'kom', 1250, 0),
  m('mat_hinge_hidden', 'DEMO-SR-SK', 'Šarka skrivena', 'okov', 'kom', 2600, 0),
  m('mat_hinge_heavy', 'DEMO-SR-PO', 'Šarka pojačana', 'okov', 'kom', 2100, 0),
  m('mat_lock_standard', 'DEMO-BR-ST', 'Brava standardna sa kvakom', 'okov', 'kom', 3800, 0),
  m('mat_lock_cylinder', 'DEMO-BR-SC', 'Sigurnosna brava sa cilindrom', 'okov', 'kom', 6400, 0),
  m('mat_lock_electric', 'DEMO-BR-EL', 'Elektro-brava', 'okov', 'kom', 11800, 0),
  m('mat_wheel', 'DEMO-TK-001', 'Točkić za kliznu kapiju', 'okov', 'kom', 2400, 0),
  m('mat_motor_sliding', 'DEMO-AU-KL', 'Automatika za kliznu kapiju', 'automatika', 'kom', 78000, 0),
  m('mat_motor_swing', 'DEMO-AU-KR', 'Automatika sa krakom', 'automatika', 'kom', 62000, 0),
  m('mat_motor_underground', 'DEMO-AU-PZ', 'Podzemna automatika', 'automatika', 'kom', 94000, 0),
];

/** Materijali modela kojih još nema u cenovniku (poređenje po ID-u ili šifri, bez obzira na veličinu slova). */
export function missingModelMaterials(existing: Material[]): Material[] {
  const ids = new Set(existing.map((x) => x.id));
  const skus = new Set(existing.map((x) => x.sku.trim().toLowerCase()).filter(Boolean));
  return MODEL_MATERIALS.filter((x) => !ids.has(x.id) && !skus.has(x.sku.trim().toLowerCase())).map((x) => ({ ...x }));
}
