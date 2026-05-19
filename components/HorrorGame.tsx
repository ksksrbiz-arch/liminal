'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { auth, db } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';

const POSSIBLE_NOTES = [
    "I can hear it breathing. It doesn't use the doors.",
    "Don't look at the walls for too long.",
    "It mimics their voices.",
    "The layout changes when you blink.",
    "I've been running for three days. The corridors are identical.",
    "If you find this, turn back. There is no exit.",
    "I swear I heard my own footsteps behind me.",
    "The air is getting colder here."
];

export type InteractableItem = {
    type: 'note' | 'artifact' | 'pipe' | 'switch' | 'phone' | 'cabinet';
    id: string;
    message: string;
    name?: string;
};

const POSSIBLE_ARTIFACTS = [
    { id: "a1", name: "Shattered Tape Recorder", message: "Voice log: '...it mimics the rescue team perfectly. Don't answer...'", color: 0x2a2a2a, shape: "box" },
    { id: "a2", name: "Child's Toy Block", message: "A wooden block with a strange rune burned into it. It feels slightly warm.", color: 0x8b5a2b, shape: "box" },
    { id: "a3", name: "Bloody ID Badge", message: "Dr. Aris Thorne. The photo is scratched out entirely.", color: 0x550000, shape: "tetra" },
    { id: "a4", name: "Melted Flashlight", message: "The batteries aren't just dead, they're completely crystallized.", color: 0x555555, shape: "cylinder" },
    { id: "a5", name: "Surgical Scalpel", message: "It's clean. Too clean. It hums when you hold it to your ear.", color: 0xaaaaaa, shape: "cylinder" }
];

const POSSIBLE_CALLS = [
    { id: "c1", name: "Missed Call", message: "STATIC... 'Don't let it see your face.' ...STATIC" },
    { id: "c2", name: "Missed Call", message: "'Can you hear me? We are trapped in Sector 4. The lights...'" },
    { id: "c3", name: "Missed Call", message: "Heavy breathing, followed by a wet tearing sound." }
];

const POSSIBLE_MEMORIES = [
    { id: "m1", name: "Fragmented Memory", message: "LOG 492: The geometry here shifts when unobserved. We lost Jenkins to a hallway that wasn't there yesterday." },
    { id: "m2", name: "Fragmented Memory", message: "LOG 501: It's adapting. It learned to sound like my daughter. I don't have a daughter." },
    { id: "m3", name: "Fragmented Memory", message: "LOG 512: The breaker boxes are failing. Keeping the lights on seems to aggravate it. But the dark..." }
];

export default function HorrorGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [scare, setScare] = useState(false);
  
  // Interaction states
  const [hoveredNote, setHoveredNote] = useState<InteractableItem | null>(null);
  const hoveredNoteRef = useRef<InteractableItem | null>(null);
  const [readingNote, setReadingNote] = useState<InteractableItem | null>(null);
  const interactablesRef = useRef<THREE.Mesh[]>([]);
  const raycaster = new THREE.Raycaster();
  const centerPoint = new THREE.Vector2(0, 0);
  const [user, setUser] = useState<any>(null); // simple state for UI
  const userRef = useRef<any>(null);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  const [showNotesMenu, setShowNotesMenu] = useState(false);
  const envStatesRef = useRef<Record<string, any>>({});

  const [isMobileMode, setIsMobileMode] = useState<boolean>(
     typeof window !== 'undefined' ? (window.innerWidth < 768 || 'ontouchstart' in window) : false
  );
  
  useEffect(() => {
     // Intentionally empty, relying on initial state. Could add resize listener here if needed.
  }, []);

  const touchLeftRef = useRef<{active: boolean; id: number | null; start: THREE.Vector2; current: THREE.Vector2}>({
      active: false, id: null, start: new THREE.Vector2(), current: new THREE.Vector2()
  });
  const touchRightRef = useRef<{active: boolean; id: number | null; last: THREE.Vector2; deltaX: number; deltaY: number}>({
      active: false, id: null, last: new THREE.Vector2(), deltaX: 0, deltaY: 0
  });

  // Touch event handlers for mobile mapped to full screen overlay
  const handleTouchStart = (e: React.TouchEvent) => {
       if (!isStarted || gameOver || readingNote) return;
       for (let i = 0; i < e.changedTouches.length; i++) {
           const touch = e.changedTouches[i];
           if (touch.clientX < window.innerWidth / 2) {
               if (!touchLeftRef.current.active) {
                   touchLeftRef.current = {
                       active: true,
                       id: touch.identifier,
                       start: new THREE.Vector2(touch.clientX, touch.clientY),
                       current: new THREE.Vector2(touch.clientX, touch.clientY)
                   };
               }
           } else {
               if (!touchRightRef.current.active) {
                   touchRightRef.current = {
                        active: true,
                        id: touch.identifier,
                        last: new THREE.Vector2(touch.clientX, touch.clientY),
                        deltaX: 0,
                        deltaY: 0
                   };
               }
           }
       }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
       if (!isStarted || gameOver || readingNote) return;
       for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touchLeftRef.current.active && touch.identifier === touchLeftRef.current.id) {
                 touchLeftRef.current.current.set(touch.clientX, touch.clientY);
            } else if (touchRightRef.current.active && touch.identifier === touchRightRef.current.id) {
                 touchRightRef.current.deltaX += touch.clientX - touchRightRef.current.last.x;
                 touchRightRef.current.deltaY += touch.clientY - touchRightRef.current.last.y;
                 touchRightRef.current.last.set(touch.clientX, touch.clientY);
            }
       }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
       for (let i = 0; i < e.changedTouches.length; i++) {
           const touch = e.changedTouches[i];
           if (touchLeftRef.current.active && touch.identifier === touchLeftRef.current.id) {
               touchLeftRef.current.active = false;
           } else if (touchRightRef.current.active && touch.identifier === touchRightRef.current.id) {
               touchRightRef.current.active = false;
           }
       }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
       setUser(u);
       userRef.current = u;
       if (u) {
           try {
               const saveRef = doc(db, 'users', u.uid, 'save', 'data');
               const docSnap = await getDoc(saveRef);
               if (docSnap.exists()) {
                   setSavedNotes(docSnap.data().notesFound || []);
               }
           } catch (e) {
               console.error("Failed to load progress:", e);
           }
       } else {
           setSavedNotes([]);
       }
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
      setLoadingLogin(true);
      try {
          const provider = new GoogleAuthProvider();
          await signInWithPopup(auth, provider);
      } catch (e: any) {
          console.error("Login Error:", e);
      } finally {
          setLoadingLogin(false);
      }
  };

  const saveNoteFound = async (noteId: string) => {
      setSavedNotes(prev => {
          if (!prev.includes(noteId)) {
              return [...prev, noteId];
          }
          return prev;
      });

      const currentUser = userRef.current;
      if (!currentUser) return;
      try {
          const saveRef = doc(db, 'users', currentUser.uid, 'save', 'data');
          const docSnap = await getDoc(saveRef);
          if (!docSnap.exists()) {
              await setDoc(saveRef, {
                  notesFound: [noteId],
                  updatedAt: new Date().toISOString()
              });
          } else {
              await updateDoc(saveRef, {
                  notesFound: arrayUnion(noteId),
                  updatedAt: new Date().toISOString()
              });
          }
      } catch (e) {
          console.error("Failed to save progress", e);
      }
  };

  useEffect(() => {
    if (!mountRef.current || gameOver) return;

    // --- Web Worker Setup (Computational Optimization) ---
    const aiWorker = new Worker('/aiWorker.js');
    type AIResult = { dirX: number; dirZ: number; dist: number };
    let aiState: AIResult = { dirX: 0, dirZ: 0, dist: 0 };
    
    aiWorker.onmessage = (e) => {
        aiState = e.data;
    };

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const fogColor = new THREE.Color(0x06080a); // Sickly cold blue-grey
    scene.background = fogColor;
    scene.fog = new THREE.FogExp2(fogColor, 0.12); 


    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.y = 1.4; 
    camera.position.x = 2.5; // starting cell (1 * unit)
    camera.position.z = 2.5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); 
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2; // increased exposure slightly
    mountRef.current.appendChild(renderer.domElement);
    
    // --- Post-Processing Setup ---
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const DreadShader = {
        uniforms: {
            "tDiffuse": { value: null },
            "time": { value: 0.0 },
            "distortionIntensity": { value: 0.0 }, // scales with stalker proximity
            "flickerState": { value: 0.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float time;
            uniform float distortionIntensity;
            uniform float flickerState;
            varying vec2 vUv;

            // Pseudo-random noise
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }

            void main() {
                vec2 uv = vUv;
                
                // 1. Proximity-Based Screen Distortion (Heat-haze ripple)
                if (distortionIntensity > 0.01) {
                    float ripple = sin(uv.y * 20.0 + time * 5.0) * 0.005 * distortionIntensity;
                    uv.x += ripple;
                }
                
                // 2. Dynamic Chromatic Aberration
                // Splitting R and B channels proportional to stalker proximity
                float caOffset = 0.005 * distortionIntensity; 
                if (flickerState > 0.5) { // Flashlight glitch spike
                     caOffset += (random(uv + time) * 0.02);
                }

                vec2 uvR = uv + vec2(caOffset, 0.0);
                vec2 uvB = uv - vec2(caOffset, 0.0);

                vec4 colorR = texture2D(tDiffuse, uvR);
                vec4 colorG = texture2D(tDiffuse, uv);
                vec4 colorB = texture2D(tDiffuse, uvB);

                vec4 finalColor = vec4(colorR.r, colorG.g, colorB.b, 1.0);

                // 3. Vignette Pulse 
                // Heartbeat driven vignette bounding the edges
                float dist = distance(uv, vec2(0.5));
                float pulse = sin(time * 6.0) * 0.5 + 0.5; // Heartbeat-esque pulse rate
                // Base vignette + extra darkness scaling with distortion and heartbeat pulse
                float vignette = smoothstep(0.8, 0.3 + (pulse * 0.1 * distortionIntensity), dist * (1.0 + distortionIntensity * 0.5));
                
                finalColor.rgb *= vignette;

                gl_FragColor = finalColor;
            }
        `
    };

    const dreadPass = new ShaderPass(DreadShader);
    composer.addPass(dreadPass);

    // --- Controls ---
    const controls = new PointerLockControls(camera, document.body);
    controlsRef.current = controls;

    controls.addEventListener('lock', () => setIsLocked(true));
    controls.addEventListener('unlock', () => setIsLocked(false));

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); 
    scene.add(ambientLight);
    
    // Add a dim hemisphere light for better shading
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.6);
    scene.add(hemiLight);

    const flashLight = new THREE.SpotLight(0xfff8e7, 300); // physically correct spotlight intensity
    flashLight.position.set(0, 0, 0);
    flashLight.target.position.set(0, 0, -1);
    flashLight.angle = Math.PI / 5;
    flashLight.penumbra = 0.8;
    flashLight.decay = 2; // more realistic distance decay
    flashLight.distance = 40;
    flashLight.castShadow = true;
    flashLight.shadow.mapSize.width = 1024;
    flashLight.shadow.mapSize.height = 1024;
    flashLight.shadow.bias = -0.001;

    camera.add(flashLight);
    camera.add(flashLight.target);
    scene.add(camera);

    let flickerTimer = 0;
    
    // --- Maze Generation ---
    const mazeSize = 25;
    
    // --- Procedural Textures ---
    const createNoiseTexture = (baseColor: string, noiseColor: string, tileSize: number = 10, isCheckerboard: boolean = false) => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = baseColor;
            ctx.fillRect(0, 0, 512, 512);

            if (isCheckerboard) {
                ctx.fillStyle = noiseColor;
                for (let i = 0; i < 512; i += tileSize) {
                    for (let j = 0; j < 512; j += tileSize) {
                        if ((i / tileSize) % 2 === (j / tileSize) % 2) {
                            ctx.fillRect(i, j, tileSize, tileSize);
                        }
                    }
                }
            }

            // Add noise and grunge
            for (let i = 0; i < 50000; i++) {
                ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)';
                ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 3, Math.random() * 3);
            }

            // Subdued vertical and horizontal streaks
            for (let i = 0; i < 20; i++) {
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.fillRect(Math.random() * 512, 0, Math.random() * 5, 512);
                ctx.fillRect(0, Math.random() * 512, 512, Math.random() * 5);
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        return texture;
    };

    const ceilingTex = createNoiseTexture('#1a1a1a', '#0a0a0a', 32, false);

    const createAdvancedWallTextures = () => {
        const resolution = 256;
        const canvasDiffuse = document.createElement('canvas');
        const canvasRough = document.createElement('canvas');
        const canvasBump = document.createElement('canvas'); // Used to generate the Normal Map
        canvasDiffuse.width = canvasRough.width = canvasBump.width = resolution;
        canvasDiffuse.height = canvasRough.height = canvasBump.height = resolution;
        
        const ctxDiffuse = canvasDiffuse.getContext('2d')!;
        const ctxRough = canvasRough.getContext('2d')!;
        const ctxBump = canvasBump.getContext('2d')!;
        
        // Base wall colors (Concrete-like with sickly flesh tone for SSS base)
        ctxDiffuse.fillStyle = '#4c4840'; 
        ctxDiffuse.fillRect(0, 0, resolution, resolution);
        
        ctxRough.fillStyle = '#dddddd'; // highly rough by default
        ctxRough.fillRect(0, 0, resolution, resolution);
        
        ctxBump.fillStyle = '#808080'; // middle gray for bump
        ctxBump.fillRect(0, 0, resolution, resolution);
        
        // Add random grunge and noise
        for (let i = 0; i < 80000; i++) {
             const x = Math.random() * resolution;
             const y = Math.random() * resolution;
             const size = Math.random() * 3 + 1;
             const isDark = Math.random() > 0.4;
             
             // Diffuse noise
             ctxDiffuse.fillStyle = isDark ? 'rgba(30, 25, 20, 0.15)' : 'rgba(100, 100, 90, 0.05)';
             ctxDiffuse.fillRect(x, y, size, size);
             
             // Bump noise (darker = deeper)
             ctxBump.fillStyle = isDark ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
             ctxBump.fillRect(x, y, size, size);
        }
        
        // Mold growth (bottom edges and corners) with color variations
        for (let i = 0; i < 300; i++) {
             const x = Math.random() * resolution;
             // Bias towards bottom
             const y = resolution - (Math.random() * Math.random() * 400); 
             
             const rad = Math.random() * 50 + 10;
             const gradD = ctxDiffuse.createRadialGradient(x, y, 0, x, y, rad);
             
             // Varied mold colors: sickly green, dark brown, or black
             const type = Math.random();
             const moldColor = type > 0.6 ? '15, 30, 15' : (type > 0.3 ? '30, 20, 10' : '10, 10, 10');
             
             gradD.addColorStop(0, `rgba(${moldColor}, 0.7)`);
             gradD.addColorStop(1, `rgba(${moldColor}, 0)`);
             ctxDiffuse.fillStyle = gradD;
             ctxDiffuse.beginPath();
             ctxDiffuse.arc(x, y, rad, 0, Math.PI*2);
             ctxDiffuse.fill();
             
             // Mold is organic, high roughness
             const gradR = ctxRough.createRadialGradient(x, y, 0, x, y, rad);
             gradR.addColorStop(0, 'rgba(255, 255, 255, 0.9)'); 
             gradR.addColorStop(1, 'rgba(255, 255, 255, 0)');
             ctxRough.fillStyle = gradR;
             ctxRough.beginPath();
             ctxRough.arc(x, y, rad, 0, Math.PI*2);
             ctxRough.fill();
             
             // Mold bumps up
             const gradB = ctxBump.createRadialGradient(x, y, 0, x, y, rad);
             gradB.addColorStop(0, 'rgba(190, 190, 190, 0.6)'); 
             gradB.addColorStop(1, 'rgba(128, 128, 128, 0)');
             ctxBump.fillStyle = gradB;
             ctxBump.beginPath();
             ctxBump.arc(x, y, rad, 0, Math.PI*2);
             ctxBump.fill();
        }
        
        // Advanced branching cracks
        for (let c = 0; c < 45; c++) {
             let cx = Math.random() * resolution;
             let cy = Math.random() * resolution;
             const crackDepth = Math.random() * 0.8 + 0.1; 
             
             const drawBranch = (bx: number, by: number, length: number, angle: number, width: number) => {
                 if (length <= 0 || width <= 0.1) return;
                 ctxDiffuse.beginPath();
                 ctxBump.beginPath();
                 ctxDiffuse.moveTo(bx, by);
                 ctxBump.moveTo(bx, by);
                 
                 for(let s = 0; s < 5; s++) {
                      bx += Math.cos(angle) * (length / 5);
                      by += Math.sin(angle) * (length / 5);
                      angle += (Math.random() - 0.5) * 1.5; // snake randomly
                      ctxDiffuse.lineTo(bx, by);
                      ctxBump.lineTo(bx, by);
                 }
                 ctxDiffuse.strokeStyle = `rgba(10, 10, 10, ${crackDepth})`;
                 ctxDiffuse.lineWidth = width;
                 ctxDiffuse.stroke();
                 
                 ctxBump.strokeStyle = `rgba(0, 0, 0, ${crackDepth})`; // Deep bump for cracks
                 ctxBump.lineWidth = width;
                 ctxBump.stroke();
                 
                 // Random probability to branch
                 if (Math.random() > 0.4) {
                     drawBranch(bx, by, length * 0.7, angle + (Math.random() * 1.5 + 0.5), width * 0.6);
                     drawBranch(bx, by, length * 0.7, angle - (Math.random() * 1.5 + 0.5), width * 0.6);
                 }
             };
             
             drawBranch(cx, cy, Math.random() * 80 + 30, Math.random() * Math.PI * 2, Math.random() * 2 + 1);
        }
        
        // Damp patches (top/middle)
        for (let w = 0; w < 20; w++) {
             const x = Math.random() * resolution;
             const y = Math.random() * 500; 
             const rad = Math.random() * 120 + 40;
             
             const gradD = ctxDiffuse.createRadialGradient(x, y, 0, x, y, rad);
             gradD.addColorStop(0, 'rgba(40, 35, 30, 0.6)');
             gradD.addColorStop(1, 'rgba(40, 35, 30, 0)');
             ctxDiffuse.fillStyle = gradD;
             ctxDiffuse.beginPath();
             ctxDiffuse.arc(x, y, rad, 0, Math.PI*2);
             ctxDiffuse.fill();

             // Damp patches have low roughness (shiny)
             const gradR = ctxRough.createRadialGradient(x, y, 0, x, y, rad);
             gradR.addColorStop(0, 'rgba(40, 40, 40, 0.85)'); 
             gradR.addColorStop(1, 'rgba(200, 200, 200, 0)');
             ctxRough.fillStyle = gradR;
             ctxRough.beginPath();
             ctxRough.arc(x, y, rad, 0, Math.PI*2);
             ctxRough.fill();
        }

        // Generate Normal Map from Bump Map
        const normalCanvas = document.createElement('canvas');
        normalCanvas.width = resolution;
        normalCanvas.height = resolution;
        const bumpImgData = ctxBump.getImageData(0, 0, resolution, resolution);
        const normalImgData = normalCanvas.getContext('2d')!.createImageData(resolution, resolution);
        const bumpData = bumpImgData.data;
        const normData = normalImgData.data;
        
        for (let y = 0; y < resolution; y++) {
            for (let x = 0; x < resolution; x++) {
                const idx = (y * resolution + x) * 4;
                const idxL = (y * resolution + Math.max(0, x - 1)) * 4;
                const idxR = (y * resolution + Math.min(resolution - 1, x + 1)) * 4;
                const idxU = (Math.max(0, y - 1) * resolution + x) * 4;
                const idxD = (Math.min(resolution - 1, y + 1) * resolution + x) * 4;
                
                const hL = bumpData[idxL] / 255.0;
                const hR = bumpData[idxR] / 255.0;
                const hU = bumpData[idxU] / 255.0;
                const hD = bumpData[idxD] / 255.0;
                
                const scale = 5.0; 
                const nX = (hL - hR) * scale;
                const nY = (hU - hD) * scale;
                const nZ = 1.0;
                
                const len = Math.sqrt(nX*nX + nY*nY + nZ*nZ);
                
                normData[idx] = ((nX/len) * 0.5 + 0.5) * 255;
                normData[idx + 1] = ((nY/len) * 0.5 + 0.5) * 255;
                normData[idx + 2] = ((nZ/len) * 0.5 + 0.5) * 255;
                normData[idx + 3] = 255;
            }
        }
        normalCanvas.getContext('2d')!.putImageData(normalImgData, 0, 0);

        const diffuseTex = new THREE.CanvasTexture(canvasDiffuse);
        const roughTex = new THREE.CanvasTexture(canvasRough);
        const normalTex = new THREE.CanvasTexture(normalCanvas); // Real normal map
        
        diffuseTex.magFilter = THREE.NearestFilter;
        diffuseTex.minFilter = THREE.NearestFilter;
        roughTex.magFilter = THREE.NearestFilter;
        roughTex.minFilter = THREE.NearestFilter;
        normalTex.magFilter = THREE.NearestFilter;
        normalTex.minFilter = THREE.NearestFilter;
        
        diffuseTex.wrapS = roughTex.wrapS = normalTex.wrapS = THREE.RepeatWrapping;
        diffuseTex.wrapT = roughTex.wrapT = normalTex.wrapT = THREE.RepeatWrapping;
        
        // --- Origin Private File System (OPFS) Caching ---
        // Save the generated massive texture maps in small cryptographic chunks to OPFS in background
        // Eliminates download/generation time on subsequent plays.
        if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
            navigator.storage.getDirectory().then(root => {
                canvasDiffuse.toBlob(blob => {
                    if(blob) root.getFileHandle('wall_diffuse.chunk', { create: true })
                                 .then(h => h.createWritable())
                                 .then(w => { w.write(blob); w.close(); });
                }, 'image/webp', 0.8);
            }).catch(e => console.log('OPFS caching unsupported or failed'));
        }

        return { diffuseTex, roughTex, normalTex };
    };

    const advancedWall = createAdvancedWallTextures();
    const wallTex = advancedWall.diffuseTex;
    const wallRoughTex = advancedWall.roughTex;
    const wallNormalTex = advancedWall.normalTex;

    const createAdvancedFloorTextures = (tileSize: number) => {
        const resolution = 256;
        const canvasDiffuse = document.createElement('canvas');
        const canvasRough = document.createElement('canvas');
        canvasDiffuse.width = canvasRough.width = resolution;
        canvasDiffuse.height = canvasRough.height = resolution;
        
        const ctxDiffuse = canvasDiffuse.getContext('2d')!;
        const ctxRough = canvasRough.getContext('2d')!;
        
        // Base tile colors
        const colorA = '#2a2a28';
        const colorB = '#1f1f1d';
        
        ctxDiffuse.fillStyle = colorA;
        ctxDiffuse.fillRect(0, 0, resolution, resolution);
        ctxRough.fillStyle = '#cccccc'; // Default roughness
        ctxRough.fillRect(0, 0, resolution, resolution);
        
        // Simple seeded random to keep grid consistent
        const seededRandom = (x: number, y: number) => { return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1); }

        for (let i = 0; i < resolution; i += tileSize) {
            for (let j = 0; j < resolution; j += tileSize) {
                const isDarker = ((i / tileSize) % 2 === (j / tileSize) % 2);
                const tileRand = seededRandom(i + 1, j + 1);
                
                const hexColor = isDarker ? colorB : colorA;
                ctxDiffuse.fillStyle = hexColor; 
                ctxDiffuse.globalAlpha = 0.8 + tileRand * 0.2; // Color variation
                ctxDiffuse.fillRect(i, j, tileSize, tileSize);
                ctxDiffuse.globalAlpha = 1.0;
                
                // Fine noise per tile
                for(let n = 0; n < 300; n++) {
                    ctxDiffuse.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.03)';
                    ctxDiffuse.fillRect(i + Math.random() * tileSize, j + Math.random() * tileSize, Math.random()*2, Math.random()*2);
                }

                // Grout lines
                ctxDiffuse.fillStyle = '#0a0a0a';
                ctxDiffuse.fillRect(i, j, tileSize, 2);
                ctxDiffuse.fillRect(i, j, 2, tileSize);

                // Grout imperfections
                for(let k = 0; k < 6; k++) {
                    const gx = i + Math.random() * tileSize;
                    const gy = j + Math.random() * tileSize;
                    ctxDiffuse.fillStyle = 'rgba(0,0,0,0.8)';
                    // Cracks on horizontal grout
                    ctxDiffuse.fillRect(gx, j - 1, Math.random()*6 + 2, Math.random()*4 + 1); 
                    // Cracks on vertical grout
                    ctxDiffuse.fillRect(i - 1, gy, Math.random()*4 + 1, Math.random()*6 + 2); 
                }

                // Tiling Variation: Roughness offset per tile
                const roughIntensity = Math.floor(tileRand * 40 + 160); 
                ctxRough.fillStyle = `rgba(${roughIntensity}, ${roughIntensity}, ${roughIntensity}, 1)`;
                ctxRough.fillRect(i, j, tileSize, tileSize);
            }
        }
        
        // 1. Stochastic Debris Layer
        for(let d = 0; d < 1200; d++) {
            const dx = Math.random() * resolution;
            const dy = Math.random() * resolution;
            const size = Math.random() * 8 + 2;
            
            const isDust = Math.random() > 0.7;
            ctxDiffuse.fillStyle = isDust ? 'rgba(100,90,80,0.4)' : 'rgba(10,5,0,0.7)';
            
            for(let c = 0; c < 8; c++) {
                const ox = dx + (Math.random() - 0.5) * size * 2;
                const oy = dy + (Math.random() - 0.5) * size * 2;
                ctxDiffuse.fillRect(ox, oy, Math.random()*3 + 1, Math.random()*3 + 1);
                // Debris is very rough (matte)
                ctxRough.fillStyle = 'rgba(255,255,255,0.5)';
                ctxRough.fillRect(ox, oy, 2, 2);
            }
        }

        // 2. Dynamic Water Stains (Damp patches)
        for(let w = 0; w < 40; w++) {
            const wx = Math.random() * resolution;
            const wy = Math.random() * resolution;
            const rad = Math.random() * 80 + 30;
            
            const gradD = ctxDiffuse.createRadialGradient(wx, wy, 0, wx, wy, rad);
            gradD.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
            gradD.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctxDiffuse.fillStyle = gradD;
            ctxDiffuse.beginPath();
            ctxDiffuse.arc(wx, wy, rad, 0, Math.PI*2);
            ctxDiffuse.fill();

            // Low roughness = damp/wet reflection
            const gradR = ctxRough.createRadialGradient(wx, wy, 0, wx, wy, rad);
            gradR.addColorStop(0, 'rgba(20, 20, 20, 0.8)'); // Very reflective
            gradR.addColorStop(1, 'rgba(20, 20, 20, 0)');
            ctxRough.fillStyle = gradR;
            ctxRough.beginPath();
            ctxRough.arc(wx, wy, rad, 0, Math.PI*2);
            ctxRough.fill();
        }

        const diffuseTex = new THREE.CanvasTexture(canvasDiffuse);
        diffuseTex.magFilter = THREE.NearestFilter;
        diffuseTex.minFilter = THREE.NearestFilter;
        diffuseTex.wrapS = THREE.RepeatWrapping;
        diffuseTex.wrapT = THREE.RepeatWrapping;
        
        const roughTex = new THREE.CanvasTexture(canvasRough);
        roughTex.magFilter = THREE.NearestFilter;
        roughTex.minFilter = THREE.NearestFilter;
        roughTex.wrapS = THREE.RepeatWrapping;
        roughTex.wrapT = THREE.RepeatWrapping;

        return { diffuseTex, roughTex };
    };

    const advancedFloor = createAdvancedFloorTextures(128);
    const floorTex = advancedFloor.diffuseTex;
    const floorRoughTex = advancedFloor.roughTex;

    // Make the repeat larger for the floor/ceiling to span the map
    floorTex.repeat.set(mazeSize, mazeSize);
    floorRoughTex.repeat.set(mazeSize, mazeSize);
    ceilingTex.repeat.set(mazeSize, mazeSize);

    const wallUniforms = {
        uTime: { value: 0 },
        uFlicker: { value: 300.0 }
    };

    const wallMat = new THREE.MeshStandardMaterial({ 
        map: wallTex, 
        roughnessMap: wallRoughTex,
        normalMap: wallNormalTex,
        normalScale: new THREE.Vector2(1.5, 1.5),
        roughness: 1.0, 
        metalness: 0.1, 
        color: 0xffffff
    });

    wallMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = wallUniforms.uTime;
        shader.uniforms.uFlicker = wallUniforms.uFlicker;

        shader.vertexShader = `
            uniform float uTime;
            uniform float uFlicker;
            
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            `#include <uv_vertex>`,
            `#include <uv_vertex>
             vec2 grimeShift = vec2(0.0);
             if (uFlicker < 100.0) { // low light trigger
                 float jitter = floor(uTime * 18.0); // frequency
                 float shiftX = (random(vec2(jitter, 1.0)) - 0.5) * 0.1;
                 float shiftY = (random(vec2(1.0, jitter)) - 0.5) * 0.1;
                 grimeShift = vec2(shiftX, shiftY);
             } else if (uFlicker > 250.0) {
                 // micro jump on snap back
                 float jitter = floor(uTime * 2.0); 
                 grimeShift = vec2((random(vec2(jitter, 0.0))-0.5)*0.01, (random(vec2(0.0, jitter))-0.5)*0.01);
             }
             
             #ifdef USE_MAP
                 vMapUv += grimeShift;
             #endif
             #ifdef USE_ROUGHNESSMAP
                 vRoughnessMapUv += grimeShift;
             #endif
             #ifdef USE_NORMALMAP
                 vNormalMapUv += grimeShift;
             #endif
            `
        );

        shader.fragmentShader = `
            uniform float uTime;
            uniform float uFlicker;
            
            float randomDiag(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <dithering_fragment>`,
            `#include <dithering_fragment>
             // Flashlight glitch condition
             // When uFlicker is super high (direct spotlight on certain faces), glitch it out
             if (uFlicker > 260.0) {
                 float n = randomDiag(gl_FragCoord.xy * 0.05 + uTime);
                 if (n > 0.8) discard; // Creates tears/holes in the geometry
             }
            `
        );
    };
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughnessMap: floorRoughTex, roughness: 1.0, metalness: 0.05, color: 0xcccccc });
    const ceilingMat = new THREE.MeshStandardMaterial({ map: ceilingTex, roughness: 1, color: 0xaaaaaa });

    const maze = Array(mazeSize).fill(0).map(() => Array(mazeSize).fill(1));
    const stack = [{x: 1, y: 1}];
    maze[1][1] = 0;

    while (stack.length > 0) {
        const curr = stack.pop()!;
        const dirs = [ [0, 2], [2, 0], [0, -2], [-2, 0] ];
        
        for(let i = dirs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
        }

        let moved = false;
        for (const [dx, dy] of dirs) {
            let nx = curr.x + dx;
            let ny = curr.y + dy;
            if (nx > 0 && nx < mazeSize - 1 && ny > 0 && ny < mazeSize - 1 && maze[nx][ny] === 1) {
                 maze[nx][ny] = 0;
                 maze[curr.x + dx/2][curr.y + dy/2] = 0; 
                 stack.push(curr);
                 stack.push({x: nx, y: ny});
                 moved = true;
                 break;
            }
        }
    }

    const unit = 2.5; // Narrow claustrophobic corridors (2.5 meters per tile)
    
    // Build Maze Meshes
    const floorGeo = new THREE.PlaneGeometry(mazeSize * unit, mazeSize * unit);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((mazeSize * unit) / 2, 0, (mazeSize * unit) / 2);
    floor.receiveShadow = true;
    scene.add(floor);
    
    const ceiling = new THREE.Mesh(floorGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((mazeSize * unit) / 2, 2.5, (mazeSize * unit) / 2);
    ceiling.receiveShadow = true;
    scene.add(ceiling);

    // High, Medium, Low detail geometries for LOD
    const wallGeoHigh = new THREE.BoxGeometry(unit, 2.5, unit, 2, 2, 2); // Reduced subdivisions for low-poly look
    const wallGeoMid = new THREE.BoxGeometry(unit, 2.5, unit);
    const wallGeoLow = new THREE.PlaneGeometry(unit, 2.5);

    const glassGeo = new THREE.BoxGeometry(unit, 2.5, 0.1);
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xaaccff,
        transmission: 0.9,
        opacity: 1,
        metalness: 0,
        roughness: 0.7, // Frosted
        ior: 1.2,
        thickness: 0.5,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    // For collision detection
    const boundingBoxes: THREE.Box3[] = [];
    const emergencyLights: { light: THREE.PointLight, baseIntensity: number, flickerOffset: number }[] = [];

    const debrisPositions: THREE.Matrix4[] = [];
    const leakPositions: THREE.Vector3[] = [];

    for (let x = 0; x < mazeSize; x++) {
        for (let y= 0; y < mazeSize; y++) {
            if (maze[x][y] === 1) {
                const lod = new THREE.LOD();
                
                // High Detail
                const highMesh = new THREE.Mesh(wallGeoHigh, wallMat);
                highMesh.castShadow = true;
                highMesh.receiveShadow = true;
                lod.addLevel(highMesh, 0);
                
                // Mid Detail
                const midMesh = new THREE.Mesh(wallGeoMid, wallMat);
                midMesh.castShadow = true;
                midMesh.receiveShadow = true;
                lod.addLevel(midMesh, 15);
                
                // Low Detail (No shadows, simpler geometry)
                const lowMesh = new THREE.Mesh(wallGeoLow, wallMat);
                lowMesh.receiveShadow = false;
                lowMesh.castShadow = false;
                lod.addLevel(lowMesh, 35);

                lod.position.set(x * unit, 1.25, y * unit);
                scene.add(lod);
                
                const box = new THREE.Box3().setFromObject(midMesh); // use mid for simple box calc
                boundingBoxes.push(box);
            } else {
                if (Math.random() > 0.05 && Math.random() < 0.12 && (x !== 1 && y !== 1)) {
                    // Frost Glass Panes (barriers)
                    const glass = new THREE.Mesh(glassGeo, glassMat);
                    glass.position.set(x * unit, 1.25, y * unit);
                    if (Math.random() > 0.5) glass.rotation.y = Math.PI / 2;
                    scene.add(glass);
                    // Add it to collision
                    const box = new THREE.Box3().setFromObject(glass);
                    boundingBoxes.push(box);
                } else if (Math.random() > 0.4) {
                    for(let i=0; i<3; i++) {
                        const m = new THREE.Matrix4();
                        const p = new THREE.Vector3(x*unit + (Math.random()-0.5)*unit*0.8, 0.05, y*unit + (Math.random()-0.5)*unit*0.8);
                        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random()*Math.PI, 0));
                        const s = new THREE.Vector3(Math.random()*0.4+0.1, 0.05, Math.random()*0.4+0.1);
                        m.compose(p, q, s);
                        debrisPositions.push(m);
                    }
                }
                if (Math.random() > 0.9) {
                    leakPositions.push(new THREE.Vector3(x*unit + (Math.random()-0.5)*2, 3.5, y*unit + (Math.random()-0.5)*2));
                }

                if (Math.random() > 0.95 && (x !== 1 && y !== 1)) {
                    // Add a note on the ground
                    const noteGeo = new THREE.PlaneGeometry(0.5, 0.5);
                    const noteMat = new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: 0.8 });
                    const note = new THREE.Mesh(noteGeo, noteMat);
                    
                    note.rotation.x = -Math.PI / 2;
                    note.position.set(x * unit, 0.05, y * unit);
                    // Random rotation on the floor
                    note.rotation.z = Math.random() * Math.PI;
                    note.castShadow = true;
                    
                    const randomNote = POSSIBLE_NOTES[Math.floor(Math.random() * POSSIBLE_NOTES.length)];
                    // User data to identify it
                    note.userData = { 
                        type: 'note', 
                        id: randomNote,
                        message: randomNote 
                    } as InteractableItem;
                    
                    scene.add(note);
                    interactablesRef.current.push(note);
                } else if (Math.random() > 0.96 && (x !== 1 && y !== 1)) {
                    // Add an artifact
                    const randomArtifact = POSSIBLE_ARTIFACTS[Math.floor(Math.random() * POSSIBLE_ARTIFACTS.length)];
                    
                    let geo;
                    if (randomArtifact.shape === 'box') geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
                    else if (randomArtifact.shape === 'tetra') geo = new THREE.TetrahedronGeometry(0.2);
                    else geo = new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8);
                    
                    const mat = new THREE.MeshStandardMaterial({ 
                        color: randomArtifact.color, 
                        roughness: 0.2, 
                        metalness: 0.8 
                    });
                    
                    const artifactMesh = new THREE.Mesh(geo, mat);
                    artifactMesh.position.set(x * unit + (Math.random()-0.5)*unit*0.5, 0.2, y * unit + (Math.random()-0.5)*unit*0.5);
                    
                    // Add random rotation
                    artifactMesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
                    
                    artifactMesh.castShadow = true;
                    artifactMesh.receiveShadow = true;
                    
                    artifactMesh.userData = {
                        type: 'artifact',
                        id: randomArtifact.id,
                        name: randomArtifact.name,
                        message: randomArtifact.message
                    } as InteractableItem;
                    
                    scene.add(artifactMesh);
                    interactablesRef.current.push(artifactMesh);
                } else if (Math.random() > 0.96 && (x !== 1 && y !== 1)) {
                    // Check if adjacent to a wall
                    const hasWallEast = x < mazeSize - 1 && maze[x+1][y] === 1;
                    const hasWallWest = x > 0 && maze[x-1][y] === 1;
                    const hasWallNorth = y > 0 && maze[x][y-1] === 1;
                    const hasWallSouth = y < mazeSize - 1 && maze[x][y+1] === 1;

                    if (hasWallEast || hasWallWest || hasWallNorth || hasWallSouth) {
                        const randomChoice = Math.random();
                        let px = x * unit;
                        let pz = y * unit;

                        if (randomChoice < 0.25) {
                            // Breaker Switch
                            const switchGeo = new THREE.BoxGeometry(0.2, 0.3, 0.1);
                            const switchMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.2 });
                            const switchMesh = new THREE.Mesh(switchGeo, switchMat);
                            
                            if (hasWallEast) { px += unit * 0.45; switchMesh.rotation.y = -Math.PI / 2; }
                            else if (hasWallWest) { px -= unit * 0.45; switchMesh.rotation.y = Math.PI / 2; }
                            else if (hasWallSouth) { pz += unit * 0.45; switchMesh.rotation.y = Math.PI; }
                            else if (hasWallNorth) { pz -= unit * 0.45; }
                            
                            switchMesh.position.set(px, 1.2, pz);
                            
                            switchMesh.userData = {
                                type: 'switch',
                                id: `switch_${x}_${y}`,
                                name: "Flickering Breaker",
                                message: "Sparks occasionally. Might short-circuit if pushed."
                            } as InteractableItem;
                            
                            scene.add(switchMesh);
                            interactablesRef.current.push(switchMesh);
                            envStatesRef.current[switchMesh.userData.id] = { state: 'on' };
                        } else if (randomChoice < 0.5) {
                            // Leaking Pipe
                            const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 3, 8);
                            const pipeMat = new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.6, metalness: 0.8 });
                            const pipeMesh = new THREE.Mesh(pipeGeo, pipeMat);
                            
                            if (hasWallEast) px += unit * 0.4;
                            else if (hasWallWest) px -= unit * 0.4;
                            else if (hasWallSouth) pz += unit * 0.4;
                            else if (hasWallNorth) pz -= unit * 0.4;
                            
                            pipeMesh.position.set(px, 1.5, pz);
                            
                            pipeMesh.userData = {
                                type: 'pipe',
                                id: `pipe_${x}_${y}`,
                                name: "Dripping Steam Vent",
                                message: "Has a rusted valve attached."
                            } as InteractableItem;
                            
                            scene.add(pipeMesh);
                            interactablesRef.current.push(pipeMesh);
                            envStatesRef.current[pipeMesh.userData.id] = { state: 'dripping' };
                            
                            // Add drip position initially
                            leakPositions.push(new THREE.Vector3(px, 2.8, pz));
                        } else if (randomChoice < 0.75) {
                            // Rotary Phone
                            const phoneGeo = new THREE.BoxGeometry(0.2, 0.3, 0.15);
                            const phoneMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8, metalness: 0.3 });
                            const phoneMesh = new THREE.Mesh(phoneGeo, phoneMat);
                            
                            if (hasWallEast) { px += unit * 0.45; phoneMesh.rotation.y = -Math.PI / 2; }
                            else if (hasWallWest) { px -= unit * 0.45; phoneMesh.rotation.y = Math.PI / 2; }
                            else if (hasWallSouth) { pz += unit * 0.45; phoneMesh.rotation.y = Math.PI; }
                            else if (hasWallNorth) { pz -= unit * 0.45; }
                            
                            phoneMesh.position.set(px, 1.4, pz);
                            
                            const randomCall = POSSIBLE_CALLS[Math.floor(Math.random() * POSSIBLE_CALLS.length)];
                            phoneMesh.userData = {
                                type: 'phone',
                                id: randomCall.id + `_${x}_${y}`,
                                name: "Rotary Wall Phone",
                                message: randomCall.message
                            } as InteractableItem;
                            
                            scene.add(phoneMesh);
                            interactablesRef.current.push(phoneMesh);
                            envStatesRef.current[phoneMesh.userData.id] = { state: 'idle' };
                        } else {
                            // Filing Cabinet
                            const cabinetGeo = new THREE.BoxGeometry(0.6, 1.2, 0.6);
                            const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x4a5a4a, roughness: 0.7, metalness: 0.5 });
                            const cabinetMesh = new THREE.Mesh(cabinetGeo, cabinetMat);
                            
                            if (hasWallEast) { px += unit * 0.2; cabinetMesh.rotation.y = -Math.PI / 2; }
                            else if (hasWallWest) { px -= unit * 0.2; cabinetMesh.rotation.y = Math.PI / 2; }
                            else if (hasWallSouth) { pz += unit * 0.2; cabinetMesh.rotation.y = Math.PI; }
                            else if (hasWallNorth) { pz -= unit * 0.2; }
                            
                            cabinetMesh.position.set(px, 0.6, pz);
                            cabinetMesh.castShadow = true;
                            cabinetMesh.receiveShadow = true;
                            
                            const randomMemory = POSSIBLE_MEMORIES[Math.floor(Math.random() * POSSIBLE_MEMORIES.length)];
                            cabinetMesh.userData = {
                                type: 'cabinet',
                                id: randomMemory.id + `_${x}_${y}`,
                                name: "Corroded Filing Cabinet",
                                message: randomMemory.message
                            } as InteractableItem;
                            
                            scene.add(cabinetMesh);
                            interactablesRef.current.push(cabinetMesh);
                            envStatesRef.current[cabinetMesh.userData.id] = { state: 'closed' };
                        }
                    }
                } else if (Math.random() > 0.85) {
                    // Add occasional flickering emergency lights
                    const pointLight = new THREE.PointLight(0xcc3322, 120, 15, 2);
                    pointLight.position.set(x * unit, 3.0, y * unit); // near ceiling
                    
                    // Small bulb mesh
                    const bulbGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
                    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xff4433 });
                    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
                    bulb.position.copy(pointLight.position);
                    
                    scene.add(pointLight);
                    scene.add(bulb);
                    emergencyLights.push({ light: pointLight, baseIntensity: 120, flickerOffset: Math.random() * 100 });
                }
            }
        }
    }

    // --- Debris & Leaks ---
    if (debrisPositions.length > 0) {
        const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
        const debrisMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1.0, metalness: 0.1 });
        const debrisMesh = new THREE.InstancedMesh(debrisGeo, debrisMat, debrisPositions.length);
        debrisMesh.castShadow = true;
        debrisMesh.receiveShadow = true;
        debrisPositions.forEach((m, i) => debrisMesh.setMatrixAt(i, m));
        scene.add(debrisMesh);
    }
    
    let waterParticles: THREE.Points | null = null;
    let waterCount = 0;
    if (leakPositions.length > 0) {
        waterCount = leakPositions.length * 20; // 20 drops per leak
        const waterGeo = new THREE.BufferGeometry();
        const waterPos = new Float32Array(waterCount * 3);
        const waterPhases = new Float32Array(waterCount);
        for (let i = 0; i < leakPositions.length; i++) {
            for (let j = 0; j < 20; j++) {
                 const idx = (i * 20 + j);
                 waterPos[idx*3] = leakPositions[i].x;
                 waterPos[idx*3+1] = Math.random() * 3.5;
                 waterPos[idx*3+2] = leakPositions[i].z;
                 waterPhases[idx] = Math.random(); // Y offset phase
            }
        }
        waterGeo.setAttribute('position', new THREE.BufferAttribute(waterPos, 3));
        waterGeo.setAttribute('phase', new THREE.BufferAttribute(waterPhases, 1));
        const waterMat = new THREE.PointsMaterial({
            color: 0x88bbcc,
            size: 0.05,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        waterParticles = new THREE.Points(waterGeo, waterMat);
        scene.add(waterParticles);
    }

    // --- The Stalker (Entity) ---
    const entityGeo = new THREE.CylinderGeometry(0.5, 0.3, 3, 16);
    const entityMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0 });
    const stalker = new THREE.Mesh(entityGeo, entityMat);
    // Start stalker far away in the maze
    stalker.position.set((mazeSize - 2) * unit, 1.5, (mazeSize - 2) * unit);
    stalker.castShadow = true;
    scene.add(stalker);
    
    // Add pulsing red eyes to stalker
    const eyeGeo = new THREE.SphereGeometry(0.05);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.2, 1, 0.4);
    rightEye.position.set(0.2, 1, 0.4);
    stalker.add(leftEye);
    stalker.add(rightEye);

    // Light from stalker
    const stalkerLight = new THREE.PointLight(0xff0000, 0, 15, 2); // hidden until close (will be up to 150 intensity)
    stalkerLight.position.set(0, 1, 0);
    stalker.add(stalkerLight);

    // --- Audio System ---
    let audioCtx: AudioContext | null = null;
    let masterGain: GainNode | null = null;
    let stalkerPanner: PannerNode | null = null;
    let heartbeatOsc: OscillatorNode | null = null;
    let filter: BiquadFilterNode | null = null;
    let deceptionPanner: PannerNode | null = null;
    let deceptionNoise: OscillatorNode | null = null;
    let deceptionGain: GainNode | null = null;

    const initAudio = () => {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
        masterGain.gain.value = 0.5;

        // Liminal drone
        const drone = audioCtx.createOscillator();
        drone.type = 'sine';
        drone.frequency.value = 45; 
        
        filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 120;
        
        drone.connect(filter);
        filter.connect(masterGain);
        drone.start();

        // Stalker Spatial Audio setup
        stalkerPanner = audioCtx.createPanner();
        stalkerPanner.panningModel = 'HRTF';
        stalkerPanner.distanceModel = 'inverse';
        stalkerPanner.refDistance = 1;
        stalkerPanner.maxDistance = 30;
        stalkerPanner.rolloffFactor = 1.5;

        const stalkerNoise = audioCtx.createOscillator();
        stalkerNoise.type = 'triangle';
        stalkerNoise.frequency.value = 100;
        const stalkerMod = audioCtx.createOscillator();
        stalkerMod.type = 'square';
        stalkerMod.frequency.value = 5; // harsh pulsing
        const modGain = audioCtx.createGain();
        modGain.gain.value = 1000;
        stalkerMod.connect(modGain);
        modGain.connect(stalkerNoise.frequency);

        const stalkerVolume = audioCtx.createGain();
        stalkerVolume.gain.value = 0.05; // Keep it low

        stalkerNoise.connect(stalkerVolume);
        stalkerVolume.connect(stalkerPanner);
        stalkerPanner.connect(masterGain);

        stalkerNoise.start();
        stalkerMod.start();

        // Deceptive Spatial Audio Setup (Fake footsteps/creaks)
        deceptionPanner = audioCtx.createPanner();
        deceptionPanner.panningModel = 'HRTF';
        deceptionPanner.distanceModel = 'inverse';
        deceptionPanner.refDistance = 1;
        deceptionPanner.maxDistance = 20;

        deceptionNoise = audioCtx.createOscillator();
        deceptionNoise.type = 'sawtooth';
        
        deceptionGain = audioCtx.createGain();
        deceptionGain.gain.value = 0;

        deceptionNoise.connect(deceptionGain);
        deceptionGain.connect(deceptionPanner);
        deceptionPanner.connect(masterGain);
        deceptionNoise.start();

        // Listener setup setup
        const listener = audioCtx.listener;
        // The listener is updated in the animation loop
    };

    // --- Movement Logic ---
    const moveState = { forward: false, backward: false, left: false, right: false, run: false };
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();

    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveState.forward = true; break;
        case 'ArrowLeft':
        case 'KeyA': moveState.left = true; break;
        case 'ArrowDown':
        case 'KeyS': moveState.backward = true; break;
        case 'ArrowRight':
        case 'KeyD': moveState.right = true; break;
        case 'ShiftLeft': moveState.run = true; break;
        case 'KeyE': 
           if (readingNote) {
              setReadingNote(null);
              if (!isLocked && !isMobileMode) controls.lock();
           } else if (hoveredNoteRef.current && (isLocked || isMobileMode)) {
              const item = hoveredNoteRef.current;
              saveNoteFound(item.id); 
              
              if (item.type === 'note' || item.type === 'artifact' || item.type === 'cabinet') {
                  setReadingNote(item);
                  controls.unlock();
                  
                  if (audioCtx) {
                      const ctx = audioCtx;
                      if (item.type === 'cabinet') {
                           // Metallic Grinding for Cabinet
                           const osc = ctx.createOscillator();
                           osc.type = 'sawtooth';
                           osc.frequency.setValueAtTime(200, ctx.currentTime);
                           osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.5);
                           const gainNode = ctx.createGain();
                           gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
                           gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                           osc.connect(gainNode);
                           gainNode.connect(ctx.destination);
                           osc.start();
                           osc.stop(ctx.currentTime + 0.5);
                           envStatesRef.current[item.id] = { state: 'open' };
                      } else if (item.type === 'artifact') {
                          // Chilling sound for Artifact
                          const osc = ctx.createOscillator();
                          osc.type = 'sine';
                          osc.frequency.setValueAtTime(800, ctx.currentTime);
                          osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 1);
                          const gainNode = ctx.createGain();
                          gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
                          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);
                          osc.connect(gainNode);
                          gainNode.connect(ctx.destination);
                          osc.start();
                          osc.stop(ctx.currentTime + 1);
                      }
                  }
              } else if (item.type === 'phone') {
                  const st = envStatesRef.current[item.id]?.state || 'idle';
                  if (st === 'idle') {
                      envStatesRef.current[item.id].state = 'answered';
                      if (audioCtx) {
                          const ctx = audioCtx;
                          const osc = ctx.createOscillator();
                          osc.type = 'square';
                          osc.frequency.setValueAtTime(600, ctx.currentTime);
                          osc.frequency.setValueAtTime(800, ctx.currentTime + 0.1);
                          const gainNode = ctx.createGain();
                          gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
                          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                          osc.connect(gainNode);
                          gainNode.connect(ctx.destination);
                          osc.start();
                          osc.stop(ctx.currentTime + 0.5);
                      }
                      setTimeout(() => {
                          setReadingNote(item);
                          controls.unlock();
                      }, 500);
                  } else {
                      setReadingNote(item);
                      controls.unlock();
                  }
              } else if (item.type === 'pipe') {
                  const currentState = envStatesRef.current[item.id]?.state;
                  if (currentState === 'dripping') {
                      envStatesRef.current[item.id].state = 'hissing';
                      envStatesRef.current[item.id].hissUntil = Date.now() + 10000;
                      if (audioCtx) {
                          const ctx = audioCtx;
                          const osc = ctx.createOscillator();
                          osc.type = 'sawtooth';
                          // High pressure hiss
                          osc.frequency.setValueAtTime(3000, ctx.currentTime);
                          osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 2.0);
                          const gainNode = ctx.createGain();
                          gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
                          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.0);
                          const filter = ctx.createBiquadFilter();
                          filter.type = 'highpass';
                          filter.frequency.value = 1000;
                          
                          osc.connect(filter);
                          filter.connect(gainNode);
                          gainNode.connect(ctx.destination);
                          osc.start();
                          osc.stop(ctx.currentTime + 2.0);
                      }
                  }
              } else if (item.type === 'switch') {
                  const stateObj = envStatesRef.current[item.id];
                  const st = stateObj?.state || 'on';
                  
                  if (st === 'on') {
                      envStatesRef.current[item.id].state = 'off';
                      flashLight.intensity = Math.random() > 0.5 ? 10 : 50; 
                      
                      // Lure stalker to sound
                      const mesh = interactablesRef.current.find(m => m.userData.id === item.id);
                      if (mesh) {
                           envStatesRef.current.globalLure = { x: mesh.position.x, z: mesh.position.z, time: Date.now() + 8000 };
                      }
                  } else if (st === 'off') {
                      envStatesRef.current[item.id].state = 'shorted';
                      flashLight.intensity = 1000; // blinding flash
                      envStatesRef.current[item.id].stunUntil = Date.now() + 3000; // stuns stalker
                      setTimeout(() => { flashLight.intensity = 0; }, 200);
                  } else {
                      envStatesRef.current[item.id].state = 'on';
                      flashLight.intensity = 300;
                  }
                  
                  if (audioCtx) {
                      const ctx = audioCtx;
                      const osc = ctx.createOscillator();
                      osc.type = 'square';
                      osc.frequency.setValueAtTime(100, ctx.currentTime);
                      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.5);
                      const gainNode = ctx.createGain();
                      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
                      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                      osc.connect(gainNode);
                      gainNode.connect(ctx.destination);
                      osc.start();
                      osc.stop(ctx.currentTime + 0.5);
                  }
              }
           }
           break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveState.forward = false; break;
        case 'ArrowLeft':
        case 'KeyA': moveState.left = false; break;
        case 'ArrowDown':
        case 'KeyS': moveState.backward = false; break;
        case 'ArrowRight':
        case 'KeyD': moveState.right = false; break;
        case 'ShiftLeft': moveState.run = false; break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    const handleStart = () => {
        if (!isMobileMode) {
            controls.lock();
        }
        setIsStarted(true);
        initAudio();
    };
    
    (window as any).startGame = handleStart;

    // --- Collision helper ---
    const checkCollision = (newPosition: THREE.Vector3) => {
         const playerBox = new THREE.Box3().setFromCenterAndSize(
             new THREE.Vector3(newPosition.x, 1.7, newPosition.z), 
             new THREE.Vector3(0.5, 3, 0.5) // player bounding box
         );
         for (const box of boundingBoxes) {
             if (playerBox.intersectsBox(box)) return true;
         }
         return false;
    };

    // --- Dust Particles ---
    const dustCount = 1500;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    const dustPhases = new Float32Array(dustCount);
    for (let i = 0; i < dustCount; i++) {
        dustPos[i*3] = Math.random() * mazeSize * unit;
        dustPos[i*3+1] = Math.random() * 3.5;
        dustPos[i*3+2] = Math.random() * mazeSize * unit;
        dustPhases[i] = Math.random() * Math.PI * 2;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    dustGeo.setAttribute('phase', new THREE.BufferAttribute(dustPhases, 1));
    const dustMat = new THREE.PointsMaterial({
        color: 0xaaaa99,
        size: 0.04,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const dustParticles = new THREE.Points(dustGeo, dustMat);
    scene.add(dustParticles);

    // --- Precision Asset Pre-Warming ---
    // Compile shaders and pipelines before the first frame runs so jump scares don't stutter 
    renderer.compile(scene, camera);

    // --- Animation Loop ---
    const startTime = performance.now();
    let prevTime = startTime;
    let frameCount = 0;

    const animate = () => {
      if (gameOver) return;
      requestAnimationFrame(animate);
      frameCount++;

      const time = performance.now();
      const delta = Math.min((time - prevTime) / 1000, 0.05); // cap delta to prevent bugs on lag
      const elapsedTime = (time - startTime) / 1000;

      // --- Computational Optimization: Occlusion Culling (Distance-based due to heavy fog) ---
      // We only update visibility of distant objects every 15 frames for performance
      if (frameCount % 15 === 0) {
          scene.children.forEach(child => {
              if (child instanceof THREE.LOD) {
                   const dist = child.position.distanceTo(camera.position);
                   // If way past fog distance, just cull it entirely, saving draw calls
                   child.visible = dist < 45;
              }
          });
      }

      // Audio Listener update
      if (audioCtx && stalkerPanner) {
          const cam = camera.position;
          audioCtx.listener.positionX.value = cam.x;
          audioCtx.listener.positionY.value = cam.y;
          audioCtx.listener.positionZ.value = cam.z;
          
          const target = new THREE.Vector3();
          camera.getWorldDirection(target);
          audioCtx.listener.forwardX.value = target.x;
          audioCtx.listener.forwardY.value = target.y;
          audioCtx.listener.forwardZ.value = target.z;
          
          audioCtx.listener.upX.value = camera.up.x;
          audioCtx.listener.upY.value = camera.up.y;
          audioCtx.listener.upZ.value = camera.up.z;

          // Stalker audio pos
          stalkerPanner.positionX.value = stalker.position.x;
          stalkerPanner.positionY.value = stalker.position.y;
          stalkerPanner.positionZ.value = stalker.position.z;

          // Fake Deception Audio Triggers
          if (deceptionPanner && deceptionGain && deceptionNoise) {
              if (Math.random() < 0.005) { // 0.5% chance per frame to trigger a fake creak/thump
                 deceptionPanner.positionX.value = camera.position.x + (Math.random() - 0.5) * 15;
                 deceptionPanner.positionY.value = camera.position.y;
                 deceptionPanner.positionZ.value = camera.position.z + (Math.random() - 0.5) * 15;
                 
                 deceptionNoise.frequency.setValueAtTime(Math.random() * 150 + 40, audioCtx.currentTime);
                 deceptionGain.gain.setValueAtTime(0.05, audioCtx.currentTime);
                 deceptionGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (Math.random() * 0.5 + 0.2));
                 setTimeout(() => { if (deceptionGain) deceptionGain.gain.value = 0; }, 1000);
              }
          }
      }

      // Flashlight flicker
      flickerTimer += delta;
      if (flickerTimer > 2) {
         if (Math.random() > 0.90) {
             flashLight.intensity = Math.random() * 50 + 10;
         } else {
             flashLight.intensity = 300;
         }
         if (flickerTimer > 2.5) flickerTimer = 0;
      }
      
      const distToStalker = camera.position.distanceTo(stalker.position);
      
      // Dynamic Fog Density
      const fogDensityTarget = 0.12 + Math.max(0, (15 - distToStalker) / 15) * 0.1;
      if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.density += (fogDensityTarget - scene.fog.density) * delta * 2;
      }

      // Pseudo-random noise function for flickering
      const getNoise = (t: number) => {
          return (Math.sin(t) + Math.sin(t * 2.718) + Math.sin(t * 5.436)) / 3.0;
      };

      // Emergency lights flicker and react to stalker
      for (const el of emergencyLights) {
          const noiseVal = getNoise(time / 200 + el.flickerOffset);
          let flickerMult = 1.0;
          if (noiseVal > 0.6) flickerMult = Math.random() * 0.2;
          else if (noiseVal > 0.3) flickerMult = 0.5 + Math.random() * 0.3;
          else flickerMult = 1.0 + (noiseVal * 0.2);

          let currentIntensity = el.baseIntensity * flickerMult;
          
          if (distToStalker < 15 && Math.random() > 0.5) {
               currentIntensity *= Math.random() * 0.2; 
          }
          el.light.intensity = Math.max(0, currentIntensity);
      }

      // Dust Particles Animation
      const dPositions = (dustParticles.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array;
      const dPhases = (dustParticles.geometry as THREE.BufferGeometry).attributes.phase.array as Float32Array;
      for (let i = 0; i < dustCount; i++) {
          const idx = i * 3;
          dPositions[idx + 1] += Math.sin(time / 1000 + dPhases[i]) * 0.002 + 0.001;
          if (dPositions[idx + 1] > 3.5) {
              dPositions[idx + 1] = 0; // Wrap around height
          }
          dPositions[idx] += Math.sin(time / 2000 + dPhases[i]) * 0.002;
          dPositions[idx + 2] += Math.cos(time / 1500 + dPhases[i]) * 0.002;
      }
      (dustParticles.geometry as THREE.BufferGeometry).attributes.position.needsUpdate = true;
      
      // Water / Leak Animation
      if (waterParticles) {
          const wPositions = (waterParticles.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array;
          const wPhases = (waterParticles.geometry as THREE.BufferGeometry).attributes.phase.array as Float32Array;
          for (let i = 0; i < waterCount; i++) {
              const idx = i * 3;
              // Faster drop speed, falling down
              wPositions[idx + 1] -= (0.05 + wPhases[i] * 0.05); 
              if (wPositions[idx + 1] < 0) {
                  wPositions[idx + 1] = 3.5; // Back to ceiling
              }
          }
          (waterParticles.geometry as THREE.BufferGeometry).attributes.position.needsUpdate = true;
      }
      
      // Update wall shader uniforms for psychological distortion effect
      wallUniforms.uTime.value = time / 1000;
      wallUniforms.uFlicker.value = flashLight.intensity;

      if (controls.isLocked === true || (isMobileMode && isStarted)) {
        // --- Mobile Camera Rotation ---
        if (isMobileMode) {
             const euler = new THREE.Euler(0, 0, 0, 'YXZ');
             euler.setFromQuaternion(camera.quaternion);
             euler.y -= touchRightRef.current.deltaX * 0.005;
             euler.x -= touchRightRef.current.deltaY * 0.005;
             euler.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, euler.x));
             camera.quaternion.setFromEuler(euler);
             
             touchRightRef.current.deltaX = 0;
             touchRightRef.current.deltaY = 0;
        }

        // --- Raycasting for Interation ---
        raycaster.setFromCamera(centerPoint, camera);
        const intersects = raycaster.intersectObjects(interactablesRef.current);
        
        let foundHover: InteractableItem | null = null;
        if (intersects.length > 0) {
           const hit = intersects[0];
           if (hit.distance < 3) {
                foundHover = hit.object.userData as InteractableItem;
           }
        }
        
        if (foundHover?.id !== hoveredNoteRef.current?.id) {
            
            // Revert emissive on old hover
            if (hoveredNoteRef.current && interactablesRef.current.length > 0) {
                 const oldMesh = interactablesRef.current.find(m => m.userData.id === hoveredNoteRef.current?.id);
                 if (oldMesh) {
                     const mat = oldMesh.material as THREE.MeshStandardMaterial;
                     if(mat) mat.emissive.setHex(0x000000);
                 }
            }

            // Apply emissive on new hover
            if (foundHover) {
                 const newMesh = interactablesRef.current.find(m => m.userData.id === foundHover?.id);
                 if (newMesh) {
                     const mat = newMesh.material as THREE.MeshStandardMaterial;
                     if(mat) mat.emissive.setHex(0x222222);
                 }
            }

            hoveredNoteRef.current = foundHover;
            setHoveredNote(foundHover);
        }

        // Player Movement
        velocity.x -= velocity.x * 10 * delta;
        velocity.z -= velocity.z * 10 * delta;

        let inputDirection = new THREE.Vector3();
        let isRunningJoystick = false;

        if (isMobileMode && touchLeftRef.current.active) {
             const deltaX = touchLeftRef.current.current.x - touchLeftRef.current.start.x;
             const deltaY = touchLeftRef.current.current.y - touchLeftRef.current.start.y;
             const maxDist = 50; 
             const dist = Math.min(Math.sqrt(deltaX*deltaX + deltaY*deltaY), maxDist);
             const angle = Math.atan2(deltaY, deltaX);
             
             const normalizedDist = dist / maxDist;
             
             // deltaY is negative when dragging UP.
             // We want moving UP (forward) to push camera forward.
             inputDirection.x = Math.cos(angle) * normalizedDist; 
             inputDirection.z = Math.sin(angle) * normalizedDist;
             
             if (normalizedDist > 0.8) isRunningJoystick = true;
        } else if (!isMobileMode) {
             inputDirection.z = Number(moveState.forward) - Number(moveState.backward);
             inputDirection.x = Number(moveState.right) - Number(moveState.left);
             inputDirection.normalize(); 
        }

        const speed = (moveState.run || isRunningJoystick) ? 6.0 : 2.5;

        if (inputDirection.z !== 0) velocity.z -= inputDirection.z * speed * 10.0 * delta;
        if (inputDirection.x !== 0) velocity.x -= inputDirection.x * speed * 10.0 * delta;

        const currentPos = controls.object.position.clone();
        
        // Move X
        currentPos.x -= velocity.x * delta;
        // Need to calculate real move right
        const moveVec = new THREE.Vector3(-velocity.x * delta, 0, -velocity.z * delta);
        moveVec.applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
        
        const nextPosX = controls.object.position.clone().add(new THREE.Vector3(moveVec.x, 0, 0));
        if (!checkCollision(nextPosX)) {
            controls.object.position.x = nextPosX.x;
        }

        const nextPosZ = controls.object.position.clone().add(new THREE.Vector3(0, 0, moveVec.z));
        if (!checkCollision(nextPosZ)) {
            controls.object.position.z = nextPosZ.z;
        }

        // Head bobbing
        if (Math.abs(velocity.x) > 0.1 || Math.abs(velocity.z) > 0.1) {
            const bobSpeed = moveState.run ? 10 : 6;
            const bobHeight = moveState.run ? 0.05 : 0.02;
            camera.position.y = 1.4 + Math.sin(elapsedTime * bobSpeed) * bobHeight;
            
            if (audioCtx && filter) {
                filter.frequency.value = 120 + Math.abs(Math.sin(elapsedTime * bobSpeed)) * 30;
            }
        } else {
             camera.position.y += (1.4 - camera.position.y) * 0.1; 
             if (audioCtx && filter) filter.frequency.value += (120 - filter.frequency.value) * 0.05;
        }

        // --- Stalker AI (Web Worker Offloaded) ---
        const distToPlayer = stalker.position.distanceTo(camera.position);

        let isStunned = false;
        let isHidden = false;
        let lurePos: { x: number, z: number } | null = null;
        const now = Date.now();

        for (const key in envStatesRef.current) {
             const s = envStatesRef.current[key];
             if (s.stunUntil && s.stunUntil > now) isStunned = true;
             if (s.hissUntil && s.hissUntil > now) isHidden = true;
        }
        
        if (envStatesRef.current.globalLure && envStatesRef.current.globalLure.time > now) {
             lurePos = envStatesRef.current.globalLure;
        }

        let finalPlayerPos = { x: camera.position.x, z: camera.position.z };
        if (isHidden) {
             // Stalker wanders locally instead of tracking player
             finalPlayerPos = { x: stalker.position.x + (Math.random()-0.5)*10, z: stalker.position.z + (Math.random()-0.5)*10 };
        } else if (lurePos) {
             // Go to lure
             finalPlayerPos = lurePos;
        }

        // Tell worker to compute path
        aiWorker.postMessage({
            playerPos: finalPlayerPos,
            stalkerPos: { x: stalker.position.x, z: stalker.position.z }
        });

        if (!isStunned) {
            if (distToPlayer > 1.2 || isHidden) {
                // Use Web Worker result
                const workerDir = new THREE.Vector3(aiState.dirX, 0, aiState.dirZ);
                const stalkerSpeed = moveState.run ? 3.5 : 1.5;
                
                if (aiState.dist > 0 && aiState.dist < 50) {
                     const newStalkerPos = stalker.position.clone().add(workerDir.multiplyScalar(stalkerSpeed * delta));
                     let stalkerBlocked = false;
                     
                     const sBox = new THREE.Box3().setFromCenterAndSize(
                        new THREE.Vector3(newStalkerPos.x, 1.5, newStalkerPos.z), 
                        new THREE.Vector3(1, 4, 1) 
                     );
                     
                     for (const box of boundingBoxes) {
                        if (sBox.intersectsBox(box)) { stalkerBlocked = true; break; }
                     }

                     if (!stalkerBlocked) {
                         stalker.position.copy(newStalkerPos);
                     } else {
                         // Wall slide
                         const stalkerDirX = new THREE.Vector3(aiState.dirX, 0, 0).normalize();
                         const newStalkerPosX = stalker.position.clone().add(stalkerDirX.multiplyScalar(stalkerSpeed * delta));
                         let blockX = false;
                         const sxBox = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(newStalkerPosX.x, 1.5, stalker.position.z), new THREE.Vector3(1, 4, 1));
                         for (let box of boundingBoxes) if(sxBox.intersectsBox(box)) blockX = true;
                         if(!blockX) stalker.position.x = newStalkerPosX.x;
                         else {
                             const stalkerDirZ = new THREE.Vector3(0, 0, aiState.dirZ).normalize();
                             const newStalkerPosZ = stalker.position.clone().add(stalkerDirZ.multiplyScalar(stalkerSpeed * delta));
                             let blockZ = false;
                             const szBox = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(stalker.position.x, 1.5, newStalkerPosZ.z), new THREE.Vector3(1, 4, 1));
                             for (let box of boundingBoxes) if(szBox.intersectsBox(box)) blockZ = true;
                             if(!blockZ) stalker.position.z = newStalkerPosZ.z;
                         }
                     }
                }
                
                stalker.lookAt(isHidden ? new THREE.Vector3(finalPlayerPos.x, camera.position.y, finalPlayerPos.z) : camera.position);
                
                // Scale red light intensity by proximity
                if (distToPlayer < 10) {
                    stalkerLight.intensity = (10 - distToPlayer) * 20; 
                } else {
                    stalkerLight.intensity = 0; 
                }

            } else {
                // Jump scare state
                setScare(true);
                controls.unlock();
                setTimeout(() => setGameOver(true), 1500);
            
                // Jumpscare sound with Cache Map Check and .onended disconnect loop
                if (audioCtx) {
                    // The Cache Map Check: skip download/generation if already in memory
                    if ((window as any).monsterAudioCache) {
                        const src = audioCtx.createBufferSource();
                        src.buffer = (window as any).monsterAudioCache;
                        src.connect(audioCtx.destination);
                        src.onended = () => src.disconnect();
                        src.start();
                    } else {
                        const jOsc = audioCtx.createOscillator();
                        jOsc.type = 'sawtooth';
                        jOsc.frequency.value = 100;
                        jOsc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 1.5);
                        jOsc.connect(audioCtx.destination);
                        
                        // The .onended Disconnect Loop
                        jOsc.onended = () => {
                            jOsc.disconnect();
                        };
                        
                        jOsc.start();
                        jOsc.stop(audioCtx.currentTime + 1.5);
                    }
                }
            }
        }
      }

      // Post Processing Uniform Updates
      if (dreadPass) {
          dreadPass.uniforms["time"].value = elapsedTime;
          // Scale distortion intensity inversely with distance to stalker (starts at ~15 units)
          const distToStalker = camera.position.distanceTo(stalker.position);
          const intensity = Math.max(0, (15 - distToStalker) / 15);
          dreadPass.uniforms["distortionIntensity"].value = intensity * 2.0; 
          dreadPass.uniforms["flickerState"].value = flashLight.intensity > 150 ? 1.0 : 0.0;
      }

      composer.render();
      prevTime = time;
    };

    animate();

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onWindowResize);

    const currentMount = mountRef.current;
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onWindowResize);
      if (currentMount) currentMount.removeChild(renderer.domElement);
      renderer.dispose();
      audioCtx?.close();
      delete (window as any).startGame;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver]);

  // UI Renders
  if (gameOver) {
      return (
        <div className="relative w-full h-screen bg-black flex items-center justify-center select-none cursor-default">
            <h1 className="text-8xl font-serif text-red-900 animate-pulse tracking-tighter">SURVIVE.</h1>
            <button 
                className="absolute bottom-20 px-8 py-3 text-red-500 font-mono tracking-widest hover:text-white border border-red-900 transition-colors"
                onClick={() => window.location.reload()}
            >RESTART</button>
        </div>
      );
  }

  return (
    <div 
       className="relative w-full h-screen bg-black overflow-hidden select-none"
       onTouchStart={handleTouchStart}
       onTouchMove={handleTouchMove}
       onTouchEnd={handleTouchEnd}
       onTouchCancel={handleTouchEnd}
    >
      <div ref={mountRef} className="absolute inset-0 outline-none" />
      
      {!isStarted && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black text-white p-8 pointer-events-auto overflow-hidden">
            {/* Eerie Backdrop Layer */}
            <div 
                className="absolute inset-0 opacity-40 mix-blend-screen pointer-events-none"
                style={{
                    backgroundImage: 'url(/backdrop-reference.jpg)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'grayscale(100%) contrast(150%) brightness(0.8) sepia(20%)',
                }}
            />
            
            {/* Static/Noise overlay */}
            <div 
                className="absolute inset-0 opacity-10 pointer-events-none mix-blend-overlay"
                style={{
                     backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                }}
            />
            
            {/* Vignette */}
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_0%,_black_90%)]" />

            <div className="relative z-10 flex flex-col items-center justify-center w-full">
            {showNotesMenu ? (
                <div className="w-full max-w-2xl flex flex-col items-center">
                    <h2 className="text-4xl font-serif text-red-700 mb-8 tracking-widest">FOUND LOGS</h2>
                    <div className="w-full max-h-[60vh] overflow-y-auto pr-4 space-y-4 font-serif italic text-gray-300 pointer-events-auto">
                        {savedNotes.length === 0 ? (
                            <p className="text-center text-gray-600 font-mono not-italic text-sm">No items found yet.</p>
                        ) : (
                            savedNotes.map((noteId, i) => {
                                const artifact = POSSIBLE_ARTIFACTS.find(a => a.id === noteId);
                                const call = POSSIBLE_CALLS.find(c => c.id === noteId.split('_')[0]); // phone ids are c1_x_y
                                const memory = POSSIBLE_MEMORIES.find(m => m.id === noteId.split('_')[0]); // cabinet ids are m1_x_y
                                
                                const matchedItem = artifact || call || memory;

                                if (matchedItem) {
                                    return (
                                        <div key={i} className="p-6 border border-gray-800 bg-gray-900/30">
                                            <h3 className="text-red-800 font-mono uppercase font-bold text-xs tracking-widest border-b border-gray-800 mb-2 pb-2 not-italic">{matchedItem.name}</h3>
                                            <p>&quot;{matchedItem.message}&quot;</p>
                                        </div>
                                    );
                                }
                                return (
                                    <div key={i} className="p-6 border border-gray-800 bg-gray-900/30">
                                        &quot;{noteId}&quot;
                                    </div>
                                );
                            })
                        )}
                        {savedNotes.length < (POSSIBLE_NOTES.length + POSSIBLE_ARTIFACTS.length + POSSIBLE_CALLS.length + POSSIBLE_MEMORIES.length) && savedNotes.length > 0 && (
                            <div className="p-6 border border-gray-800 border-dashed bg-transparent text-gray-700 text-center font-mono not-italic text-xs">
                                {(POSSIBLE_NOTES.length + POSSIBLE_ARTIFACTS.length + POSSIBLE_CALLS.length + POSSIBLE_MEMORIES.length) - savedNotes.length} items remain hidden...
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={() => setShowNotesMenu(false)}
                        className="mt-8 px-8 py-3 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-400 font-mono tracking-widest transition-colors pointer-events-auto"
                    >
                        BACK
                    </button>
                </div>
            ) : (
                <>
                    <h1 className="text-7xl font-serif tracking-widest text-[#990000] drop-shadow-lg mb-6">LIMINAL</h1>
                    <div className="max-w-lg mb-8 p-6 border-l-4 border-red-900 bg-red-950/10 pointer-events-none">
                        <p className="text-gray-300 font-mono text-sm leading-relaxed mb-4">
                         They say these halls go on forever. <br/>
                         They say you&apos;re not alone in here.
                        </p>
                        <div className="flex flex-wrap gap-4 mb-2 text-xs font-mono text-gray-500">
                            <span className="bg-gray-900 px-2 py-1 rounded hidden md:inline-block">WASD to Move</span>
                            <span className="bg-gray-900 px-2 py-1 rounded hidden md:inline-block">SHIFT to Run</span>
                            <span className="bg-gray-900 px-2 py-1 rounded md:hidden">Drag Left to Move</span>
                            <span className="bg-gray-900 px-2 py-1 rounded md:hidden">Drag Right to Look</span>
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-center gap-4 w-full max-w-xs pointer-events-auto">
                        <button 
                            onClick={() => (window as any).startGame?.()}
                            className="px-10 py-4 border border-red-900/50 text-red-500 hover:bg-[#990000]/20 hover:border-red-600 hover:text-red-100 font-mono tracking-[0.2em] transition-all duration-300 w-full text-center text-sm md:text-base whitespace-nowrap"
                        >
                            ENTER THE MAZE
                        </button>
                        
                        {!user ? (
                           <button 
                               onClick={handleLogin}
                               disabled={loadingLogin}
                               className="px-6 py-2 border border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-500 font-mono text-xs tracking-widest transition-colors w-full"
                           >
                               {loadingLogin ? "Loading..." : "Login to Save Progress"}
                           </button>
                        ) : (
                           <>
                               <span className="font-mono text-xs text-gray-500 tracking-widest mt-2 pointer-events-none">
                                   Playing as {user.email}
                               </span>
                               <button 
                                   onClick={() => setShowNotesMenu(true)}
                                   className="px-6 py-3 mt-2 border border-blue-900/40 text-blue-500 hover:bg-blue-900/20 hover:border-blue-600 hover:text-blue-300 font-mono text-xs tracking-widest transition-colors w-full"
                               >
                                   VIEW LOGS ({savedNotes.length}/{POSSIBLE_NOTES.length + POSSIBLE_ARTIFACTS.length + POSSIBLE_CALLS.length + POSSIBLE_MEMORIES.length})
                               </button>
                           </>
                        )}
                    </div>

                    <p className="absolute bottom-10 text-xs text-gray-700 font-mono pointer-events-none">Headphones Required • Contains Flashing Lights</p>
                </>
            )}
            </div>
        </div>
      )}

      {isStarted && !isLocked && !isMobileMode && !scare && (
        <div 
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md text-white cursor-pointer pointer-events-auto"
            onClick={() => controlsRef.current?.lock()}
        >
             <p className="text-3xl font-serif tracking-widest text-red-700">PAUSED</p>
             <p className="text-gray-500 mt-6 font-mono text-sm tracking-widest">Click the screen to return</p>
        </div>
      )}
      
      {scare && (
          <div className="absolute inset-0 z-50 bg-black flex items-center justify-center pointer-events-none">
              <div className="absolute inset-0 bg-red-900 mix-blend-color-burn animate-pulse"></div>
              <p className="text-9xl text-white font-serif font-bold opacity-80" style={{ transform: 'scale(1.5, 4)' }}>IT FOUND YOU</p>
          </div>
      )}

      {isStarted && (isLocked || isMobileMode) && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[3px] h-[3px] bg-white/40 rounded-full"></div>
          </div>
      )}

      {isStarted && (isLocked || isMobileMode) && hoveredNote && !readingNote && (
          <div className="absolute top-[55%] left-1/2 -translate-x-1/2 pointer-events-auto text-white opacity-80 z-20">
              <p className="font-mono text-sm tracking-widest hidden md:block">
                  [E] {['note', 'artifact', 'cabinet', 'phone'].includes(hoveredNote.type) ? 'Read' : 'Interact'}
              </p>
              <button 
                  className="md:hidden px-6 py-3 bg-white/10 border border-white/20 rounded font-mono text-sm tracking-widest pointer-events-auto backdrop-blur-md"
                  onTouchEnd={(e) => {
                       e.stopPropagation();
                       document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
                  }}
              >
                  TAP TO {['note', 'artifact', 'cabinet', 'phone'].includes(hoveredNote.type) ? 'READ' : 'INTERACT'}
              </button>
          </div>
      )}

      {readingNote && (
          <div 
             className="absolute inset-0 z-40 bg-black/80 flex items-center justify-center backdrop-blur-sm pointer-events-auto"
             onClick={() => {
                 setReadingNote(null);
                 if (!isMobileMode && !isLocked) controlsRef.current?.lock();
             }}
             onTouchEnd={() => {
                 setReadingNote(null);
                 if (!isMobileMode && !isLocked) controlsRef.current?.lock();
             }}
          >
             <div className="bg-[#e4dfd0] p-10 max-w-lg min-h-64 shadow-2xl rotate-1 rounded-sm relative m-4" onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
                 <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(0,0,0,0.1)_100%)] pointer-events-none"></div>
                 {readingNote.type !== 'note' && readingNote.name && (
                     <h3 className="font-serif text-xl text-red-950 font-bold border-b border-red-900/20 pb-2 mb-4 uppercase tracking-widest">{readingNote.name}</h3>
                 )}
                 <p className="font-serif text-2xl text-red-950 leading-relaxed font-bold italic mix-blend-color-burn" style={{ fontFamily: '"Playfair Display", serif' }}>
                    {readingNote.message}
                 </p>
                 <p className="absolute bottom-4 right-4 text-xs font-mono text-gray-500 opacity-60 pointer-events-none hidden md:block">[E] Close</p>
                 <button 
                     className="absolute bottom-4 right-4 text-xs font-mono text-gray-700 bg-black/5 px-3 py-2 rounded md:hidden border border-black/10"
                     onTouchEnd={() => {
                         setReadingNote(null);
                     }}
                 >
                     Close
                 </button>
             </div>
          </div>
      )}
      
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_0%,_black_100%)] opacity-60 z-40"></div>
      
      {/* Film grain overlay */}
      <div 
         className="absolute inset-0 pointer-events-none z-50 opacity-15 mix-blend-overlay"
         style={{ 
             backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 400 400%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
             backgroundRepeat: 'repeat',
             backgroundSize: '128px 128px'
         }} 
      ></div>
    </div>
  );
}
