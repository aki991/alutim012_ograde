import type { Gate } from '../../domain/models/types';
import { InfillArt } from '../fences/InfillArt';

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

/** Indikator smera otvaranja krila (isprekidane linije ka strani šarki). */
function SwingMark({ x, y, w, h, hingeSide, px }: { x: number; y: number; w: number; h: number; hingeSide: 'left' | 'right'; px: number }) {
  const hx = hingeSide === 'left' ? x : x + w;
  const fx = hingeSide === 'left' ? x + w : x;
  return (
    <polyline
      points={`${fx},${y} ${hx},${y + h / 2} ${fx},${y + h}`}
      fill="none"
      stroke="#f8fafc"
      strokeOpacity="0.85"
      strokeWidth={1.6 * px}
      strokeDasharray={DASH(px)}
    />
  );
}

function Hinges({ x, y, w, h, side }: { x: number; y: number; w: number; h: number; side: 'left' | 'right' }) {
  const hx = side === 'left' ? x - 8 : x + w - 30;
  return (
    <g fill="#9aa4b0" stroke="#1b1f24" strokeWidth="3">
      {[0.12, 0.88].map((t) => (
        <rect key={t} x={hx} y={y + h * t - 45} width={38} height={90} rx="6" />
      ))}
    </g>
  );
}

function Leaf({ gate, x, y, w, h, hex, uid, withHandle, handleSide }: { gate: Gate; x: number; y: number; w: number; h: number; hex: string; uid: string; withHandle: boolean; handleSide: 'left' | 'right' }) {
  const hxPos = handleSide === 'left' ? x + gate.params.frameMm + 50 : x + w - gate.params.frameMm - 80;
  return (
    <g>
      <InfillArt modelId={gate.infillModelId} x={x} y={y} w={w} h={h} frame={gate.params.frameMm} barSize={gate.params.barSizeMm} gap={gate.params.gapMm} hex={hex} colorKey={gate.color} uid={uid} />
      {withHandle && (
        <g>
          <rect x={hxPos} y={y + h * 0.5 - 220} width={22} height={440} rx="8" fill="#d8dee6" stroke="#6b7380" strokeWidth="3" />
          <rect x={hxPos - 22} y={y + h * 0.5 - 40} width={60} height={80} rx="12" fill="#c3cbd5" stroke="#6b7380" strokeWidth="3" />
          <circle cx={hxPos + 11} cy={y + h * 0.5 + 12} r="9" fill="#2b3036" />
        </g>
      )}
    </g>
  );
}

/** realistic: bez oznaka za crtež (smer otvaranja, strelica klizanja, oznaka motora) — za simulaciju na fotografiji */
export function GateArt({ gate, x, y, w, h, hex, px, realistic }: Props & { realistic?: boolean }) {
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

  if (gate.gateType === 'double') {
    const total = w;
    const gapC = 20;
    const leftW = gate.unequalLeaves && gate.leftLeafMm > 0 ? Math.min(Math.max(gate.leftLeafMm, 300), total - 300 - gapC) : (total - gapC) / 2;
    const rightW = total - gapC - leftW;
    return (
      <g>
        <Leaf gate={gate} x={x} y={y} w={leftW} h={h} hex={hex} uid={`${gate.id}-l`} withHandle={false} handleSide="right" />
        <Leaf gate={gate} x={x + leftW + gapC} y={y} w={rightW} h={h} hex={hex} uid={`${gate.id}-r`} withHandle={false} handleSide="left" />
        {!realistic && <SwingMark x={x} y={y} w={leftW} h={h} hingeSide="left" px={px} />}
        {!realistic && <SwingMark x={x + leftW + gapC} y={y} w={rightW} h={h} hingeSide="right" px={px} />}
        <Hinges x={x} y={y} w={leftW} h={h} side="left" />
        <Hinges x={x + leftW + gapC} y={y} w={rightW} h={h} side="right" />
        <rect x={x + leftW - 30} y={y + h * 0.5 - 40} width={80} height={80} rx="14" fill="#c3cbd5" stroke="#6b7380" strokeWidth="3" />
        {gate.automation && <rect x={x + w / 2 - 60} y={y - 70} width={120} height={50} rx="10" fill="#1b1f24" />}
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
