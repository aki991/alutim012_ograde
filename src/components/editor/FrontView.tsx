import { memo } from 'react';
import { computeLayout } from '../../domain/geometry/layout';
import { cornerInfo, isCorner } from '../../domain/geometry/corner';
import { colorHex, GATE_LABELS, leftPostShared, postDrawnByItems, rodCountFor } from '../../domain/models/catalog';
import type { Post, Project } from '../../domain/models/types';
import { fmtMm } from '../../utils/units';
import { itemLabel } from '../../utils/labels';
import { InfillArt, SvgDefs } from '../fences/InfillArt';
import { GateArt } from '../gates/GateArt';

export interface FrontViewOptions {
  showDimensions: boolean;
  showGrid: boolean;
  showLabels: boolean;
  /** napredni prikaz: položaji stubova po osama (modularne mere) */
  showModular?: boolean;
  /** bez pozadine i tla (ograda za simulaciju na fotografiji) */
  transparent?: boolean;
}

export interface FrontViewProps {
  project: Project;
  /** px po mm */
  scale: number;
  options?: Partial<FrontViewOptions>;
  selectedId?: string | null;
  selectedType?: 'item' | 'post' | null;
  dimmedId?: string | null;
  /** indeks stuba (0..n) gde će element biti ubačen */
  dropIndex?: number | null;
  dropLabel?: string;
  /** true samo u editoru: crta nevidljive zone za selekciju i prevlačenje */
  interactive?: boolean;
  /** minijatura: bez kota, oznaka i mreže, sa ravnomernim prostorom oko geometrije */
  compact?: boolean;
  className?: string;
}

const GROUND_BAND = 160;

export function frontViewMetrics(project: Project, scale: number, showDimensions: boolean, compact = false, withAdd = false) {
  const layout = computeLayout(project);
  const firstW = project.posts[0]?.widthMm ?? 0;
  const lastW = project.posts[project.posts.length - 1]?.widthMm ?? 0;
  const COMPACT_PAD = 140; // mm — minijature: ravnomeran prostor oko cele geometrije
  const padL = compact ? COMPACT_PAD : (showDimensions ? 96 : 40) / scale;
  const padR = compact ? COMPACT_PAD : (withAdd ? 120 : 40) / scale; // desno ostaje mesto za dugme +
  const padT = compact ? COMPACT_PAD : (showDimensions ? 74 : 40) / scale;
  const padB = compact ? COMPACT_PAD : (showDimensions ? 118 : 50) / scale;
  const groundY = compact ? Math.max(layout.maxHeightMm, 400) : Math.max(layout.maxHeightMm, 800);
  const vx = -firstW / 2 - padL;
  const vy = -padT;
  const vw = layout.occupiedMm + padL + padR;
  const vh = groundY + (compact ? 40 : GROUND_BAND) + padT + padB;
  return { layout, vx, vy, vw, vh, groundY, padT, padB, firstW, lastW, widthPx: vw * scale, heightPx: vh * scale };
}

/** Skala (px/mm) pri kojoj ceo crtež staje u zadatu površinu. */
export function fitScale(project: Project, containerW: number, containerH: number, showDimensions: boolean): number {
  const layout = computeLayout(project);
  const groundY = Math.max(layout.maxHeightMm, 800);
  const padX = (showDimensions ? 96 : 40) + 120;
  const padY = (showDimensions ? 74 : 40) + (showDimensions ? 118 : 50);
  const sw = (containerW - padX - 8) / Math.max(layout.occupiedMm, 1000);
  const sh = (containerH - padY - 8) / (groundY + GROUND_BAND);
  return Math.min(0.5, Math.max(0.02, Math.min(sw, sh)));
}

function PostArt({ post, x, groundY, hex }: { post: Post; x: number; groundY: number; hex: string }) {
  const w = post.widthMm;
  const top = groundY - post.heightMm;
  const left = x - w / 2;
  const capH = Math.min(70, w * 0.6);
  const isMasonry = post.type === 'concrete' || post.type === 'concrete_plinth' || post.type === 'decorative';
  const body = isMasonry ? '#c9ccd0' : hex;
  const cap = isMasonry ? '#8b9097' : '#1f2328';
  if (post.round && !isMasonry) {
    // srebrni cevni stub: okrugli presek, kapa i podnožna ploča
    const d = Math.min(w, 90);
    const l = x - d / 2;
    return (
      <g>
        <rect x={l} y={top} width={d} height={post.heightMm} rx={d / 2.6} fill={body} />
        <rect x={l} y={top} width={d} height={post.heightMm} rx={d / 2.6} fill="url(#shade-v)" />
        <rect x={l - 4} y={top - 10} width={d + 8} height={26} rx="10" fill="#9aa3ad" />
        <rect x={l - 14} y={groundY - 24} width={d + 28} height={24} rx="8" fill="#8f98a2" />
        <rect x={l} y={top} width={d} height={post.heightMm} rx={d / 2.6} fill="none" stroke="#000" strokeOpacity="0.3" strokeWidth="3" />
      </g>
    );
  }
  if (!isMasonry && post.type !== 'decorative') {
    // aluminijumski stub i stub kapije: ravna pravougaona površina u boji stuba, bez kape, senčenja i ivice
    return <rect x={left} y={top} width={w} height={post.heightMm} fill={body} />;
  }
  return (
    <g>
      <rect x={left} y={top} width={w} height={post.heightMm} fill={body} />
      <rect x={left} y={top} width={w} height={post.heightMm} fill="url(#shade-v)" />
      <g fill="#000" fillOpacity="0.08">
        {Array.from({ length: 14 }, (_, i) => (
          <circle key={i} cx={left + ((i * 37) % 100) / 100 * w} cy={top + ((i * 211) % 1000) / 1000 * post.heightMm} r="5" />
        ))}
      </g>
      {post.type === 'decorative' ? (
        <polygon points={`${left - 12},${top} ${left + w + 12},${top} ${x},${top - w * 0.55}`} fill={cap} />
      ) : (
        <rect x={left - 12} y={top - capH} width={w + 24} height={capH} rx="6" fill={cap} />
      )}
      <rect x={left} y={top} width={w} height={post.heightMm} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="4" />
    </g>
  );
}

function DimLine({ x1, x2, y, text, sub, fs, scale, edit }: { x1: number; x2: number; y: number; text: string; sub?: string; fs: number; scale: number; edit?: { kind: 'width' | 'height' | 'total'; id: string } }) {
  const t = 5 / scale;
  const mid = (x1 + x2) / 2;
  const narrow = (x2 - x1) * scale < text.length * 6.4 + 8;
  return (
    <g stroke="#17212e" strokeWidth={1.2 / scale} fill="none">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1 - t} y1={y + t} x2={x1 + t} y2={y - t} strokeWidth={1.8 / scale} />
      <line x1={x2 - t} y1={y + t} x2={x2 + t} y2={y - t} strokeWidth={1.8 / scale} />
      <line x1={x1} y1={y - 7 / scale} x2={x1} y2={y + 7 / scale} />
      <line x1={x2} y1={y - 7 / scale} x2={x2} y2={y + 7 / scale} />
      <text x={mid} y={y - 6 / scale} textAnchor="middle" fontSize={fs} fontWeight="600" fill="#17212e" stroke="none" style={{ paintOrder: 'stroke' }}>
        {narrow ? text.replace(' mm', '') : text}
      </text>
      {sub && !narrow && (
        <text x={mid} y={y + fs * 1.05 + 4 / scale} textAnchor="middle" fontSize={fs * 0.82} fill="#64748b" stroke="none">{sub}</text>
      )}
      {edit && (
        // klik na kotu otvara izmenu mere
        <rect x={mid - Math.max(text.length * fs * 0.32, 14 / scale)} y={y - fs * 1.7} width={2 * Math.max(text.length * fs * 0.32, 14 / scale)} height={fs * 2.3} fill="#d71920" fillOpacity="0" stroke="none" pointerEvents="all" style={{ cursor: 'pointer' }} data-dim={edit.kind} data-id={edit.id} data-testid={`dim-${edit.kind}-${edit.id}`}>
          <title>Kliknite da promenite meru</title>
        </rect>
      )}
    </g>
  );
}

/**
 * Detaljan pogled spreda. Crtež nastaje programski iz podataka projekta — svaki element je zaseban SVG objekat.
 * Svi tekstovi i linije se skaliraju prema `scale` tako da ostanu čitljivi pri zumiranju.
 */
function FrontViewBase({ project, scale, options, selectedId, selectedType, dimmedId, dropIndex, dropLabel, className, interactive, compact }: FrontViewProps) {
  const opts: FrontViewOptions = {
    showDimensions: options?.showDimensions ?? project.settings.showDimensions,
    showGrid: options?.showGrid ?? project.settings.showGrid,
    showLabels: options?.showLabels ?? project.settings.showLabels,
    showModular: options?.showModular ?? false,
    transparent: options?.transparent ?? false,
  };
  const m = frontViewMetrics(project, scale, opts.showDimensions && !compact, compact, Boolean(interactive) && project.items.length > 0);
  const { layout, groundY } = m;
  const px = 1 / scale;
  const fs = 13 * px;
  const items = project.items;
  const gridStep = 500;
  const gx0 = Math.floor(m.vx / gridStep) * gridStep;
  const gx1 = m.vx + m.vw;
  const gy0 = m.vy;
  const gy1 = m.vy + m.vh;

  const selectedItemIndex = selectedType === 'item' ? items.findIndex((i) => i.id === selectedId) : -1;
  const heightRef = selectedItemIndex >= 0 ? items[selectedItemIndex] : items.find((i) => i.kind !== 'opening') ?? items[0];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${m.vx} ${m.vy} ${m.vw} ${m.vh}`}
      width={m.widthPx}
      height={m.heightPx}
      className={className}
      role="img"
      aria-label={`Crtež ograde: ${project.name}`}
      data-testid={interactive ? "front-view" : undefined}
      style={{ display: 'block', userSelect: 'none', fontFamily: 'Inter Variable, Inter, system-ui, sans-serif' }}
    >
      <SvgDefs />
      {!opts.transparent && <rect x={m.vx} y={m.vy} width={m.vw} height={m.vh} fill="#fff" />}
      {opts.showGrid && !opts.transparent && (
        <g stroke="#e8edf3" strokeWidth={1 * px}>
          {Array.from({ length: Math.ceil((gx1 - gx0) / gridStep) + 1 }, (_, i) => (
            <line key={`gx${i}`} x1={gx0 + i * gridStep} y1={gy0} x2={gx0 + i * gridStep} y2={gy1} />
          ))}
          {Array.from({ length: Math.ceil((gy1 - gy0) / gridStep) + 1 }, (_, i) => {
            const yy = groundY - Math.floor((groundY - gy0) / gridStep) * gridStep + i * gridStep;
            return <line key={`gy${i}`} x1={m.vx} y1={yy} x2={gx1} y2={yy} />;
          })}
        </g>
      )}

      {/* tlo */}
      {!opts.transparent && (
        <>
          <rect x={m.vx} y={groundY} width={m.vw} height={GROUND_BAND} fill="#eef1f5" />
          <rect x={m.vx} y={groundY} width={m.vw} height={GROUND_BAND} fill="url(#ground-hatch)" opacity="0.5" />
          <line x1={m.vx} y1={groundY} x2={m.vx + m.vw} y2={groundY} stroke="#17212e" strokeWidth={2 * px} />
        </>
      )}

      {/* postolje ispod polja ograde */}
      {layout.items.map((li) =>
        li.item.kind === 'fence' ? (
          <rect key={`pl-${li.item.id}`} x={li.clearStart} y={groundY - 6} width={li.clearWidth} height={6} fill="#9aa3ad" />
        ) : null,
      )}

      {/* elementi */}
      {layout.items.map((li) => {
        const it = li.item;
        const x = li.clearStart;
        const w = li.clearWidth;
        const y = groundY - li.plinthMm - it.heightMm;
        const dim = dimmedId === it.id;
        return (
          <g key={it.id} opacity={dim ? 0.3 : 1} data-item-art={it.id}>
            {li.plinthMm > 0 && (
              <g>
                <rect x={x} y={groundY - li.plinthMm} width={w} height={li.plinthMm} fill="#c9ccd0" />
                <rect x={x} y={groundY - li.plinthMm} width={w} height={li.plinthMm} fill="url(#shade-v)" />
                <rect x={x} y={groundY - li.plinthMm} width={w} height={14} fill="#8b9097" />
              </g>
            )}
            {it.kind === 'fence' && (
              <InfillArt modelId={it.modelId} x={x} y={y} w={w} h={it.heightMm} frame={it.params.frameMm} barSize={it.params.barSizeMm} gap={it.params.gapMm} hex={colorHex(it.color)} colorKey={it.color} skipLeftPost={leftPostShared(project.items, li.index)} axis={{ x: li.axisStart, w: li.axisEnd - li.axisStart }} rodCount={rodCountFor(it.modelId, it.params, it.heightMm) ?? undefined} uid={it.id} />
            )}
            {it.kind === 'gate' && <GateArt gate={it} x={x} y={y} w={w} h={it.heightMm} hex={colorHex(it.color)} px={px} realistic={opts.transparent} />}
            {it.kind === 'opening' && isCorner(it) && (() => {
              // ugaoni spoj: prečke i rukohvat se savijaju između dva stuba (u razvijenom prikazu — kratka cev sa oznakom ugla)
              const info = cornerInfo(project, li.index);
              const col = info ? colorHex(info.color) : '#64748b';
              const cx = (li.axisStart + li.axisEnd) / 2;
              return (
                <g data-testid={`corner-art-${li.index}`}>
                  {info && <rect x={li.axisStart} y={groundY - info.heightMm} width={li.axisEnd - li.axisStart} height={info.railMm} fill={col} />}
                  {info?.rodHeightsMm.map((rh) => <rect key={rh} x={li.axisStart} y={groundY - rh - info.rodDiaMm / 2} width={li.axisEnd - li.axisStart} height={info.rodDiaMm} fill={col} />)}
                  <rect x={cx - 150} y={y - 215} width={300} height={130} rx={26} fill="#0ea5e9" />
                  <text x={cx} y={y - 215 + 90} textAnchor="middle" fontSize={78} fontWeight="700" fill="#fff">{it.bendDeg! > 0 ? '↱' : '↰'} {Math.abs(it.bendDeg!)}°</text>
                </g>
              );
            })()}
            {it.kind === 'opening' && !isCorner(it) && (
              <g>
                <rect x={x} y={y} width={w} height={it.heightMm} fill="#f8fafc" stroke="#94a3b8" strokeDasharray={`${8 * px} ${6 * px}`} strokeWidth={1.5 * px} />
                <text x={x + w / 2} y={y + it.heightMm / 2} textAnchor="middle" fontSize={fs * 1.2} fill="#64748b">Prazan otvor</text>
              </g>
            )}
            {/* hit područje za selekciju i prevlačenje */}
            {interactive && <rect
              x={li.axisStart + 0} y={y - 10} width={li.axisEnd - li.axisStart} height={it.heightMm + li.plinthMm + 20}
              fill="transparent" data-hit="item" data-id={it.id} style={{ cursor: 'grab', touchAction: 'none' }}
            />}
          </g>
        );
      })}

      {/* stubovi */}
      {layout.posts.map((lp) => (
        <g key={lp.post.id}>
          {(lp.post.turnDeg ?? 0) !== 0 && lp.role !== 'end' && (
            <g data-testid={`turn-mark-${lp.index}`} pointerEvents="none">
              <rect x={lp.x - 150} y={groundY - lp.post.heightMm - 200} width={300} height={130} rx={26} fill="#0ea5e9" />
              <text x={lp.x} y={groundY - lp.post.heightMm - 200 + 90} textAnchor="middle" fontSize={78} fontWeight="700" fill="#fff">{lp.post.turnDeg! > 0 ? '↱' : '↰'} {Math.abs(lp.post.turnDeg!)}°</text>
            </g>
          )}
          {!postDrawnByItems(project.items, lp.index) && <PostArt post={lp.post} x={lp.x} groundY={groundY} hex={colorHex(lp.post.color)} />}
          {interactive && <rect
            x={lp.x - lp.post.widthMm / 2 - 10 * px} y={groundY - lp.post.heightMm - 70} width={lp.post.widthMm + 20 * px} height={lp.post.heightMm + 70}
            fill="transparent" data-hit="post" data-id={lp.post.id} style={{ cursor: 'pointer' }}
          />}
        </g>
      ))}

      {/* oznake elemenata */}
      {opts.showLabels && layout.items.map((li) => {
        const label = li.item.kind === 'gate' ? GATE_LABELS[li.item.gateType] : itemLabel(items, li.index);
        const cx = (li.clearStart + li.clearEnd) / 2;
        const w = (label.length * 7.2 + 20) * px;
        if (w > li.clearWidth) return null;
        return (
          <g key={`lb-${li.item.id}`} pointerEvents="none">
            <rect x={cx - w / 2} y={groundY + 6 * px} width={w} height={22 * px} rx={11 * px} fill="#17212e" fillOpacity="0.88" />
            <text x={cx} y={groundY + 21.5 * px} textAnchor="middle" fontSize={11.5 * px} fill="#fff" fontWeight="600">{label}</text>
          </g>
        );
      })}

      {/* selekcija */}
      {selectedType === 'item' && selectedId && (() => {
        const li = layout.items.find((l) => l.item.id === selectedId);
        if (!li) return null;
        const y = groundY - li.item.heightMm - li.plinthMm;
        return (
          <rect data-testid="selection-outline" x={li.axisStart + Math.min(4 * px, (li.axisEnd - li.axisStart) / 4)} y={y - 8 * px} width={Math.max(1, li.axisEnd - li.axisStart - Math.min(8 * px, (li.axisEnd - li.axisStart) / 2))} height={li.item.heightMm + li.plinthMm + 16 * px} rx={6 * px} fill="#d71920" fillOpacity="0.06" stroke="#d71920" strokeWidth={3 * px} pointerEvents="none" />
        );
      })()}
      {selectedType === 'post' && selectedId && (() => {
        const lp = layout.posts.find((l) => l.post.id === selectedId);
        if (!lp) return null;
        const top = groundY - lp.post.heightMm;
        return (
          <rect data-testid="selection-outline" x={lp.x - lp.post.widthMm / 2 - 8 * px} y={top - 80} width={lp.post.widthMm + 16 * px} height={lp.post.heightMm + 90} rx={6 * px} fill="#d71920" fillOpacity="0.08" stroke="#d71920" strokeWidth={3 * px} pointerEvents="none" />
        );
      })()}

      {/* kote */}
      {opts.showDimensions && items.length > 0 && (
        <g pointerEvents="none">
          {/* kota svakog elementa je tik iznad njega (i njegovih stubova), ne na zajedničkoj liniji */}
          {layout.items.map((li) => {
            const lh = layout.posts[li.index]?.post.heightMm ?? 0;
            const rh = layout.posts[li.index + 1]?.post.heightMm ?? 0;
            const top = Math.max(li.item.heightMm + li.plinthMm, lh, rh);
            const dy = groundY - top - 12 - 22 * px;
            // kota je spoljna (zauzeta) dužina: od spoljne ivice levog do spoljne ivice desnog stuba
            const hl = li.item.kind === 'opening' && li.item.bendDeg !== undefined ? 0 : (layout.posts[li.index]?.post.widthMm ?? 0) / 2;
            const hr = li.item.kind === 'opening' && li.item.bendDeg !== undefined ? 0 : (layout.posts[li.index + 1]?.post.widthMm ?? 0) / 2;
            const x1 = li.axisStart - hl;
            const x2 = li.axisEnd + hr;
            return (
              <g key={`d-${li.item.id}`}>
                <line x1={x1} y1={dy} x2={x1} y2={groundY - Math.max(lh, li.item.heightMm)} stroke="#94a3b8" strokeWidth={1 * px} strokeDasharray={`${3 * px} ${3 * px}`} />
                <line x1={x2} y1={dy} x2={x2} y2={groundY - Math.max(rh, li.item.heightMm)} stroke="#94a3b8" strokeWidth={1 * px} strokeDasharray={`${3 * px} ${3 * px}`} />
                <DimLine x1={x1} x2={x2} y={dy} text={fmtMm(x2 - x1)} fs={fs} scale={scale} edit={interactive ? { kind: 'width', id: li.item.id } : undefined} />
              </g>
            );
          })}

          {/* pozicije stubova */}
          {opts.showModular && layout.posts.map((lp, i) => (
            <g key={`pp-${lp.post.id}`}>
              <line x1={lp.x} y1={groundY + 0} x2={lp.x} y2={groundY + 84 * px} stroke="#94a3b8" strokeWidth={1 * px} />
              <text x={lp.x} y={groundY + 100 * px} textAnchor="middle" fontSize={10 * px} fill="#64748b">
                {`S${i + 1}·${lp.x}`}
              </text>
            </g>
          ))}

          {/* ukupna dužina */}
          <DimLine x1={layout.posts[0].x - layout.posts[0].post.widthMm / 2} x2={layout.posts[layout.posts.length - 1].x + layout.posts[layout.posts.length - 1].post.widthMm / 2} y={groundY + 60 * px} text={`${fmtMm(layout.occupiedMm)} (ukupna dužina)`} fs={fs * 1.1} scale={scale} edit={interactive ? { kind: 'total', id: items[0].id } : undefined} />

          {/* visina */}
          {heightRef && (
            <g>
              <line x1={-m.firstW / 2 - 40 * px} y1={groundY - heightRef.heightMm} x2={-m.firstW / 2 - 40 * px} y2={groundY} stroke="#17212e" strokeWidth={1.2 * px} />
              <line x1={-m.firstW / 2 - 46 * px} y1={groundY - heightRef.heightMm + 6 * px} x2={-m.firstW / 2 - 34 * px} y2={groundY - heightRef.heightMm - 6 * px} stroke="#17212e" strokeWidth={1.8 * px} />
              <line x1={-m.firstW / 2 - 46 * px} y1={groundY + 6 * px} x2={-m.firstW / 2 - 34 * px} y2={groundY - 6 * px} stroke="#17212e" strokeWidth={1.8 * px} />
              <text x={-m.firstW / 2 - 50 * px} y={groundY - heightRef.heightMm / 2} textAnchor="middle" fontSize={fs} fontWeight="600" fill="#17212e" transform={`rotate(-90 ${-m.firstW / 2 - 50 * px} ${groundY - heightRef.heightMm / 2})`}>
                {`H: ${fmtMm(heightRef.heightMm)}`}
              </text>
              {interactive && (
                <rect x={-m.firstW / 2 - 50 * px - fs * 1.3} y={groundY - heightRef.heightMm / 2 - 60 * px} width={fs * 1.7} height={120 * px} fill="#d71920" fillOpacity="0" pointerEvents="all" style={{ cursor: 'pointer' }} data-dim="height" data-id={heightRef.id} data-testid={`dim-height-${heightRef.id}`}>
                  <title>Kliknite da promenite visinu</title>
                </rect>
              )}
            </g>
          )}
        </g>
      )}

      {/* dugme +: dodaje sledeći element na kraj niza */}
      {interactive && !compact && items.length > 0 && (() => {
        const lastP = layout.posts[layout.posts.length - 1];
        const r = 22 * px;
        const cx = lastP.x + m.lastW / 2 + 22 * px + r;
        const cy = groundY - Math.min(layout.maxHeightMm / 2, 700);
        return (
          <g data-add="end" data-testid="add-end" style={{ cursor: 'pointer' }}>
            <title>Dodaj sledeći element</title>
            <circle cx={cx} cy={cy} r={r + 6 * px} fill="transparent" />
            <circle cx={cx} cy={cy} r={r} fill="#fff" stroke="#d71920" strokeWidth={2.5 * px} />
            <path d={`M${cx - r * 0.45} ${cy}H${cx + r * 0.45}M${cx} ${cy - r * 0.45}V${cy + r * 0.45}`} stroke="#d71920" strokeWidth={3 * px} strokeLinecap="round" />
          </g>
        );
      })()}

      {/* indikator ubacivanja */}
      {dropIndex !== null && dropIndex !== undefined && layout.posts[dropIndex] && (
        <g pointerEvents="none" data-testid="drop-indicator">
          <rect x={layout.posts[dropIndex].x - 5 * px} y={groundY - layout.maxHeightMm - 40} width={10 * px} height={layout.maxHeightMm + 40} fill="#d71920" />
          <polygon points={`${layout.posts[dropIndex].x - 14 * px},${groundY - layout.maxHeightMm - 40} ${layout.posts[dropIndex].x + 14 * px},${groundY - layout.maxHeightMm - 40} ${layout.posts[dropIndex].x},${groundY - layout.maxHeightMm - 40 + 18 * px}`} fill="#d71920" />
          <rect x={layout.posts[dropIndex].x - 52 * px} y={groundY - layout.maxHeightMm - 40 - 26 * px} width={104 * px} height={22 * px} rx={6 * px} fill="#d71920" />
          <text x={layout.posts[dropIndex].x} y={groundY - layout.maxHeightMm - 40 - 10.5 * px} textAnchor="middle" fontSize={11.5 * px} fontWeight="700" fill="#fff">{dropLabel ?? 'Ubaci ovde'}</text>
        </g>
      )}
    </svg>
  );
}

export const FrontView = memo(FrontViewBase);
