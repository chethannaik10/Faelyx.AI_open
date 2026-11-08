"use client";

import React, { useState } from "react";
// Import React Three Fiber Canvas
import { Canvas } from "@react-three/fiber";
// Import helpful scene helpers from @react-three/drei
import { OrbitControls, Grid, Environment, Box } from "@react-three/drei";
// Import icons
import {
  Square,
  Circle as CircleIcon,
  Minus,
  Spline,
  Scissors,
  Copy,
  RotateCw,
  Box as BoxIcon,
  Wand2,
  Upload,
} from "lucide-react";

// --- Simple Placeholder 3D Component ---
// This represents where the AI-generated model will go.
function CADModelPlaceholder() {
  return (
    <Box args={[2, 1, 3]} castShadow receiveShadow>
      {/* Use a simple cyan outline material to look 'CAD-like' */}
      <meshStandardMaterial
        color="#00E5FF"
        wireframe={false}
        roughness={0.1}
        metalness={0.8}
      />
    </Box>
  );
}

export default function CADApplicationPage() {
  const [activeTab, setActiveTab] = useState("Build with AI");
  const [activeTool, setActiveTool] = useState("Box");

  return (
    <div className="flex flex-col w-full h-screen bg-[#121214] text-[#E1E1E6] font-sans overflow-hidden select-none">
      
      {/* --- 1. TOP HEADER NAVIGATION --- */}
      <header className="h-12 bg-gradient-to-r from-[#1A1A1E] to-[#2C2D35] border-b border-[#2C2D35] flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 font-bold tracking-wider text-white text-sm">
            <BoxIcon className="w-5 h-5 text-[#00E5FF]" />
            <span>STITCH CAD</span>
          </div>

          <nav className="flex gap-1 text-xs text-[#8D8D99]">
            {["File", "Edit", "Sketch", "3D Features", "Constraints", "Build with AI", "Export"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded transition-colors ${
                  activeTab === tab
                    ? "text-white font-semibold bg-white/10 border-b-2 border-[#00E5FF]"
                    : "hover:bg-white/5 hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        <div className="text-xs text-[#00E5FF] bg-[#00E5FF]/10 px-3 py-1 rounded-full border border-[#00E5FF]/20 font-mono">
          Project_Alpha.cad
        </div>
      </header>

      {/* --- 2. MAIN WORKSPACE CONTAINER --- */}
      <div className="flex flex-1 relative overflow-hidden">
        
        {/* --- LEFT SIDEBAR: TOOL PALETTE --- */}
        <aside className="w-56 bg-[#1E1E22] border-r border-[#2C2D35] flex flex-col z-10">
          <div className="p-3 text-[10px] font-bold tracking-widest text-[#8D8D99] uppercase border-b border-[#2C2D35]">
            {activeTab === "Build with AI" ? "AI Model Parameters" : "2D Drawing Tools"}
          </div>

          {activeTab === "Build with AI" ? (
            // Build with AI Input Panel
            <div className="p-3 flex flex-col gap-4 text-xs">
              <div>
                <label className="text-[#8D8D99] block mb-2 font-medium">Upload Reference</label>
                <div className="border border-dashed border-[#2C2D35] hover:border-[#00E5FF] rounded-lg p-3 flex flex-col items-center gap-2 bg-[#121214] cursor-pointer transition-colors text-center">
                  <Upload className="w-5 h-5 text-[#00E5FF]" />
                  <span className="text-[11px] text-[#8D8D99]">Drag sketch or image (PNG/JPG)</span>
                </div>
              </div>

              <div>
                <label className="text-[#8D8D99] block mb-1 font-medium">AI Prompt & Specs</label>
                <textarea
                  className="w-full h-24 bg-[#121214] border border-[#2C2D35] rounded p-2 text-xs text-[#E1E1E6] focus:outline-none focus:border-[#00E5FF]"
                  defaultValue="Generate a complex bracket based on the sketch. Material: Aluminum 6061. Max Stress: 120 MPa."
                />
              </div>

              <button className="w-full bg-[#00E5FF] hover:bg-[#00c8e0] text-[#121214] font-bold py-2 rounded flex items-center justify-center gap-2 transition-colors">
                <Wand2 className="w-4 h-4" /> Generate 3D Model
              </button>
            </div>
          ) : (
            // Standard 2D Sketch Tools
            <div className="grid grid-cols-2 gap-1 p-2">
              {[
                { name: "Line", icon: Minus, key: "L" },
                { name: "Rect", icon: Square, key: "R" },
                { name: "Circle", icon: CircleIcon, key: "C" },
                { name: "Spline", icon: Spline, key: "S" },
                { name: "Trim", icon: Scissors, key: "T" },
                { name: "Pattern", icon: RotateCw, key: "P" },
              ].map((tool) => (
                <button
                  key={tool.name}
                  onClick={() => setActiveTool(tool.name)}
                  className={`h-9 px-2 text-xs rounded flex items-center justify-between border transition-all ${
                    activeTool === tool.name
                      ? "bg-[#2F80ED] border-[#00E5FF] text-white"
                      : "bg-white/5 border-transparent text-[#E1E1E6] hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <tool.icon className="w-3.5 h-3.5" />
                    <span>{tool.name}</span>
                  </div>
                  <span className="text-[9px] opacity-60 font-mono">{tool.key}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* --- CENTER VIEWPORT: THREE.JS 3D CANVAS --- */}
        <main className="flex-1 relative bg-[#121214]">
          {/* 
              THE Live 3D Viewport.
              The Canvas component initializes Three.js and rendering.
              camera sets the default perspective.
          */}
          <Canvas
            shadows
            camera={{ position: [5, 5, 5], fov: 50 }}
            className="z-0"
          >
            {/* 1. Standard Lighting Setup */}
            <ambientLight intensity={0.5} />
            <directionalLight
              position={[10, 10, 5]}
              intensity={1}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
            />
            
            {/* 2. Environment (lighting reflections) */}
            <Environment preset="city" />

            {/* 3. Infinite Grid Helper (CAD look) */}
            <Grid
              infiniteGrid
              cellSize={0.5}
              sectionSize={2.5}
              fadeDistance={20}
              fadeStrength={1}
              sectionColor="#2C2D35"
              cellColor="#1F2026"
            />

            {/* 4. The CAD Model Placeholder */}
            <CADModelPlaceholder />

            {/* 5. Interactive Controls (Pan, Zoom, Rotate) */}
            <OrbitControls makeDefault enablePan={true} enableZoom={true} minDistance={2} maxDistance={50} />
          </Canvas>

          {/* Viewport Overlay HUD */}
          <div className="absolute top-4 left-4 pointer-events-none bg-[#1E1E22]/70 border border-[#2C2D35] px-3 py-1.5 rounded text-xs font-mono">
            View: Isometric | Render: Shaded | Grid: 0.5mm
          </div>
        </main>

        {/* --- RIGHT SIDEBAR: INSPECTOR / DIAGNOSTICS --- */}
        <aside className="w-64 bg-[#1E1E22] border-l border-[#2C2D35] flex flex-col z-10 text-xs p-3 space-y-4">
          <div className="font-semibold text-white">Inspector / AI Output</div>
          
          {activeTab === "Build with AI" && (
            <>
              <div className="bg-[#121214] border border-[#2C2D35] p-3 rounded space-y-2">
                <span className="font-semibold text-white block">AI Generation Status</span>
                <div className="w-full bg-[#1F2026] rounded-full h-2 overflow-hidden">
                  <div className="bg-[#00E5FF] h-full w-2/3 rounded-full"></div>
                </div>
                <div className="flex justify-between text-[10px] text-[#8D8D99]">
                  <span>Optimizing Topology</span>
                  <span>67%</span>
                </div>
              </div>

              <div className="space-y-2 text-[11px] text-[#8D8D99]">
                <strong className="text-white block">AI Recommendations</strong>
                <p>
                  Consider increasing the material thickness at the mounting points to handle high torque. Switch from Aluminum to Steel for better stress distribution.
                </p>
              </div>
            </>
          )}
        </aside>

      </div>

      {/* --- 3. BOTTOM STATUS BAR --- */}
      <footer className="h-7 bg-[#1E1E22] border-t border-[#2C2D35] flex items-center justify-between px-4 text-[11px] text-[#8D8D99] font-mono z-20">
        <span>Ready | Build with AI Mode</span>
        <span>Cursor: X: 0.00 Y: 0.00 Z: 0.00</span>
      </footer>

    </div>
  );
}