"use client";

import Navbar from "@/components/Navbar";

export default function HistoryPage() {
  return (
    <div style={{ background: "#09090b", color: "#fff", minHeight: "100vh" }}>
      <Navbar />
      <main style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
        <h2>?? Generation Logs</h2>
        <table style={{ width: "100%", marginTop: "20px", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #27272a", textAlign: "left" }}>
              <th style={{ padding: "12px" }}>Time</th>
              <th style={{ padding: "12px" }}>Primitive</th>
              <th style={{ padding: "12px" }}>Dimensions</th>
              <th style={{ padding: "12px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #18181b" }}>
              <td style={{ padding: "12px", color: "#a1a1aa" }}>Active Session</td>
              <td style={{ padding: "12px" }}>Cube / Sphere</td>
              <td style={{ padding: "12px" }}>Dynamic</td>
              <td style={{ padding: "12px", color: "#22c55e" }}>Ready</td>
            </tr>
          </tbody>
        </table>
      </main>
    </div>
  );
}
