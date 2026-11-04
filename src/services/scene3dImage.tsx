import { createRoot, extend } from '@react-three/fiber';
import { Suspense, createRef } from 'react';
import * as THREE from 'three';
import { computeLayout } from '../domain/geometry/layout';
import { computePlan } from '../domain/geometry/plan';
import type { Project } from '../domain/models/types';
import { SceneContent, presetPose, webglAvailable, type SceneApi } from '../components/editor/three/Scene3D';

// van komponente <Canvas> klase three.js se registruju ručno
extend(THREE as unknown as Parameters<typeof extend>[0]);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 3D prikaz projekta (izometrija, uklopljen u kadar) kao JPEG data URL, iscrtan van ekrana: ne zavisi od toga da li je 3D prikaz
 * otvoren u uređivaču i ne dira kameru uređivača. Vraća null ako uređaj ne podržava WebGL ili crtanje ne uspe.
 */
export async function scene3dJpeg(project: Project, width = 1500, height = 720): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!webglAvailable() || project.items.length === 0) return null;
  const canvas = document.createElement('canvas');
  const root = createRoot(canvas);
  try {
    root.configure({
      gl: { antialias: true, preserveDrawingBuffer: true },
      shadows: true,
      dpr: 1,
      frameloop: 'never',
      size: { width, height, top: 0, left: 0 },
      camera: { fov: 45, near: 0.05, far: 600, position: [6, 5, 9] },
    });
    const layout = computeLayout(project);
    const store = await root.render(
      <Suspense fallback={null}>
        <SceneContent project={project} layout={layout} projectId={project.id} selectionId={null} selectionType={null} hoverId={null} dropIndex={null} draggedId={null}
          editMode={false} controlsEnabled={false} apiRef={createRef<SceneApi | null>() as React.MutableRefObject<SceneApi | null>} onContextLost={() => undefined} shadows still />
      </Suspense>,
    );
    const state = store.getState();
    // sačekaj da se učitaju modeli i teksture: broj objekata u sceni se ustali
    let last = -1;
    let stable = 0;
    for (let i = 0; i < 60 && stable < 4; i++) {
      await sleep(150);
      let n = 0;
      state.scene.traverse(() => { n += 1; });
      stable = n === last && n > 30 ? stable + 1 : 0;
      last = n;
    }
    // izometrija: isti kadar kao u uređivaču (uklopljen u sliku)
    const pose = presetPose('iso', layout, width / height, 45, computePlan(project), 0.95);
    state.camera.position.copy(pose.position);
    state.camera.lookAt(pose.target);
    state.camera.updateMatrixWorld();
    state.gl.render(state.scene, state.camera);
    state.gl.render(state.scene, state.camera);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    return { dataUrl, width, height };
  } catch {
    return null;
  } finally {
    try { root.unmount(); } catch { /* već uklonjeno */ }
  }
}
