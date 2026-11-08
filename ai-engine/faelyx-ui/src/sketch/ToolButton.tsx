// One SKETCH TOOLBOX button. `hint` is kept in the props (callers still
// pass it, and other panels — e.g. the Constraints list's own longer
// "select first..." hint — may still want it for something other than a
// hover popup later) but is no longer rendered as a hover tooltip here.
import type { IconType } from './types';

export function SketchToolButton({ icon: Icon, label, active, onClick }: { icon: IconType; label: string; hint?: string; active?: boolean; onClick: () => void }) {
  return <button className={`tool-item ${active ? 'selected' : ''}`} onClick={onClick}>
    <span className="tool-icon"><Icon size={14} /></span><span>{label}</span>
  </button>;
}
