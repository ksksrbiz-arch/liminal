"use client";

import React, { useState, useEffect, useRef } from "react";
import { SafeModeTerminal } from "./SafeModeTerminal";
import { BugReportModal } from "./BugReportModal";
import { ErrorBoundary } from "./ErrorBoundary";
import { logger } from "../lib/gameLogger";
import {
  Volume2,
  VolumeX,
  BatteryCharging,
  Heart,
  ShieldCheck,
  Zap,
  HelpCircle,
  Skull,
  Play,
  TrendingUp,
  RotateCcw,
  Bug,
  Compass,
} from "lucide-react";

// Web Audio API custom Synth for horror sound generation
class HorrorSoundSynthesizer {
  private ctx: AudioContext | null = null;
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private heartbeatInterval: any = null;
  private isMuted: boolean = false;

  constructor() {}

  public init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.startAmbientHum();
      this.startHeartbeatLoop(1.2); 
    } catch (e) {
      console.error("AudioContext initialization failed", e);
    }
  }

  private startAmbientHum() {
    if (!this.ctx || this.isMuted) return;
    try {
      this.ambientOsc = this.ctx.createOscillator();
      this.ambientOsc.type = "sawtooth";
      this.ambientOsc.frequency.value = 45; // ultra-low horror drone frequency

      // low pass filter to make it massive and muddy
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 100;

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.08;

      this.ambientOsc.connect(filter);
      filter.connect(this.ambientGain);
      this.ambientGain.connect(this.ctx.destination);

      this.ambientOsc.start();
    } catch (e) {}
  }

  public setHeartbeatSpeed(delaySeconds: number) {
    this.startHeartbeatLoop(delaySeconds);
  }

  private startHeartbeatLoop(delaySeconds: number) {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.heartbeatInterval = setInterval(() => {
      this.playHeartbeatDoublet();
    }, delaySeconds * 1000);
  }

  private playHeartbeatDoublet() {
    if (!this.ctx || this.isMuted || this.ctx.state === "suspended") return;
    try {
      const now = this.ctx.currentTime;
      // First beat (low tone thump)
      this.playThump(now, 58, 0.15);
      // Second beat (slightly higher thump closely after)
      this.playThump(now + 0.22, 54, 0.12);
    } catch (e) {}
  }

  private playThump(time: number, freq: number, duration: number) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(10, time + duration);

      gain.gain.setValueAtTime(0.42, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + duration);
    } catch (e) {}
  }

  public playCoinSfx() {
    if (!this.ctx || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {}
  }

  public playSanitySfx() {
    if (!this.ctx || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.setValueAtTime(495, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.25);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {}
  }

  public playDecoySfx() {
    if (!this.ctx || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(1500, now + 0.4);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {}
  }

  public playJumpscareSfx() {
    if (!this.ctx || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;
      // High frequency horror screech synth
      for (let i = 0; i < 4; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sawtooth";
        // detuned chords
        osc.frequency.setValueAtTime(180 + i * 115, now);
        osc.frequency.linearRampToValueAtTime(50 + Math.random() * 200, now + 1.2);

        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 1.2);
      }
    } catch (e) {}
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      if (this.ambientGain) this.ambientGain.gain.value = 0;
    } else {
      if (this.ambientGain) this.ambientGain.gain.value = 0.08;
    }
    return this.isMuted;
  }

  public cleanup() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    try {
      if (this.ambientOsc) this.ambientOsc.stop();
      if (this.ctx) this.ctx.close();
    } catch (e) {}
  }
}

// 2D Tactical Grid Map definition
// # = Wall, . = Floor, B = Battery, S = Sanity Syringe, H = Hack PC Router, E = Lock Exit Hatch
const BUNKER_MAP = [
  ["#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#"],
  ["#", ".", ".", "B", ".", "#", ".", ".", ".", ".", ".", "#", "S", ".", "#"],
  ["#", ".", "#", "#", ".", "#", ".", "#", "#", "#", ".", "#", ".", ".", "#"],
  ["#", ".", ".", ".", ".", ".", ".", "#", ".", "#", ".", ".", ".", "#", "#"],
  ["#", "#", "#", ".", "#", "#", ".", "#", ".", "#", "#", "#", ".", ".", "#"],
  ["#", "S", ".", ".", ".", "#", ".", ".", ".", "B", ".", "#", ".", ".", "#"],
  ["#", ".", "#", "#", "H", "#", "#", "#", "#", ".", ".", "#", "#", ".", "#"],
  ["#", ".", ".", ".", ".", ".", "#", "E", "#", ".", ".", ".", ".", "B", "#"],
  ["#", ".", "#", "#", "#", ".", "#", ".", "#", "#", "#", ".", "#", ".", "#"],
  ["#", "B", ".", ".", "#", ".", ".", ".", "H", ".", ".", ".", "#", ".", "#"],
  ["#", "#", "#", ".", "#", "#", ".", "#", "#", "#", "#", ".", "#", ".", "#"],
  ["#", ".", "S", ".", ".", ".", ".", ".", ".", ".", "#", ".", ".", ".", "#"],
  ["#", ".", "#", "#", "#", "#", ".", "#", "#", ".", "#", "#", "#", "S", "#"],
  ["#", ".", ".", ".", ".", "B", ".", ".", "#", ".", ".", ".", ".", ".", "#"],
  ["#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#"],
];

const GRID_SIZE = 40; // pixel size per map square
const MAP_ROWS = BUNKER_MAP.length;
const MAP_COLS = BUNKER_MAP[0].length;

export default function HorrorGame() {
  // Game states
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameWin, setGameWin] = useState(false);
  const [sanity, setSanity] = useState(100);
  const [flashlightBattery, setFlashlightBattery] = useState(100);
  const [flashlightOn, setFlashlightOn] = useState(true);
  const [bunkerOverrideCode, setBunkerOverrideCode] = useState("7391");
  const [overrideProgress, setOverrideProgress] = useState(0);
  const [jumpscareActive, setJumpscareActive] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMuted, setIsMuted] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const [codeInputValue, setCodeInputValue] = useState("");
  const [timeElapsed, setTimeElapsed] = useState(0);

  // Entities state
  const [player, setPlayer] = useState({ x: 1.5, y: 1.5 }); // in node/grid metrics
  const [stalker, setStalker] = useState({ x: 13.5, y: 13.5 });
  const [batteriesLeft, setBatteriesLeft] = useState<any[]>([]);
  const [sanityPills, setSanityPills] = useState<any[]>([]);
  const [hacksLeft, setHacksLeft] = useState<any[]>([]);
  const [decoyCoords, setDecoyCoords] = useState<{ x: number; y: number } | null>(null);
  const [decoyTimer, setDecoyTimer] = useState(0);
  const [exitHatchCoords, setExitHatchCoords] = useState({ x: 7, y: 7 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const synthRef = useRef<HorrorSoundSynthesizer | null>(null);
  const keysPressedRef = useRef<{ [key: string]: boolean }>({});

  // 1. Initialize custom synth and pick coordinates on startup
  useEffect(() => {
    synthRef.current = new HorrorSoundSynthesizer();
    
    // Parse Bunker Grid Map config items
    const batts: any[] = [];
    const pills: any[] = [];
    const hks: any[] = [];
    let exitPos = { x: 7, y: 7 };

    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const val = BUNKER_MAP[r][c];
        if (val === "B") batts.push({ r, c, active: true });
        if (val === "S") pills.push({ r, c, active: true });
        if (val === "H") hks.push({ r, c, active: true });
        if (val === "E") exitPos = { r, c };
      }
    }
    setBatteriesLeft(batts);
    setSanityPills(pills);
    setHacksLeft(hks);
    setExitHatchCoords({ x: exitPos.c + 0.5, y: exitPos.r + 0.5 });

    // Generate random 4-char override code on game generation
    const randomCode = Math.floor(1000 + Math.random() * 9000).toString();
    setBunkerOverrideCode(randomCode);

    return () => {
      if (synthRef.current) {
        synthRef.current.cleanup();
      }
    };
  }, []);

  const handleStartGame = () => {
    if (synthRef.current) {
      synthRef.current.init();
    }
    setIsPlaying(true);
    setGameOver(false);
    setGameWin(false);
    setSanity(100);
    setFlashlightBattery(100);
    setOverrideProgress(0);
    setPlayer({ x: 1.5, y: 1.5 });
    setStalker({ x: 13.5, y: 13.5 });
    setTimeElapsed(0);
    logger.log("SYSTEM", "OPERATOR DEPLOYED INTO HIGH PRESSURE SECURE SECTOR COLD HARBOR");
  };

  // 2. Track key presses
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || gameOver || gameWin) return;
      keysPressedRef.current[e.key.toLowerCase()] = true;
      
      // Let 'f' toggle flashlight
      if (e.key.toLowerCase() === "f") {
        setFlashlightOn((prev) => !prev);
        synthRef.current?.playCoinSfx();
        logger.log("INFO", `Flashlight turned ${!flashlightOn ? "ON" : "OFF"}`);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPlaying, gameOver, gameWin, flashlightOn]);

  // 3. Game Engine Loop (Math and real-time canvas delta calculations)
  useEffect(() => {
    if (!isPlaying || gameOver || gameWin) return;

    let subFrameId: number;

    const gameTick = () => {
      setTimeElapsed((prev) => prev + 1 / 60);

      // Player Movement Math & Obstruction Avoidance
      let dx = 0;
      let dy = 0;
      const moveSpeed = 0.057;

      if (keysPressedRef.current["w"] || keysPressedRef.current["arrowup"]) dy = -moveSpeed;
      if (keysPressedRef.current["s"] || keysPressedRef.current["arrowdown"]) dy = moveSpeed;
      if (keysPressedRef.current["a"] || keysPressedRef.current["arrowleft"]) dx = -moveSpeed;
      if (keysPressedRef.current["d"] || keysPressedRef.current["arrowright"]) dx = moveSpeed;

      // Handle diagonal normalization
      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }

      setPlayer((pos) => {
        let newX = pos.x + dx;
        let newY = pos.y + dy;

        // Check bounding cylinder boundaries with walls for security
        const checkValid = (qx: number, qy: number) => {
          const checkPuff = 0.28;
          const corners = [
            { x: qx - checkPuff, y: qy - checkPuff },
            { x: qx + checkPuff, y: qy - checkPuff },
            { x: qx - checkPuff, y: qy + checkPuff },
            { x: qx + checkPuff, y: qy + checkPuff },
          ];

          for (const c of corners) {
            const r = Math.floor(c.y);
            const col = Math.floor(c.x);
            if (r < 0 || r >= MAP_ROWS || col < 0 || col >= MAP_COLS) return false;
            if (BUNKER_MAP[r][col] === "#") return false;
          }
          return true;
        };

        const targetX = checkValid(newX, pos.y) ? newX : pos.x;
        const targetY = checkValid(pos.x, newY) ? newY : pos.y;
        return { x: targetX, y: targetY };
      });

      // Battery & Sanity Drainage Calculus
      setFlashlightBattery((battery) => {
        if (!flashlightOn) return Math.min(battery + 0.03, 100); // ambient recharge
        const nextBatt = battery - 0.045;
        if (nextBatt <= 0) {
          setFlashlightOn(false);
          logger.log("WARNING", "FLASHLIGHT POWER DEPLETED - ENTIRE SECTOR PITCH BLACK");
          return 0;
        }
        return nextBatt;
      });

      // Sanity depends on flashlight setting, and monster proximity alert
      setPlayer((pPos) => {
        setStalker((sPos) => {
          const dist = Math.hypot(pPos.x - sPos.x, pPos.y - sPos.y);

          setSanity((prev) => {
            let drain = 0.012; // base ambient terror
            if (!flashlightOn) drain += 0.05; // terror of dark
            if (dist < 4) {
              drain += (4 - dist) * 0.15; // physical monster proximity terror!
            }
            const nextSanity = Math.max(prev - drain, 0);

            // Audio heartbeat adjustment relative to threat level
            const alertFactor = Math.max(0.2, Math.min(1.4, dist / 8));
            synthRef.current?.setHeartbeatSpeed(alertFactor);

            return nextSanity;
          });

          return sPos;
        });
        return pPos;
      });

      // Monster Prowl and Pathfinding Logic
      setStalker((sPos) => {
        setPlayer((pPos) => {
          // Decoy mechanics override
          const attractionTarget = decoyCoords ? { x: decoyCoords.x + 0.5, y: decoyCoords.y + 0.5 } : pPos;
          
          const sDx = attractionTarget.x - sPos.x;
          const sDy = attractionTarget.y - sPos.y;
          const stalkDist = Math.hypot(sDx, sDy);

          // Stalker speeds dependent on visual state and player motion cues
          let stalkerVelocity = 0.026;
          if (stalkDist < 4.2 && flashlightOn) {
            stalkerVelocity = 0.045; // alert active sprint
          }

          // Move stalker sequentially closer
          const stalkNewX = sPos.x + (sDx / stalkDist) * stalkerVelocity;
          const stalkNewY = sPos.y + (sDy / stalkDist) * stalkerVelocity;

          // Resolve basic stalker collision walls so it stays on path
          const canStalkerGo = (qx: number, qy: number) => {
            const r = Math.floor(qy);
            const col = Math.floor(qx);
            if (r < 0 || r >= MAP_ROWS || col < 0 || col >= MAP_COLS) return false;
            return BUNKER_MAP[r][col] !== "#";
          };

          const sTargetX = canStalkerGo(stalkNewX, sPos.y) ? stalkNewX : sPos.x;
          const sTargetY = canStalkerGo(sPos.x, stalkNewY) ? stalkNewY : sPos.y;

          // Check direct death state trigger!
          const proximityToPlayer = Math.hypot(sTargetX - pPos.x, sTargetY - pPos.y);
          if (proximityToPlayer < 0.62) {
            setJumpscareActive(true);
            synthRef.current?.playJumpscareSfx();
            logger.log("CRITICAL", "STALKER PHYSICAL INCURSION RECORDED - COGNITIVE MATRIX SHATTERED");
            setTimeout(() => {
              setJumpscareActive(false);
              setGameOver(true);
            }, 1800);
          }

          return { x: sTargetX, y: sTargetY };
        });
        return sPos;
      });

      // Check item collisions: Battery pickups
      setPlayer((pos) => {
        setBatteriesLeft((batts) => {
          return batts.map((b) => {
            if (!b.active) return b;
            const dist = Math.hypot(pos.x - (b.c + 0.5), pos.y - (b.r + 0.5));
            if (dist < 0.6) {
              setFlashlightBattery((bat) => Math.min(bat + 45, 100));
              synthRef.current?.playCoinSfx();
              logger.log("INFO", `Acquired Tactical Battery at Sector [X: ${b.c}, Y: ${b.r}]`);
              return { ...b, active: false };
            }
            return b;
          });
        });

        // Collect Sanity Syringe
        setSanityPills((pills) => {
          return pills.map((p) => {
            if (!p.active) return p;
            const dist = Math.hypot(pos.x - (p.c + 0.5), pos.y - (p.r + 0.5));
            if (dist < 0.6) {
              setSanity((sa) => Math.min(sa + 35, 100));
              synthRef.current?.playSanitySfx();
              logger.log("INFO", `Administered Neuro-stabilizer adrenaline cell [X: ${p.c}, Y: ${p.r}]`);
              return { ...p, active: false };
            }
            return p;
          });
        });

        // Interact Hack router terminals
        setHacksLeft((hacks) => {
          return hacks.map((h) => {
            if (!h.active) return h;
            const dist = Math.hypot(pos.x - (h.c + 0.5), pos.y - (h.r + 0.5));
            if (dist < 0.6) {
              setOverrideProgress((curr) => Math.min(curr + 34, 100));
              synthRef.current?.playSanitySfx();
              logger.log("INFO", `Hacked Secure Bunker Firewall Router at [X: ${h.c}, Y: ${h.r}] (+34% bypass integrity)`);
              return { ...h, active: false };
            }
            return h;
          });
        });

        return pos;
      });

      subFrameId = requestAnimationFrame(gameTick);
    };

    subFrameId = requestAnimationFrame(gameTick);
    return () => cancelAnimationFrame(subFrameId);
  }, [isPlaying, gameOver, gameWin, flashlightOn, decoyCoords]);

  // 4. Decoy timeout control
  useEffect(() => {
    if (!decoyCoords) return;
    const interval = setInterval(() => {
      setDecoyTimer((prev) => {
        if (prev <= 1) {
          setDecoyCoords(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [decoyCoords]);

  // 5. Draw Game Canvas overlay with Lighting raycasts and shadows
  useEffect(() => {
    if (!isPlaying) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    // Set canvas dimensions
    canvas.width = MAP_COLS * GRID_SIZE;
    canvas.height = MAP_ROWS * GRID_SIZE;

    const render = () => {
      // 5.1 Draw Bunker floor layout
      context.fillStyle = "#0c0d10";
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Render cells
      for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
          const val = BUNKER_MAP[r][c];
          if (val === "#") {
            // High metal grid walls with carbon shadow edges
            context.fillStyle = "#1e2430";
            context.fillRect(c * GRID_SIZE, r * GRID_SIZE, GRID_SIZE, GRID_SIZE);
            context.strokeStyle = "#0d1117";
            context.lineWidth = 2;
            context.strokeRect(c * GRID_SIZE, r * GRID_SIZE, GRID_SIZE, GRID_SIZE);
          } else {
            // Draw floor stripes
            context.strokeStyle = "#0f1115";
            context.lineWidth = 1;
            context.strokeRect(c * GRID_SIZE, r * GRID_SIZE, GRID_SIZE, GRID_SIZE);
          }
        }
      }

      // Draw active inventory items: Battery cells
      batteriesLeft.forEach((b) => {
        if (b.active) {
          context.fillStyle = "#4bc0c0";
          context.beginPath();
          context.arc(b.c * GRID_SIZE + GRID_SIZE / 2, b.r * GRID_SIZE + GRID_SIZE / 2, 7, 0, Math.PI * 2);
          context.fill();
          // Glow borders of active items
          context.strokeStyle = "#ffffff";
          context.lineWidth = 1;
          context.stroke();
        }
      });

      // Draw Adrenaline Syringes
      sanityPills.forEach((p) => {
        if (p.active) {
          context.fillStyle = "#d03a45";
          context.beginPath();
          context.arc(p.c * GRID_SIZE + GRID_SIZE / 2, p.r * GRID_SIZE + GRID_SIZE / 2, 6, 0, Math.PI * 2);
          context.fill();
        }
      });

      // Draw Hacking Router Terminals
      hacksLeft.forEach((h) => {
        if (h.active) {
          context.fillStyle = "#f59e0b";
          context.fillRect(h.c * GRID_SIZE + 10, h.r * GRID_SIZE + 10, GRID_SIZE - 20, GRID_SIZE - 20);
          context.strokeStyle = "#ffffff";
          context.strokeRect(h.c * GRID_SIZE + 10, h.r * GRID_SIZE + 10, GRID_SIZE - 20, GRID_SIZE - 20);
        }
      });

      // Exit Door platform marker
      context.fillStyle = "#2c1717";
      context.fillRect((exitHatchCoords.x - 0.5) * GRID_SIZE, (exitHatchCoords.y - 0.5) * GRID_SIZE, GRID_SIZE, GRID_SIZE);
      context.strokeStyle = "#e11d48";
      context.strokeRect((exitHatchCoords.x - 0.5) * GRID_SIZE, (exitHatchCoords.y - 0.5) * GRID_SIZE, GRID_SIZE, GRID_SIZE);

      // 5.2 Flashlight darkness mask shadowing
      context.fillStyle = "rgba(0, 0, 0, 0.97)";
      context.fillRect(0, 0, canvas.width, canvas.height);

      if (flashlightOn) {
        // Carve out visual lighting glow circle centered on the operator mouse position angle
        const pX = player.x * GRID_SIZE;
        const pY = player.y * GRID_SIZE;

        // Calculate Mouse relative beam angle starting from player
        const rect = canvas.getBoundingClientRect();
        const absoluteMouseX = mousePos.x - rect.left;
        const absoluteMouseY = mousePos.y - rect.top;

        const beamAngle = Math.atan2(absoluteMouseY - pY, absoluteMouseX - pX);

        context.save();
        context.globalCompositeOperation = "destination-out";

        // Draw player direct ambient glow space
        const radius = 120 + Math.random() * 5; // dynamic ambient spark
        const glowRad = context.createRadialGradient(pX, pY, 15, pX, pY, radius);
        glowRad.addColorStop(0, "rgba(255, 255, 255, 1)");
        glowRad.addColorStop(0.3, "rgba(255, 255, 255, 0.4)");
        glowRad.addColorStop(1, "rgba(255, 255, 255, 0)");
        context.fillStyle = glowRad;
        context.beginPath();
        context.arc(pX, pY, radius, 0, Math.PI * 2);
        context.fill();

        // Project flashlight cone directional ray
        const coneLength = 250;
        const aperture = 0.54; // cone spread index
        context.fillStyle = "rgba(255, 255, 255, 0.35)";
        context.beginPath();
        context.moveTo(pX, pY);
        context.arc(
          pX,
          pY,
          coneLength,
          beamAngle - aperture,
          beamAngle + aperture
        );
        context.closePath();
        context.fill();

        context.restore();
      }

      // 5.3 Draw Operator Avatar above darkness mask
      const operatorX = player.x * GRID_SIZE;
      const operatorY = player.y * GRID_SIZE;
      context.fillStyle = "#0284c7";
      context.beginPath();
      context.arc(operatorX, operatorY, 10, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#ffffff";
      context.stroke();

      // Simple yellow flashlight focus beam pointer dot
      if (flashlightOn) {
        context.fillStyle = "rgba(253, 224, 71, 0.5)";
        context.beginPath();
        context.arc(operatorX, operatorY, 4, 0, Math.PI * 2);
        context.fill();
      }

      // 5.4 Draw Stalker if revealed inside current flashlight lighting cone or physically close
      const stX = stalker.x * GRID_SIZE;
      const stY = stalker.y * GRID_SIZE;
      const distToStalker = Math.hypot(player.x - stalker.x, player.y - stalker.y);

      let isRevealed = false;
      if (distToStalker < 1.8) {
        isRevealed = true; // ultra proximities bypass dark
      } else if (flashlightOn) {
        const rect = canvas.getBoundingClientRect();
        const pX = player.x * GRID_SIZE;
        const pY = player.y * GRID_SIZE;
        const absoluteMouseX = mousePos.x - rect.left;
        const absoluteMouseY = mousePos.y - rect.top;
        const beamAngle = Math.atan2(absoluteMouseY - pY, absoluteMouseX - pX);

        // Angle bounds verification
        const angleToStalker = Math.atan2(stY - pY, stX - pX);
        let angleOffset = Math.abs(beamAngle - angleToStalker);
        if (angleOffset > Math.PI) angleOffset = Math.PI * 2 - angleOffset;

        if (angleOffset < 0.54 && distToStalker * GRID_SIZE < 270) {
          isRevealed = true; // revealed within raycone limit
        }
      }

      if (isRevealed) {
        // Terrifying glowing stalker avatar
        context.fillStyle = "#b91c1c";
        context.beginPath();
        context.arc(stX, stY, 11, 0, Math.PI * 2);
        context.fill();

        // Evil glaring pupils
        context.fillStyle = "#ffffff";
        context.fillRect(stX - 4, stY - 4, 3, 3);
        context.fillRect(stX + 1, stY - 4, 3, 3);
      }

      // Render decoy emitter signal if pulsing
      if (decoyCoords) {
        const decX = (decoyCoords.x + 0.5) * GRID_SIZE;
        const decY = (decoyCoords.y + 0.5) * GRID_SIZE;
        context.strokeStyle = "#4bc0c0";
        context.lineWidth = 2;
        context.beginPath();
        context.arc(decX, decY, 12 + (Date.now() % 400) * 0.05, 0, Math.PI * 2);
        context.stroke();
      }
    };

    render();
  }, [isPlaying, player, stalker, flashlightOn, mousePos, decoyCoords, batteriesLeft, sanityPills, hacksLeft]);

  // Handle deploying decoy from the system terminal
  const handleDeployDecoy = () => {
    synthRef.current?.playDecoySfx();
    // Pick random location from map
    let found = false;
    let attempts = 0;
    while (!found && attempts < 100) {
      attempts++;
      const r = Math.floor(Math.random() * MAP_ROWS);
      const c = Math.floor(Math.random() * MAP_COLS);
      if (BUNKER_MAP[r][c] === ".") {
        setDecoyCoords({ x: c, y: r });
        setDecoyTimer(8);
        found = true;
        logger.log("SYSTEM", `SEISMIC DECOY DEPLOYED AT COORDS [X: ${c}, Y: ${r}]`);
      }
    }
  };

  // Safe mode override bypass progress
  const handleOverrideProgress = (added: number) => {
    setOverrideProgress((v) => {
      const next = Math.min(v + added, 100);
      if (next >= 100) {
        logger.log("SYSTEM", `HACK OVERRIDE COMPLETE: CODE IS [ ${bunkerOverrideCode} ]`);
      }
      return next;
    });
  };

  // Submit escape digit keypad verification
  const handleExitKeypadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pX = Math.floor(player.x);
    const pY = Math.floor(player.y);

    const isInExitRange = Math.hypot(player.x - exitHatchCoords.x, player.y - exitHatchCoords.y) < 1.5;

    if (!isInExitRange) {
      alert("KEYPAD ALERT: You must step onto the Escape Gateway door tile (represented by the RED square in Sector center) to access the physical keypad override interface!");
      return;
    }

    if (codeInputValue === bunkerOverrideCode && overrideProgress >= 100) {
      setGameWin(true);
      logger.log("SYSTEM", "ESCAPE GATES OVERRIDDEN. PRESSURE RELEASE DETECTED. SECTOR EXITED SUCCESSFULLY.");
    } else if (overrideProgress < 100) {
      alert("DENIED: System security firedoor firewall is active. You must bypass the firewall with 'override' on the terminal or harvest Hacker Routers before entering keypad combinations!");
    } else {
      alert("INVALID PASSCODE SYNC. TERMINAL REJECTED CODE.");
    }
  };

  return (
    <ErrorBoundary>
      <div className={`min-h-screen grid grid-rows-[auto_1fr] bg-[#030304] text-gray-300 font-mono relative overflow-hidden crt crt-animate select-none`}>
        {/* Real-time CRT Scanlines glow Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-[#ff3b3b]/1 to-transparent pointer-events-none z-50 mix-blend-color-dodge" />
        
        {/* Jumpscare Terror visual mask */}
        {jumpscareActive && (
          <div className="absolute inset-0 bg-red-950/85 z-[99991] flex flex-col items-center justify-center border-4 border-red-500 animate-pulse bg-cover">
            <h1 className="text-3xl sm:text-7xl font-extrabold text-[#b91c1c] tracking-widest glitch-shake scale-110">
              ITS INSIDE YOUR HEAD
            </h1>
            <p className="text-lg text-red-500 font-bold mt-4 tracking-wider">CRITICAL SYSTEM FAILURE</p>
            <div className="text-9xl mt-4">👻</div>
          </div>
        )}

        {/* Dashboard Tactical Header */}
        <header className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#08090e] border-b border-gray-900 px-6 py-4 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <Skull className="w-8 h-8 text-[#b91c1c] animate-pulse" />
            <div>
              <h1 className="text-md sm:text-xl font-black tracking-widest text-[#eaeaea]">PARANOIA: COLD INTERCEPT</h1>
              <p className="text-[10px] text-gray-500 font-bold tracking-widest">TACTICAL MULTI-SECTOR EMERGENCY SURVIVAL</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-gray-400">
            <div className="flex items-center gap-2 bg-[#0d121b] border border-[#1b2535] px-3 py-1.5 rounded">
              <Compass className="w-4 h-4 text-sky-400 animate-spin" style={{ animationDuration: '8s' }} />
              <span>COORDS: <strong className="text-gray-200">X:{player.x.toFixed(1)} Y:{player.y.toFixed(1)}</strong></span>
            </div>

            <div className="flex items-center gap-2 bg-[#0d1511] border border-[#1b3420] px-3 py-1.5 rounded">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span>GRID OVERRIDE: <strong className="text-emerald-400">{overrideProgress}%</strong></span>
            </div>

            <button
              onClick={() => {
                if (synthRef.current) {
                  const muted = synthRef.current.toggleMute();
                  setIsMuted(muted);
                }
              }}
              id="sound-toggle-btn"
              className="flex items-center justify-center p-2 rounded bg-[#0d1017] border border-gray-800 hover:border-gray-700 hover:text-white transition duration-150"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            <button
              onClick={() => setShowBugReport(true)}
              id="show-bug-report-btn"
              className="flex items-center gap-2 px-3 py-1.5 rounded bg-red-950/20 shadow-lg border border-red-900/40 hover:border-red-600/60 text-red-400 hover:text-red-300 font-bold transition duration-150"
            >
              <Bug className="w-4 h-4 text-red-500" />
              REPORT INCIDENT
            </button>
          </div>
        </header>

        {/* Start Game Lobby Mask */}
        {!isPlaying ? (
          <div className="flex flex-col items-center justify-center p-6 text-center bg-black relative">
            <div className="max-w-xl bg-[#090a0d] border border-gray-800 p-8 rounded-lg shadow-2xl space-y-6">
              <Skull className="w-16 h-16 text-[#b91c1c] mx-auto animate-bounce" />
              <h2 className="text-2xl font-black text-gray-100 uppercase tracking-widest font-mono">
                COLD HARBOR OUT-POST DEPLOYMENT
              </h2>
              <p className="text-xs text-gray-400 leading-relaxed text-left">
                You are locked in a secure tactical sub-bunker containment block. A hyper-adaptive sonic predator has breached boundaries and is tracking your energy traces.
              </p>
              <div className="space-y-2 text-xs text-left bg-black p-4 rounded border border-gray-900 text-[#4bc0c0]">
                <strong className="text-white block">OPERATIONAL BRIEF:</strong>
                <li>• Use <strong className="text-white">WASD / Arrow Keys</strong> to pace through the bunker map.</li>
                <li>• Direct your mouse coordinate beam to focus flashlight projections.</li>
                <li>• Flashlight batteries drain quickly! Harvest power cubes (teal circles).</li>
                <li>• Access terminals or type commands like <strong className="text-white">override</strong> in the system debugger console to unlock the codes.</li>
                <li>• Reach the exit gateway door, enter the code, and breach escape safety!</li>
              </div>

              <button
                onClick={handleStartGame}
                id="start-bunker-lobby-btn"
                className="w-full flex items-center justify-center gap-2 bg-[#b91c1c] hover:bg-red-800 text-white font-bold py-3 px-6 rounded border border-red-500 transition duration-150 scale-100 hover:scale-102 active:scale-95 shadow-xl"
              >
                <Play className="w-5 h-5 fill-white" />
                INITIATE SECURITY INSERTION PROCEDURES
              </button>
            </div>
          </div>
        ) : (
          /* Main Play screen splitting Canvas and System Command Line Terminal */
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] divide-y lg:divide-y-0 lg:divide-x divide-gray-900 overflow-hidden h-full">
            
            {/* Left Sandbox Viewport */}
            <div className="flex flex-col p-4 bg-[#040405] overflow-y-auto h-full space-y-4">
              {/* Survival Statistics Indicators */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                {/* Sanity Meter */}
                <div className="flex items-center justify-between bg-black border border-[#1f1717] px-4 py-3 rounded">
                  <div className="flex items-center gap-2">
                    <Heart className="w-5 h-5 text-[#b91c1c] pulse-heart" />
                    <div>
                      <p className="text-[10px] text-gray-500 font-bold tracking-wider">BIOS METABOLICS</p>
                      <h3 className="text-sm font-black text-gray-200">SANITY: {Math.floor(sanity)}%</h3>
                    </div>
                  </div>
                  <div className="w-16 bg-gray-950 h-1.5 rounded border border-gray-900 overflow-hidden">
                    <div
                      className="bg-[#b91c1c] h-full transition-all"
                      style={{ width: `${sanity}%` }}
                    />
                  </div>
                </div>

                {/* Flashlight Energy Cell */}
                <div className="flex items-center justify-between bg-black border border-[#161f22] px-4 py-3 rounded">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-sky-400 animate-pulse" />
                    <div>
                      <p className="text-[10px] text-gray-500 font-bold tracking-wider">FLASHLIGHT POWER</p>
                      <h3 className="text-sm font-black text-gray-200">BATTERY: {Math.floor(flashlightBattery)}%</h3>
                    </div>
                  </div>
                  <div className="w-16 bg-gray-950 h-1.5 rounded border border-gray-900 overflow-hidden">
                    <div
                      className="bg-sky-400 h-full transition-all"
                      style={{ width: `${flashlightBattery}%` }}
                    />
                  </div>
                </div>

                {/* Physical Exit keypad input system */}
                <form
                  onSubmit={handleExitKeypadSubmit}
                  className="flex items-center justify-between bg-black border border-gray-900 px-3 py-2 rounded gap-2"
                >
                  <div className="flex items-center gap-2">
                    <BatteryCharging className="w-4 h-4 text-rose-500" />
                    <span className="text-[10px] text-gray-400">EXIT PIN:</span>
                  </div>
                  <input
                    type="password"
                    maxLength={4}
                    value={codeInputValue}
                    onChange={(e) => setCodeInputValue(e.target.value)}
                    placeholder="KEY CODE"
                    className="w-20 bg-[#0a0a0c] border border-gray-800 text-center text-xs text-rose-400 font-bold font-mono tracking-widest focus:outline-none focus:border-rose-500 py-1 rounded select-text"
                  />
                  <button
                    type="submit"
                    id="door-pad-unlock-btn"
                    className="bg-rose-950 hover:bg-rose-900 text-rose-400 font-bold px-2 py-1 rounded text-[10px] border border-rose-800 transition duration-150"
                  >
                    SUBMIT
                  </button>
                </form>

              </div>

              {/* Responsive interactive game canvas */}
              <div className="flex-1 flex items-center justify-center bg-black rounded border border-gray-900 p-2 relative overflow-hidden h-[420px] max-h-[580px] select-none">
                <canvas
                  ref={canvasRef}
                  onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                  className="max-w-full max-h-full cursor-crosshair rounded shadow-2xl selection:bg-transparent"
                />

                {/* Map labels and dynamic instruction panels */}
                <div className="absolute top-4 left-4 text-[10px] bg-black/85 border border-[#4bc0c0]/30 px-3 py-2 rounded text-[#4bc0c0] pointer-events-none uppercase">
                  ACTIVE TASK: BYPASS TERMINAL OVERRIDE (TYPE &apos;OVERRIDE&apos; IN R-PANEL CONSOLE) -> REACH EXIT KEYPAD (RED GRID TILE) -> BREACH OUT
                </div>
              </div>
            </div>

            {/* Right System Debugging Terminal Area */}
            <div className="h-full flex flex-col min-h-[350px]">
              <SafeModeTerminal
                batteryLevel={flashlightBattery}
                sanityLevel={sanity}
                bunkerOverrideCode={bunkerOverrideCode}
                isOverrideComplete={overrideProgress >= 100}
                onOverrideProgress={handleOverrideProgress}
                stalkerDistance={Math.hypot(player.x - stalker.x, player.y - stalker.y) * 4.5} // scale metric to relative meters
                onDeployDecoy={handleDeployDecoy}
                overrideProgress={overrideProgress}
                className="flex-1"
              />
            </div>

          </div>
        )}

        {/* End of Life Game Over / Win overlays screen modals */}
        {gameOver && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[99999] flex flex-col items-center justify-center p-6 text-center font-mono crt">
            <div className="max-w-md bg-[#0a0505] border border-[#ff3333]/30 p-8 rounded shadow-2xl space-y-6">
              <Skull className="w-16 h-16 text-[#ff3333] mx-auto animate-pulse" />
              <h1 className="text-2xl font-black text-[#ff3333] tracking-widest">WIPED FROM THE INFRASTRUSTURE</h1>
              <p className="text-xs text-gray-400 leading-relaxed">
                The tactical predator has compromised your cognitive shield limits. Life diagnostics terminated offline.
              </p>
              
              <div className="bg-[#120505] border border-red-950 p-4 rounded text-left text-[10px] text-red-400 leading-relaxed space-y-1">
                <strong>DIAGNOSTIC STATUS LOG:</strong>
                <li>• Elapsed Survival Duty: <span className="text-white">{Math.floor(timeElapsed)} seconds</span></li>
                <li>• Terminals bypassed: <span className="text-white">{overrideProgress}%</span></li>
                <li>• Intrusion alert level: <span className="text-white">EXTREME PROXIMITY CRITICAL</span></li>
              </div>

              <button
                onClick={handleStartGame}
                id="retry-lobby-from-loss-btn"
                className="w-full flex items-center justify-center gap-2 bg-[#7f1d1d] hover:bg-red-800 text-white font-bold py-3 px-6 rounded border border-red-600 transition duration-150 active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                RE-SYNCHRONIZE AND DEPLOY OPERATOR
              </button>
            </div>
          </div>
        )}

        {gameWin && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[99999] flex flex-col items-center justify-center p-6 text-center font-mono crt">
            <div className="max-w-md bg-[#050a06] border border-[#33ff33]/30 p-8 rounded shadow-2xl space-y-6">
              <ShieldCheck className="w-16 h-16 text-[#33ff33] mx-auto animate-bounce" />
              <h1 className="text-2xl font-black text-[#33ff33] tracking-widest">GATE ESCAPE DE-SECTOR SUCCESSFUL</h1>
              <p className="text-xs text-gray-400 leading-relaxed">
                You input the bypass key code [ {bunkerOverrideCode} ] successfully. Exit blast gates sealed completely behind you, securing safety.
              </p>

              <div className="bg-[#051205] border border-emerald-950 p-4 rounded text-left text-[10px] text-emerald-400 leading-relaxed space-y-1">
                <strong>DUTY DIAGNOSTIC LOGS:</strong>
                <li>• Survival Duration: <span className="text-white">{Math.floor(timeElapsed)} seconds</span></li>
                <li>• Remaining battery cell: <span className="text-white">{Math.floor(flashlightBattery)}%</span></li>
                <li>• Biological sanity preserve: <span className="text-white">{Math.floor(sanity)}%</span></li>
                <li>• System Security level: <span className="text-white">BYPASS CLEARED OK</span></li>
              </div>

              <button
                onClick={handleStartGame}
                id="victory-retry-lobby-btn"
                className="w-full flex items-center justify-center gap-2 bg-[#1b3a21] hover:bg-[#285732] text-[#33ff33] font-bold py-3 px-6 rounded border border-[#33ff33]/30 transition duration-150 active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                BEGIN NEXT PATROL DUTY ASSIGNMENT
              </button>
            </div>
          </div>
        )}

        {/* SECURE BUG REPORT INCIDENT MODAL INTERFACE */}
        <BugReportModal
          isOpen={showBugReport}
          onClose={() => setShowBugReport(false)}
          gameTimeElapsed={timeElapsed}
          sanityLevel={sanity}
          playerState={{
            x: player.x,
            y: player.y,
            stalker_x: stalker.x,
            stalker_y: stalker.y,
            decoyCoords,
            overrideProgress,
          }}
        />
      </div>
    </ErrorBoundary>
  );
}
