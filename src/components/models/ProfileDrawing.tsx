import { profileGeometry, type Dim, type ProfileSpec } from '../../domain/models/profileDrawings';

const INK = '#1a1a1a';
const DIM = '#d71920';

/** Dužina natpisa u mm (približno), za proračun okvira crteža. */
const textLen = (label: string, fs: number): number => label.length * fs * 0.62;

/** Jedna kota: linija sa kosim crtama na krajevima, pomoćne linije do preseka i natpis. Sve mere se skaliraju veličinom slova. */
function DimLine({ d, fs }: { d: Dim; fs: number }) {
  const k = fs / 4; // razmera: razmaci kota su zadati za slova od 4 mm
  const [x1, y1] = d.from;
  const [x2, y2] = d.to;
  const horizontal = Math.abs(y2 - y1) < 1e-6;
  const g = d.gap * k;
  const ox = horizontal ? 0 : g;
  const oy = horizontal ? g : 0;
  const ax = x1 + ox; const ay = y1 + oy; const bx = x2 + ox; const by = y2 + oy;
  const tick = 1.6 * k;
  const over = 1.2 * k;
  const mx = (ax + bx) / 2; const my = (ay + by) / 2;
  const sw = 0.28 * k;
  return (
    <g stroke={DIM} strokeWidth={sw} fill="none" data-testid="profile-dim">
      <line x1={x1} y1={y1} x2={ax + (horizontal ? 0 : Math.sign(g) * over)} y2={ay + (horizontal ? Math.sign(g) * over : 0)} strokeOpacity="0.5" />
      <line x1={x2} y1={y2} x2={bx + (horizontal ? 0 : Math.sign(g) * over)} y2={by + (horizontal ? Math.sign(g) * over : 0)} strokeOpacity="0.5" />
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
  // veličina slova prati veličinu profila, pa su natpisi iste veličine na ekranu za male i velike profile
  const fs = 0.045 * Math.max(geo.w, geo.h * 1.2);
  const k = fs / 4;
  // okvir crteža: presek i sve kote sa natpisima
  let x0 = 0; let y0 = 0; let x1 = geo.w; let y1 = geo.h;
  for (const d of geo.dims) {
    const horizontal = Math.abs(d.to[1] - d.from[1]) < 1e-6;
    const g = d.gap * k;
    const pts: [number, number][] = [d.from, d.to].map(([x, y]) => (horizontal ? [x, y + g] : [x + g, y]));
    const tl = textLen(d.label, fs);
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (horizontal) { const t = g > 0 ? pts[0][1] + fs * 1.4 : pts[0][1] - fs * 1.4; y0 = Math.min(y0, t); y1 = Math.max(y1, t); x0 = Math.min(x0, (pts[0][0] + pts[1][0]) / 2 - tl / 2); x1 = Math.max(x1, (pts[0][0] + pts[1][0]) / 2 + tl / 2); }
    else { const t = g > 0 ? pts[0][0] + fs * 1.4 : pts[0][0] - fs * 1.4; x0 = Math.min(x0, t); x1 = Math.max(x1, t); }
  }
  const m = fs * 1.4;
  const vx = x0 - m; const vy = y0 - m; const vw = x1 - x0 + 2 * m; const vh = y1 - y0 + 2 * m;
  return (
    <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label={`Crtež preseka: ${title}`} data-testid="profile-drawing" className="w-full max-w-[460px] h-auto bg-white rounded-lg border border-line" style={{ aspectRatio: `${vw} / ${vh}` }}>
      <path d={geo.path} fill="#3a3f45" fillRule={geo.fillRule} stroke={INK} strokeWidth={0.06 * fs} strokeLinejoin="round" />
      {geo.dims.map((d, i) => <DimLine key={i} d={d} fs={fs} />)}
    </svg>
  );
}
