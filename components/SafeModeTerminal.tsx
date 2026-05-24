"use client";

import React, { useState, useEffect, useRef } from "react";
import { Terminal as TerminalIcon, ShieldAlert, Wifi, Key, Hammer, Database } from "lucide-react";

interface Props {
  batteryLevel: number;
  sanityLevel: number;
  bunkerOverrideCode: string;
  isOverrideComplete: boolean;
  onOverrideProgress: (add: number) => void;
  stalkerDistance: number;
  onDeployDecoy: () => void;
  overrideProgress: number;
  className?: string;
}

export function SafeModeTerminal({
  batteryLevel,
  sanityLevel,
  bunkerOverrideCode,
  isOverrideComplete,
  onOverrideProgress,
  stalkerDistance,
  onDeployDecoy,
  overrideProgress,
  className = "",
}: Props) {
  const [history, setHistory] = useState<string[]>([
    "=== COLD HARBOR BUNKER CORP - SYSTEMS SHELL v7.8a ===",
    "Emergency SafeMode Override online. Flash memory healthy.",
    "Type 'help' to audit system capabilities.",
    "",
  ]);
  const [inputVal, setInputVal] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const addLine = (text: string) => {
    setHistory((prev) => [...prev, text]);
  };

  const processCommand = (cmd: string) => {
    const cleanCmd = cmd.trim().toLowerCase();
    addLine(`operator@bunker-sys:~$ ${cmd}`);

    if (!cleanCmd) return;

    const parts = cleanCmd.split(" ");
    const baseCmd = parts[0];

    switch (baseCmd) {
      case "help":
        addLine("AVAILABLE PROTOCOLS:");
        addLine("  status     - Audit real-time bios status & biological sanity");
        addLine("  scan       - Query proximity locator radar for dynamic interference");
        addLine("  decoy      - Trigger dynamic noise sensory flare to distract anomaly");
        addLine("  override   - Run encryption codes to bypass the primary heavy exit firedoor");
        addLine("  camera [i] - Inspect CCTV feeds (i: 1-4). Check area structure");
        addLine("  clear      - Empty local memory cache output");
        break;

      case "status":
        addLine("--- BIO-BIOS DATA STATUS ---");
        addLine(`  TERMINAL BATTERY : ${Math.floor(batteryLevel)}%`);
        addLine(`  OPERATOR SANITY : ${Math.floor(sanityLevel)}% (${
          sanityLevel > 70 ? "STABLE" : sanityLevel > 35 ? "PARANOID ILLUSIONS DETECTED" : "SEVERE HYPERSTRESS - CRITICAL"
        })`);
        addLine(`  FIREWALL BYPASS  : ${overrideProgress}% / 100%`);
        addLine(`  ANOMALY RADAR    : ${stalkerDistance < 15 ? "CRITICAL PROXIMITY ALERT" : "MONITORING DISTANT TRACKS"}`);
        break;

      case "scan":
        addLine("Initializing bunker echo sweep locator...");
        setTimeout(() => {
          addLine(`Echo reflection received: Distant disturbance matched at standard ${stalkerDistance.toFixed(1)} meters.`);
          if (stalkerDistance < 12) {
            addLine("WARNING: Proximity indicates intense metabolic state. Evade immediate sensory zones!");
          } else {
            addLine("Sensor status: Sub-ambient prowling behavior recorded. Maintain low acoustic profile.");
          }
        }, 300);
        break;

      case "decoy":
        addLine("Broadcasting localized high-pitch sensory decoy signal...");
        onDeployDecoy();
        setTimeout(() => {
          addLine("SUCCESS: Acoustic emitter deployed! Entity redirected to coordinate decoy signature.");
        }, 400);
        break;

      case "override":
        if (isOverrideComplete) {
          addLine("--------------------------------------------------");
          addLine("CRITICAL: Heavy firedoor bypass override COMPLETED.");
          addLine(`USE KEY CODE : [ ${bunkerOverrideCode} ] ON EXIT HATCH KEYPAD`);
          addLine("--------------------------------------------------");
        } else {
          addLine("Compressing cryptographic payload scripts...");
          const inc = Math.floor(Math.random() * 15) + 12;
          onOverrideProgress(inc);
          setTimeout(() => {
            addLine(`Bypass integrity progress advances to ${Math.min(overrideProgress + inc, 100)}%`);
            if (overrideProgress + inc >= 100) {
              addLine("--------------------------------------------------");
              addLine("SUCCESS: Firedoor security core destroyed!");
              addLine(`DE-CRYPTION COMPLETE. EXIT CODE UNLOCKED: [ ${bunkerOverrideCode} ]`);
              addLine("Input this code at the exit hatch terminal!");
              addLine("--------------------------------------------------");
            }
          }, 400);
        }
        break;

      case "camera": {
        const camId = parts[1];
        if (!camId || !["1", "2", "3", "4"].includes(camId)) {
          addLine("Syntax Error: Use 'camera [1-4]' (e.g., camera 2).");
          break;
        }
        addLine(`Synchronizing optical feed with Cam ${camId}...`);
        setTimeout(() => {
          if (camId === "1") {
            addLine("--- CAM 1: REACTOR LEVEL ---");
            addLine(" [|  _ _ _ _  |] ");
            addLine(" [| /       \\ |] <= REACTOR BLOCK");
            addLine(" [| |  (•)  | |] ");
            addLine(" [| \\_______/ |] ");
            addLine("  Status: L-Power state. Fluid leakages recorded.");
          } else if (camId === "2") {
            addLine("--- CAM 2: SECTOR B CARGO STORAGE ---");
            addLine("  +_________________+ ");
            addLine("  | [X] [ ]   [X]   | ");
            addLine("  | [X]       [X]   | <= SHELVING GATES");
            addLine("  |     [ ]         | ");
            addLine("  +_________________+ ");
            addLine("  Status: Sound sensory tripwire active.");
          } else if (camId === "3") {
            addLine("--- CAM 3: CORRIDOR MAIN GATE ---");
            addLine(" =====[EXIT HATCH SEC]=====");
            addLine("   [ | ] <- DOOR GATES LOCKED");
            addLine("   [ | ] HACK EXIT VIA OVERRIDE");
            addLine(" ========================");
            addLine("  Status: Keypad standing by for 4-digit input.");
          } else {
            addLine("--- CAM 4: ADMIN SANCTUM ---");
            addLine("  /===============\\ ");
            addLine("  |  [T]   [D]    |  [T]: Terminal Console");
            addLine("  |               |  [D]: Decoy emitter stand");
            addLine("  \\===============/ ");
            addLine("  Status: Dynamic heat signature tracking anomaly.");
          }
        }, 550);
        break;
      }

      case "clear":
        setHistory([]);
        break;

      default:
        addLine(`Command Error: '${baseCmd}' unrecognized. Type 'help' for tactical guidance.`);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal) return;
    processCommand(inputVal);
    setInputVal("");
  };

  return (
    <div className={`flex flex-col border border-emerald-950 bg-[#020603] uppercase select-text h-full ${className}`}>
      {/* SafeMode Terminal Header */}
      <div className="flex items-center justify-between border-b border-emerald-950 bg-[#040c06] px-3 py-2 text-emerald-500 font-bold text-xs tracking-wider">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-emerald-500 animate-pulse" />
          <span>SYS_TERMINAL_SAFE_MODE</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-emerald-600">
          <div className="flex items-center gap-1">
            <Wifi className="w-3 h-3 text-emerald-500" />
            <span>LINK-ACTIVE (SECURE)</span>
          </div>
          <div className="flex items-center gap-1">
            <Database className="w-3 h-3" />
            <span>DB-BUNKER</span>
          </div>
        </div>
      </div>

      {/* Output Console History */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 text-[#33ff33] text-xs leading-relaxed space-y-1 scrollbar-thin select-text"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          textShadow: "0 0 4px rgba(51, 255, 51, 0.4)",
        }}
      >
        {history.map((line, idx) => (
          <div key={idx} className="whitespace-pre-wrap">
            {line}
          </div>
        ))}
      </div>

      {/* Terminal Input Footer */}
      <form onSubmit={handleFormSubmit} className="flex border-t border-emerald-950 bg-[#010301] p-2">
        <span className="text-[#33ff33] text-xs font-bold pl-2 pr-1 pt-1.5 shrink-0 operator-prompt">
          O_SYS_CMD&gt;
        </span>
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="ENTER BUNKER CMD (HELP, OVERRIDE, SCAN...)"
          className="flex-1 bg-transparent px-2 py-1.5 text-[#33ff33] text-xs font-bold font-mono focus:outline-none placeholder-emerald-900 input-terminal flex"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            textShadow: "0 0 2px rgba(51, 255, 51, 0.4)",
          }}
        />
        <button
          type="submit"
          id="terminal-submit-btn"
          className="bg-emerald-950 hover:bg-emerald-900 text-emerald-400 font-bold px-4 py-1.5 rounded text-[10px] border border-emerald-800 transition duration-150 shrink-0"
        >
          EXECUTE
        </button>
      </form>
    </div>
  );
}
