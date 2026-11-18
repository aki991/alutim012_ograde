import type { Gate } from '../../domain/models/types';
import { InfillArt } from '../fences/InfillArt';
import { SlidingAssemblyArt } from './SlidingAssemblyArt';
import { ramInsets } from '../../domain/models/tubes';
import { hingeCountFor } from '../../domain/gates/hingeRule';
import { hingePositions, resolveGate } from '../../domain/gates/design';
import { activeLeafIndex, BOLT_INSET_MM, doubleLeafBoxes, floorBoltLengthMm, lockHeightMm, swingLeafBoxes } from '../../domain/geometry/gates';

interface Props {
  gate: Gate;
  x: number;
  y: number;
  w: number;
  h: number;
  hex: string;
  /** veličina 1 px u mm — za debljine linija koje treba da ostanu tanke */
  px: number;
}

const DASH = (px: number) => `${6 * px} ${5 * px}`;

/** Indikator smera otvaranja krila: isprekidane linije idu od uglova na strani šarki i sastaju se na sredini strane brave. */
function SwingMark({ x, y, w, h, hingeSide, px }: { x: number; y: number; w: number; h: number; hingeSide: 'left' | 'right'; px: number }) {
  const hx = hingeSide === 'left' ? x : x + w;
  const fx = hingeSide === 'left' ? x + w : x;
  return (
    <polyline
      points={`${hx},${y} ${fx},${y + h / 2} ${hx},${y + h}`}
      fill="none"
      stroke="#f8fafc"
      strokeOpacity="0.85"
      strokeWidth={1.6 * px}
      strokeDasharray={DASH(px)}
    />
  );
}

function Hinges({ x, y, w, h, side, gate, clearX, clear }: { x: number; y: number; w: number; h: number; side: 'left' | 'right'; gate?: Gate; clearX?: number; clear?: number }) {
  // mere kapije: položaj ose šarke od lica stuba, broj šarki, gornja šarka od vrha i razmak osa
  const r = gate?.design && clear !== undefined ? resolveGate(gate, clear).values : null;
  const val = (k: string) => r?.[k]?.v ?? null;
  const axis = val('hingeAxis');
  // osovina šarke je na ivici krila na strani šarki (ili na meri ose iz mera kapije)
  const cx = axis !== null && clearX !== undefined && clear !== undefined ? (side === 'left' ? clearX + axis : clearX + clear - axis) : side === 'left' ? x : x + w;
  const nH = Math.max(1, Math.round(val('hingeCount') ?? hingeCountFor(w, h)));
  const spacing = val('hingeSpacing'); const top = val('hingeTop');
  const cys = r && (spacing !== null || top !== null)
    ? hingePositions(h, nH, spacing, top).map((mm) => y + mm)
    : [0.12, 0.88].map((t) => y + h * t);
  const metal = '#8d97a3';
  return (
    <g fill={metal} stroke="#1b1f24" strokeWidth="3">
      {cys.map((cy, i) => (
        <g key={i}>
          {/* listovi: jedan na krilu, drugi na stubu */}
          <rect x={cx - 50} y={cy - 30} width={40} height={60} rx="3" />
          <rect x={cx + 10} y={cy - 30} width={40} height={60} rx="3" />
          {/* osovina u tri članka */}
          {[-45, -15, 15].map((dy) => <rect key={dy} x={cx - 10} y={cy + dy - 14} width={20} height={28} rx="4" />)}
          {/* zavrtnji */}
          {[-40, 40].flatMap((dx) => [-18, 18].map((dy) => <circle key={`${dx}${dy}`} cx={cx + dx} cy={cy + dy} r="4" fill="#2b3036" stroke="none" />))}
        </g>
      ))}
    </g>
  );
}

function Leaf({ gate, x, y, w, h, hex, uid, withHandle, handleSide, cy: cyProp }: { cy?: number; gate: Gate; x: number; y: number; w: number; h: number; hex: string; uid: string; withHandle: boolean; handleSide: 'left' | 'right' }) {
  const cy = cyProp ?? y + h * 0.5;
  const hxPos = handleSide === 'left' ? x + gate.params.frameMm + 50 : x + w - gate.params.frameMm - 80;
  return (
    <g>
      <InfillArt modelId={gate.infillModelId} x={x} y={y} w={w} h={h} frame={gate.params.frameMm} barSize={gate.params.barSizeMm} gap={gate.params.gapMm} lift={gate.params.liftMm} slats={gate.params.slats} hex={hex} colorKey={gate.color} ram={ramInsets(gate.infillModelId, gate.params)} uid={uid} />
      {withHandle && (
        <g>
          <rect x={hxPos} y={cy - 220} width={22} height={440} rx="8" fill="#d8dee6" stroke="#6b7380" strokeWidth="3" />
          <rect x={hxPos - 22} y={cy - 40} width={60} height={80} rx="12" fill="#c3cbd5" stroke="#6b7380" strokeWidth="3" />
          <circle cx={hxPos + 11} cy={cy + 12} r="9" fill="#2b3036" />
        </g>
      )}
    </g>
  );
}

/** realistic: bez oznaka za crtež (smer otvaranja, strelica klizanja, oznaka motora) — za simulaciju na fotografiji */
export function GateArt({ gate, x, y, w, h, hex, px, realistic, showDims }: Props & { realistic?: boolean; showDims?: boolean }) {
  // klizna kapija kao parametarski sklop (šina ili samonoseća, ručna ili motorna)
  if (gate.gateType === 'sliding' && gate.sliding) return <SlidingAssemblyArt gate={gate} clearStart={x} clearEnd={x + w} clearWidth={w} floorY={y + h} px={px} hex={hex} showDims={showDims} realistic={realistic} />;
  const hingeSide = gate.opening;
  const freeSide = hingeSide === 'left' ? 'right' : 'left';

  if (gate.gateType === 'sliding') {
    const dir = gate.opening === 'right' ? 1 : -1;
    const ax = x + w / 2 - dir * w * 0.18;
    const ay = y + h * 0.5;
    return (
      <g>
        <Leaf gate={gate} x={x} y={y} w={w} h={h} hex={hex} uid={`${gate.id}-s`} withHandle={false} handleSide="left" />
        {/* donje vođenje i točkići */}
        <rect x={x - 20} y={y + h} width={w + 40} height={26} fill="#59616b" stroke="#2b3036" strokeWidth="3" />
        {[0.1, 0.9].map((t) => (
          <g key={t}>
            <circle cx={x + w * t} cy={y + h + 2} r="34" fill="#2b3036" />
            <circle cx={x + w * t} cy={y + h + 2} r="13" fill="#aab3be" />
          </g>
        ))}
        {/* strelica smera klizanja */}
        {!realistic && <g stroke="#f8fafc" strokeWidth={3 * px} fill="#f8fafc" fillOpacity="0.95">
          <line x1={ax - dir * 260} y1={ay} x2={ax + dir * 260} y2={ay} strokeOpacity="0.95" markerEnd="none" />
          <polygon points={`${ax + dir * 330},${ay} ${ax + dir * 220},${ay - 70} ${ax + dir * 220},${ay + 70}`} stroke="none" />
        </g>}
        {gate.automation && !realistic && (
          <g>
            <rect x={dir === 1 ? x + w - 160 : x + 20} y={y + h - 340} width={140} height={200} rx="10" fill="#1b1f24" stroke="#f8fafc" strokeOpacity="0.6" strokeWidth={2 * px} />
            <text x={(dir === 1 ? x + w - 160 : x + 20) + 70} y={y + h - 215} textAnchor="middle" fontSize={90} fontWeight="700" fill="#f8fafc">M</text>
          </g>
        )}
      </g>
    );
  }

  const boxes = swingLeafBoxes(gate, w);
  // visina brave iz mera kapije: od donje ivice krila do ose brave (bez mere — na sredini)
  const lockMm = gate.design ? resolveGate(gate, w).values.lockH?.v ?? null : null;
  const lockAt = (yLeaf: number) => (lockMm !== null ? yLeaf + h - Math.min(Math.max(lockMm, 0), h) : yLeaf + h * 0.5);
  // donji zazor iz mera kapije podiže krilo od poda
  const gB = gate.design ? resolveGate(gate, w).values.gB?.v ?? 0 : 0;
  const yl = y - gB;
  if (gate.gateType === 'double') {
    // aktivno krilo nosi bravu i kvaku uz unutrašnju ivicu; pasivno ima prihvatnik brave i podni zasun uz ivicu na kojoj se krila sastaju
    const bx = doubleLeafBoxes(gate, w);
    const act = activeLeafIndex(gate);
    const A = bx[act]; const P = bx[1 - act];
    const fr = gate.params.frameMm;
    const lockCy = yl + h - lockHeightMm(gate, w, h);
    const innerP = act === 0 ? x + P.x : x + P.x + P.w; // unutrašnja ivica pasivnog krila
    const dirIn = act === 0 ? 1 : -1; // od ivice ka sredini pasivnog krila
    const boltX = innerP + dirIn * BOLT_INSET_MM;
    const floorY = y + h;
    const boltLen = floorBoltLengthMm(h);
    const boltTop = floorY - boltLen;
    return (
      <g>
        <Leaf gate={gate} x={x + bx[0].x} y={yl} w={bx[0].w} h={h} hex={hex} uid={`${gate.id}-l`} withHandle={act === 0} handleSide="right" cy={lockCy} />
        <Leaf gate={gate} x={x + bx[1].x} y={yl} w={bx[1].w} h={h} hex={hex} uid={`${gate.id}-r`} withHandle={act === 1} handleSide="left" cy={lockCy} />
        {!realistic && <SwingMark x={x + bx[0].x} y={yl} w={bx[0].w} h={h} hingeSide="left" px={px} />}
        {!realistic && <SwingMark x={x + bx[1].x} y={yl} w={bx[1].w} h={h} hingeSide="right" px={px} />}
        <Hinges x={x + bx[0].x} y={yl} w={bx[0].w} h={h} side="left" gate={gate} clearX={x} clear={w} />
        <Hinges x={x + bx[1].x} y={yl} w={bx[1].w} h={h} side="right" gate={gate} clearX={x} clear={w} />
        {/* prihvatnik brave na pasivnom krilu, u visini brave */}
        <rect data-testid="gate-strike" x={innerP + dirIn * (fr / 2) - 13} y={lockCy - 70} width={26} height={140} rx="6" fill="#c3cbd5" stroke="#6b7380" strokeWidth="3" />
        {/* podni zasun: nadgradna šipka sa dvorišne strane pasivnog krila, uz ivicu spoja; spuštena u podni prihvat */}
        <g data-testid="gate-floor-bolt">
          <rect x={boltX - 8} y={boltTop} width={16} height={boltLen + 26} rx="4" fill="#d8dee6" stroke="#434b55" strokeWidth="3" />
          {[0.12, 0.72].map((t) => <rect key={t} x={boltX - 24} y={boltTop + boltLen * t} width={48} height={44} rx="6" fill="#9aa4b0" stroke="#1b1f24" strokeWidth="3" />)}
          <rect x={boltX + 8} y={boltTop + 30} width={44} height={14} rx="5" fill="#2b3036" />
          <rect data-testid="gate-floor-catch" x={boltX - 30} y={floorY - 6} width={60} height={34} rx="4" fill="#59616b" stroke="#2b3036" strokeWidth="3" />
          <rect x={boltX - 10} y={floorY - 6} width={20} height={14} fill="#1b1f24" />
        </g>
        {gate.automation && <rect x={x + w / 2 - 60} y={yl - 70} width={120} height={50} rx="10" fill="#1b1f24" />}
        {!realistic && <text x={x + A.x + A.w / 2} y={yl + 70} textAnchor="middle" fontSize={64} fontWeight={700} fill="#f8fafc" fillOpacity="0.9">aktivno</text>}
        {!realistic && <text x={x + P.x + P.w / 2} y={yl + 70} textAnchor="middle" fontSize={64} fontWeight={700} fill="#f8fafc" fillOpacity="0.9">pasivno</text>}
      </g>
    );
  }

  // pešačka i jednokrilna sa merama kapije
  if (boxes) {
    const [b0] = boxes;
    return (
      <g>
        <Leaf gate={gate} x={x + b0.x} y={yl} w={b0.w} h={h} hex={hex} uid={`${gate.id}-p`} withHandle handleSide={freeSide} cy={lockAt(yl)} />
        {!realistic && <SwingMark x={x + b0.x} y={yl} w={b0.w} h={h} hingeSide={hingeSide} px={px} />}
        <Hinges x={x + b0.x} y={yl} w={b0.w} h={h} side={hingeSide} gate={gate} clearX={x} clear={w} />
        {gate.automation && <rect x={x + b0.x + b0.w / 2 - 60} y={yl - 70} width={120} height={50} rx="10" fill="#1b1f24" />}
      </g>
    );
  }

  // pešačka i jednokrilna
  return (
    <g>
      <Leaf gate={gate} x={x} y={y} w={w} h={h} hex={hex} uid={`${gate.id}-p`} withHandle handleSide={freeSide} />
      {!realistic && <SwingMark x={x} y={y} w={w} h={h} hingeSide={hingeSide} px={px} />}
      <Hinges x={x} y={y} w={w} h={h} side={hingeSide} />
      {gate.automation && <rect x={x + w / 2 - 60} y={y - 70} width={120} height={50} rx="10" fill="#1b1f24" />}
    </g>
  );
}
