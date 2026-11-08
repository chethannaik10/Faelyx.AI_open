// Assembles the Sketch & 2D handler hooks (each built from the core state
// plus the ones before it) into one object the views render from.
import type { SketchCore } from '../useSketchCore';
import { useViewAndAnnotations } from './viewAndAnnotations';
import { useSnapAndSelect } from './snapAndSelect';
import { useDrawingTools } from './drawingTools';
import { useTrimAndChamfer } from './trimAndChamfer';
import { useModifyTools } from './modifyTools';
import { useCanvasClick } from './canvasClick';
import { useConstraintsAndInspector } from './constraintsAndInspector';
import { useShortcutsAndClipboard } from './shortcutsAndClipboard';
import { useImageImport } from './imageImport';

export function useSketchHandlers(core: SketchCore) {
  const p1 = useViewAndAnnotations(core, {});
  const p2 = useSnapAndSelect(core, { ...p1 });
  const p3 = useDrawingTools(core, { ...p1, ...p2 });
  const p4 = useTrimAndChamfer(core, { ...p1, ...p2, ...p3 });
  const pm = useModifyTools(core, { ...p1, ...p2, ...p3, ...p4 });
  const p5 = useCanvasClick(core, { ...p1, ...p2, ...p3, ...p4, ...pm });
  const p6 = useConstraintsAndInspector(core, { ...p1, ...p2, ...p3, ...p4, ...p5 });
  const p7 = useShortcutsAndClipboard(core, p1);
  const p8 = useImageImport(core, p1);
  return { ...core, ...p1, ...p2, ...p3, ...p4, ...pm, ...p5, ...p6, ...p7, ...p8 };
}

export type SketchUI = ReturnType<typeof useSketchHandlers>;
