// The live link between 3D Design and the workspaces that consume its model (Engineering Analysis, CAM & CNC).
// 3D Design owns the part (an STL built by the geometry kernel); the other workspaces read it, follow its changes
// and show whether they are using it.
import { Box, Link2, Unlink } from 'lucide-react';

/** Cheap content hash of an STL: byte length plus a 32-bit FNV-1a over every byte. '' when there is no model. */
export function stlFingerprint(buf: ArrayBuffer | null | undefined): string {
  if (!buf || buf.byteLength <= 84) return '';
  const u = new Uint8Array(buf);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; }
  return `${u.length}:${h.toString(36)}`;
}

/** "1,234 triangles · 120 × 60 × 104 mm" for a flat triangle array (9 floats per triangle). */
export function meshSummary(tris: ArrayLike<number> | null | undefined): string {
  if (!tris || tris.length < 9) return '';
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const x = tris[i], y = tris[i + 1], z = tris[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const f = (v: number) => (v >= 100 ? Math.round(v) : +v.toPrecision(3));
  return `${Math.floor(tris.length / 9).toLocaleString('en-US')} triangles · ${f(x1 - x0)} × ${f(y1 - y0)} × ${f(z1 - z0)} mm`;
}

export type LinkState = 'none' | 'linked' | 'available';

/** Strip under the workspace's top line: where the model in use comes from and how to get the 3D Design one. */
export function ModelLinkBar({ state, name, detail, note, onUse, onOpen }: {
  state: LinkState; name: string; detail?: string; note?: string; onUse?: () => void; onOpen: () => void;
}) {
  if (state === 'linked') {
    return (
      <div className="ml-bar ml-on" role="status">
        <Link2 size={11} />
        <span className="ml-t"><b>Linked to 3D Design</b> · {name}{detail ? <em> · {detail}</em> : null}{note ? <strong> · {note}</strong> : null}</span>
        <button onClick={onOpen} title="Edit the part in 3D Design; this workspace follows every change"><Box size={10} /> Edit in 3D Design</button>
      </div>
    );
  }
  if (state === 'available') {
    return (
      <div className="ml-bar ml-avail" role="status">
        <Unlink size={11} />
        <span className="ml-t"><b>Not using the 3D Design model</b> · {name}{detail ? <em> · {detail}</em> : null}</span>
        {onUse && <button className="ml-primary" onClick={onUse}><Link2 size={10} /> Use it</button>}
        <button onClick={onOpen}><Box size={10} /> 3D Design</button>
      </div>
    );
  }
  return (
    <div className="ml-bar ml-none" role="status">
      <Unlink size={11} />
      <span className="ml-t"><b>No 3D Design model yet</b> · build a part in 3D Design and it appears here automatically.</span>
      <button onClick={onOpen}><Box size={10} /> Open 3D Design</button>
    </div>
  );
}
