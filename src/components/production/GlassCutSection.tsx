import { glassAnglesLabel, glassEdgesLabel, glassMm, type GlassCutPiece } from '../../domain/pricing/glassCutting';
import { glassCutSvg } from '../../services/glassCutSvg';

export function GlassCutSection({ pieces }: { pieces: GlassCutPiece[] }) {
  if (!pieces.length) return null;
  return <section className="mt-5" data-testid="glass-cut-list">
    <h3 className="font-bold text-[16px] mb-2">Staklo — mere za sečenje</h3>
    <p className="text-xs text-muted mb-3">Svaka tabla je prikazana gledano spreda. Oznake A–D su unutrašnji uglovi, a AB–DA dužine stvarnih ivica.</p>
    <div className="grid gap-3 xl:grid-cols-2">{pieces.map((p) => <article key={p.id} className="rounded-xl border border-line p-3" data-testid="glass-cut-piece">
      <h4 className="font-semibold">{p.id} · Pozicija {p.pos} · 1 kom</h4>
      <p className="text-xs text-muted">{p.sku} · {p.material} · debljina {glassMm(p.thicknessMm, 2)} mm</p>
      <img className="w-full max-w-[340px] mx-auto" alt={`Skica stakla ${p.id}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(glassCutSvg(p))}`} />
      <p className="text-[12px]" data-testid="glass-cut-edges">{glassEdgesLabel(p)}</p>
      <p className="text-[12px] mt-1" data-testid="glass-cut-angles">{glassAnglesLabel(p)}</p>
      <p className="text-xs text-muted mt-1">Nagib {glassMm(p.slopeDeg)}° · pravougaonik za iskroj {glassMm(p.horizontalMm)} × {glassMm(p.heightMm)} mm</p>
    </article>)}</div>
  </section>;
}
