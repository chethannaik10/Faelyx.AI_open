// The "How to use" block at the bottom of the right-hand pane (3D Design
// and Sketch & 2D): the active option's purpose, numbered steps and tips.
import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import type { Guide } from './howTo3D';

const KEY = 'faelyx.howToUse.open';
const readOpen = (): boolean => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };

export default function HowToUse({ guide }: { guide: Guide }) {
  const [open, setOpen] = useState<boolean>(readOpen);
  const toggle = () => { const next = !open; setOpen(next); try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* storage unavailable */ } };
  return (
    <section className="how-to-use" aria-label="How to use">
      <button type="button" className="how-to-use-head" onClick={toggle} aria-expanded={open}>
        <BookOpen size={12} /><span>HOW TO USE</span>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && <div className="how-to-use-body">
        <strong className="how-to-use-title">{guide.title}</strong>
        {guide.summary && <p className="how-to-use-summary">{guide.summary}</p>}
        <ol className="how-to-use-steps">{guide.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        {guide.tips && guide.tips.length > 0 && <div className="how-to-use-tips">
          <span>TIPS</span>
          <ul>{guide.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>}
      </div>}
    </section>
  );
}
