import { useGLTF } from '@react-three/drei';
import { Component, useMemo, type ReactNode } from 'react';
import { gateModelUrl } from '../../../assets/gates3d';
import { mmToScene as s } from '../../../domain/geometry/gates';
import { colorHex, DEKOR_COLOR, FENCE_MODELS, INOX_COLOR, normalizeColorKey, panelArt, panelPeriodMm, panelTiles } from '../../../domain/models/catalog';
import type { FenceModelId, GateType } from '../../../domain/models/types';
import { adaptLeaf, LEAF_CLEARANCE, type LeafKind } from './gateGlb';

export interface GlbLeafProps {
  modelId: FenceModelId;
  gateType: GateType;
  /** pravac u kome se krilo prostire od šarke (+1 ka većem x) */
  extendDir: 1 | -1;
  /** za kliznu kapiju: strana otvaranja (+1 desno) */
  slideDir: 1 | -1;
  widthMm: number;
  heightMm: number;
  color: string;
}

/** Osnovna širina polja ograde: po njoj se meri razmak vertikalnih letvica koji kapija preuzima. */
const FENCE_REF_WIDTH_MM = 2000;

function leafKind(gateType: GateType, extendDir: 1 | -1): LeafKind {
  if (gateType === 'sliding') return 'klizno';
  if (gateType === 'double') return extendDir === 1 ? 'levo' : 'desno';
  return 'levo';
}

/** Krilo kapije iz GLB modela (okvir, ispuna i okovi), prilagođeno merama i boji. Centrirano po x, od tla do vrha. */
export function GlbLeaf({ modelId, gateType, extendDir, slideDir, widthMm, heightMm, color }: GlbLeafProps) {
  const url = gateModelUrl(FENCE_MODELS[modelId].image, gateType);
  if (!url) throw new Error(`Nema 3D modela kapije za ${modelId}`);
  const gltf = useGLTF(url, false, false);
  const kind = leafKind(gateType, extendDir);
  const sliding = gateType === 'sliding';
  const group = useMemo(
    () => {
      // razmak letvica prati ogradu istog modela: ista slika polja → isti razmak (visina; kod vertikalnih širina po ponavljanju)
      const art = panelArt(modelId, color);
      const pitch = art?.pitchFrac
        ? art.vertical
          ? { axis: 'x' as const, value: (art.pitchFrac * s(FENCE_REF_WIDTH_MM)) / panelTiles(art, FENCE_REF_WIDTH_MM, heightMm) }
          : { axis: 'y' as const, value: s(panelPeriodMm(modelId) ?? art.pitchFrac * heightMm) }
        : undefined;
      const g = adaptLeaf(gltf.scene, kind, {
        pitch,
        width: s(widthMm),
        height: s(heightMm),
        clearance: sliding ? LEAF_CLEARANCE.slide : LEAF_CLEARANCE.swing,
        hex: panelArt(modelId, color)?.bodyHex ?? colorHex(color),
        keepDecor: normalizeColorKey(color) === DEKOR_COLOR,
        keepInox: normalizeColorKey(color) === INOX_COLOR,
      });
      if (!g) throw new Error(`Krilo nije pronađeno u 3D modelu (${url})`);
      return g;
    },
    [gltf, kind, widthMm, heightMm, color, sliding, url, modelId],
  );
  // GLB krila krilnih kapija imaju šarku levo (osim "desnog" krila), klizno se otvara udesno: ogledalo kad treba obrnuto
  const mirror = sliding ? slideDir === -1 : kind === 'levo' && extendDir === -1;
  return <primitive object={group} scale={[mirror ? -1 : 1, 1, 1]} />;
}

/** Ako učitavanje ili obrada GLB-a ne uspe, prikaži rezervni (parametarski) prikaz umesto rušenja scene. */
export class GlbBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
