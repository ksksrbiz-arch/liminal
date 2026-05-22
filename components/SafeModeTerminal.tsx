import React, { useState, useEffect } from 'react';
import { getLogger } from '../lib/gameLogger';

// Fallback HTML5 pitch sound synthesizer for complete resource file resilience
const playBeep = (freq: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.1) => {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    
    // Smooth ramp down
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Suppress audio creation exceptions completely
  }
};

const MAZE_SIZE = 15;

// Pure static grid of 15x15 maze layout (0 = walkable hallway, 1 = solid concrete barrier)
const MAZE_GRID: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,0,1,1,1,0,1,1,1,0,1],
  [1,0,1,0,0,0,1,0,0,0,0,0,1,0,1],
  [1,0,1,1,1,1,1,0,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,1,0,1],
  [1,1,1,0,1,1,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,1,1,0,1,1,1],
  [1,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,1,1,1,1,1,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,0,0,1,0,1],
  [1,1,1,0,1,1,1,1,1,0,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,1,0,1,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

interface SafeModeTerminalProps {
  onReboot: () => void;
  onOpenFeedback: () => void;
  savedNotes: string[];
  onNoteDiscovered: (id: string) => void;
}

export default function SafeModeTerminal({
  onReboot,
  onOpenFeedback,
  savedNotes,
  onNoteDiscovered
}: SafeModeTerminalProps) {
  const logger = getLogger();
  
  // States of the interactive text-based escape room
  const [player, setPlayer] = useState({ x: 1, y: 1 });
  const [flashlight, setFlashlight] = useState(true);
  const [battery, setBattery] = useState(100);
  const [switches, setSwitches] = useState([
    { id: 'sw1', x: 1, y: 13, name: 'Breaker Alpha', active: false },
    { id: 'sw2', x: 13, y: 1, name: 'Breaker Beta', active: false },
    { id: 'sw3', x: 13, y: 13, name: 'Breaker Gamma', active: false },
    { id: 'sw4', x: 7, y: 7, name: 'Main Power Core', active: false },
  ]);
  const [isEscaped, setIsEscaped] = useState(false);
  const [statusFeed, setStatusFeed] = useState<string[]>([
    "===========================================================",
    "  [SYSTEM WARNING] EMERGENCY GRAPHICS CORES COLLAPSED      ",
    "  [ENVIRONMENT PRE-WARMED] ACTIVE RE-ROUTE: SAFE-MODE TERMINAL",
    "===========================================================",
    "Initializing auxiliary grid-telemetry stream...",
    "Telemetry established. Flashlight is active.",
    "Goal: Locate and repair all 4 Breaker switches, then find the exit corridor at (14, 14)."
  ]);
  
  const [isDead, setIsDead] = useState(false);
  const [isStalkerActive, setIsStalkerActive] = useState(false);
  const [stalker, setStalker] = useState({ x: 10, y: 12 });
  const [turns, setTurns] = useState(0);
  const [nearbyScan, setNearbyScan] = useState<string>("");

  const appendToFeed = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setStatusFeed(prev => [...prev, `[${time}] ${msg}`].slice(-40)); // keep last 40 lines
  };

  const handleToggleFlashlight = () => {
    if (battery <= 0) {
      appendToFeed("POWER DEPLETED. Flashlight unit remains unresponsive.");
      playBeep(100, 0.5, 'square');
      return;
    }
    setFlashlight(f => {
      const next = !f;
      appendToFeed(`Flashlight filters preset: ${next ? 'ONLINE' : 'SECURED'}`);
      playBeep(next ? 1000 : 800, 0.08, 'sine');
      return next;
    });
  };

  const handleExamine = () => {
    if (battery <= 0 && !flashlight) {
      appendToFeed("WARNING: Unable to examine environment in absolute darkness. Engage power filters.");
      playBeep(120, 0.4, 'sawtooth');
      return;
    }
    
    // Reduce battery slightly
    setBattery(b => Math.max(0, b - 1));

    // Check if on a switch
    const matchSwitch = switches.find(s => s.x === player.x && s.y === player.y);
    const notesAvailable = [
      { x: 3, y: 1, text: "NOTE: 'The walls have code... They breathe when we look away. - Resident Caretaker'" },
      { x: 9, y: 3, text: "NOTE: 'A system-wide graphics core failure is predicted. Telemetry terminal will execute automatically.'" },
      { x: 5, y: 11, text: "NOTE: 'The sound in the dark (frequency ~85Hz) signals Stalker relocation vectors. Stay close to lights.'" }
    ];
    const matchNote = notesAvailable.find(n => n.x === player.x && n.y === player.y);

    if (matchSwitch) {
      setNearbyScan(`[SCAN]: DETECTED ${matchSwitch.name} - State: ${matchSwitch.active ? "OPERATIONAL" : "FRACTURED"}. Press [R] to deploy local override.`);
      playBeep(600, 0.15, 'sine');
    } else if (matchNote) {
      setNearbyScan(`[MEM_DATA]: Found a physical paper fragment: "${matchNote.text}"`);
      onNoteDiscovered('terminal_note_' + player.x + '_' + player.y);
      playBeep(800, 0.2, 'sine');
    } else {
      // Find battery
      const isBatterySpot = player.x === 11 && player.y === 5;
      if (isBatterySpot && battery < 90) {
        setBattery(b => Math.min(100, b + 40));
        setNearbyScan("[RESTORE]: Siphoned lithium cell cores adjacent to ventilation duct. Light levels restored +40%.");
        logger.info("Lithium core siphoned in text salvage matrix", "TEXT_MODE");
        playBeep(900, 0.4, 'triangle');
      } else {
        setNearbyScan("[SCAN]: Steel corridors. No structural anomalies detected in visual sweep.");
        playBeep(300, 0.1, 'sine');
      }
    }
    
    // Step turns for AI
    setTurns(t => t + 1);
  };

  const handleRepair = () => {
    const matchSwitch = switches.find(s => s.x === player.x && s.y === player.y);
    if (matchSwitch) {
      if (matchSwitch.active) {
        appendToFeed(`Power bypass is already functioning on ${matchSwitch.name}.`);
        playBeep(200, 0.2, 'sine');
      } else {
        setSwitches(prev => prev.map(s => s.id === matchSwitch.id ? { ...s, active: true } : s));
        appendToFeed(`SUCCESS: Reconstructed breaker coils on ${matchSwitch.name}. Critical grid signals stabilizing.`);
        logger.info(`Text Breaker repaired: ${matchSwitch.id}`, "TEXT_MODE");
        playBeep(850, 0.6, 'sine');
      }
    } else {
      appendToFeed("NO OVERRIDES DETECTED NOT COMPATIBLE WITH THIS COORDINATE.");
      playBeep(150, 0.3, 'sawtooth');
    }
    setTurns(t => t + 1);
  };

  const handleMove = (dx: number, dy: number) => {
    const nx = player.x + dx;
    const ny = player.y + dy;
    
    // Boundary and collision logic
    if (nx >= 0 && nx < MAZE_SIZE && ny >= 0 && ny < MAZE_SIZE) {
      if (MAZE_GRID[ny][nx] === 0) {
        setPlayer({ x: nx, y: ny });
        // Consume battery if light is active
        if (flashlight) {
          setBattery(b => {
            const next = Math.max(0, b - 1);
            if (next === 0) {
              setFlashlight(false);
              appendToFeed("CRITICAL ALARM: OPTICAL CORE COLLAPSED. POWER REDUCED TO NULL.");
              playBeep(110, 0.8, 'square');
            }
            return next;
          });
        }
        
        // Output coordinate feeds
        const directions = [];
        if (MAZE_GRID[ny-1][nx] === 0) directions.push("North ▲");
        if (MAZE_GRID[ny+1][nx] === 0) directions.push("South ▼");
        if (MAZE_GRID[ny][nx-1] === 0) directions.push("West ◀");
        if (MAZE_GRID[ny][nx+1] === 0) directions.push("East ▶");
        
        appendToFeed(`Advanced to coordinate (${nx}, ${ny}). Passageways clear: ${directions.join(', ')}`);
        setNearbyScan("");
        playBeep(240, 0.05, 'triangle', 0.05);

        // Escape Trigger
        if (nx === 13 && ny === 13) {
          const allSwitchesActive = switches.every(s => s.active);
          if (allSwitchesActive) {
            setIsEscaped(true);
            logger.info("Player escaped in text-mode fallback mode!", "TEXT_MODE");
            playBeep(1200, 1.2, 'sine', 0.2);
          } else {
            appendToFeed("ALERT: Exit hatch is locked shut. Core grid requires all 4 Breakers repaired first.");
            playBeep(200, 0.5, 'sawtooth');
          }
        }

        // Trigger stalker spawning after 12 moves
        if (turns > 12 && !isStalkerActive) {
          setIsStalkerActive(true);
          appendToFeed("UNCAUGHT DEVIATION REGISTERED. Thermal tracking sensors indicators spiked in deep sectors.");
          playBeep(85, 1.5, 'sine', 0.4);
        }

        // Steer Stalker
        setTurns(t => t + 1);
      } else {
        appendToFeed(`COLLISION AVOIDED: Solid concrete wall obstructing movement.`);
        playBeep(180, 0.1, 'sine');
      }
    }
  };

  // Keyboard controls for retro feel inside useEffect
  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (isDead || isEscaped) return;
      const key = e.key.toLowerCase();
      if (key === 'w' || e.key === 'ArrowUp') handleMove(0, -1);
      else if (key === 's' || e.key === 'ArrowDown') handleMove(0, 1);
      else if (key === 'a' || e.key === 'ArrowLeft') handleMove(-1, 0);
      else if (key === 'd' || e.key === 'ArrowRight') handleMove(1, 0);
      else if (key === 'f') handleToggleFlashlight();
      else if (key === 'e') handleExamine();
      else if (key === 'r') handleRepair();
    };

    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, flashlight, battery, switches, isDead, isEscaped, turns]);

  // Stalker movement simulation relative to player turns
  useEffect(() => {
    if (!isStalkerActive || isDead || isEscaped) return;
    
    // Stalker basic pathing towards player
    setTimeout(() => {
      setStalker(s => {
        let nx = s.x;
        let ny = s.y;
        
        const dx = player.x - s.x;
        const dy = player.y - s.y;
        
        // Attempt movement in the axis of greatest discrepancy
        if (Math.abs(dx) > Math.abs(dy)) {
          const step = dx > 0 ? 1 : -1;
          if (MAZE_GRID[ny][nx + step] === 0) nx += step;
          else if (MAZE_GRID[ny + (dy > 0 ? 1 : -1)][nx] === 0) ny += dy > 0 ? 1 : -1;
        } else {
          const step = dy > 0 ? 1 : -1;
          if (MAZE_GRID[ny + step][nx] === 0) ny += step;
          else if (MAZE_GRID[ny][nx + (dx > 0 ? 1 : -1)] === 0) nx += dx > 0 ? 1 : -1;
        }

        const dist = Math.abs(player.x - nx) + Math.abs(player.y - ny);
        
        if (dist === 0) {
          setIsDead(true);
          appendToFeed("!!! HARD SYSTEM TERMINATED: PHYSICAL SECTOR ANOMALY INTERVENED !!!");
          playBeep(80, 2.0, 'sawtooth', 0.35);
          logger.fatal("Stalker intercepted text fallback sector player position.", "TEXT_MODE_CRITICAL");
        } else if (dist <= 2) {
          appendToFeed("ALERT CHECKPOINT: Audio signals indicate close-proximity organic respiration! (~12Hz frequency shift)");
          playBeep(905, 0.3, 'sawtooth', 0.2);
        } else if (dist <= 4) {
          appendToFeed("DISTANT VIBRATION: Heavy drag sounds detected nearby.");
          playBeep(90, 0.2, 'sine', 0.1);
        }

        return { x: nx, y: ny };
      });
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns, isStalkerActive, player.x, player.y, isDead, isEscaped]);

  const resetLocalTerminal = () => {
    setPlayer({ x: 1, y: 1 });
    setBattery(100);
    setFlashlight(true);
    setSwitches(prev => prev.map(s => ({ ...s, active: false })));
    setIsDead(false);
    setIsEscaped(false);
    setIsStalkerActive(false);
    setTurns(0);
    setNearbyScan("");
    setStatusFeed([
      "===========================================================",
      "  CONSOLE REBOOT COMPLETED. EMULATING SAFE ENVIRONMENT.     ",
      "===========================================================",
      "Telemetry systems reset. Position calibrated to (1,1).",
      "Goal: Repair all 4 Breaker switches and escape to sector (13,13)."
    ]);
    playBeep(440, 0.5, 'sine');
  };

  return (
    <div className="relative w-full h-screen bg-[#050505] text-[#ff8000] font-mono flex flex-col p-4 md:p-6 select-none overflow-hidden" id="safe_mode_grid_terminal">
      {/* Animated Scanlines Layer */}
      <div 
        className="absolute inset-0 pointer-events-none z-40 opacity-[0.06]"
        style={{
          backgroundImage: "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))",
          backgroundSize: "100% 4px, 6px 100%"
        }}
      />
      
      {/* Glow shading */}
      <div className="absolute inset-0 pointer-events-none z-30 bg-[radial-gradient(circle_at_center,_transparent_40%,_rgba(0,0,0,0.8)_100%)]"></div>

      {/* Header section with telemetry and automatic diagnostics */}
      <header className="border-b border-[#cc6600]/30 pb-4 mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 z-10">
        <div>
          <h1 className="text-xl font-bold tracking-[0.2em] flex items-center gap-2 text-[#ff9900] animate-pulse">
            <span>●</span> LIMIMAL CORE DIAGNOSTIC TERMINAL
          </h1>
          <p className="text-[10px] text-[#cc6600]/70 mt-1 uppercase">
            ACTIVE SYSTEM PROFILE: REVERT_DEGRADED_TEXT_PLAYABLE_SAFE // SYS_ID: d9ecc9bf
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onReboot}
            id="reboot_graphics_driver"
            className="px-3 py-1.5 border border-[#ff8000]/40 rounded text-xs bg-[#ff8000]/10 hover:bg-[#ff8000]/20 transition-all font-bold"
          >
            ⚠️ REBOOT GRAPHICS CORE
          </button>
          <button
            onClick={onOpenFeedback}
            id="terminal_open_feedback"
            className="px-3 py-1.5 border border-[#ffb366]/40 rounded text-xs bg-[#ffb366]/10 hover:bg-[#ffb366]/20 transition-all text-[#ffb366]"
          >
            💬 SUBMIT SIGNAL FEEDBACK
          </button>
          <button
            onClick={resetLocalTerminal}
            id="reset_safe_room"
            className="px-3 py-1.5 border border-red-900/40 rounded text-xs bg-red-950/20 text-red-400 hover:bg-red-950/40 transition-all"
          >
            ♻️ RESET TEST GRID
          </button>
        </div>
      </header>

      {/* Main Grid Content Panels */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden z-10">
        
        {/* Left column - Action controls and Map */}
        <section className="lg:col-span-5 flex flex-col gap-4 overflow-auto">
          
          {/* Diagnostic Stats */}
          <div className="border border-[#cc6600]/30 bg-black/40 p-4 rounded flex flex-col gap-2.5">
            <h2 className="text-sm font-bold tracking-wider text-[#ffaa00] border-b border-[#cc6600]/20 pb-1.5 uppercase">SYSTEM CRITICAL STATE</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="opacity-60 block">VECTOR POSITION:</span>
                <span className="text-[#ffd280] font-bold">X: {player.x}, Y: {player.y}</span>
              </div>
              <div>
                <span className="opacity-60 block">LITHIUM CORE BATTERY:</span>
                <span className={`font-bold ${battery <= 25 ? 'text-red-500 animate-pulse' : 'text-green-400'}`}>
                  {battery}% {battery <= 0 && '(DEPLETED)'}
                </span>
              </div>
              <div>
                <span className="opacity-60 block">OPTICS EMISSION:</span>
                <span className="font-bold">{flashlight ? 'ACTIVE [300W]' : 'POWER FILTERED [OFF]'}</span>
              </div>
              <div>
                <span className="opacity-60 block">STALKER SIGNATURE:</span>
                <span className={`font-bold ${isStalkerActive ? 'text-red-500 animate-pulse' : 'text-[#ff8000]/60'}`}>
                  {isStalkerActive ? 'SIGNAL DETECTED' : 'QUIET'}
                </span>
              </div>
            </div>

            {/* Switch Grid Tracker */}
            <div className="mt-2.5 pt-2.5 border-t border-[#cc6600]/20">
              <span className="opacity-60 text-xs block mb-1.5 uppercase">GRID SWITCHOVERS (4 REQUIRED):</span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {switches.map((s) => (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <span className={s.active ? 'text-[#00ff66]' : 'text-red-500 animate-pulse'}>
                      {s.active ? '✔' : '✘'}
                    </span>
                    <span className="opacity-80">
                      {s.name} ({s.x}, {s.y})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Graphical Minimap Decryption */}
          <div className="border border-[#cc6600]/30 bg-black/50 p-4 rounded flex flex-col items-center justify-center">
            <h2 className="text-xs font-bold tracking-wider text-[#ffaa00] mb-2 uppercase self-start">COGNITIVE COMPILING SENSORY MINIMAP</h2>
            <div className="grid gap-[2px] bg-black/80 p-2.5 border border-[#cc6600]/15 rounded">
              {MAZE_GRID.map((row, y) => (
                <div key={y} className="flex gap-[2px]">
                  {row.map((cell, x) => {
                    const isPlayer = player.x === x && player.y === y;
                    const isStalker = isStalkerActive && stalker.x === x && stalker.y === y;
                    const isSwitch = switches.some(s => s.x === x && s.y === y);
                    const isExit = x === 13 && y === 13;
                    
                    let cls = "w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-sm flex items-center justify-center text-[8px] font-bold ";
                    let content = "";
                    
                    if (isPlayer) {
                      cls += "bg-[#ff8000] text-black animate-pulse";
                      content = "P";
                    } else if (isStalker) {
                      cls += "bg-red-900 text-[#ff3333] animate-ping";
                      content = "S";
                    } else if (isSwitch) {
                      const active = switches.find(s => s.x === x && s.y === y)?.active;
                      cls += active ? "bg-green-950 text-green-400 border border-green-500/30" : "bg-red-950 text-red-500 border border-red-500/30 animate-pulse";
                      content = "⚡";
                    } else if (isExit) {
                      cls += "bg-blue-900 text-blue-300 animate-pulse";
                      content = "E";
                    } else if (cell === 1) {
                      cls += "bg-[#331a00] opacity-30";
                    } else {
                      cls += "bg-black/60 border border-[#cc6600]/5";
                    }

                    return (
                      <span key={x} className={cls} title={`Sector ${x},${y}`}>
                        {content}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-[9px] mt-2.5 opacity-70">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#ff8000] rounded"></span>Player</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-900 rounded"></span>Stalker</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-950 rounded"></span>Breaker</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-900 rounded"></span>Exit Gate</span>
            </div>
          </div>

        </section>

        {/* Right column - Main status terminal logs and triggers */}
        <section className="lg:col-span-7 flex flex-col border border-[#cc6600]/30 rounded bg-black/40 overflow-hidden relative">
          
          {/* Log terminal print-out */}
          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs flex flex-col gap-1.5 scrollbar-thin select-text animate-fade-in">
            {statusFeed.map((f, index) => {
              let color = "text-[#cc6600]/80";
              if (f.includes("[SYSTEM WARNING]") || f.includes("ALERT") || f.includes("COLLISION") || f.includes("WARNING")) color = "text-yellow-500";
              if (f.includes("HARD SYSTEM TERMINATED") || f.includes("ORGANIC RESPIRATION")) color = "text-red-500 font-bold";
              if (f.includes("SUCCESS") || f.includes("COILS ON")) color = "text-green-400 font-bold";
              return (
                <div key={index} className={`whitespace-pre-wrap leading-relaxed ${color}`}>
                  {f}
                </div>
              );
            })}
            
            {/* Examine text banner */}
            {nearbyScan && (
              <div className="mt-4 p-3 bg-[#e67300]/10 border-l-2 border-[#ff8000] text-[#ffd280] font-mono leading-relaxed text-xs animate-fade-in animate-pulse">
                {nearbyScan}
              </div>
            )}
          </div>

          {/* Action Keyboard Buttons UI Panel */}
          <footer className="border-t border-[#cc6600]/20 p-4 bg-black/70 flex flex-col gap-3.5">
            
            {/* Interactive button layout */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase opacity-40">Tactile Directional Steering</span>
                <div className="grid grid-cols-3 gap-2.5 w-36">
                  <div></div>
                  <button
                    onClick={() => handleMove(0, -1)}
                    className="h-9 border border-[#ff8000]/30 rounded flex items-center justify-center font-bold bg-black/70 active:bg-[#ff8000]/20 hover:text-white cursor-pointer"
                    title="Move North"
                  >
                    ▲
                  </button>
                  <div></div>
                  <button
                    onClick={() => handleMove(-1, 0)}
                    className="h-9 border border-[#ff8000]/30 rounded flex items-center justify-center font-bold bg-black/70 active:bg-[#ff8000]/20 hover:text-white cursor-pointer"
                    title="Move West"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => handleMove(0, 1)}
                    className="h-9 border border-[#ff8000]/30 rounded flex items-center justify-center font-bold bg-black/70 active:bg-[#ff8000]/20 hover:text-white cursor-pointer"
                    title="Move South"
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => handleMove(1, 0)}
                    className="h-9 border border-[#ff8000]/30 rounded flex items-center justify-center font-bold bg-black/70 active:bg-[#ff8000]/20 hover:text-white cursor-pointer"
                    title="Move East"
                  >
                    ▶
                  </button>
                </div>
              </div>

              {/* Utility actions */}
              <div className="flex-1 flex flex-row flex-wrap gap-2 justify-end self-end">
                <button
                  onClick={handleToggleFlashlight}
                  className={`px-4 py-2.5 border rounded font-mono text-xs tracking-wider transition-all duration-300 cursor-pointer ${
                    flashlight 
                      ? 'border-yellow-500/50 bg-yellow-950/20 text-yellow-300 shadow-[0_0_8px_rgba(234,179,8,0.2)]'
                      : 'border-gray-800 bg-black/40 text-gray-500'
                  }`}
                >
                  🔦 LIGHT: {flashlight ? 'ON' : 'OFF'} [F]
                </button>
                
                <button
                  onClick={handleExamine}
                  className="px-4 py-2.5 border border-[#ff8000]/30 rounded bg-black/40 text-[#ff9900] active:bg-[#ff8000]/15 hover:text-white transition-all text-xs tracking-wider font-bold cursor-pointer"
                >
                  🔍 EXAMINE [E]
                </button>

                <button
                  onClick={handleRepair}
                  className="px-4 py-2.5 border border-[#ff8000]/30 rounded bg-black/40 text-[#ff9900] active:bg-[#ff8000]/15 hover:text-white transition-all text-xs tracking-wider font-bold cursor-pointer"
                >
                  ⚡ OVERRIDE REPAIR [R]
                </button>
              </div>
            </div>

            {/* Instruction Footer */}
            <div className="text-[10px] text-[#cc6600]/50 text-center uppercase tracking-widest mt-1">
              PROMPT COMMANDS DETECTABLE VIA PHYSICAL KEYBOARD INDICES. USE RESPONSIBLY.
            </div>
          </footer>

          {/* Escaped Modal Shield */}
          {isEscaped && (
            <div className="absolute inset-0 bg-[#050505]/95 flex flex-col items-center justify-center p-6 z-50 text-green-400 text-center animate-fade-in">
              <h2 className="text-4xl font-serif text-green-500 tracking-widest animate-pulse font-bold uppercase mb-4">COILS REPAIRED • SYSTEM SECURED</h2>
              <div className="max-w-md text-sm font-mono leading-relaxed mb-6">
                You bypassed the core failure telemetry grid. With all 4 Breakers restored, the containment shields sealed in sector (13,13). The stalker vector was safely trapped. 
                <br/><br/>
                Your resilience under degraded telemetry safe-mode establishes complete compliance.
              </div>
              <button
                onClick={resetLocalTerminal}
                className="px-6 py-2.5 border border-green-500 text-green-400 hover:bg-green-950/40 rounded tracking-widest text-xs font-mono font-bold transition-all cursor-pointer"
              >
                DISPATCH NEXT SECURE GRID SIMULATION
              </button>
            </div>
          )}

          {/* Loss Modal Shield */}
          {isDead && (
            <div className="absolute inset-0 bg-[#050505]/95 flex flex-col items-center justify-center p-6 z-50 text-red-500 text-center">
              <h2 className="text-4xl font-serif text-red-600 tracking-widest font-bold uppercase mb-4 animate-bounce">SIGNAL LOSS • RECOVERY COMPROMISED</h2>
              <div className="max-w-md text-sm font-mono leading-relaxed mb-6 opacity-80">
                A physical hazard compromised your vectors at coordinate ({player.x}, {player.y}). Direct extraction failed.
                Your logs have been successfully logged to local core memory bank.
              </div>
              <div className="flex gap-3">
                <button
                  onClick={resetLocalTerminal}
                  className="px-6 py-2.5 border border-red-600 text-red-400 hover:bg-red-950/40 rounded tracking-widest text-xs font-mono font-bold transition-all cursor-pointer"
                >
                  RE-TRY RETRO SIGNAL GRID
                </button>
                <button
                  onClick={onOpenFeedback}
                  className="px-6 py-2.5 border border-yellow-600 text-yellow-400 hover:bg-yellow-950/40 rounded tracking-widest text-xs font-mono font-bold transition-all animate-bounce cursor-pointer"
                >
                  REPORT UNEXPECTED INSTABILITY
                </button>
              </div>
            </div>
          )}

        </section>
      </div>
    </div>
  );
}
