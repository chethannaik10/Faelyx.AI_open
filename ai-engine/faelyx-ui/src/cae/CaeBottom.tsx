// Bottom panel of the CAE workspace: summary (verdict, key results, checks), charts, tables and the solver log.
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, XCircle, Info } from 'lucide-react';
import { analysisSpec, type Result, type TableData } from './model';
import { Chart, download } from './caeUi';

export type BottomTab = 'summary' | 'curves' | 'tables' | 'log';

const csv = (t: TableData) => [t.cols, ...t.rows].map((r) => r.map((c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');

export default function CaeBottom({ result: r, tab, analysis, stale }: { result: Result | null; tab: BottomTab; analysis: string; stale: boolean }) {
  const [ti, setTi] = useState(0);
  const spec = analysisSpec(analysis as never);
  if (!r) {
    return (
      <div className="cae-empty-b">
        <Info size={14} />
        <b>{spec.label}</b>
        <span>{spec.needs}</span>
        <span>Set up the study on the left, then press RUN. Results, charts, tables and the solver log appear here.</span>
      </div>
    );
  }
  if (tab === 'summary') {
    const pass = r.verdict.pass;
    return (
      <div className="cae-sum">
        {stale && <div className="cae-stale"><AlertTriangle size={11} /> The study changed since this run. These results are out of date.</div>}
        <div className={`cae-verdict ${pass === true ? 'pass' : pass === false ? 'fail' : 'info'}`}>
          {pass === true ? <CheckCircle2 size={15} /> : pass === false ? <XCircle size={15} /> : <Info size={15} />}
          <div><b>{pass === true ? 'PASS' : pass === false ? 'FAIL' : 'RESULT'}</b><span>{r.verdict.text.replace(/^(PASS|FAIL):\s*/, '') || r.title}</span></div>
        </div>
        <div className="cae-kv-grid">
          {r.kv.map((k, i) => <div key={i} className={`cae-kvc ${k.status ?? ''}`}><span>{k.label}</span><b>{k.value}</b></div>)}
        </div>
        {r.checks.length > 0 && (
          <table className="cae-table">
            <thead><tr><th></th><th>Check</th><th>Value</th><th>Limit</th></tr></thead>
            <tbody>
              {r.checks.map((c, i) => (
                <tr key={i} className={c.ok ? '' : 'bad'} title={c.note}>
                  <td>{c.ok ? <CheckCircle2 size={11} color="#70ce9e" /> : <XCircle size={11} color="#ff7a8c" />}</td><td>{c.name}{c.note && !c.ok ? <small>{c.note}</small> : null}</td><td className="m">{c.value}</td><td className="m">{c.limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {r.notes.map((n, i) => <p key={i} className="cae-note"><AlertTriangle size={10} /> {n}</p>)}
      </div>
    );
  }
  if (tab === 'curves') {
    if (!r.curves.length) return <div className="cae-empty-b"><span>This analysis produced no charts.</span></div>;
    return <div className="cae-charts">{r.curves.map((c) => <Chart key={c.id} curve={c} />)}</div>;
  }
  if (tab === 'tables') {
    if (!r.tables.length) return <div className="cae-empty-b"><span>This analysis produced no tables.</span></div>;
    const t = r.tables[Math.min(ti, r.tables.length - 1)];
    return (
      <div className="cae-tables">
        <div className="cae-ttabs">
          {r.tables.map((x, i) => <button key={x.id} className={i === ti ? 'on' : ''} onClick={() => setTi(i)}>{x.title}</button>)}
          <i />
          <button onClick={() => download(`${t.id}.csv`, csv(t), 'text/csv')}><Download size={10} /> CSV</button>
        </div>
        <div className="cae-tscroll">
          <table className="cae-table"><thead><tr>{t.cols.map((c, i) => <th key={i}>{c}</th>)}</tr></thead><tbody>{t.rows.map((row, i) => <tr key={i}>{row.map((c, k) => <td key={k} className={k ? 'm' : ''}>{c}</td>)}</tr>)}</tbody></table>
        </div>
      </div>
    );
  }
  return (
    <div className="cae-log">
      <div className="cae-log-h">
        <span><b>{r.solver.name}</b></span>
        {r.solver.iterations !== undefined && <span>{r.solver.iterations} iterations</span>}
        {r.solver.residual !== undefined && r.solver.residual > 0 && <span>residual {r.solver.residual.toExponential(1)}</span>}
        <span>{(r.solver.time / 1000).toFixed(1)} s</span>
        <span>{r.mesh.type} · {r.mesh.elements.toLocaleString('en-US')} elements · h = {+r.mesh.h.toPrecision(3)} mm</span>
      </div>
      <pre>{r.solver.log.join('\n')}</pre>
      {r.assumptions.length > 0 && <><h4>Assumptions</h4><ul>{r.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></>}
      <h4>Limitations of this analysis</h4>
      <ul>{spec.limits.map((a, i) => <li key={i}>{a}</li>)}</ul>
      {r.inputs.length > 0 && <><h4>Inputs</h4><div className="cae-kv-grid">{r.inputs.map((k, i) => <div key={i} className="cae-kvc"><span>{k.label}</span><b>{k.value}</b></div>)}</div></>}
    </div>
  );
}
