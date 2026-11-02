import { profileGeometry, type Dim, type ProfileSpec } from '../../domain/models/profileDrawings';

const INK = '#1a1a1a';
const DIM = '#d71920';

/** Jedna kota: linija sa kosim crtama na krajevima, pomoćne linije do preseka i natpis. Mere su u mm (viewBox = mm). */
function DimLine({ d, fs }: { d: Dim; fs: number }) {
  const [x1, y1] = d.from;
  const [x2, y2] = d.to;
  const horizontal = Math.abs(y2 - y1) < 1e-6;
  const g = d.gap;
  // pomeranje kote upravno od pravca duži
  const ox = horizontal ? 0 : g;
  const oy = horizontal ? g : 0;
  const ax = x1 + ox; const ay = y1 + oy; const bx = x2 + ox; const by = y2 + oy;
  const tick = 1.6;
  const mx = (ax + bx) / 2; const my = (ay + by) / 2;
  const sw = 0.28;
  return (
    <g stroke={DIM} strokeWidth={sw} fill="none" data-testid="profile-dim">
      <line x1={x1} y1={y1} x2={ax + (horizontal ? 0 : Math.sign(g) * 1.2)} y2={ay + (horizontal ? Math.sign(g) * 1.2 : 0)} strokeOpacity="0.5" />
      <line x1={x2} y1={y2} x2={bx + (horizontal ? 0 : Math.sign(g) * 1.2)} y2={by + (horizontal ? Math.sign(g) * 1.2 : 0)} strokeOpacity="0.5" />
      <line x1={ax} y1={ay} x2={bx} y2={by} />
      <line x1={ax - tick / 2} y1={ay + tick / 2} x2={ax + tick / 2} y2={ay - tick / 2} strokeWidth={sw * 1.6} />
      <line x1={bx - tick / 2} y1={by + tick / 2} x2={bx + tick / 2} y2={by - tick / 2} strokeWidth={sw * 1.6} />
      {horizontal ? (
        <text x={mx} y={g > 0 ? my + fs * 1.15 : my - fs * 0.4} textAnchor="middle" fontSize={fs} fontWeight="600" fill={INK} stroke="none">{d.label}</text>
      ) : (
        <text x={g > 0 ? mx + fs * 1.15 : mx - fs * 0.4} y={my} textAnchor="middle" fontSize={fs} fontWeight="600" fill={INK} stroke="none" transform={`rotate(-90 ${g > 0 ? mx + fs * 1.15 : mx - fs * 0.4} ${my})`}>{d.label}</text>
      )}
    </g>
  );
}

/** Tehnički crtež poprečnog preseka profila sa kotama (kao u cenovniku dobavljača). */
export function ProfileDrawing({ spec, title }: { spec: ProfileSpec; title: string }) {
  const geo = profileGeometry(spec);
  const fs = Math.max(3.4, Math.max(geo.w, geo.h) / 17);
  const pad = fs * 3.6;
  const vx = -pad; const vy = -pad * 0.9;
  const vw = geo.w + pad * 2; const vh = geo.h + pad * 1.9;
  return (
    <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label={`Crtež preseka: ${title}`} data-testid="profile-drawing" className="w-full max-w-[460px] h-auto bg-white rounded-lg border border-line" style={{ aspectRatio: `${vw} / ${vh}` }}>
      <path d={geo.path} fill="#3a3f45" fillRule="evenodd" stroke={INK} strokeWidth={0.25} strokeLinejoin="round" />
      {geo.dims.map((d, i) => <DimLine key={i} d={d} fs={fs} />)}
    </svg>
  );
}
