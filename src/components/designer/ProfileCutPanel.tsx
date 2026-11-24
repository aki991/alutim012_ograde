import { useState } from 'react';
import { NumInput } from '../forms/NumInput';
import { linearLocalPoly, partAngle, type CustomModel, type CustomPart } from '../../domain/models/custom';
import { cornerTargets, cutAngle, fitProfile, profileEndCuts, profileEndLabels, profileEndTips, setProfileEndCut } from '../../domain/models/profileCuts';
import { sectionFace, type MatShape } from '../../domain/models/materialShape';
import type { Material } from '../../domain/models/types';

const fmtDeg = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

export function ProfileCutPanel({ model, part, shape, materials, onApply, onError }: { model: CustomModel; part: CustomPart; shape: MatShape; materials: Material[]; onApply: (model: CustomModel) => void; onError: (message: string) => void }) {
  const [targetId, setTargetId] = useState('');
  if (shape.type !== 'linear') return null;
  const cuts = profileEndCuts(part); const tips = profileEndTips(part); const labels = profileEndLabels(part);
  const targets = cornerTargets(model, part.id, materials);
  const target = targets.find((p) => p.id === targetId) ?? targets[0];
  const run = (result: { model: CustomModel } | { error: string }) => 'error' in result ? onError(result.error) : onApply(result.model);
  const set = (end: 0 | 1, angle: number) => run(setProfileEndCut(model, part.id, end, angle, shape));
  const face = sectionFace(shape.section, partAngle(part));
  const preview = linearLocalPoly({ ...part, lengthMm: Math.max(180, face.face * 6), endCuts: cuts }, face.u0, face.u1);
  return <div className="mt-2 rounded-lg border border-line p-2" data-testid="profile-cut-panel">
    <div className="text-[13px] font-semibold">Uglovi sečenja</div>
    <p className="text-[11.5px] text-muted mt-1">Ugao prema osi profila: 90° je ravan rez. Svaki kraj se podešava zasebno; smer okreće kosinu reza.</p>
    {([0, 1] as const).map((end) => <div key={end} className="border-b border-line py-2 last:border-0">
      <label className="flex items-center justify-between gap-2 text-[13px]">
        <span>{labels[end]}</span>
        <span className="w-[132px] flex items-center gap-1.5"><NumInput value={Math.round(cutAngle(cuts[end]) * 100) / 100} required min={0.1} max={90} unit="°" ariaLabel={`Ugao sečenja — ${labels[end].toLowerCase()}`} testId={`part-cut-${end === 0 ? 'start' : 'end'}`} onCommit={(v) => { if (v !== null) set(end, cuts[end] > 90 ? 180 - v : v); }} /><span className="text-muted text-xs">°</span></span>
      </label>
      {tips[end]
        ? <p className="text-[11.5px] text-muted mt-1" data-testid={`part-cut-tip-${end}`}>Dva reza (šiljak): <b>{fmtDeg(cutAngle(cuts[end]))}° + {fmtDeg(cutAngle(tips[end]!.deg))}°</b>. Upisan ugao zamenjuje ih jednim rezom.</p>
        : <button type="button" className="btn btn-sm mt-1" data-testid={`part-cut-flip-${end}`} disabled={Math.abs(cuts[end] - 90) < 0.001} onClick={() => set(end, 180 - cuts[end])}>Obrni smer reza</button>}
    </div>)}
    <svg viewBox={`-3 ${-face.u1 - 3} ${Math.max(180, face.face * 6) + 6} ${face.face + 6}`} className="w-full h-12 my-2" role="img" aria-label="Oblik rezova: početak levo, kraj desno">
      <polygon points={preview.map(([x, y]) => `${x},${-y}`).join(' ')} fill="#e2e8f0" stroke="#334155" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
    <p className="text-[11.5px] text-muted">Dužina za krojenje: <b data-testid="profile-cut-length">{Number(part.lengthMm.toFixed(2)).toLocaleString('sr-Latn-RS')} mm</b> (najveća mera komada). Rezovi se vide na crtežu i u krojnoj listi.</p>
    {targets.length > 1 && <label className="block text-[12px] mt-2">Spoj sa profilom
      <select className="input mt-1" data-testid="part-cut-target" value={target?.id ?? ''} onChange={(e) => setTargetId(e.target.value)}>{targets.map((p) => <option key={p.id} value={p.id}>{materials.find((m) => m.id === p.materialId)?.name ?? p.materialId} · {model.parts.indexOf(p) + 1}</option>)}</select>
    </label>}
    <button type="button" className="btn btn-sm w-full mt-2" data-testid="part-cut-fit" onClick={() => run(fitProfile(model, part.id, target?.id, materials))}>Prilagodi ugao</button>
    <p className="text-[11.5px] text-muted mt-1">Dva profila preklopljena krajevima dobijaju zajednički ugao. Kosa cev koja krajevima prelazi preko rama seče se tako da stane unutra: uz jednu stranu jedan rez, u uglu dva reza (šiljak). Za ukrštanje na sredini prvo podelite profil.</p>
  </div>;
}
