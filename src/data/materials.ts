import type { Material } from '../domain/models/types';

/**
 * Aplikacija više nema ugrađene materijale: cenovnik čine samo materijali koje korisnik uveze ili ručno doda.
 * Nova instalacija počinje sa praznom listom.
 */
export const SEED_MATERIALS: Material[] = [];

/** ID-evi nekadašnjih ugrađenih materijala: pri učitavanju se brišu iz sačuvane baze (osim onih koje je korisnik uvezao iz svog cenovnika). */
export const BUILTIN_MATERIAL_IDS: ReadonlySet<string> = new Set([
  'mat_alu_profil', 'mat_alu_panel', 'mat_alu_vertical', 'mat_wpc_daska', 'mat_alu_picket', 'mat_inox_cev',
  'mat_rukohvat', 'mat_inox_traka', 'mat_alu_lamela', 'mat_alu_frame', 'mat_decor_panel', 'mat_glass',
  'mat_glass_clamp', 'mat_post_alu', 'mat_post_concrete', 'mat_concrete_plinth', 'mat_post_decorative', 'mat_post_gate',
  'mat_ek_kv000007', 'mat_ek_kv000016', 'mat_ek_kz000003', 'mat_ek_kz000004', 'mat_ek_ku000002', 'mat_u_60x28',
  'mat_ek_ktwm3899', 'mat_ek_ktf303010', 'mat_ek_ktf808030', 'mat_ek_ktf10010020', 'mat_ek_k100018', 'mat_ek_k100013',
  'mat_u_20x20', 'mat_kv_30x20', 'mat_bts_p1033', 'mat_bts_p1054', 'mat_bts_pal2647', 'mat_bts_p1146',
  'mat_bts_ak5039n', 'mat_bts_ak5001', 'mat_bts_ak5020k', 'mat_bts_ak5022y', 'mat_bts_ak5022a', 'mat_bts_ak5062',
  'mat_bts_ak5036x', 'mat_bts_ak5027k', 'mat_bts_ak5011y', 'mat_bts_ak5009', 'mat_bts_ak5012a', 'mat_ek_k100014',
  'mat_ek_k100010', 'mat_ek_k100011', 'mat_ek_k100007', 'mat_ek_k100008', 'mat_pega_06', 'mat_pega_04',
  'mat_pega_2275_1', 'mat_pega_09', 'mat_pega_eco_11', 'mat_pega_eco_12', 'mat_pega_eco_97', 'mat_pega_97_8',
  'mat_pega_eco_46', 'mat_pega_sks_51_2', 'mat_pega_eco_10', 'mat_pipe_bend', 'mat_anchor', 'mat_bracket',
  'mat_screw', 'mat_hinge_standard', 'mat_hinge_hidden', 'mat_hinge_heavy', 'mat_lock_standard', 'mat_lock_cylinder',
  'mat_lock_electric', 'mat_wheel', 'mat_motor_sliding', 'mat_motor_swing', 'mat_motor_underground',
  'mat_u_25x20', 'mat_kv_20x20', 'mat_ram_cev',
]);

/** Materijal koji je došao uz aplikaciju i korisnik ga nije uvezao iz svog cenovnika (uvoz skida oznaku „demo“). */
export const isBuiltinMaterial = (m: Pick<Material, 'id' | 'demo'>): boolean => m.demo && BUILTIN_MATERIAL_IDS.has(m.id);
