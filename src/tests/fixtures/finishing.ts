import type { ModelSpecs } from '../../domain/models/spec';
import type { FenceSection, Material, PricingSettings, Project } from '../../domain/models/types';

export const FINISHING_MATERIALS: Material[] = [
  { id: 'finish-pipe', sku: 'PIPE20', name: 'Cev 20×20×2', category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 25, demo: false },
  { id: 'finish-cap', sku: 'CAP20', name: 'Kapa pismo 20×20', category: 'zavrsetak', unit: 'kom', unitPrice: 50, wastePercent: 0, demo: false },
  { id: 'mat_hinge_standard', sku: 'HINGE', name: 'Šarka standardna', category: 'okov', unit: 'kom', unitPrice: 300, wastePercent: 0, demo: false },
  { id: 'mat_lock_standard', sku: 'LOCK', name: 'Brava standardna', category: 'okov', unit: 'kom', unitPrice: 900, wastePercent: 0, demo: false },
];
export const FINISHING_SPECS: ModelSpecs = {
  h_white: [{ id: 'finish-spec', name: 'Prečke', materialId: 'finish-pipe', group: 'Profili ispune', qty: '2', lengthMm: '1000', enabled: true }],
};
export const FINISHING_PRICING: PricingSettings = { vatPercent: 20, pricesIncludeVat: false, profitMode: 'markup', profitPercent: 10, discountPercent: 5, laborPerM2Rsd: 0, laborPerGateRsd: 0, installPerMeterRsd: 0, installPerGateRsd: 0, coatingPerM2Rsd: 0, currency: 'RSD' };

export function finishingProject(): Project {
  const fence = (i: number): FenceSection => ({ kind: 'fence', id: `finish-f${i}`, modelId: 'h_white', widthMm: 2000, heightMm: 1200, color: 'RAL 7016', materialId: 'finish-pipe', params: { barSizeMm: 20, gapMm: 20, frameMm: 0 } });
  return {
    id: 'proj_finishing', schemaVersion: 3, name: 'Provera plastifikacije', customerId: null, status: 'nacrt', createdAt: '2026-11-18T10:00:00Z', updatedAt: '2026-11-18T10:00:00Z', notes: '', quoteNo: 'TEST-P',
    items: [fence(1), { kind: 'gate', id: 'finish-gate', gateType: 'pedestrian', infillModelId: 'h_white', widthMm: 1100, heightMm: 1200, color: 'RAL 7016', opening: 'right', swing: 'inward', hinge: 'standard', lock: 'standard', automation: false, automationType: 'swing_arm', unequalLeaves: false, leftLeafMm: 0, params: { barSizeMm: 20, gapMm: 20, frameMm: 0 } }, fence(3)],
    posts: Array.from({ length: 4 }, (_, i) => ({ id: `finish-post${i}`, type: 'aluminium', widthMm: 20, heightMm: 1500, heightCustom: true, color: 'RAL 7016', mounting: 'concrete_base', custom: true, materialId: 'finish-pipe' })),
    settings: { totalMode: 'auto', fixedTotalMm: 5100, fillStrategy: 'proportional', defaultHeightMm: 1200, defaultColor: 'RAL 7016', showDimensions: true, showGrid: true, showLabels: true, pricing: { ...FINISHING_PRICING } },
  };
}
