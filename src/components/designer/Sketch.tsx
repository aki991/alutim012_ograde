import { useMemo } from 'react';
import { CUSTOM_KIND_LABELS, partBounds, type CustomModel } from '../../domain/models/custom';
import { guideReport } from '../../domain/models/guides';
import type { Material } from '../../domain/models/types';
import { buildSketch, fmtNum, type Sketch } from '../../domain/models/sketch';
import { GuideSection } from './GuideSection';
import { PartSvg, resolveParts } from './PartsSvg';

const INK = '#111827';
const DIM = '#d71920';
const MUTED = '#64748b';
const WELD = '#15803d';
const FONT = 'Arial, Helvetica, sans-serif';
const TW = 0.58; // približna širina znaka u visinama slova

/** Raspoređuje intervale u redove tako da se u istom redu ne preklapaju (širina natpisa se računa kao najmanji razmak). */
function rowsOf(items: { lo: number; hi: number }[], gap: number): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].lo - items[b].lo);
  const ends: number[] = [];
  const out = new Array<number>(items.length).fill(0);
  for (const i of order) {
    let r = 0;
    while (r < ends.length && items[i].lo < ends[r] + gap) r += 1;
    ends[r] = items[i].hi;
    out[i] = r;
  }
  return out;
}

const trunc = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Skica sa kotama za majstora: crtež ograde u bojama pozicija, sve mere (odstojanja od vrha i poda, visine i razmaci između prečki,
 * dužine, širine, razmaci uspravnih delova), tabela delova sa dužinama i brojem komada i presek prečke u U profilu sa uglom nagiba.
 * Sve je u milimetrima; sve boje i veličine su zadate atributima, pa se ista skica koristi na ekranu i u PDF-u.
 */
export function SketchSvg({ model, materials, className, style }: { model: CustomModel; materials: Material[]; className?: string; style?: React.CSSProperties }) {
  const sk = useMemo(() => buildSketch(model, materials), [model, materials]);
  const parts = useMemo(() => resolveParts(model, materials), [model, materials]);
  return <SketchDrawing model={model} materials={materials} sk={sk} parts={parts} className={className} style={style} />;
}

function SketchDrawing({ model, materials, sk, parts, className, style }: { model: CustomModel; materials: Material[]; sk: Sketch; parts: ReturnType<typeof resolveParts>; className?: string; style?: React.CSSProperties }) {
  const W = model.widthMm; const H = model.heightMm;
  const fs = Math.max(8, Math.max(W, H) * 0.0185);
  const sw = fs * 0.07;
  const tick = fs * 0.32;
  const Y = (y: number): number => H - y; // y nagore → y naniže

  /* ---- levi lanac (odstojanja i razmaci po visini) ---- */
  const xChain = -2.2 * fs;
  const leftItems = sk.left.map((d) => ({ ...d, y1: Y(d.b), y2: Y(d.a), mid: (Y(d.a) + Y(d.b)) / 2, text: fmtNum(d.value) }));
  leftItems.sort((a, b) => a.mid - b.mid);
  let prev = -Infinity;
  const leftLabels = leftItems.map((d) => { const ly = Math.max(d.mid, prev + 1.15 * fs); prev = ly; return ly; });
  const maxLeftW = Math.max(0, ...leftItems.map((d) => d.text.length * TW * fs));
  const xOverall = xChain - maxLeftW - 3 * fs;

  /* ---- donji lanac (odstojanja i razmaci po širini) ---- */
  const yChain = H + 2.2 * fs;
  const bottomItems = sk.bottom.map((d) => ({ ...d, mid: (d.a + d.b) / 2, text: fmtNum(d.value), w: fmtNum(d.value).length * TW * fs }));
  const bottomRows = rowsOf(bottomItems.map((d) => ({ lo: d.mid - Math.max(d.w, d.b - d.a) / 2, hi: d.mid + Math.max(d.w, d.b - d.a) / 2 })), 0.4 * fs);
  const bottomRowCount = bottomItems.length ? Math.max(...bottomRows) + 1 : 0;
  const yOverall = yChain + 1.3 * fs + bottomRowCount * 1.15 * fs + 1.6 * fs;

  /* ---- gornje kote (dužine vodoravnih, širine uspravnih delova) ---- */
  const topItems = sk.top.map((d) => ({ ...d, text: fmtNum(d.value), w: fmtNum(d.value).length * TW * fs }));
  const topRows = rowsOf(topItems.map((d) => ({ lo: (d.x0 + d.x1) / 2 - Math.max(d.w, d.x1 - d.x0) / 2, hi: (d.x0 + d.x1) / 2 + Math.max(d.w, d.x1 - d.x0) / 2 })), 0.4 * fs);
  const topRowCount = topItems.length ? Math.max(...topRows) + 1 : 0;
  const yTop = (row: number): number => -(1.8 * fs + row * 2.4 * fs);

  /* ---- zavarivanje: visina gornje ivice svake prečke od poda (osa odmah desno od crteža) ---- */
  const xWeld = W + 1.6 * fs;
  const weldItems = sk.welds.map((d) => ({ ...d, Y: Y(d.y), text: fmtNum(d.value) }));
  let prevW = -Infinity;
  const weldLabels = weldItems.map((d) => { const ly = Math.max(d.Y, prevW + 1.15 * fs); prevW = ly; return ly; });
  const weldLabelW = weldItems.length ? Math.max(...weldItems.map((d) => d.text.length)) * TW * fs : 0;
  const weldEnd = weldItems.length ? xWeld + 0.7 * fs + weldLabelW + 1.2 * fs : W;

  /* ---- desne kote (dužine uspravnih delova, vidljive visine vodoravnih) ---- */
  const rightItems = sk.right.map((d) => ({ ...d, text: fmtNum(d.value), w: fmtNum(d.value).length * TW * fs }));
  const rightCols = rowsOf(rightItems.map((d) => ({ lo: Y(d.y1) + (d.y1 - d.y0) / 2 - Math.max(d.w, d.y1 - d.y0) / 2, hi: Y(d.y1) + (d.y1 - d.y0) / 2 + Math.max(d.w, d.y1 - d.y0) / 2 })), 0.4 * fs);
  const rightColCount = rightItems.length ? Math.max(...rightCols) + 1 : 0;
  const xRight = (col: number): number => (weldItems.length ? weldEnd : W) + 1.8 * fs + col * 2.4 * fs;

  /* ---- okvir platna ---- */
  const topMost = Math.min(topRowCount ? yTop(topRowCount - 1) - 1.4 * fs : -0.6 * fs, weldItems.length ? -2.6 * fs : 0);
  const titleY = topMost - 1.4 * fs;
  const minX = xOverall - 1.8 * fs;
  const drawMaxX = Math.max((weldItems.length ? weldEnd : W) + (rightColCount ? 1.8 * fs + rightColCount * 2.4 * fs : 1 * fs) + 0.8 * fs, weldItems.length ? xWeld + 11 * fs : 0);
  const legendW = 80 * fs;
  const maxX = Math.max(drawMaxX, minX + legendW);
  const minY = titleY - 1.6 * fs;

  /* ---- tabela delova ---- */
  const rowH = 1.75 * fs;
  const legendY0 = yOverall + 3.2 * fs;
  const col = { sw: 0, no: 2.4 * fs, name: 4.6 * fs, section: 38 * fs, length: 49 * fs, angle: 60 * fs, count: 75 * fs };
  const legendH = rowH * (sk.positions.length + 1.2);

  /* ---- preseci prečki u U profilima ---- */
  const secY0 = legendY0 + legendH + 3 * fs;
  const secH = 22 * fs;
  const details = sk.groups.map((g, i) => ({ g, report: guideReport(model, g.bar, materials), y: secY0 + i * (secH + 2.5 * fs) }));
  const maxY = details.length ? details[details.length - 1].y + secH + 1.5 * fs : legendY0 + legendH + 1.5 * fs;

  const vw = maxX - minX; const vh = maxY - minY;
  const dimLine = (props: { x1: number; y1: number; x2: number; y2: number }) => <line {...props} stroke={DIM} strokeWidth={sw} />;
  const slash = (x: number, y: number) => <line x1={x - tick} y1={y + tick} x2={x + tick} y2={y - tick} stroke={DIM} strokeWidth={sw * 1.8} />;
  const ext = (x1: number, y1: number, x2: number, y2: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DIM} strokeWidth={sw * 0.7} strokeOpacity={0.55} />;
  const label = (x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end', bold = false, size = fs, rot?: number) => (
    <text x={x} y={y} fontSize={size} fontFamily={FONT} fontWeight={bold ? 700 : 600} fill={INK} textAnchor={anchor} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>{text}</text>
  );
  const typeLabel = CUSTOM_KIND_LABELS[model.kind];
  const colorOf = (id: string): string => { const no = sk.noOf.get(id); return no ? sk.positions[no - 1].color : '#e2e8f0'; };

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${minX} ${minY} ${vw} ${vh}`} width={Math.round(vw)} height={Math.round(vh)} className={className} style={style} role="img" aria-label={`Skica sa kotama: ${model.name}`} data-testid="sketch-svg" fontFamily={FONT}>
      <rect x={minX} y={minY} width={vw} height={vh} fill="#ffffff" />
      {label(minX + 0.6 * fs, titleY, `${model.name || 'Model'} — ${typeLabel.toLowerCase()} ${fmtNum(W, 0)} × ${fmtNum(H, 0)} mm`, 'start', true, fs * 1.25)}

      {/* crtež: delovi u bojama pozicija */}
      <g transform={`translate(0 ${H}) scale(1 -1)`}>
        <rect x={0} y={0} width={W} height={H} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
        {parts.map((r) => <PartSvg key={r.part.id} part={r.part} shape={r.shape} hex={colorOf(r.part.id)} />)}
      </g>
      <line x1={-fs} y1={H} x2={W + fs} y2={H} stroke="#475569" strokeWidth={sw * 2} />
      {/* oznake pozicija (prvi deo svake pozicije) */}
      {sk.positions.map((p) => {
        const r = parts.find((x) => x.part.id === p.firstId);
        if (!r) return null;
        const b = partBounds(r.part, r.shape);
        const cx = (b.x0 + b.x1) / 2; const cy = Y((b.y0 + b.y1) / 2);
        return (
          <g key={p.no} data-testid="sketch-tag">
            <circle cx={cx} cy={cy} r={0.85 * fs} fill="#ffffff" stroke={INK} strokeWidth={sw * 1.2} />
            {label(cx, cy + fs * 0.34, String(p.no), 'middle', true, fs * 0.95)}
          </g>
        );
      })}
      {sk.oblique.map((o) => <g key={o.id}>{label(o.x, Y(o.y) - 0.6 * fs, o.text, 'middle', true, fs * 0.9, -o.angleDeg)}</g>)}

      {/* levi lanac: odstojanje od vrha, razmaci, odstojanje od poda */}
      {leftItems.map((d, i) => (
        <g key={`l${i}`} data-testid="sketch-dim-v" data-value={d.value}>
          {ext(0, d.y1, xChain - 0.5 * fs, d.y1)}{ext(0, d.y2, xChain - 0.5 * fs, d.y2)}
          {dimLine({ x1: xChain, y1: d.y1, x2: xChain, y2: d.y2 })}{slash(xChain, d.y1)}{slash(xChain, d.y2)}
          {Math.abs(leftLabels[i] - d.mid) > 0.01 && <line x1={xChain} y1={d.mid} x2={xChain - 0.45 * fs} y2={leftLabels[i] - 0.3 * fs} stroke={DIM} strokeWidth={sw * 0.7} />}
          {label(xChain - 0.55 * fs, leftLabels[i] + 0.35 * fs, d.text, 'end', d.kind === 'offset')}
        </g>
      ))}
      {/* ukupna visina */}
      {ext(0, 0, xOverall - 0.5 * fs, 0)}{ext(0, H, xOverall - 0.5 * fs, H)}
      {dimLine({ x1: xOverall, y1: 0, x2: xOverall, y2: H })}{slash(xOverall, 0)}{slash(xOverall, H)}
      {label(xOverall - 0.45 * fs, H / 2, fmtNum(H, 0), 'middle', true, fs * 1.1, -90)}

      {/* donji lanac: odstojanja i razmaci po širini */}
      {bottomItems.map((d, i) => (
        <g key={`b${i}`} data-testid="sketch-dim-h" data-value={d.value}>
          {ext(d.a, H, d.a, yChain + 0.5 * fs)}{ext(d.b, H, d.b, yChain + 0.5 * fs)}
          {dimLine({ x1: d.a, y1: yChain, x2: d.b, y2: yChain })}{slash(d.a, yChain)}{slash(d.b, yChain)}
          {label(d.mid, yChain + 1.35 * fs + bottomRows[i] * 1.15 * fs, d.text, 'middle', d.kind === 'offset')}
        </g>
      ))}
      {/* ukupna širina */}
      {ext(0, H, 0, yOverall + 0.5 * fs)}{ext(W, H, W, yOverall + 0.5 * fs)}
      {dimLine({ x1: 0, y1: yOverall, x2: W, y2: yOverall })}{slash(0, yOverall)}{slash(W, yOverall)}
      {label(W / 2, yOverall + 1.35 * fs, fmtNum(W, 0), 'middle', true, fs * 1.1)}

      {/* gornje kote */}
      {topItems.map((d, i) => {
        const ly = yTop(topRows[i]); const mid = (d.x0 + d.x1) / 2;
        return (
          <g key={`t${i}`} data-testid="sketch-dim-top" data-value={d.value}>
            {ext(d.x0, 0, d.x0, ly - 0.5 * fs)}{ext(d.x1, 0, d.x1, ly - 0.5 * fs)}
            {dimLine({ x1: d.x0, y1: ly, x2: d.x1, y2: ly })}{slash(d.x0, ly)}{slash(d.x1, ly)}
            {label(mid, ly - 0.4 * fs, d.text, 'middle')}
          </g>
        );
      })}
      {/* zavarivanje: od poda do linije naleganja svake prečke na bočni U profil (zelena osa) */}
      {weldItems.length > 0 && (
        <g data-testid="sketch-welds">
          <line x1={xWeld} y1={H} x2={xWeld} y2={weldItems[0].Y} stroke={WELD} strokeWidth={sw * 1.4} />
          <line x1={xWeld - 0.5 * fs} y1={H} x2={xWeld + 0.5 * fs} y2={H} stroke={WELD} strokeWidth={sw * 1.6} />
          {label(xWeld + 0.7 * fs, H + 0.1 * fs + 0.35 * fs, '0', 'start', true, fs * 0.9)}
          {weldItems.map((d, i) => (
            <g key={d.id} data-testid="sketch-weld" data-value={d.value}>
              <line x1={W} y1={d.Y} x2={xWeld} y2={d.Y} stroke={WELD} strokeWidth={sw * 0.8} strokeOpacity={0.7} />
              <circle cx={xWeld} cy={d.Y} r={sw * 1.9} fill={WELD} />
              {Math.abs(weldLabels[i] - d.Y) > 0.01 && <line x1={xWeld} y1={d.Y} x2={xWeld + 0.6 * fs} y2={weldLabels[i] - 0.3 * fs} stroke={WELD} strokeWidth={sw * 0.7} />}
              <text x={xWeld + 0.7 * fs} y={weldLabels[i] + 0.35 * fs} fontSize={fs} fontFamily={FONT} fontWeight={700} fill={WELD} textAnchor="start">{d.text}</text>
            </g>
          ))}
          <text x={xWeld - 0.2 * fs} y={-1.75 * fs} fontSize={fs * 0.85} fontFamily={FONT} fontWeight={700} fill={WELD} textAnchor="start">Zavarivanje</text>
          <text x={xWeld - 0.2 * fs} y={-0.75 * fs} fontSize={fs * 0.8} fontFamily={FONT} fontWeight={600} fill={WELD} textAnchor="start">od poda do linije naleganja</text>
        </g>
      )}
      {/* desne kote */}
      {rightItems.map((d, i) => {
        const lx = xRight(rightCols[i]); const y1 = Y(d.y1); const y2 = Y(d.y0); const mid = (y1 + y2) / 2;
        return (
          <g key={`r${i}`} data-testid="sketch-dim-right" data-value={d.value}>
            {ext(weldItems.length ? weldEnd : W, y1, lx + 0.5 * fs, y1)}{ext(weldItems.length ? weldEnd : W, y2, lx + 0.5 * fs, y2)}
            {dimLine({ x1: lx, y1, x2: lx, y2 })}{slash(lx, y1)}{slash(lx, y2)}
            {label(lx + 1.15 * fs, mid, d.text, 'middle', false, fs, -90)}
          </g>
        );
      })}

      {/* tabela delova */}
      <g data-testid="sketch-legend" transform={`translate(${minX + 0.6 * fs} ${legendY0})`}>
        <rect x={0} y={0} width={legendW - 1.2 * fs} height={rowH} fill="#f1f5f9" />
        {([['Poz.', col.no], ['Materijal', col.name], ['Presek (mm)', col.section], ['Dužina (mm)', col.length], ['Ugao / nagib', col.angle], ['Kom.', col.count]] as [string, number][]).map(([t, x]) => (
          <g key={t}>{label(x, rowH * 0.68, t, 'start', true, fs * 0.85)}</g>
        ))}
        {sk.positions.map((p, i) => {
          const y = rowH * (i + 1);
          return (
            <g key={p.no} data-testid="sketch-legend-row">
              <line x1={0} y1={y} x2={legendW - 1.2 * fs} y2={y} stroke="#e2e8f0" strokeWidth={sw} />
              <rect x={col.sw} y={y + rowH * 0.2} width={1.5 * fs} height={rowH * 0.6} fill={p.color} stroke={INK} strokeWidth={sw} />
              {label(col.no, y + rowH * 0.68, String(p.no), 'start', true, fs * 0.95)}
              {label(col.name, y + rowH * 0.68, trunc(`${p.name}`, 48), 'start', false, fs * 0.9)}
              {label(col.section, y + rowH * 0.68, p.section, 'start', false, fs * 0.9)}
              {label(col.length, y + rowH * 0.68, p.length, 'start', true, fs * 0.95)}
              {label(col.angle, y + rowH * 0.68, p.angle, 'start', false, fs * 0.9)}
              {label(col.count, y + rowH * 0.68, `${p.count}`, 'start', true, fs * 0.95)}
            </g>
          );
        })}
      </g>

      {/* preseci: prečka u U profilu sa uglom nagiba i podaci o rasporedu */}
      {details.map(({ g, report, y }, i) => {
        const x = minX + 0.6 * fs; const tx = x + 24 * fs;
        const gapNeg = g.values.gap < 0;
        const lines: [string, boolean][] = [
          [`Presek prečke u bočnom U profilu${sk.groups.length > 1 ? ` (${i + 1})` : ''}`, true],
          [`${g.count} × ${trunc(g.material, 40)} — ${g.lufta === 'bez' ? 'bez lufta' : 'sa luftom'}`, false],
          [`Od vrha ${fmtNum(g.values.top)} mm · od dna ${fmtNum(g.values.bottom)} mm`, false],
          ...(g.count >= 2 ? [[`Razmak između prečki ${fmtNum(g.values.gap)} mm${gapNeg ? ' (uvučene jedna u drugu)' : ''}`, false] as [string, boolean], [`Korak osa–osa prečki ${fmtNum(g.pitch ?? 0)} mm`, false] as [string, boolean]] : []),
          [`Vidljiva visina prečke ${fmtNum(g.values.h)} mm · visina bočnih strana ${fmtNum(g.values.H)} mm`, false],
          [`Nagib preseka ${fmtNum(g.tiltDeg, 2)}° od ravni ograde (najviše ${fmtNum(g.fitDeg, 2)}°)`, true],
          [`Unutrašnji otvor U profila ${fmtNum(g.opening)} mm`, false],
        ];
        return (
          <g key={i} data-testid="sketch-detail">
            {report && <GuideSection bar={g.bar} report={report} placement={{ x, y, width: 22 * fs, height: secH }} />}
            {lines.map(([t, b], k) => <g key={k}>{label(tx, y + 1.6 * fs + k * 1.9 * fs, t, 'start', b, fs * 0.95)}</g>)}
          </g>
        );
      })}
      {sk.missing > 0 && label(minX + 0.6 * fs, maxY - 0.3 * fs, `Upozorenje: ${sk.missing} delova ima materijal koji je obrisan iz cenovnika.`, 'start', true, fs * 0.9)}
      <text x={maxX - 0.6 * fs} y={maxY - 0.3 * fs} fontSize={fs * 0.8} fontFamily={FONT} fill={MUTED} textAnchor="end">Mere su u mm. Pozicije su obojene kao u tabeli. Zelena osa: visina od poda do linije na kojoj prečka naleže na U profil (mesto zavarivanja).</text>
    </svg>
  );
}
