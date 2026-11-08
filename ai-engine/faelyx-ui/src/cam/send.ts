// Direct send to a machine over the local network. Every protocol here is a plain HTTP upload that the
// machine's own web service accepts (Klipper/Moonraker, OctoPrint, Duet/RepRapFirmware, or any URL).
// Browsers enforce CORS and mixed-content rules, so a failure is reported with the likely reason instead
// of pretending the file was delivered.

import type { SendProtocol } from './camData';

export interface SendTarget { protocol: SendProtocol; host: string; apiKey: string; path: string; startAfter: boolean }
export interface SendResult { ok: boolean; message: string; detail?: string }

function base(host: string): string {
  let h = host.trim();
  if (!h) throw new Error('Enter the machine address first, e.g. 192.168.1.50 or http://printer.local:7125.');
  if (!/^https?:\/\//i.test(h)) h = `http://${h}`;
  return h.replace(/\/+$/, '');
}

function explain(err: unknown, url: string): string {
  const e = err as Error;
  if (e?.name === 'AbortError') return `No answer from ${url} within 15 s. Check the address and that the machine is on this network.`;
  const mixed = typeof location !== 'undefined' && location.protocol === 'https:' && url.startsWith('http:');
  return `The browser could not complete the request to ${url}. ${mixed ? 'This page is served over HTTPS and the machine over plain HTTP, which browsers block (mixed content). ' : ''}Other common causes: the address is wrong, the machine is off, or its web service does not allow cross-origin requests (CORS) from this page. For Klipper add this page's origin to cors_domains in moonraker.conf.`;
}

async function http(url: string, init: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(timer); }
}

export async function testConnection(t: SendTarget): Promise<SendResult> {
  let b: string;
  try { b = base(t.host); } catch (e) { return { ok: false, message: (e as Error).message }; }
  try {
    if (t.protocol === 'moonraker') {
      const r = await http(`${b}/server/info`);
      if (!r.ok) return { ok: false, message: `Moonraker answered HTTP ${r.status}.` };
      const j = await r.json().catch(() => null) as { result?: { klippy_state?: string; moonraker_version?: string } } | null;
      return { ok: true, message: `Moonraker ${j?.result?.moonraker_version ?? ''} reachable; Klipper state: ${j?.result?.klippy_state ?? 'unknown'}.` };
    }
    if (t.protocol === 'octoprint') {
      const r = await http(`${b}/api/version`, { headers: t.apiKey ? { 'X-Api-Key': t.apiKey } : {} });
      if (r.status === 401 || r.status === 403) return { ok: false, message: 'OctoPrint is reachable but rejected the application key.' };
      if (!r.ok) return { ok: false, message: `OctoPrint answered HTTP ${r.status}.` };
      const j = await r.json().catch(() => null) as { text?: string } | null;
      return { ok: true, message: `${j?.text ?? 'OctoPrint'} reachable.` };
    }
    if (t.protocol === 'duet') {
      const r = await http(`${b}/rr_connect?password=${encodeURIComponent(t.apiKey || 'reprap')}`);
      if (!r.ok) return { ok: false, message: `Duet answered HTTP ${r.status}.` };
      const j = await r.json().catch(() => null) as { err?: number } | null;
      return j && j.err === 0 ? { ok: true, message: 'Duet web server reachable and the session opened.' } : { ok: false, message: 'Duet is reachable but refused the connection (wrong password?).' };
    }
    const r = await http(b, { method: 'GET' });
    return { ok: true, message: `Reached ${b} (HTTP ${r.status}).` };
  } catch (e) { return { ok: false, message: explain(e, b) }; }
}

export async function sendProgram(t: SendTarget, filename: string, body: Blob): Promise<SendResult> {
  let b: string;
  try { b = base(t.host); } catch (e) { return { ok: false, message: (e as Error).message }; }
  try {
    if (t.protocol === 'moonraker') {
      const form = new FormData();
      form.append('file', body, filename);
      form.append('root', 'gcodes');
      form.append('print', t.startAfter ? 'true' : 'false');
      const r = await http(`${b}/server/files/upload`, { method: 'POST', body: form, headers: t.apiKey ? { 'X-Api-Key': t.apiKey } : {} }, 60000);
      if (!r.ok) return { ok: false, message: `Moonraker rejected the upload (HTTP ${r.status}).`, detail: (await r.text().catch(() => '')).slice(0, 300) };
      return { ok: true, message: `Uploaded ${filename} to Klipper${t.startAfter ? ' and started the print' : ''}.` };
    }
    if (t.protocol === 'octoprint') {
      if (!t.apiKey) return { ok: false, message: 'OctoPrint needs an application key (Settings → Application Keys).' };
      const form = new FormData();
      form.append('file', body, filename);
      form.append('select', 'true');
      form.append('print', t.startAfter ? 'true' : 'false');
      const r = await http(`${b}/api/files/local`, { method: 'POST', body: form, headers: { 'X-Api-Key': t.apiKey } }, 60000);
      if (!r.ok) return { ok: false, message: `OctoPrint rejected the upload (HTTP ${r.status}).`, detail: (await r.text().catch(() => '')).slice(0, 300) };
      return { ok: true, message: `Uploaded ${filename} to OctoPrint${t.startAfter ? ' and started the print' : ''}.` };
    }
    if (t.protocol === 'duet') {
      const pass = encodeURIComponent(t.apiKey || 'reprap');
      const c = await http(`${b}/rr_connect?password=${pass}`);
      if (!c.ok) return { ok: false, message: `Duet answered HTTP ${c.status} when connecting.` };
      const name = `0:/gcodes/${filename}`;
      const r = await http(`${b}/rr_upload?name=${encodeURIComponent(name)}`, { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' } }, 60000);
      if (!r.ok) return { ok: false, message: `Duet rejected the upload (HTTP ${r.status}).` };
      const j = await r.json().catch(() => null) as { err?: number } | null;
      if (j && j.err !== 0) return { ok: false, message: 'Duet reported an error while writing the file (SD card full or read-only?).' };
      if (t.startAfter) await http(`${b}/rr_gcode?gcode=${encodeURIComponent(`M32 "${name}"`)}`);
      return { ok: true, message: `Uploaded ${filename} to the Duet SD card${t.startAfter ? ' and sent M32 to start it' : ''}.` };
    }
    const url = /^https?:\/\//i.test(t.path) ? t.path : `${b}${t.path.startsWith('/') ? '' : '/'}${t.path}`;
    const r = await http(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain', 'X-Filename': filename } }, 60000);
    if (!r.ok) return { ok: false, message: `${url} answered HTTP ${r.status}.`, detail: (await r.text().catch(() => '')).slice(0, 300) };
    return { ok: true, message: `Posted ${filename} to ${url} (HTTP ${r.status}).` };
  } catch (e) { return { ok: false, message: explain(e, b) }; }
}
