// The SKETCH TOOLBOX panel: entity tools with their variant menus, measure, constraints and AI import.
import {
  ChevronDown, Search, Sparkles } from 'lucide-react';
import { entityTools, measureTools, constraintModeTools } from '../tools';
import { SketchToolButton } from '../ToolButton';
import { PanelHeaderLite } from '../PlanePicker';

// `hidden`: App.tsx keeps this component mounted at all times now (instead
// of unmounting it whenever you switch to another workspace tab), so the
// sketch geometry — and the `ref` that 3D Design's "Apply changes" reads
// via getExtrudeProfile() — survives the tab switch. Previously the ref
// went null the moment you left Sketch & 2D, so Extrude/Pocket could never
// actually see what you'd drawn; this prop just hides the canvas visually
// while it keeps running underneath.
// `snapEnabled`/`showGrid`: driven by the Snap/Grid toggles in App.tsx's
// bottom statusbar. Both default to on so the canvas behaves the same as
// before if a caller doesn't pass them at all.
// The six `appearance*` props below are driven by the new "Style" popover
// beside those same Grid/Snap toggles (see App.tsx) — each is `null` until
// the user actually touches that control, so a sketch that's never opened
// the popover renders with exactly the original hardcoded colors/widths
// (the CSS var()s this feeds all fall back to those same originals — see
// the --sketch-* custom properties below and their uses in index.css).
import type { SketchUI } from '../handlers';

export function ToolboxPanel({ core }: { core: SketchUI }) {
  const {
    setToolboxPick, finishProfile, flyoutOpen, profileChain, resetToolState, setCircleDefOpen, setFlyoutOpen, setImageDialogOpen, setTool, tool,
  } = core;
  return (
    <aside className="toolbox-panel">
      <PanelHeaderLite eyebrow="COMMANDS" title="SKETCH TOOLBOX" action={<Search size={13} />} />
      <div className="toolbox-scroll">
        <section className="tool-section">
          <div className="section-toggle"><span><ChevronDown size={12} />SKETCH ENTITIES</span><small>{entityTools.length}</small></div>
          <div className="tool-list" onMouseLeave={() => setFlyoutOpen(null)}>
            {entityTools.map((t) => {
              const groupActive = t.flyout ? [t.mode, ...t.flyout.map((v) => v.mode)].includes(tool) : tool === t.mode;
              return (
                <div className="tool-item-wrap" key={t.name}>
                  <SketchToolButton icon={t.icon} label={t.name} hint={t.hint} active={groupActive}
                    onClick={() => { setTool(t.mode); resetToolState(); setToolboxPick(null); setFlyoutOpen(null); }} />
                  {t.flyout && (
                    <button type="button" className={`tool-flyout-toggle ${flyoutOpen === t.name ? 'open' : ''}`}
                      onClick={(evt) => { evt.stopPropagation(); setFlyoutOpen((cur) => (cur === t.name ? null : t.name)); }}
                      aria-label={`${t.name} variants`}>
                      <ChevronDown size={10} />
                    </button>
                  )}
                  {t.flyout && flyoutOpen === t.name && (
                    <div className="tool-flyout">
                      {t.flyout.map((v) => (
                        <button key={v.mode} type="button" className={`tool-flyout-item ${tool === v.mode ? 'selected' : ''}`}
                          onClick={() => {
                            // Choosing General Profile again ends an open profile, as in CATIA.
                            if (v.mode === 'profile' && tool === 'profile' && profileChain) { finishProfile(false); setFlyoutOpen(null); return; }
                            setTool(v.mode); resetToolState(); setToolboxPick(null); setFlyoutOpen(null);
                            if (v.mode === 'circle-coord') setCircleDefOpen(true);
                          }}>
                          <span className="tool-icon"><v.icon size={13} /></span><span>{v.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <section className="tool-section">
          <div className="section-toggle"><span><ChevronDown size={12} />MEASURE</span><small>{measureTools.length}</small></div>
          <div className="tool-list">
            {measureTools.map((m) => (
              <SketchToolButton key={m.mode} icon={m.icon} label={m.name} hint={m.hint} active={tool === m.mode}
                onClick={() => { setTool(m.mode); resetToolState(); setToolboxPick(null); }} />
            ))}
          </div>
        </section>
        <section className="tool-section">
          <div className="section-toggle"><span><ChevronDown size={12} />MODIFY</span><small>{constraintModeTools.length}</small></div>
          <div className="tool-list">
            {/* The constraint buttons (Fixed … Angle) are no longer offered here — only Fillet, Chamfer and Trim. */}
            {constraintModeTools.map((t) => (
              <SketchToolButton key={t.mode} icon={t.icon} label={t.name} hint={t.hint} active={tool === t.mode}
                onClick={() => { setTool(t.mode); resetToolState(); setToolboxPick(null); setFlyoutOpen(null); }} />
            ))}
          </div>
        </section>
        <section className="tool-section">
          <div className="section-toggle"><span><ChevronDown size={12} />AI IMPORT</span></div>
          <div className="tool-list">
            <SketchToolButton
              icon={Sparkles}
              label="Image to Sketch"
              hint="Upload a PNG, JPG or SVG — crop, scale and trace it into editable lines, arcs, circles or splines with constraints. The picture stays on a locked reference layer under the sketch."
              onClick={() => { setToolboxPick({ kind: 'ai', type: 'image-import', name: 'Image to Sketch', hint: 'Trace a picture into editable sketch geometry.' }); setImageDialogOpen(true); }}
            />
          </div>
        </section>
      </div>
    </aside>
  );
}
