import { useMemo } from 'react';
import { compareMaterials, MATERIAL_GROUPS, materialShape } from '../../domain/models/materialShape';
import { visibleMaterials } from '../../config/features';
import type { Material } from '../../domain/models/types';
import { SearchSelect } from '../ui/SearchSelect';
import { Switch } from '../ui/Switch';

/** Ista pretraga i ponašanje liste kao pri izboru materijala u magacinu i krojnoj listi. */
export function MaterialPicker({ materials, onPick, placeholder = '— izaberite novi materijal —', testId, ariaLabel, showAll }: {
  materials: Material[]; onPick: (id: string) => void; placeholder?: string; testId?: string; ariaLabel?: string;
  showAll?: { checked: boolean; onChange: (v: boolean) => void; visible: boolean };
}) {
  const groups = useMemo(() => {
    const list = visibleMaterials(materials);
    return MATERIAL_GROUPS.map((g) => ({ label: g.label, items: list.filter((m) => materialShape(m).group === g.id).sort(compareMaterials)
      .map((m) => ({ value: m.id, label: `${m.sku} · ${m.name}`, sku: m.sku })) })).filter((g) => g.items.length);
  }, [materials]);
  return <SearchSelect value="" onChange={onPick} groups={groups} allowEmpty={false} placeholder={placeholder} testId={testId}
    ariaLabel={ariaLabel ?? 'Materijal'} searchLabel="Pretraga materijala" searchPlaceholder="Pretraga po nazivu ili šifri"
    footer={showAll?.visible ? <div className="shrink-0 border-t border-line px-3 py-2 bg-slate-50"><Switch label="Prikaži sve materijale" testId="swap-show-all" checked={showAll.checked} onChange={showAll.onChange} /></div> : undefined} />;
}
