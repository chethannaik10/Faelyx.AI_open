"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import { Download, Cpu } from "lucide-react";

export default function StudioPage() {
  const [shape, setShape] = useState("cube");
  const [size, setSize] = useState(25);
  const [stlUrl, setStlUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shape, size: Number(size) }),
      });

      if (!response.ok) throw new Error("Generation failed");

      const blob = await response.blob();
      setStlUrl(window.URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "#09090b", color: "#fff", minHeight: "100vh" }}>
      <Navbar />
      <main style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
        <h2>??? Main Studio Workspace</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px", marginTop: "20px" }}>
          <div style={{ background: "#18181b", padding: "24px", borderRadius: "8px", border: "1px solid #27272a" }}>
            <h3>Control Panel</h3>
            <label style={{ display: "block", margin: "12px 0 4px" }}>Shape Type</label>
            <select value={shape} onChange={(e) => setShape(e.target.value)} style={{ width: "100%", padding: "8px", background: "#09090b", color: "#fff", border: "1px solid #3f3f46", borderRadius: "4px" }}>
              <option value="cube">Cube</option>
              <option value="sphere">Sphere</option>
              <option value="cylinder">Cylinder</option>
            </select>

            <label style={{ display: "block", margin: "12px 0 4px" }}>Size ({size}mm)</label>
            <input type="range" min="5" max="100" value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ width: "100%" }} />

            <button onClick={handleGenerate} disabled={loading} style={{ width: "100%", marginTop: "20px", padding: "10px", background: "#f97316", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
              <Cpu size={18} /> {loading ? "Generating..." : "Generate Mesh"}
            </button>
          </div>

          <div style={{ background: "#18181b", padding: "24px", borderRadius: "8px", border: "1px solid #27272a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "300px" }}>
            {stlUrl ? (
              <a href={stlUrl} download={`${shape}_${size}mm.stl`} style={{ color: "#22c55e", textDecoration: "none", fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px" }}>
                <Download size={24} /> Download {shape.toUpperCase()} STL
              </a>
            ) : (
              <p style={{ color: "#71717a" }}>Generated 3D output will appear here</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
