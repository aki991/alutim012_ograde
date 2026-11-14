import { ramInsets } from '../../domain/models/tubes';
import { isRl10Model, isRl10Post, rl10Ends, rl10ItemAt, rl10PostInfo, rl10Tan } from '../../domain/models/rl10';
import { Rl10FieldArt, Rl10JointArt, Rl10PostArt } from '../fences/Rl10Art';
import { isStairPost, stairGroupAt, stairGroupSummary, stairProfile } from '../../domain/geometry/stair';
import { memo } from 'react';
import { swingLeafBoxes } from '../../domain/geometry/gates';
import { computeLayout, isSpacer } from '../../domain/geometry/layout';
import { cornerInfo, isCorner } from '../../domain/geometry/corner';
import { colorHex, GATE_LABELS, hasLightFence, leftPostShared, postDrawnByItems, rodCountFor } from '../../domain/models/catalog';
import { isTarabicaPost, postCaps } from '../../domain/models/tarabica';
import type { Post, PostCap, Project } from '../../domain/models/types';
import { fmtMm } from '../../utils/units';
import { itemLabel } from '../../utils/labels';
import { InfillArt, SvgDefs } from '../fences/InfillArt';
import { CapArt } from '../fences/TarabicaArt';
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
  /** više izabranih elemenata (Ctrl+klik, okvir): svaki dobija okvir; ako je prazno, važi samo izabrani element */
  selectedIds?: string[];
  /** više izabranih stubova (Ctrl+klik): svaki dobija okvir */
  selectedPostIds?: string[];
  dimmedId?: string | null;
  /** indeks stuba (0..n) gde će element biti ubačen */
  dropIndex?: number | null;
  dropLabel?: string;
  /** true samo u editoru: crta nevidljive zone za selekciju i prevlačenje */
  interactive?: boolean;
  /** sivu pozadinu zadaje pozivalac (sličice u katalogu); bez vrednosti: siva u editoru kad ima svetle ograde */
  greyBackdrop?: boolean;
  /** minijatura: bez kota, oznaka i mreže, sa ravnomernim prostorom oko geometrije */
  compact?: boolean;
  className?: string;
}

const GROUND_BAND = 160;
/** približna širina jednog znaka kote u pikselima (13 px, debljina 600) */
const DIM_CHAR_PX = 7.6;

/** Prikaz kote po širini polja: cela („3.700 mm"), skraćena („3.700") ili uspravna kad ni skraćena ne staje. */
type DimMode = 'full' | 'short' | 'vertical';
function dimMode(widthMm: number, scale: number, text: string): DimMode {
  const w = widthMm * scale - 8;
  if (text.length * DIM_CHAR_PX <= w) return 'full';
  if (text.replace(' mm', '').length * DIM_CHAR_PX <= w) return 'short';
  return 'vertical';
}

type LaidItem = ReturnType<typeof computeLayout>['items'][number];
export interface WidthDim { kind: 'panel' | 'post'; x1: number; x2: number; li?: LaidItem; postIndex?: number }

/**
 * Kote odozgo kao lanac stvarnih mera: posebno svako platno (svetla širina između stubova: ograda, kapija ili otvor) i posebno
 * svaki stubić (njegova širina). Ugaoni spoj se kotira od ose do ose (stubovi uz njega se kotiraju zasebno).
 */
export function widthDims(layout: ReturnType<typeof computeLayout>): WidthDim[] {
  const out: WidthDim[] = [];
  for (const li of layout.items) {
    if (isSpacer(li.item)) continue;
    if (li.clearEnd - li.clearStart > 0.5) out.push({ kind: 'panel', li, x1: li.clearStart, x2: li.clearEnd });
  }
  layout.posts.forEach((lp, i) => {
    if (!lp.hidden && lp.widthMm > 0.5) out.push({ kind: 'post', x1: lp.x - lp.widthMm / 2, x2: lp.x + lp.widthMm / 2, postIndex: i });
  });
  return out.sort((a, b) => a.x1 - b.x1);
}

/**
 * Kote visine sa leve strane: najviše tri — jedna za sva platna ograde, jedna za sve stubove i jedna za sve kapije (ako ih ima),
 * jer kapije obično nisu iste visine kao platna. Svaka kota pokazuje najvišu meru svoje vrste, a klik menja visinu svih.
 */
export interface HeightGroup { key: string; kind: 'fence' | 'post' | 'gate'; heightMm: number; plinthMm: number; id: string; /** nivo poda (stepenište, terasa) */ floorMm: number; /** elementi te vrste nisu iste visine: kota pokazuje najvišu */ mixed: boolean }
export function heightGroups(project: Project, _preferId?: string | null): HeightGroup[] {
  const layout = computeLayout(project);
  const out: HeightGroup[] = [];
  for (const kind of ['fence', 'gate'] as const) {
    const all = layout.items.filter((li) => li.item.kind === kind);
    if (!all.length) continue;
    const top = all.reduce((a, li) => (li.item.heightMm > a.item.heightMm ? li : a), all[0]);
    out.push({ key: kind, kind, heightMm: top.item.heightMm, plinthMm: top.plinthMm, id: top.item.id, floorMm: Math.min(top.floorStart, top.floorEnd), mixed: new Set(all.map((li) => Math.round(li.item.heightMm))).size > 1 });
    if (kind === 'fence') {
      const posts = layout.posts.filter((lp) => !lp.hidden);
      if (posts.length) {
        const tallest = posts.reduce((a, lp) => (lp.topMm > a.topMm ? lp : a), posts[0]);
        out.push({ key: 'post', kind: 'post', heightMm: tallest.topMm, plinthMm: 0, id: tallest.post.id, floorMm: tallest.floorMm, mixed: new Set(posts.map((lp) => Math.round(lp.topMm))).size > 1 });
      }
    }
  }
  // redosled: ograda, stubovi, kapije (stubovi su dodati odmah posle ograde); projekat samo sa kapijama dobija i kotu stubova
  if (!out.some((g) => g.kind === 'post')) {
    const posts = layout.posts.filter((lp) => !lp.hidden);
    if (posts.length) {
      const tallest = posts.reduce((a, lp) => (lp.topMm > a.topMm ? lp : a), posts[0]);
      out.splice(0, 0, { key: 'post', kind: 'post', heightMm: tallest.topMm, plinthMm: 0, id: tallest.post.id, floorMm: tallest.floorMm, mixed: new Set(posts.map((lp) => Math.round(lp.topMm))).size > 1 });
    }
  }
  return out;
}

const HEIGHT_NAMES = { fence: 'Ograda', post: 'Stubovi', gate: 'Kapija' } as const;
const heightLabel = (g: HeightGroup) => `${HEIGHT_NAMES[g.kind]} H${g.mixed ? ' (najviša)' : ''}: ${fmtMm(g.heightMm)}`;
/** koliko piksela uspravni natpis kote visine viri iznad vrha kote (kad ne staje uz nju) */
const heightLabelOverflowPx = (g: HeightGroup, scale: number) => Math.max(0, heightLabel(g).length * DIM_CHAR_PX + 8 - g.heightMm * scale);

export function frontViewMetrics(project: Project, scale: number, showDimensions: boolean, compact = false, withAdd = false) {
  const layout = computeLayout(project);
  const firstW = layout.posts[0]?.widthMm ?? 0;
  const lastW = layout.posts[layout.posts.length - 1]?.widthMm ?? 0;
  const COMPACT_PAD = 140; // mm — minijature: ravnomeran prostor oko cele geometrije
  // levo ostaje po jedna traka za svaku kotu visine (ograda, kapija); gore više mesta ako neka kota po širini mora da stoji uspravno
  const heightLines = Math.max(1, heightGroups(project).length);
  const vertical = showDimensions && widthDims(layout).some((d) => dimMode(d.x2 - d.x1, scale, fmtMm(d.x2 - d.x1)) === 'vertical');
  const padL = compact ? COMPACT_PAD : (showDimensions ? 56 + 38 * heightLines : 40) / scale;
  const padR = compact ? COMPACT_PAD : (withAdd ? 120 : 40) / scale; // desno ostaje mesto za dugme +
  const overflow = showDimensions ? Math.max(0, ...heightGroups(project).map((g) => heightLabelOverflowPx(g, scale))) : 0;
  const padT = compact ? COMPACT_PAD : (showDimensions ? Math.max(vertical ? 116 : 74, 40 + overflow) : 40) / scale;
  const padB = compact ? COMPACT_PAD : (showDimensions ? 150 : 50) / scale; // dole: kote osa–osa, ukupna dužina i položaji stubova
  const groundY = compact ? Math.max(layout.maxTopMm, 400) : Math.max(layout.maxTopMm, 800);
  const vx = -firstW / 2 - padL;
  const vy = -padT;
  const vw = layout.occupiedMm + padL + padR;
  const vh = groundY + (compact ? 40 : GROUND_BAND) + padT + padB;
  return { layout, vx, vy, vw, vh, groundY, padT, padB, firstW, lastW, widthPx: vw * scale, heightPx: vh * scale };
}

/** Skala (px/mm) pri kojoj ceo crtež staje u zadatu površinu. */
export function fitScale(project: Project, containerW: number, containerH: number, showDimensions: boolean): number {
  const layout = computeLayout(project);
  const groundY = Math.max(layout.maxTopMm, 800);
  const padX = (showDimensions ? 56 + 38 * Math.max(1, heightGroups(project).length) : 40) + 120;
  const padY = (showDimensions ? 100 : 40) + (showDimensions ? 150 : 50);
  const sw = (containerW - padX - 8) / Math.max(layout.occupiedMm, 1000);
  const sh = (containerH - padY - 8) / (groundY + GROUND_BAND);
  return Math.min(0.5, Math.max(0.02, Math.min(sw, sh)));
}

function PostArt({ post, x, groundY, hex, caps, plinthMm = 0 }: { post: Post; x: number; groundY: number; hex: string; caps?: { top: PostCap; bottom: PostCap }; /** visina podnožja uz betonski stub: stub i podnožje se crtaju kao jedna livena celina (bez šava, ivica samo iznad podnožja) */ plinthMm?: number }) {
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
    // aluminijumski stub i stub kapije: ravna pravougaona površina u boji stuba, bez senčenja i ivice (uz tarabicu sa izabranim kapama)
    return (
      <g>
        <rect x={left} y={top} width={w} height={post.heightMm} fill={body} />
        {caps && <rect x={left} y={top} width={w} height={post.heightMm} fill="url(#shade-v)" />}
        {caps && <rect x={left} y={top} width={w} height={post.heightMm} fill="none" stroke="#000" strokeOpacity="0.38" strokeWidth="2" />}
        {caps && <CapArt kind={caps.top} x={x} w={w} base={top} hex={body} />}
        {caps && <CapArt kind={caps.bottom} x={x} w={w} base={groundY} hex={body} />}
      </g>
    );
  }
  const merged = isMasonry && post.type !== 'decorative' && plinthMm > 0;
  const bodyH = post.heightMm;
  return (
    <g>
      <rect x={left} y={top} width={w} height={bodyH} fill={body} />
      {/* stub na podnožju je ravan kao i podnožje (bez senčenja), da nema šava: jedna livena celina */}
      {!merged && <rect x={left} y={top} width={w} height={bodyH} fill="url(#shade-v)" />}
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
      {merged
        // ivica samo iznad podnožja (bez linije na spoju sa podnožjem): stub i podnožje deluju kao jedan komad
        ? <path d={`M${left} ${groundY - plinthMm} L${left} ${top} L${left + w} ${top} L${left + w} ${groundY - plinthMm}`} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="4" strokeLinejoin="miter" />
        : <rect x={left} y={top} width={w} height={post.heightMm} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="4" />}
    </g>
  );
}

/** Katanac na koti: klik zaključava ili otključava meru (širinu platna ili ukupnu dužinu). Crveni je zaključan. */
function LockIcon({ x, y, size, locked, kind, id, scale }: { x: number; y: number; size: number; locked: boolean; kind: 'item' | 'total'; id: string; scale: number }) {
  const s = size; const col = locked ? '#d71920' : '#94a3b8';
  return (
    <g transform={`translate(${x} ${y})`} data-lock={kind} data-id={id} data-locked={locked ? 'true' : 'false'} data-testid={kind === 'total' ? 'lock-total' : `lock-item-${id}`} pointerEvents="all" style={{ cursor: 'pointer' }}>
      <title>{locked ? 'Zaključano — klik otključava' : 'Klik zaključava meru'}</title>
      <rect x={-s * 0.9} y={-s * 1.0} width={s * 1.8} height={s * 2.0} fill="#fff" fillOpacity="0.001" />
      <path d={`M${-s * 0.38} ${-s * 0.05} V${-s * 0.35} a${s * 0.38} ${s * 0.38} 0 0 1 ${s * 0.76} 0 V${-s * 0.05}`} fill="none" stroke={col} strokeWidth={1.6 / scale} transform={locked ? undefined : `translate(${s * 0.42} 0)`} />
      <rect x={-s * 0.55} y={-s * 0.05} width={s * 1.1} height={s * 0.8} rx={s * 0.12} fill={col} />
    </g>
  );
}

function DimLine({ x1, x2, y, text, sub, fs, scale, edit, color = '#17212e' }: { x1: number; x2: number; y: number; text: string; sub?: string; fs: number; scale: number; edit?: { kind: 'width' | 'clear' | 'height' | 'total'; id: string }; color?: string }) {
  const t = 5 / scale;
  const mid = (x1 + x2) / 2;
  const mode = dimMode(x2 - x1, scale, text);
  const narrow = mode !== 'full';
  const label = narrow ? text.replace(' mm', '') : text;
  const vertical = mode === 'vertical';
  const hitW = vertical ? fs * 1.8 : 2 * Math.max(text.length * fs * 0.32, 14 / scale);
  const hitH = vertical ? label.length * fs * 0.62 + 12 / scale : fs * 2.3;
  return (
    <g stroke={color} strokeWidth={1.2 / scale} fill="none">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1 - t} y1={y + t} x2={x1 + t} y2={y - t} strokeWidth={1.8 / scale} />
      <line x1={x2 - t} y1={y + t} x2={x2 + t} y2={y - t} strokeWidth={1.8 / scale} />
      <line x1={x1} y1={y - 7 / scale} x2={x1} y2={y + 7 / scale} />
      <line x1={x2} y1={y - 7 / scale} x2={x2} y2={y + 7 / scale} />
      {vertical ? (
        <text transform={`translate(${mid + fs * 0.35} ${y - 6 / scale}) rotate(-90)`} textAnchor="start" fontSize={fs} fontWeight="600" fill={color} stroke="none">{label}</text>
      ) : (
        <text x={mid} y={y - 6 / scale} textAnchor="middle" fontSize={fs} fontWeight="600" fill={color} stroke="none" style={{ paintOrder: 'stroke' }}>{label}</text>
      )}
      {sub && !narrow && (
        <text x={mid} y={y + fs * 1.05 + 4 / scale} textAnchor="middle" fontSize={fs * 0.82} fill="#64748b" stroke="none">{sub}</text>
      )}
      {edit && (
        // klik na kotu otvara izmenu mere
        <rect x={mid - hitW / 2} y={vertical ? y - hitH : y - fs * 1.7} width={hitW} height={hitH} fill="#d71920" fillOpacity="0" stroke="none" pointerEvents="all" style={{ cursor: 'pointer' }} data-dim={edit.kind} data-id={edit.id} data-testid={`dim-${edit.kind}-${edit.id}`}>
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
function FrontViewBase({ project, scale, options, selectedId, selectedType, selectedIds, selectedPostIds, dimmedId, dropIndex, dropLabel, className, interactive, compact, greyBackdrop }: FrontViewProps) {
  const opts: FrontViewOptions = {
    showDimensions: options?.showDimensions ?? project.settings.showDimensions,
    showGrid: options?.showGrid ?? project.settings.showGrid,
    showLabels: options?.showLabels ?? project.settings.showLabels,
    showModular: options?.showModular ?? false,
    transparent: options?.transparent ?? false,
  };
  const m = frontViewMetrics(project, scale, opts.showDimensions && !compact, compact, Boolean(interactive) && project.items.length > 0);
  const { layout, groundY } = m;
  // svetla (bela) ograda se na beloj pozadini ne vidi: u editoru je pozadina siva
  const grey = greyBackdrop ?? (Boolean(interactive) && hasLightFence(project.items));
  const px = 1 / scale;
  const fs = 13 * px;
  const items = project.items;
  const gridStep = 500;
  const gx0 = Math.floor(m.vx / gridStep) * gridStep;
  const gx1 = m.vx + m.vw;
  const gy0 = m.vy;
  const gy1 = m.vy + m.vh;

  const selectedItemIndex = selectedType === 'item' ? items.findIndex((i) => i.id === selectedId) : -1;
  const hGroups = heightGroups(project, selectedItemIndex >= 0 ? items[selectedItemIndex].id : null);

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
      {!opts.transparent && <rect x={m.vx} y={m.vy} width={m.vw} height={m.vh} fill={grey ? '#b3bac3' : '#fff'} />}
      {opts.showGrid && !opts.transparent && (
        <g stroke={grey ? '#c3c9d1' : '#e8edf3'} strokeWidth={1 * px}>
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
          <rect x={m.vx} y={groundY} width={m.vw} height={GROUND_BAND} fill={grey ? '#9aa3ad' : '#eef1f5'} />
          <rect x={m.vx} y={groundY} width={m.vw} height={GROUND_BAND} fill="url(#ground-hatch)" opacity="0.5" />
          <line x1={m.vx} y1={groundY} x2={m.vx + m.vw} y2={groundY} stroke="#17212e" strokeWidth={2 * px} />
        </>
      )}

      {/* postolje ispod polja ograde */}
      {layout.items.map((li) =>
        li.item.kind === 'fence' && li.floorStart === li.floorEnd ? (
          <rect key={`pl-${li.item.id}`} x={li.clearStart} y={groundY - li.floorStart - 6} width={li.clearWidth} height={6} fill="#9aa3ad" />
        ) : null,
      )}

      {/* nivoi: terasa na višem nivou (ploča do tla) i stepenice ispod stepeništa */}
      {layout.hasLevels && layout.items.map((li) => {
        if (isSpacer(li.item)) return null;
        const wl = (layout.posts[li.index]?.widthMm ?? 0) / 2;
        const wr = (layout.posts[li.index + 1]?.widthMm ?? 0) / 2;
        const fill = grey ? '#d9dde2' : '#e3e7ec';
        if (li.floorStart === li.floorEnd) {
          if (li.floorStart <= 0) return null;
          return <rect key={`lv-${li.item.id}`} data-testid={`level-${li.index}`} x={li.axisStart - wl} y={groundY - li.floorStart} width={li.axisEnd - li.axisStart + wl + wr} height={li.floorStart} fill={fill} stroke="#8b939c" strokeWidth={1.2 * px} />;
        }
        // stepenište: stepenici se crtaju jednom za ceo niz polja (ravnomerni po celoj dužini, nezavisno od stubova)
        const grp = stairGroupAt(items, li.index);
        if (!grp || grp.from !== li.index) return null;
        const a = layout.items[grp.from];
        const b = layout.items[grp.to];
        const run = b.axisEnd - a.axisStart;
        const pts = stairProfile(a.axisStart, b.axisEnd, a.floorStart, b.floorEnd, grp.steps);
        const poly = [...pts.map(([x, f]) => `${x},${groundY - f}`), `${b.axisEnd},${groundY}`, `${a.axisStart},${groundY}`].join(' ');
        const ang = (-Math.atan2(b.floorEnd - a.floorStart, run) * 180) / Math.PI;
        const mx = (a.axisStart + b.axisEnd) / 2;
        const my = groundY - (a.floorStart + b.floorEnd) / 2;
        return (
          <g key={`lv-${li.item.id}`} data-testid={`stair-steps-${li.index}`} pointerEvents="none">
            <polygon points={poly} fill={fill} stroke="#8b939c" strokeWidth={1.2 * px} strokeLinejoin="round" />
            {!compact && <text transform={`translate(${mx} ${my}) rotate(${ang})`} y={26 * px} textAnchor="middle" fontSize={fs * 0.9} fontWeight="600" fill="#334155">{stairGroupSummary(grp)}</text>}
          </g>
        );
      })}

      {/* elementi */}
      {layout.items.map((li) => {
        if (isSpacer(li.item)) return null; // razmaknik između dva stuba kapije se ne crta
        const it = li.item;
        const x = li.clearStart;
        const w = li.clearWidth;
        const floorY = groundY - li.floorStart;
        const y = floorY - li.plinthMm - it.heightMm;
        const dim = dimmedId === it.id;
        // stepenište: crtež polja se iskosi (vertikale ostaju vertikalne, rukohvat i prečke prate nagib)
        const run = li.axisEnd - li.axisStart;
        const t = run > 0 ? (li.floorEnd - li.floorStart) / run : 0;
        const shear = t !== 0 ? `matrix(1 ${-t} 0 1 0 ${t * li.axisStart})` : undefined;
        return (
          <g key={it.id} opacity={dim ? 0.3 : 1} data-item-art={it.id} transform={shear} data-stair={t !== 0 ? 'true' : undefined}>
            {li.plinthMm > 0 && (() => {
              // gornja tamna traka podnožja ne ide ispod betonskog stuba koji stoji na njemu: stub i podnožje su jedna celina
              const masonryAt = (k: number) => { const lp = layout.posts[k]; return !!lp && !lp.hidden && (lp.post.type === 'concrete' || lp.post.type === 'concrete_plinth'); };
              const bx0 = masonryAt(li.index) ? Math.max(li.plinthX0, li.clearStart) : li.plinthX0;
              const bx1 = masonryAt(li.index + 1) ? Math.min(li.plinthX1, li.clearEnd) : li.plinthX1;
              return (
                <g>
                  <rect x={li.plinthX0} y={floorY - li.plinthMm} width={li.plinthX1 - li.plinthX0} height={li.plinthMm} fill="#c9ccd0" />
                  {/* uz betonski stub podnožje je ravno (bez svog senčenja): senčenje stuba ide kroz podnožje, pa nema šava na spoju */}
                  {!masonryAt(li.index) && !masonryAt(li.index + 1) && <rect x={li.plinthX0} y={floorY - li.plinthMm} width={li.plinthX1 - li.plinthX0} height={li.plinthMm} fill="url(#shade-v)" />}
                  {bx1 > bx0 && <rect x={bx0} y={floorY - li.plinthMm} width={bx1 - bx0} height={14} fill="#8b9097" />}
                </g>
              );
            })()}
            {it.kind === 'fence' && !isRl10Model(it.modelId) && (
              <InfillArt modelId={it.modelId} x={x} y={y} w={w} h={it.heightMm} frame={it.params.frameMm} barSize={it.params.barSizeMm} gap={it.params.gapMm} lift={it.params.liftMm} arch={it.params.archMm} hex={colorHex(it.color)} colorKey={it.color} skipLeftPost={leftPostShared(project.items, li.index) || isStairPost(project.items, li.index)} skipRightPost={isStairPost(project.items, li.index + 1)} sloped={li.floorStart !== li.floorEnd} axis={{ x: li.axisStart, w: li.axisEnd - li.axisStart }} rodCount={rodCountFor(it.modelId, it.params, it.heightMm) ?? undefined} ram={ramInsets(it.modelId, it.params)} uid={it.id} />
            )}
            {it.kind === 'gate' && <GateArt gate={it} x={x} y={y} w={w} h={it.heightMm} hex={colorHex(it.color)} px={px} realistic={opts.transparent} />}
            {it.kind === 'opening' && isCorner(it) && (() => {
              // ugaoni spoj: prečke i rukohvat se savijaju između dva stuba (u razvijenom prikazu — kratka cev sa oznakom ugla)
              const info = cornerInfo(project, li.index);
              const col = info ? colorHex(info.color) : '#64748b';
              const cx = (li.axisStart + li.axisEnd) / 2;
              return (
                <g data-testid={`corner-art-${li.index}`}>
                  {info && <rect x={li.axisStart} y={floorY - info.heightMm} width={li.axisEnd - li.axisStart} height={info.railMm} fill={col} />}
                  {info?.rodHeightsMm.map((rh) => <rect key={rh} x={li.axisStart} y={floorY - rh - info.rodDiaMm / 2} width={li.axisEnd - li.axisStart} height={info.rodDiaMm} fill={col} />)}
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
      {layout.posts.filter((lp) => !lp.hidden).map((lp) => (
        <g key={lp.post.id}>
          {(lp.post.turnDeg ?? 0) !== 0 && lp.role !== 'end' && (
            <g data-testid={`turn-mark-${lp.index}`} pointerEvents="none">
              <rect x={lp.x - 150} y={groundY - lp.floorMm - lp.topMm - 200} width={300} height={130} rx={26} fill="#0ea5e9" />
              <text x={lp.x} y={groundY - lp.floorMm - lp.topMm - 200 + 90} textAnchor="middle" fontSize={78} fontWeight="700" fill="#fff">{lp.post.turnDeg! > 0 ? '↱' : '↰'} {Math.abs(lp.post.turnDeg!)}°</text>
            </g>
          )}
          {isRl10Post(project.items, lp.index) && (() => {
            const rl = rl10ItemAt(project.items, lp.index);
            if (!rl || rl.kind !== 'fence') return null;
            const flat = { tilt: 0, joint: null, adjustable: false };
            const foot = groundY - lp.floorMm - lp.baseMm;
            const line = groundY - lp.lineMm - lp.levelMm;
            return (
              <>
                <Rl10PostArt x={lp.x + lp.shiftMm} footY={foot} lineY={line} heightMm={rl.heightMm} params={rl.params} info={lp.auxShiftMm !== null ? flat : rl10PostInfo(project.items, layout, lp.index)} />
                {/* ugao u osnovi: drugi stub je na dolazećoj ogradi */}
                {lp.auxShiftMm !== null && <Rl10PostArt x={lp.x + lp.auxShiftMm} footY={foot} lineY={line} heightMm={rl.heightMm} params={rl.params} info={flat} />}
              </>
            );
          })()}
          {!isRl10Post(project.items, lp.index) && (!postDrawnByItems(project.items, lp.index) || isStairPost(project.items, lp.index)) && <PostArt post={{ ...lp.post, heightMm: lp.lengthMm }} x={lp.x} groundY={groundY - lp.floorMm - lp.baseMm} hex={colorHex(lp.post.color)} plinthMm={lp.levelMm} caps={isTarabicaPost(project.items, lp.post, lp.index) ? postCaps(lp.post) : undefined} />}
          {interactive && <rect
            x={lp.x + lp.shiftMm - lp.post.widthMm / 2 - 10 * px} y={groundY - lp.floorMm - lp.topMm - 70} width={lp.post.widthMm + 20 * px} height={lp.lengthMm + 70}
            fill="transparent" data-hit="post" data-id={lp.post.id} style={{ cursor: 'pointer' }}
          />}
        </g>
      ))}

      {/* RL10: rukohvat i prečke su ispred stubova (prečke prolaze kroz nosače), pa se crtaju posle stubova */}
      {layout.items.map((li) => {
        const it = li.item;
        if (it.kind !== 'fence' || !isRl10Model(it.modelId)) return null;
        const run = li.axisEnd - li.axisStart;
        const t = run > 0 ? (li.floorEnd - li.floorStart) / run : 0;
        return (
          <g key={`rl-${it.id}`} transform={t !== 0 ? `matrix(1 ${-t} 0 1 0 ${t * li.axisStart})` : undefined} opacity={dimmedId === it.id ? 0.3 : 1} pointerEvents="none">
            <Rl10FieldArt x0={li.axisStart} x1={li.axisEnd} floorY={groundY - li.floorStart - li.plinthMm} heightMm={it.heightMm} params={it.params}
              left={rl10Ends(project.items, layout, li.index, project.posts).left} right={rl10Ends(project.items, layout, li.index, project.posts).right} tan={rl10Tan(li)} />
          </g>
        );
      })}

      {/* RL10: zglobovi rukohvata i prečki na spoju ravnog dela i stepeništa stoje sami (stub je pomeren ka ravnom delu) */}
      {layout.posts.filter((lp) => !lp.hidden && isRl10Post(project.items, lp.index)).map((lp) => {
        const info = rl10PostInfo(project.items, layout, lp.index);
        const rl = rl10ItemAt(project.items, lp.index);
        if (!info.joint || !rl || rl.kind !== 'fence') return null;
        return <g key={`rj-${lp.post.id}`} pointerEvents="none"><Rl10JointArt x={lp.x} lineY={groundY - lp.lineMm - lp.levelMm} heightMm={rl.heightMm} params={rl.params} joint={info.joint} /></g>;
      })}

      {/* oznake elemenata */}
      {opts.showLabels && layout.items.map((li) => {
        if (isSpacer(li.item)) return null;
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
      {selectedIds && selectedIds.length > 1 && layout.items.filter((l) => selectedIds.includes(l.item.id)).map((li) => {
        const y = groundY - Math.max(li.floorStart, li.floorEnd) - li.item.heightMm - li.plinthMm;
        return (
          <rect key={`ms-${li.item.id}`} data-testid="multi-outline" data-id={li.item.id} x={li.clearStart} y={y} width={Math.max(1, li.clearEnd - li.clearStart)} height={li.item.heightMm + li.plinthMm + Math.abs(li.floorEnd - li.floorStart)} rx={0} fill="#d71920" fillOpacity="0.1" stroke="#d71920" strokeWidth={3 * px} pointerEvents="none" />
        );
      })}
      {selectedType === 'item' && selectedId && !(selectedIds && selectedIds.length > 1) && (() => {
        const li = layout.items.find((l) => l.item.id === selectedId);
        if (!li) return null;
        const y = groundY - Math.max(li.floorStart, li.floorEnd) - li.item.heightMm - li.plinthMm;
        return (
          <rect data-testid="selection-outline" x={li.clearStart} y={y} width={Math.max(1, li.clearEnd - li.clearStart)} height={li.item.heightMm + li.plinthMm + Math.abs(li.floorEnd - li.floorStart)} rx={0} fill="#d71920" fillOpacity="0.06" stroke="#d71920" strokeWidth={3 * px} pointerEvents="none" />
        );
      })()}
      {selectedType === 'post' && selectedId && (() => {
        const lp = layout.posts.find((l) => l.post.id === selectedId);
        if (!lp) return null;
        const top = groundY - lp.floorMm - lp.topMm;
        return (
          <rect data-testid="selection-outline" x={lp.x - lp.post.widthMm / 2} y={top} width={lp.post.widthMm} height={lp.lengthMm} rx={0} fill="#d71920" fillOpacity="0.08" stroke="#d71920" strokeWidth={3 * px} pointerEvents="none" />
        );
      })()}

      {selectedPostIds && selectedPostIds.length > 1 && layout.posts.filter((l) => selectedPostIds.includes(l.post.id)).map((lp) => (
        <rect key={`mp-${lp.post.id}`} data-testid="multi-post-outline" x={lp.x - lp.post.widthMm / 2} y={groundY - lp.floorMm - lp.topMm} width={lp.post.widthMm} height={lp.lengthMm} rx={0} fill="#d71920" fillOpacity="0.1" stroke="#d71920" strokeWidth={3 * px} pointerEvents="none" />
      ))}

      {/* kote */}
      {opts.showDimensions && items.length > 0 && (
        <g pointerEvents="none">
          {/* kote po širini: lanac stvarnih mera na jednoj liniji iznad najvišeg dela — posebno svako platno (svetla širina između
              stubova) i posebno svaki stubić (plavo), sa pomoćnim linijama do ivica */}
          {(() => {
            const dy = groundY - layout.maxTopMm - 30 * px;
            return widthDims(layout).map((d) => {
              if (d.kind === 'post') {
                const lp = layout.posts[d.postIndex!];
                const top = groundY - lp.floorMm - lp.topMm - 4 * px;
                return (
                  <g key={`dp-${lp.post.id}`} data-testid="dim-post">
                    <line x1={d.x1} y1={dy} x2={d.x1} y2={top} stroke="#93c5fd" strokeWidth={1 * px} strokeDasharray={`${3 * px} ${3 * px}`} />
                    <line x1={d.x2} y1={dy} x2={d.x2} y2={top} stroke="#93c5fd" strokeWidth={1 * px} strokeDasharray={`${3 * px} ${3 * px}`} />
                    <DimLine x1={d.x1} x2={d.x2} y={dy} text={fmtMm(d.x2 - d.x1)} fs={fs * 0.9} scale={scale} color="#1d4ed8" />
                  </g>
                );
              }
              const li = d.li!;
              // kapija sa merama: kota je širina samog krila (svetli otvor − zazori), posebno za svako krilo; menja se u „Mere kapije“
              const boxes = li.item.kind === 'gate' ? swingLeafBoxes(li.item, li.clearWidth) : null;
              if (boxes) {
                return (
                  <g key={`d-${li.item.id}`} data-testid="dim-panel">
                    {boxes.map((b, n) => <DimLine key={n} x1={d.x1 + b.x} x2={d.x1 + b.x + b.w} y={dy} text={fmtMm(b.w)} sub="krilo" fs={fs} scale={scale} />)}
                  </g>
                );
              }
              return (
                <g key={`d-${li.item.id}`} data-testid="dim-panel">
                  <DimLine x1={d.x1} x2={d.x2} y={dy} text={fmtMm(d.x2 - d.x1)} sub={li.item.kind === 'opening' ? 'otvor' : 'platno'} fs={fs} scale={scale} edit={interactive ? { kind: 'clear', id: li.item.id } : undefined} />
                  {interactive && (li.item.kind === 'fence' || (li.item.kind === 'opening' && li.item.bendDeg === undefined)) && (
                    <LockIcon x={(d.x1 + d.x2) / 2 + fs * 2.6} y={dy + fs * 0.75} size={fs * 0.62} locked={Boolean((li.item as { widthLocked?: boolean }).widthLocked)} kind="item" id={li.item.id} scale={scale} />
                  )}
                </g>
              );
            });
          })()}

          {/* kote osa–osa: razmak od sredine jednog stuba do sredine sledećeg, za svako platno (kapije i otvori su isto platna u nizu) */}
          <g data-testid="dim-axis-chain">
            {layout.items.filter((li) => !isSpacer(li.item)).map((li) => {
              const a = li.axisStart; const b = li.axisEnd;
              return (
                <g key={`ax-${li.item.id}`} data-testid="dim-axis">
                  <line x1={a} y1={groundY + 4 * px} x2={a} y2={groundY + 52 * px} stroke="#94a3b8" strokeWidth={1 * px} strokeDasharray={`${3 * px} ${3 * px}`} />
                  <line x1={b} y1={groundY + 4 * px} x2={b} y2={groundY + 52 * px} stroke="#94a3b8" strokeWidth={1 * px} strokeDasharray={`${3 * px} ${3 * px}`} />
                  <DimLine x1={a} x2={b} y={groundY + 46 * px} text={fmtMm(b - a)} sub="osa–osa" fs={fs} scale={scale} color="#0f766e" />
                </g>
              );
            })}
          </g>

          {/* pozicije stubova */}
          {opts.showModular && layout.posts.map((lp, i) => (
            <g key={`pp-${lp.post.id}`}>
              <line x1={lp.x} y1={groundY + 0} x2={lp.x} y2={groundY + 124 * px} stroke="#94a3b8" strokeWidth={1 * px} />
              <text x={lp.x} y={groundY + 140 * px} textAnchor="middle" fontSize={10 * px} fill="#64748b">
                {`S${i + 1}·${lp.x}`}
              </text>
            </g>
          ))}

          {/* ukupna dužina */}
          <DimLine x1={layout.posts[0].x - layout.posts[0].widthMm / 2} x2={layout.posts[layout.posts.length - 1].x + layout.posts[layout.posts.length - 1].widthMm / 2} y={groundY + 100 * px} text={`${fmtMm(layout.occupiedMm)} (ukupna dužina)`} fs={fs * 1.1} scale={scale} edit={interactive ? { kind: 'total', id: items[0].id } : undefined} />
          {interactive && (() => {
            const x1 = layout.posts[0].x - layout.posts[0].widthMm / 2; const x2 = layout.posts[layout.posts.length - 1].x + layout.posts[layout.posts.length - 1].widthMm / 2;
            const label = `${fmtMm(layout.occupiedMm)} (ukupna dužina)`;
            return <LockIcon x={(x1 + x2) / 2 + (label.length * fs * 1.1 * 0.32) + fs * 1.4} y={groundY + 100 * px - fs * 0.5} size={fs * 0.7} locked={project.settings.totalMode === 'fixed'} kind="total" id={items[0].id} scale={scale} />;
          })()}

          {/* visina */}
          {/* visine: jedna kota za ogradu (od vrha podnožja do vrha ograde) i jedna za kapiju (od tla); podnožje ispod ograde ima svoju meru */}
          {hGroups.map((g, gi) => {
            const lx = -m.firstW / 2 - (40 + 38 * gi) * px;
            const baseY = groundY - g.floorMm;
            const plinthY = baseY - g.plinthMm;
            const topY = plinthY - g.heightMm;
            const tick = (y: number) => <line key={y} x1={lx - 6 * px} y1={y + 6 * px} x2={lx + 6 * px} y2={y - 6 * px} stroke="#17212e" strokeWidth={1.8 * px} />;
            const tx = lx - 8 * px;
            const midY = (topY + plinthY) / 2;
            return (
              <g key={g.key}>
                <line x1={lx} y1={topY} x2={lx} y2={baseY} stroke="#17212e" strokeWidth={1.2 * px} />
                <line x1={lx} y1={topY} x2={-m.firstW / 2 - 4 * px} y2={topY} stroke="#94a3b8" strokeWidth={1 * px} strokeDasharray={`${3 * px} ${3 * px}`} />
                {tick(topY)}
                {tick(baseY)}
                {g.plinthMm > 0 && tick(plinthY)}
                {heightLabelOverflowPx(g, scale) > 0
                  ? <text transform={`translate(${tx} ${plinthY - 4 * px}) rotate(-90)`} textAnchor="start" fontSize={fs} fontWeight="600" fill="#17212e">{heightLabel(g)}</text>
                  : <text transform={`translate(${tx} ${midY}) rotate(-90)`} textAnchor="middle" fontSize={fs} fontWeight="600" fill="#17212e">{heightLabel(g)}</text>}
                {g.plinthMm * scale >= 26 && (
                  <text transform={`translate(${tx} ${(plinthY + baseY) / 2}) rotate(-90)`} textAnchor="middle" fontSize={fs * 0.85} fill="#64748b">{`${fmtMm(g.plinthMm)}`}</text>
                )}
                {interactive && (
                  <rect x={tx - fs * 1.1} y={midY - 60 * px} width={fs * 1.7} height={120 * px} fill="#d71920" fillOpacity="0" pointerEvents="all" style={{ cursor: 'pointer' }} data-dim={`height-${g.kind}`} data-id={g.id} data-testid={`dim-height-${g.kind}`}>
                    <title>{g.kind === 'post' ? 'Kliknite da promenite visinu svih stubova' : g.kind === 'gate' ? 'Kliknite da promenite visinu svih kapija' : 'Kliknite da promenite visinu svih platna'}</title>
                  </rect>
                )}
              </g>
            );
          })}
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
          <rect x={layout.posts[dropIndex].x - 5 * px} y={groundY - layout.maxTopMm - 40} width={10 * px} height={layout.maxTopMm + 40} fill="#d71920" />
          <polygon points={`${layout.posts[dropIndex].x - 14 * px},${groundY - layout.maxTopMm - 40} ${layout.posts[dropIndex].x + 14 * px},${groundY - layout.maxHeightMm - 40} ${layout.posts[dropIndex].x},${groundY - layout.maxHeightMm - 40 + 18 * px}`} fill="#d71920" />
          <rect x={layout.posts[dropIndex].x - 52 * px} y={groundY - layout.maxTopMm - 40 - 26 * px} width={104 * px} height={22 * px} rx={6 * px} fill="#d71920" />
          <text x={layout.posts[dropIndex].x} y={groundY - layout.maxTopMm - 40 - 10.5 * px} textAnchor="middle" fontSize={11.5 * px} fontWeight="700" fill="#fff">{dropLabel ?? 'Ubaci ovde'}</text>
        </g>
      )}
    </svg>
  );
}

export const FrontView = memo(FrontViewBase);
