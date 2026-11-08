import Link from "next/link";
import { Box } from "lucide-react";

export default function Navbar() {
  return (
    <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", background: "#09090b", borderBottom: "1px solid #27272a", color: "#fff" }}>
      <div style={{ fontWeight: "bold", fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px" }}>
        <Box color="#f97316" /> AI CAD Studio
      </div>
      <div style={{ display: "flex", gap: "24px" }}>
        <Link href="/" style={{ color: "#a1a1aa", textDecoration: "none" }}>Studio</Link>
        <Link href="/assembly" style={{ color: "#a1a1aa", textDecoration: "none" }}>Assembly</Link>
        <Link href="/history" style={{ color: "#a1a1aa", textDecoration: "none" }}>History</Link>
      </div>
    </nav>
  );
}
