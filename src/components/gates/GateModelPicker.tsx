import { leafKeyOf } from '../../domain/gates/gateModels';
import { fenceModelOfGate } from '../../domain/models/catalog';
import type { Gate } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';

/** moji tipovi kapija koji mogu na ovu kapiju: isti tip (klizne: isti oslonac) i samo za ogradu ove kapije, podrazumevani prvi */
export function gateModelChoices(models: ReturnType<typeof useAppStore.getState>['settings']['customModels'], g: Gate) {
  const fence = leafKeyOf(fenceModelOfGate(g), models);
  return (models ?? [])
    .filter((m) => m.kind === 'gate' && !m.replaces && !m.draft && !m.derivedFrom && m.parts.length > 0 && m.gate?.gateType === g.gateType && m.leafModelId === fence && (g.gateType !== 'sliding' || m.gate?.sliding?.support === g.sliding?.support))
    .sort((a, b) => Number(!!b.gateDefault) - Number(!!a.gateDefault));
}

/**
 * Izbor modela kapije u projektu: „Obična kapija“ ili neki od mojih modela istog tipa. Bez mojih modela samo piše da je kapija obična.
 * Izbor modela postavlja njegov crtež, mere i okove na kapiju; povratak na običnu kapiju vraća polazne vrednosti tog tipa.
 */
export function GateModelPicker({ gate, label = 'Tip kapije' }: { gate: Gate; label?: string }) {
  const models = useAppStore((s) => s.settings.customModels);
  const choices = gateModelChoices(models, gate);
  const current = gate.design?.template?.id && choices.some((m) => m.id === gate.design?.template?.id) ? gate.design.template.id : '';
  return (
    <label className="flex flex-col gap-1 text-[13px]" data-testid="gate-model-picker">{label}
      {choices.length === 0 ? (
        <span className="input !py-1 bg-slate-50 text-muted" data-testid="gate-model-plain">Obična kapija</span>
      ) : (
        <select className="input !py-1" data-testid="gate-model-select" value={current}
          onChange={(e) => { const st = useAppStore.getState(); if (e.target.value) st.applyGateModel(gate.id, e.target.value); else st.applyBasicGate(gate.id); }}>
          <option value="">Obična kapija</option>
          {choices.map((m) => <option key={m.id} value={m.id}>{m.name}{m.gateDefault ? ' (podrazumevana)' : ''}</option>)}
        </select>
      )}
    </label>
  );
}
