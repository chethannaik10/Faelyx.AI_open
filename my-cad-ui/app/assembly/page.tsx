"use client";

import Navbar from "@/components/Navbar";

export default function AssemblyPage() {
  return (
    <div style={{ background: "#09090b", color: "#fff", minHeight: "100vh" }}>
      <Navbar />
      <main style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
        <h2>?? Assembly & CSG Operations</h2>
        <p style={{ color: "#a1a1aa" }}>Combine, intersect, or subtract shapes to create complex multi-part models.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "24px" }}>
          <div style={{ background: "#18181b", padding: "20px", borderRadius: "8px", border: "1px solid #27272a" }}>
            <h4>Base Mesh (Object A)</h4>
            <p style={{ color: "#71717a" }}>Primary geometry model</p>
          </div>
          <div style={{ background: "#18181b", padding: "20px", borderRadius: "8px", border: "1px solid #27272a" }}>
            <h4>Modifier Tool (Object B)</h4>
            <p style={{ color: "#71717a" }}>Boolean operation cutter</p>
          </div>
        </div>
      </main>
    </div>
  );
}
