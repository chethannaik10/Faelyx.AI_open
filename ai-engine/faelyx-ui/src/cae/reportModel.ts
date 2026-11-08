// Content of the engineering report, independent of the file format. reportPdf.ts and reportDocx.ts render these blocks.

import { analysisSpec, loadSpec, type CaseInput, type Result } from './model';
import { bodiesBounds } from './regions';

export type Block =
  | { t: 'title'; text: string; sub: string }
  | { t: 'h1' | 'h2'; text: string }
  | { t: 'p'; text: string; bold?: boolean; small?: boolean }
  | { t: 'bullets'; items: string[] }
  | { t: 'verdict'; pass: boolean | null; text: string }
  | { t: 'kv'; rows: { k: string; v: string; status?: string }[] }
  | { t: 'table'; cols: string[]; rows: string[][]; widths?: number[]; caption?: string }
  | { t: 'img'; data: string; w: number; h: number; caption: string }
  | { t: 'chart'; title: string; xlabel: string; ylabel: string; series: { name: string; x: number[]; y: number[] }[]; logx?: boolean; logy?: boolean }
  | { t: 'break' };

export interface ReportImage { title: string; data: string; w: number; h: number }
export interface ReportCtx { project: string; input: CaseInput; result: Result; images: ReportImage[]; date: Date; fosTarget: number; author?: string }

const f3 = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(2) : String(+v.toPrecision(4))) : '–');

export function paramLabel(input: CaseInput, key: string, v: number | string | boolean): string {
  const spec = analysisSpec(input.analysis).params.find((p) => p.k === key);
  if (!spec) return String(v);
  if (spec.type === 'select') return spec.options?.find((o) => o.v === v)?.label ?? String(v);
  if (spec.type === 'bool') return v ? 'yes' : 'no';
  return `${v}${spec.unit ? ' ' + spec.unit : ''}`;
}

export function executiveSummary(c: ReportCtx): string[] {
  const { result: r, input } = c;
  const spec = analysisSpec(input.analysis);
  const parts: string[] = [];
  const solids = input.bodies.filter((b) => b.role !== 'carve').length;
  parts.push(`${spec.label} of ${c.project || 'the model'} (${solids} part${solids === 1 ? '' : 's'}) was run on ${r.mesh.elements.toLocaleString('en-US')} ${r.mesh.type.toLowerCase().includes('lattice') ? 'lattice cells' : 'elements'} with a typical element size of ${f3(r.mesh.h)} mm.`);
  if (r.verdict.text) parts.push(r.verdict.text);
  const key = r.kv.filter((k) => k.status && k.status !== 'info').slice(0, 3).concat(r.kv.filter((k) => k.status === 'info').slice(0, 3)).slice(0, 5);
  if (key.length) parts.push('Principal results: ' + key.map((k) => `${k.label} ${k.value}`).join('; ') + '.');
  const bad = r.checks.filter((k) => !k.ok);
  if (bad.length) parts.push(`${bad.length} check${bad.length === 1 ? '' : 's'} not satisfied: ${bad.map((k) => k.name).join('; ')}.`);
  if (r.notes.length) parts.push('Attention: ' + r.notes[0]);
  return parts;
}

export function buildReport(c: ReportCtx): Block[] {
  const { result: r, input } = c;
  const spec = analysisSpec(input.analysis);
  const out: Block[] = [];
  out.push({ t: 'title', text: `${spec.label}`, sub: `${c.project || 'Untitled model'} · ${c.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}${c.author ? ' · ' + c.author : ''}` });

  out.push({ t: 'h1', text: '1. Executive summary' });
  out.push({ t: 'verdict', pass: r.verdict.pass, text: r.verdict.pass === null ? 'Not rated' : r.verdict.pass ? 'DESIGN VERDICT: PASS' : 'DESIGN VERDICT: FAIL' });
  for (const p of executiveSummary(c)) out.push({ t: 'p', text: p });

  out.push({ t: 'h1', text: '2. Model, materials and study set-up' });
  out.push({ t: 'p', text: `Study: ${spec.label}. ${spec.blurb}` });
  const bb = bodiesBounds(input.bodies);
  if (bb) out.push({ t: 'p', small: true, text: `Overall size: ${f3(bb.max[0] - bb.min[0])} × ${f3(bb.max[1] - bb.min[1])} × ${f3(bb.max[2] - bb.min[2])} mm.` });
  out.push({
    t: 'table', caption: 'Bodies and materials', cols: ['Body', 'Role', 'Material', 'E (MPa)', 'ν', 'ρ (kg/m³)', 'Yield (MPa)'],
    rows: input.bodies.map((b) => [b.name, b.role === 'solid' ? 'Solid' : b.role === 'fluid' ? 'Fluid passage' : 'Void', b.mat.name + (b.mat.kind === 'ortho' ? ' (orthotropic)' : ''), f3(b.mat.E), f3(b.mat.nu), f3(b.mat.rho), b.mat.yield ? f3(b.mat.yield) : '–']),
    widths: [2, 1.2, 2.6, 1.1, 0.8, 1.1, 1.1],
  });
  const ps = spec.params.filter((p) => !p.show || p.show(input.params as Record<string, number | string | boolean>));
  if (ps.length) out.push({ t: 'table', caption: 'Solver settings', cols: ['Parameter', 'Value'], rows: ps.map((p) => [p.label, paramLabel(input, p.k, input.params[p.k] ?? p.def)]), widths: [3, 2] });

  out.push({ t: 'h1', text: '3. Mesh' });
  out.push({
    t: 'kv', rows: [
      { k: 'Discretisation', v: r.mesh.type }, { k: 'Elements / cells', v: r.mesh.elements.toLocaleString('en-US') }, { k: 'Nodes', v: r.mesh.nodes.toLocaleString('en-US') },
      { k: 'Degrees of freedom', v: r.mesh.dof.toLocaleString('en-US') }, { k: 'Element size', v: `${f3(r.mesh.h)} mm` }, { k: 'Mesh quality', v: r.mesh.quality || '–' },
      ...(r.mesh.extra ? [{ k: 'Grid', v: r.mesh.extra }] : []), { k: 'Meshing time', v: `${(r.mesh.time / 1000).toFixed(1)} s` },
    ],
  });
  const conv = r.tables.find((t) => t.id === 'conv');
  if (conv) out.push({ t: 'table', caption: conv.title, cols: conv.cols, rows: conv.rows.map((row) => row.map(String)) });
  const meshImg = c.images.find((i) => i.title === 'mesh');
  if (meshImg) out.push({ t: 'img', data: meshImg.data, w: meshImg.w, h: meshImg.h, caption: 'Figure 1 – Voxel mesh coloured by body.' });

  out.push({ t: 'h1', text: '4. Loads and boundary conditions' });
  const loads = input.loads.filter((l) => l.on);
  if (!loads.length) out.push({ t: 'p', text: 'No loads or restraints were applied (not required by this study).' });
  else out.push({
    t: 'table', caption: 'Applied loads and restraints', cols: ['Name', 'Type', 'Applied to', 'Values'],
    rows: loads.map((l) => {
      const s = loadSpec(l.type), region = input.regions.find((x) => x.id === l.region);
      return [l.name || s.label, s.label, region ? region.name : s.region === 'none' ? 'whole model' : '–', s.fields.length ? s.fields.map((f) => `${f.label} = ${f3(l.p[f.k] ?? f.def)}${f.unit ? ' ' + f.unit : ''}`).join(', ') : 'all components fixed / blocked'];
    }), widths: [1.6, 1.6, 1.6, 3.4],
  });
  const bcImg = c.images.find((i) => i.title === 'loads');
  if (bcImg) out.push({ t: 'img', data: bcImg.data, w: bcImg.w, h: bcImg.h, caption: 'Figure 2 – Load and boundary-condition diagram (supports in blue / teal, loads as arrows, thermal and electrical conditions as markers).' });
  if (r.inputs.length) out.push({ t: 'kv', rows: r.inputs.map((k) => ({ k: k.label, v: k.value })) });

  out.push({ t: 'h1', text: '5. Results' });
  if (r.kv.length) out.push({ t: 'kv', rows: r.kv.map((k) => ({ k: k.label, v: k.value, status: k.status })) });
  let fig = 3;
  for (const im of c.images.filter((i) => i.title !== 'mesh' && i.title !== 'loads')) out.push({ t: 'img', data: im.data, w: im.w, h: im.h, caption: `Figure ${fig++} – ${im.title}` });
  if (r.hotspots.length) {
    out.push({ t: 'h2', text: 'Hot spots' });
    out.push({ t: 'table', cols: ['Location', 'Quantity', 'Value', 'x (mm)', 'y (mm)', 'z (mm)'], rows: r.hotspots.map((h) => [h.label, r.fields.find((f) => f.id === h.fieldId)?.label ?? h.fieldId, f3(h.value), f3(h.x), f3(h.y), f3(h.z)]), widths: [1.8, 2.2, 1, 1, 1, 1] });
  }
  for (const t of r.tables.filter((t) => t.id !== 'conv')) out.push({ t: 'table', caption: t.title, cols: t.cols, rows: t.rows.map((row) => row.map((v) => (typeof v === 'number' ? f3(v) : String(v)))) });
  for (const cu of r.curves.slice(0, 4)) out.push({ t: 'chart', title: cu.title, xlabel: cu.xlabel, ylabel: cu.ylabel, series: cu.series.map((s) => ({ name: s.name, x: s.x, y: s.y })), logx: cu.logx, logy: cu.logy });

  out.push({ t: 'h1', text: '6. Compliance checks' });
  if (!r.checks.length) out.push({ t: 'p', text: 'This study defines no pass / fail criteria.' });
  else out.push({ t: 'table', cols: ['Check', 'Result', 'Requirement', 'Status', 'Note'], rows: r.checks.map((k) => [k.name, k.value, k.limit, k.ok ? 'PASS' : 'FAIL', k.note ?? '']), widths: [2.4, 1.2, 1.4, 0.8, 2.6] });
  out.push({ t: 'verdict', pass: r.verdict.pass, text: r.verdict.text || (r.verdict.pass === null ? 'No verdict.' : r.verdict.pass ? 'The design meets the criteria.' : 'The design does not meet the criteria.') });

  out.push({ t: 'h1', text: '7. Solver, assumptions and limitations' });
  out.push({ t: 'kv', rows: [{ k: 'Solver', v: r.solver.name || '–' }, ...(r.solver.iterations !== undefined ? [{ k: 'Iterations', v: String(r.solver.iterations) }] : []), ...(r.solver.residual !== undefined ? [{ k: 'Final residual', v: r.solver.residual.toExponential(1) }] : []), { k: 'Solution time', v: `${(r.solver.time / 1000).toFixed(1)} s` }] });
  if (r.notes.length) { out.push({ t: 'h2', text: 'Notes and warnings' }); out.push({ t: 'bullets', items: r.notes }); }
  const lim = [...new Set([...r.assumptions, ...spec.limits])];
  if (lim.length) { out.push({ t: 'h2', text: 'Assumptions and limitations' }); out.push({ t: 'bullets', items: lim }); }
  out.push({ t: 'p', small: true, text: 'This report was generated automatically by the Faelyx AI CAE module from the stated inputs. Voxel-mesh results are screening estimates; verify safety-critical designs with an independent analysis and the applicable design code before release.' });
  return out;
}
