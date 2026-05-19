'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { auth, db } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';

const POSSIBLE_NOTES = [
    { id: "n1", name: "Torn Page", text: "It wears the faces of the people it takes. I saw my own face.", effect: 0.15 },
    { id: "n2", name: "Hastily Scrawled Note", text: "Don't look at the walls for too long. They blink back.", effect: 0.1 },
    { id: "n3", name: "Medical Log", text: "It understands human anatomy perfectly, but it enjoys putting us back together wrong.", effect: 0.2 },
    { id: "n4", name: "Architect's Warning", text: "The layout changes when you blink. We are not inside a building.", effect: 0.15 },
    { id: "n5", name: "Maintenance Report", text: "The primary cooling pipe burst. Focus on the sound of the drips... it calms the mind.", effect: -0.15 },
    { id: "n6", name: "Ripped Poster", text: "If you hear it breathing, DO NOT MOVE.", effect: 0.2 },
    { id: "n7", name: "Psychiatric Eval", text: "It doesn't want to kill us. It wants to learn how to be us.", effect: 0.15 }
];

export type InteractableItem = {
    type: 'note' | 'artifact' | 'pipe' | 'switch' | 'phone' | 'cabinet' | 'save_point' | 'tape_recorder';
    id: string;
    message: string;
    name?: string;
    paranoiaEffect?: number;
};

const POSSIBLE_ARTIFACTS = [
    { id: "a1", name: "Shattered Tape Recorder", message: "Voice log: '...it's not a mimic. It's an echo. It replays their last moments...'", color: 0x2a2a2a, shape: "box", type: "tape_recorder", effect: 0.2 },
    { id: "a2", name: "Children's Shoe", message: "A pristine, single children's sneaker. It's inexplicably warm to the touch.", color: 0x8b5a2b, shape: "box", type: "artifact", effect: 0.15 },
    { id: "a3", name: "Employee Badge", message: "The photo is scratched out. The name reads: YOUR NAME.", color: 0x550000, shape: "tetra", type: "artifact", effect: 0.25 },
    { id: "a4", name: "Ripped Journal Page", message: "It only moves when you can't hear it. Wait... or is it when you CAN hear it?", color: 0xdddddd, shape: "cylinder", type: "artifact", effect: 0.2 },
    { id: "a5", name: "Bent Syringe", message: "The needle is bent. The thick black fluid inside is still rhythmically pulsing.", color: 0xaaaaaa, shape: "cylinder", type: "artifact", effect: 0.15 },
    { id: "a6", name: "Cracked Reading Glass", message: "One lens is missing. The other shows a bloody thumbprint on the inside.", color: 0x334455, shape: "tetra", type: "artifact", effect: 0.15 },
    { id: "a7", name: "Mangled Wedding Band", message: "The gold is twisted as if crushed by extreme pressure. An inscription reads 'Forever'.", color: 0xffd700, shape: "cylinder", type: "artifact", effect: 0.2 },
    { id: "a8", name: "Water-Damaged Wallet", message: "The ID photo has melted into a featureless smudge. The cash inside is entirely black.", color: 0x3a2e21, shape: "box", type: "artifact", effect: 0.1 }
];

const POSSIBLE_CALLS = [
    { id: "c1", name: "Missed Call", message: "'Can you hear me? Please, don't open the door. We know you're in there.'" },
    { id: "c2", name: "Missed Call", message: "(Heavy metallic scraping, followed by your own voice)... Found you. ...(click)" },
    { id: "c3", name: "Missed Call", message: "'Hello? Is anyone there? It's so dark... wait, what is that? NO, NO—'" }
];

const POSSIBLE_MEMORIES = [
    { id: "m1", name: "Fragmented Memory", message: "LOG 492: The walls are bleeding again. We're running out of buckets.", effect: 0.15 },
    { id: "m2", name: "Fragmented Memory", message: "LOG 501: It spoke today. It used my mother's voice. She's been dead for ten years.", effect: 0.2 },
    { id: "m3", name: "Fragmented Memory", message: "INTERVIEW TRANSCRIPT: 'It doesn't bite. It just... unfolds... and then you're inside it.'", effect: 0.25 }
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
  const decalsRef = useRef<THREE.Mesh[]>([]);
  const raycaster = new THREE.Raycaster();
  const centerPoint = new THREE.Vector2(0, 0);
  const [user, setUser] = useState<any>(null); // simple state for UI
  const userRef = useRef<any>(null);
  const startPosRef = useRef<{x: number, z: number} | null>(null);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  const unsavedNotesRef = useRef<string[]>([]); // Items waiting to be saved
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pauseText, setPauseText] = useState("PAUSED");
  const [showNotesMenu, setShowNotesMenu] = useState(false);
  const envStatesRef = useRef<Record<string, any>>({});
  const paranoiaRef = useRef(0);
  const nextHallucinationTimeRef = useRef(0);
  const stalkerDirectorRef = useRef({
      mode: 'absence' as 'gaslight' | 'ambush' | 'absence' | 'pursuit',
      modeDurationMs: 15000,
      modeStartTime: 0,
      playerPacingScore: 0, 
      lookingBackScore: 0,
      targetPos: new THREE.Vector3()
  });
  const stalkingDataRef = useRef({
      lastCamForward: new THREE.Vector3(0, 0, -1)
  });

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
                   const data = docSnap.data();
                   setSavedNotes(data.notesFound || []);
                   if (data.spawnX !== undefined && data.spawnZ !== undefined) {
                       startPosRef.current = { x: data.spawnX, z: data.spawnZ };
                   }
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

  const collectItemLocally = (noteId: string) => {
      setSavedNotes(prev => {
          if (!prev.includes(noteId)) {
              if (!unsavedNotesRef.current.includes(noteId)) {
                  unsavedNotesRef.current.push(noteId);
              }
              return [...prev, noteId];
          }
          return prev;
      });
  };

  const saveGameAtCheckpoint = async () => {
      const currentUser = userRef.current;
      if (!currentUser || !controlsRef.current) return;
      
      const pos = controlsRef.current.object.position;
      setSaveMessage("SAVING PROGRESS...");
      
      try {
          const saveRef = doc(db, 'users', currentUser.uid, 'save', 'data');
          const docSnap = await getDoc(saveRef);
          
          if (!docSnap.exists()) {
              await setDoc(saveRef, {
                  notesFound: unsavedNotesRef.current,
                  spawnX: pos.x,
                  spawnZ: pos.z,
                  updatedAt: new Date().toISOString()
              });
          } else {
              await updateDoc(saveRef, {
                  notesFound: arrayUnion(...unsavedNotesRef.current),
                  spawnX: pos.x,
                  spawnZ: pos.z,
                  updatedAt: new Date().toISOString()
              });
          }
          unsavedNotesRef.current = [];
          setSaveMessage("DATABANK SECURED");
      } catch (e) {
          console.error("Failed to save progress", e);
          setSaveMessage("SAVE FAILED. SIGNAL LOST.");
      }
      
      setTimeout(() => setSaveMessage(null), 3000);
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

    const textureLoader = new THREE.TextureLoader();
    const phantomTex = textureLoader.load('/assets/phantom_face_1779155661032.png');
    const stalkerTex = textureLoader.load('/assets/stalker_skin_1779155620434.png');
    const decalTex = textureLoader.load('/assets/paranoia_decal_1779155637969.png');
    const dragMarksTex = textureLoader.load('/assets/drag_marks.png');
    const wallScratchesTex = textureLoader.load('/assets/wall_scratches.png');
    const bloodPoolTex = textureLoader.load('/assets/blood_pool.png');


    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.y = 1.4; 
    
    if (startPosRef.current) {
        camera.position.x = startPosRef.current.x;
        camera.position.z = startPosRef.current.z;
    } else {
        camera.position.x = 2.5; // starting cell (1 * unit)
        camera.position.z = 2.5;
    }

    const isDeviceMobile = typeof window !== 'undefined' ? (window.innerWidth < 768 || 'ontouchstart' in window) : false;
    
    const renderer = new THREE.WebGLRenderer({ 
        antialias: !isDeviceMobile, 
        powerPreference: "high-performance",
        precision: isDeviceMobile ? "mediump" : "highp"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(isDeviceMobile ? 1.0 : Math.min(window.devicePixelRatio, 1.5)); 
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = isDeviceMobile ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2; // increased exposure slightly
    mountRef.current.appendChild(renderer.domElement);
    
    // --- Post-Processing Setup ---
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ssaoPass.kernelRadius = 0.5; // tightened radius for crevices
    ssaoPass.minDistance = 0.0005;
    ssaoPass.maxDistance = 0.05;
    ssaoPass.output = SSAOPass.OUTPUT.Default;
    composer.addPass(ssaoPass);

    const DreadShader = {
        defines: {
            "MOBILE": isDeviceMobile ? 1 : 0
        },
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
                
                #if MOBILE == 1
                
                // Fast path for mobile: bypass complex UV distortion & chromatic aberration
                vec4 finalColor = texture2D(tDiffuse, uv);
                
                // Single-pass color blend for vignette
                float dist = distance(vUv, vec2(0.5));
                float pulse = sin(time * 6.0) * 0.5 + 0.5;
                float vignette = smoothstep(0.8, 0.3 + (pulse * 0.1 * distortionIntensity), dist * (1.0 + distortionIntensity * 0.5));
                finalColor.rgb *= vignette;
                
                #else
                
                // On mobile, bypass screen distortion completely to save ops
                if (distortionIntensity > 0.01) {
                    float ripple = sin(uv.y * 20.0 + time * 5.0) * 0.005 * distortionIntensity;
                    uv.x += ripple;
                }
                
                // 2. Dynamic Chromatic Aberration
                float nonLinearDistortion = pow(max(0.0, distortionIntensity - 0.5), 2.0) * 0.4;
                float caOffset = 0.005 * nonLinearDistortion; 
                if (flickerState > 0.5) { // Flashlight glitch spike
                     caOffset += (random(uv + time) * 0.02);
                }
                vec2 uvR = uv + vec2(caOffset, 0.0);
                vec2 uvB = uv - vec2(caOffset, 0.0);

                vec4 colorR = texture2D(tDiffuse, uvR);
                vec4 colorG = texture2D(tDiffuse, uv);
                vec4 colorB = texture2D(tDiffuse, uvB);

                vec4 finalColor = vec4(colorR.r, colorG.g, colorB.b, 1.0);
                
                // Scanlines on desktop only
                if (mod(gl_FragCoord.y, 4.0) < 1.0) {
                     finalColor.rgb *= 0.90; 
                }

                // 3. Vignette Pulse 
                // Heartbeat driven vignette bounding the edges, not encroaching on inner 40%
                float dist = distance(vUv, vec2(0.5)); // use original UV
                float pulse = sin(time * 6.0) * 0.5 + 0.5; 
                
                // Modular alpha-mask to protect central 40% (dist < 0.2)
                float mask = smoothstep(0.2, 0.5, dist);
                
                // Base vignette
                float vignetteDarkness = mask * (0.3 + pulse * 0.2 * nonLinearDistortion);
                finalColor.rgb *= (1.0 - vignetteDarkness);
                
                #endif

                gl_FragColor = finalColor;
            }
        `
    };

    const dreadPass = new ShaderPass(DreadShader);
    composer.addPass(dreadPass);

    let fxaaPass: ShaderPass | null = null;
    if (isDeviceMobile && FXAAShader) {
        fxaaPass = new ShaderPass(FXAAShader);
        const pixelRatio = renderer.getPixelRatio();
        fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
        fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
        composer.addPass(fxaaPass);
    }

    // --- Controls ---
    const controls = new PointerLockControls(camera, document.body);
    controlsRef.current = controls;

    controls.addEventListener('lock', () => setIsLocked(true));
    controls.addEventListener('unlock', () => { 
        setIsLocked(false);
        setPauseText(paranoiaRef.current > 0.8 ? "IT IS RIGHT BEHIND YOU" : paranoiaRef.current > 0.5 ? "UNSAFE" : "PAUSED");
    });

    // --- Phantom Hallucination Mesh ---
    const phantomGeo = new THREE.PlaneGeometry(1.5, 1.5);
    const phantomMat = new THREE.MeshBasicMaterial({ 
        map: phantomTex, 
        transparent: true, 
        opacity: 0.9, 
        fog: true, 
        color: 0xffffff, 
        side: THREE.DoubleSide,
        depthWrite: false, // Ensures it doesn't bleed through geometry
        depthTest: true
    });
    const phantomMesh = new THREE.Mesh(phantomGeo, phantomMat);
    phantomMesh.visible = false;
    scene.add(phantomMesh);

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
    flashLight.shadow.mapSize.width = isDeviceMobile ? 512 : 1024;
    flashLight.shadow.mapSize.height = isDeviceMobile ? 512 : 1024;
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

    const ceilingTex = createNoiseTexture('#1a1a1a', '#0a0a0a', 512, false);

    const createAdvancedWallTextures = () => {
        const resolution = 1024;
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
        
        if (isDeviceMobile) {
            normalTex.generateMipmaps = false;
        }

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

    const createAdvancedFractalNoise = (size: number, { octaves = 4, persistence = 0.5 } = {}) => {
        const data = new Float32Array(size * size);
        const random = (x: number, y: number) => {
            return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1);
        };
        const smoothNoise = (x: number, y: number) => {
            const fractX = x - Math.trunc(x);
            const fractY = y - Math.trunc(y);
            const x1 = Math.trunc(x);
            const y1 = Math.trunc(y);
            const x2 = x1 + 1;
            const y2 = y1 + 1;
            const v1 = random(x1, y1), v2 = random(x2, y1), v3 = random(x1, y2), v4 = random(x2, y2);
            const fX = fractX * fractX * (3.0 - 2.0 * fractX);
            const fY = fractY * fractY * (3.0 - 2.0 * fractY);
            return (v1 * (1 - fX) + v2 * fX) * (1 - fY) + (v3 * (1 - fX) + v4 * fX) * fY;
        };

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let total = 0;
                let frequency = 1;
                let amplitude = 1;
                let maxValue = 0; 
                for (let i = 0; i < octaves; i++) {
                    total += smoothNoise((x * frequency) / 32, (y * frequency) / 32) * amplitude;
                    maxValue += amplitude;
                    amplitude *= persistence;
                    frequency *= 2;
                }
                data[y * size + x] = total / maxValue;
            }
        }
        return data;
    };

    const generateCrumblingConcreteTexture = (size = 1024) => {
        const resolution = size;
        const canvasDiffuse = document.createElement('canvas');
        const canvasRough = document.createElement('canvas');
        const canvasNormal = document.createElement('canvas');
        canvasDiffuse.width = canvasRough.width = canvasNormal.width = resolution;
        canvasDiffuse.height = canvasRough.height = canvasNormal.height = resolution;
        
        const ctxDiffuse = canvasDiffuse.getContext('2d')!;
        const ctxRough = canvasRough.getContext('2d')!;
        const ctxNormal = canvasNormal.getContext('2d')!;
        
        const noise = createAdvancedFractalNoise(size, { octaves: 4, persistence: 0.5 });
        const microNoise = createAdvancedFractalNoise(size, { octaves: 2, persistence: 0.8 });

        const imgD = ctxDiffuse.createImageData(resolution, resolution);
        const imgR = ctxRough.createImageData(resolution, resolution);
        const imgN = ctxNormal.createImageData(resolution, resolution);
        
        const heightData = new Float32Array(size * size);
        
        for (let i = 0; i < size * size; i++) {
            const val = noise[i];
            const micro = microNoise[i];
            
            const finalHeight = val * 0.8 + micro * 0.2;
            heightData[i] = finalHeight;
            
            const y = Math.floor(i / size);
            const verticalOrientation = y / size; 
            const dampnessBias = Math.pow(verticalOrientation, 3.0); 
            
            const dampness = Math.max(0, val - 0.4 + dampnessBias * 0.5); 
            
            // HSL to RGB variation logic (brown/olive concrete base)
            imgD.data[i * 4] = 100 - (dampness * 40) + val * 20;     
            imgD.data[i * 4 + 1] = 95 - (dampness * 35) + val * 20;   
            imgD.data[i * 4 + 2] = 85 - (dampness * 30) + val * 20;   
            imgD.data[i * 4 + 3] = 255;
            
            imgR.data[i * 4] = imgR.data[i * 4 + 1] = imgR.data[i * 4 + 2] = Math.max(0, 255 - (dampness * 150));
            imgR.data[i * 4 + 3] = 255;
        }
        
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = y * size + x;
                const idxL = y * size + Math.max(0, x - 1);
                const idxR = y * size + Math.min(size - 1, x + 1);
                const idxU = Math.max(0, y - 1) * size + x;
                const idxD = Math.min(size - 1, y + 1) * size + x;
                
                const hL = heightData[idxL];
                const hR = heightData[idxR];
                const hU = heightData[idxU];
                const hD = heightData[idxD];
                
                const scale = 5.0; 
                const nX = (hL - hR) * scale;
                const nY = (hU - hD) * scale;
                const nZ = 1.0;
                
                const len = Math.hypot(nX, nY, nZ) || 1.0;
                
                imgN.data[idx * 4] = ((nX/len) * 0.5 + 0.5) * 255;
                imgN.data[idx * 4 + 1] = ((nY/len) * 0.5 + 0.5) * 255;
                imgN.data[idx * 4 + 2] = ((nZ/len) * 0.5 + 0.5) * 255;
                imgN.data[idx * 4 + 3] = 255;
            }
        }

        ctxDiffuse.putImageData(imgD, 0, 0);
        ctxRough.putImageData(imgR, 0, 0);
        ctxNormal.putImageData(imgN, 0, 0);
        
        const diffuseTex = new THREE.CanvasTexture(canvasDiffuse);
        const roughTex = new THREE.CanvasTexture(canvasRough);
        const normalTex = new THREE.CanvasTexture(canvasNormal);
        
        if (isDeviceMobile) {
            normalTex.generateMipmaps = false;
        }

        diffuseTex.wrapS = roughTex.wrapS = normalTex.wrapS = THREE.RepeatWrapping;
        diffuseTex.wrapT = roughTex.wrapT = normalTex.wrapT = THREE.RepeatWrapping;

        return { diffuseTex, roughTex, normalTex };
    };

    const advancedWall = generateCrumblingConcreteTexture(isDeviceMobile ? 1024 : 2048);
    const wallTex = advancedWall.diffuseTex;
    const wallRoughTex = advancedWall.roughTex;
    const wallNormalTex = advancedWall.normalTex;

    const createGrungeTexture = () => {
        const resolution = 512;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = resolution;
        const ctx = canvas.getContext('2d')!;
        const noise = createAdvancedFractalNoise(resolution, { octaves: 4, persistence: 0.6 });
        const img = ctx.createImageData(resolution, resolution);
        
        for (let i = 0; i < resolution * resolution; i++) {
            const val = noise[i];
            const distX = (i % resolution) / resolution - 0.5;
            const distY = Math.floor(i / resolution) / resolution - 0.5;
            const dist = Math.sqrt(distX*distX + distY*distY) * 2.0;

            const edgeFade = Math.max(0, 1.0 - Math.pow(dist, 2.0));
            // Create a water-stain ring pattern: dark on edges of the blob
            let alpha = Math.max(0, val * edgeFade * 255);
            if(alpha > 150) alpha *= 0.5; // inner part is lighter
            
            img.data[i * 4] = 255;
            img.data[i * 4 + 1] = 255;
            img.data[i * 4 + 2] = 255;
            img.data[i * 4 + 3] = alpha;
        }
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        return tex;
    };
    const corrosionTex = createGrungeTexture();

    const createAdvancedFloorTextures = (tileSize: number) => {
        const resolution = 1024;
        const canvasDiffuse = document.createElement('canvas');
        const canvasRough = document.createElement('canvas');
        const canvasBump = document.createElement('canvas');
        canvasDiffuse.width = canvasRough.width = canvasBump.width = resolution;
        canvasDiffuse.height = canvasRough.height = canvasBump.height = resolution;
        
        const ctxDiffuse = canvasDiffuse.getContext('2d')!;
        const ctxRough = canvasRough.getContext('2d')!;
        const ctxBump = canvasBump.getContext('2d')!;
        
        // Base tile colors
        const colorA = '#2a2a28';
        const colorB = '#1f1f1d';
        
        ctxDiffuse.fillStyle = colorA;
        ctxDiffuse.fillRect(0, 0, resolution, resolution);
        ctxRough.fillStyle = '#cccccc'; // Default roughness
        ctxRough.fillRect(0, 0, resolution, resolution);
        ctxBump.fillStyle = '#808080'; // middle gray for bump
        ctxBump.fillRect(0, 0, resolution, resolution);
        
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
                    const isDark = Math.random() > 0.5;
                    ctxDiffuse.fillStyle = isDark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.03)';
                    const cx = i + Math.random() * tileSize;
                    const cy = j + Math.random() * tileSize;
                    const cSize = Math.random()*2;
                    ctxDiffuse.fillRect(cx, cy, cSize, cSize);
                    
                    ctxBump.fillStyle = isDark ? 'rgba(110,110,110,0.1)' : 'rgba(140,140,140,0.1)';
                    ctxBump.fillRect(cx, cy, cSize, cSize);
                }

                // Grout lines
                ctxDiffuse.fillStyle = '#0a0a0a';
                ctxDiffuse.fillRect(i, j, tileSize, 2);
                ctxDiffuse.fillRect(i, j, 2, tileSize);
                
                // Deep bump for grout lines
                ctxBump.fillStyle = '#202020';
                ctxBump.fillRect(i, j, tileSize, 2);
                ctxBump.fillRect(i, j, 2, tileSize);

                // Grout imperfections (cracks)
                for(let k = 0; k < 6; k++) {
                    const gx = i + Math.random() * tileSize;
                    const gy = j + Math.random() * tileSize;
                    ctxDiffuse.fillStyle = 'rgba(0,0,0,0.8)';
                    ctxBump.fillStyle = 'rgba(0,0,0,0.9)'; // very deep
                    
                    // Cracks on horizontal grout
                    const w1 = Math.random()*6 + 2;
                    const h1 = Math.random()*4 + 1;
                    ctxDiffuse.fillRect(gx, j - 1, w1, h1); 
                    ctxBump.fillRect(gx, j - 1, w1, h1);
                    
                    // Cracks on vertical grout
                    const w2 = Math.random()*4 + 1;
                    const h2 = Math.random()*6 + 2;
                    ctxDiffuse.fillRect(i - 1, gy, w2, h2); 
                    ctxBump.fillRect(i - 1, gy, w2, h2);
                }

                // Tiling Variation: Roughness offset per tile
                const roughIntensity = Math.floor(tileRand * 40 + 160); 
                ctxRough.fillStyle = `rgba(${roughIntensity}, ${roughIntensity}, ${roughIntensity}, 1)`;
                ctxRough.fillRect(i, j, tileSize, tileSize);
                
                // Slight bump variation per tile to catch light differently
                const bumpOff = Math.floor(tileRand * 10 - 5);
                ctxBump.fillStyle = `rgba(${128 + bumpOff}, ${128 + bumpOff}, ${128 + bumpOff}, 0.2)`;
                ctxBump.fillRect(i + 2, j + 2, tileSize - 4, tileSize - 4);
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
                const ds = Math.random()*3 + 1;
                ctxDiffuse.fillRect(ox, oy, ds, ds);
                // Debris is very rough (matte)
                ctxRough.fillStyle = 'rgba(255,255,255,0.5)';
                ctxRough.fillRect(ox, oy, 2, 2);
                
                // Debris sticks out slightly
                ctxBump.fillStyle = isDust ? 'rgba(135,135,135,0.4)' : 'rgba(150,150,150,0.7)';
                ctxBump.fillRect(ox, oy, ds, ds);
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
        diffuseTex.magFilter = THREE.NearestFilter;
        diffuseTex.minFilter = THREE.NearestFilter;
        diffuseTex.wrapS = THREE.RepeatWrapping;
        diffuseTex.wrapT = THREE.RepeatWrapping;
        
        const roughTex = new THREE.CanvasTexture(canvasRough);
        roughTex.magFilter = THREE.NearestFilter;
        roughTex.minFilter = THREE.NearestFilter;
        roughTex.wrapS = THREE.RepeatWrapping;
        roughTex.wrapT = THREE.RepeatWrapping;

        const normalTex = new THREE.CanvasTexture(normalCanvas);
        normalTex.magFilter = THREE.NearestFilter;
        normalTex.minFilter = THREE.NearestFilter;
        normalTex.wrapS = THREE.RepeatWrapping;
        normalTex.wrapT = THREE.RepeatWrapping;

        if (isDeviceMobile) {
            normalTex.generateMipmaps = false;
        }

        return { diffuseTex, roughTex, normalTex };
    };

    const advancedFloor = createAdvancedFloorTextures(128);
    const floorTex = advancedFloor.diffuseTex;
    const floorRoughTex = advancedFloor.roughTex;
    const floorNormalTex = advancedFloor.normalTex;

    // Make the repeat larger for the floor/ceiling to span the map
    floorTex.repeat.set(mazeSize, mazeSize);
    floorRoughTex.repeat.set(mazeSize, mazeSize);
    floorNormalTex.repeat.set(mazeSize, mazeSize);
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
    const floorMat = new THREE.MeshStandardMaterial({ 
        map: floorTex, 
        roughnessMap: floorRoughTex, 
        normalMap: floorNormalTex,
        normalScale: new THREE.Vector2(2.0, 2.0),
        roughness: 1.0, 
        metalness: 0.05, 
        color: 0xcccccc 
    });
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

    const clothingGeo = new THREE.IcosahedronGeometry(0.3, 2);
    const pos = clothingGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        // Flatten bottom and add wrinkles
        if (y < 0) {
            pos.setY(i, y * 0.2);
        } else {
            pos.setY(i, y + Math.sin(pos.getX(i)*10)*0.05);
            pos.setZ(i, pos.getZ(i) + Math.cos(pos.getY(i)*15)*0.05);
        }
    }
    clothingGeo.computeVertexNormals();
    const clothingMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.0 });

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
                
                // Add Paranoia Decals on walls
                if (Math.random() < 0.25) {
                    const isScratch = Math.random() < 0.5;
                    const decalGeo = new THREE.PlaneGeometry(isScratch ? 2.5 : 1.5, isScratch ? 1.0 : 1.5);
                    const decalMat = new THREE.MeshBasicMaterial({ 
                        map: isScratch ? wallScratchesTex : decalTex, 
                        color: isScratch ? 0x220000 : 0x990000, 
                        transparent: true, opacity: 0, depthWrite: false, 
                        blending: isScratch ? THREE.MultiplyBlending : THREE.MultiplyBlending, // scratches can just multiply
                        premultipliedAlpha: true
                    });
                    const decalMesh = new THREE.Mesh(decalGeo, decalMat);
                    decalMesh.userData = { type: isScratch ? 'scratch' : 'blood' };
                    
                    let decalSpawned = false;
                    const yPos = isScratch ? 1.6 : 1.25; // Scratches near eye level
                    if (x > 0 && maze[x-1][y] === 0) {
                        decalMesh.position.set(x * unit - unit/2 + 0.01, yPos, y * unit);
                        decalMesh.rotation.y = -Math.PI / 2;
                        decalSpawned = true;
                    } else if (x < mazeSize -1 && maze[x+1][y] === 0) {
                        decalMesh.position.set(x * unit + unit/2 - 0.01, yPos, y * unit);
                        decalMesh.rotation.y = Math.PI / 2;
                        decalSpawned = true;
                    } else if (y > 0 && maze[x][y-1] === 0) {
                        decalMesh.position.set(x * unit, yPos, y * unit - unit/2 + 0.01);
                        decalMesh.rotation.y = Math.PI;
                        decalSpawned = true;
                    } else if (y < mazeSize - 1 && maze[x][y+1] === 0) {
                        decalMesh.position.set(x * unit, yPos, y * unit + unit/2 - 0.01);
                        decalMesh.rotation.y = 0;
                        decalSpawned = true;
                    }
                    
                    if (decalSpawned) {
                        scene.add(decalMesh);
                        decalsRef.current.push(decalMesh);
                    }
                }

                // Add Corrosion/Grunge Environmental Decals
                if (Math.random() < 0.3) {
                    const grungeGeo = new THREE.PlaneGeometry(3, 3);
                    const grungeMat = new THREE.MeshBasicMaterial({
                        map: corrosionTex,
                        color: 0x111111,
                        transparent: true,
                        opacity: 0.65,
                        depthWrite: false,
                        blending: THREE.MultiplyBlending,
                        premultipliedAlpha: true
                    });
                    const grungeMesh = new THREE.Mesh(grungeGeo, grungeMat);
                    let grungeSpawned = false;
                    
                    if (x > 0 && maze[x-1][y] === 0) {
                        grungeMesh.position.set(x * unit - unit/2 + 0.015, 1.5, y * unit);
                        grungeMesh.rotation.y = -Math.PI / 2;
                        grungeSpawned = true;
                    } else if (x < mazeSize -1 && maze[x+1][y] === 0) {
                        grungeMesh.position.set(x * unit + unit/2 - 0.015, 1.5, y * unit);
                        grungeMesh.rotation.y = Math.PI / 2;
                        grungeSpawned = true;
                    } else if (y > 0 && maze[x][y-1] === 0) {
                        grungeMesh.position.set(x * unit, 1.5, y * unit - unit/2 + 0.015);
                        grungeMesh.rotation.y = Math.PI;
                        grungeSpawned = true;
                    } else if (y < mazeSize - 1 && maze[x][y+1] === 0) {
                        grungeMesh.position.set(x * unit, 1.5, y * unit + unit/2 - 0.015);
                        grungeMesh.rotation.y = 0;
                        grungeSpawned = true;
                    }

                    if (grungeSpawned) scene.add(grungeMesh);
                }
                
                const box = new THREE.Box3().setFromObject(midMesh); // use mid for simple box calc
                boundingBoxes.push(box);
            } else {
                // Add floor decals (drag marks or blood pools)
                if (Math.random() < 0.1) {
                    const isDragMark = Math.random() < 0.5;
                    const floorDecalGeo = new THREE.PlaneGeometry(isDragMark ? 3.0 : 2.0, isDragMark ? 3.0 : 2.0);
                    const floorDecalMat = new THREE.MeshBasicMaterial({ 
                        map: isDragMark ? dragMarksTex : bloodPoolTex, 
                        color: isDragMark ? 0x222222 : 0x330000, 
                        transparent: true, opacity: isDragMark ? 0.3 : 0.6, depthWrite: false, 
                        blending: THREE.MultiplyBlending,
                        premultipliedAlpha: true
                    });
                    const floorDecalMesh = new THREE.Mesh(floorDecalGeo, floorDecalMat);
                    floorDecalMesh.position.set(x * unit + (Math.random() - 0.5), 0.02, y * unit + (Math.random() - 0.5));
                    floorDecalMesh.rotation.x = -Math.PI / 2;
                    floorDecalMesh.rotation.z = Math.random() * Math.PI * 2;
                    scene.add(floorDecalMesh);
                }

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
                } else if (Math.random() > 0.95 && (x !== 1 && y !== 1)) {
                    // Added clothing
                    const clothingMesh = new THREE.Mesh(clothingGeo, clothingMat);
                    clothingMesh.position.set(x * unit + (Math.random()-0.5)*unit*0.6, 0.05, y * unit + (Math.random()-0.5)*unit*0.6);
                    clothingMesh.rotation.y = Math.random() * Math.PI;
                    scene.add(clothingMesh);
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
                        id: randomNote.id,
                        name: randomNote.name,
                        message: randomNote.text,
                        paranoiaEffect: randomNote.effect
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
                        roughnessMap: wallRoughTex,
                        normalMap: wallNormalTex,
                        normalScale: new THREE.Vector2(2.0, 2.0),
                        roughness: 0.8, 
                        metalness: 0.8 
                    });
                    
                    const artifactMesh = new THREE.Mesh(geo, mat);
                    artifactMesh.position.set(x * unit + (Math.random()-0.5)*unit*0.5, 0.2, y * unit + (Math.random()-0.5)*unit*0.5);
                    
                    // Add random rotation
                    artifactMesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
                    
                    artifactMesh.castShadow = true;
                    artifactMesh.receiveShadow = true;
                    
                    artifactMesh.userData = {
                        type: randomArtifact.type as any,
                        id: randomArtifact.id,
                        name: randomArtifact.name,
                        message: randomArtifact.message,
                        paranoiaEffect: randomArtifact.effect
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

                        if (randomChoice < 0.15) {
                            // Safe Zone / Save Point
                            const shrineGroup = new THREE.Group();
                            
                            // Base/pedestal
                            const shrineGeo = new THREE.CylinderGeometry(0.3, 0.4, 1.0, 8);
                            const shrineMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.9 });
                            const shrineMesh = new THREE.Mesh(shrineGeo, shrineMat);
                            shrineGroup.add(shrineMesh);
                            
                            // Glowing orb / beacon
                            const beaconGeo = new THREE.SphereGeometry(0.15, 16, 16);
                            const beaconMat = new THREE.MeshBasicMaterial({ color: 0x22ffaa });
                            const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
                            beaconMesh.position.y = 0.6;
                            shrineGroup.add(beaconMesh);
                            
                            // Soothing light
                            const safeLight = new THREE.PointLight(0x22ffaa, 200, 10, 2);
                            safeLight.position.y = 0.6;
                            shrineGroup.add(safeLight);

                            if (hasWallEast) px += unit * 0.4;
                            else if (hasWallWest) px -= unit * 0.4;
                            else if (hasWallSouth) pz += unit * 0.4;
                            else if (hasWallNorth) pz -= unit * 0.4;

                            shrineGroup.position.set(px, 0.5, pz);
                            shrineGroup.userData = {
                                type: 'save_point',
                                id: `save_point_${x}_${y}`,
                                name: "Luminous Shrine",
                                message: "The light holds back the rot. You can rest here."
                            } as InteractableItem;

                            scene.add(shrineGroup);
                            
                            // We construct a specific mesh for the raycaster
                            const rayTargetGeo = new THREE.BoxGeometry(1, 1.5, 1);
                            const rayTargetMat = new THREE.MeshBasicMaterial({ visible: false });
                            const rayTargetMesh = new THREE.Mesh(rayTargetGeo, rayTargetMat);
                            rayTargetMesh.position.copy(shrineGroup.position);
                            rayTargetMesh.userData = shrineGroup.userData;
                            scene.add(rayTargetMesh);
                            interactablesRef.current.push(rayTargetMesh);
                            
                            // Mark location as a global safe zone
                            envStatesRef.current[`safe_${x}_${y}`] = { state: 'active', x: px, z: pz };
                            
                        } else if (randomChoice < 0.35) {
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
                        } else if (randomChoice < 0.6) {
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

    // --- Debris & Leaks & Biological Matter ---
    if (debrisPositions.length > 0) {
        // Shard (Ceramic)
        const shardGeo = new THREE.TetrahedronGeometry(0.5);
        const shardMat = new THREE.MeshStandardMaterial({ color: 0xddddcc, roughness: 0.9, metalness: 0.1 });
        const shardMesh = new THREE.InstancedMesh(shardGeo, shardMat, debrisPositions.length);
        shardMesh.castShadow = true; shardMesh.receiveShadow = true;
        
        // Rebar (Metal)
        const rebarGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.5, 4);
        const rebarMat = new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 0.8, metalness: 0.5 });
        const rebarMesh = new THREE.InstancedMesh(rebarGeo, rebarMat, debrisPositions.length);
        rebarMesh.castShadow = true; rebarMesh.receiveShadow = true;

        let shardsCount = 0;
        let rebarsCount = 0;
        
        debrisPositions.forEach((m) => {
            const tempM = m.clone();
            const jitterScale = new THREE.Vector3(1, 1, 1).multiplyScalar(0.5 + Math.random() * 0.8);
            tempM.scale(jitterScale);

            if (Math.random() > 0.4) {
                shardMesh.setMatrixAt(shardsCount++, tempM);
            } else {
                rebarMesh.setMatrixAt(rebarsCount++, tempM);
            }
        });
        
        shardMesh.count = shardsCount;
        rebarMesh.count = rebarsCount;
        
        scene.add(shardMesh);
        scene.add(rebarMesh);
        
        // Biological/Organ matter splatters
        const organicMat = new THREE.MeshStandardMaterial({ color: 0x4a0000, roughness: 0.2, metalness: 0.4 });
        const splatPositions = [];
        for (let i = 0; i < 60; i++) {
             const m = debrisPositions[Math.floor(Math.random() * debrisPositions.length)];
             if (m) splatPositions.push(m);
        }
        if (splatPositions.length > 0) {
             const organicGeo = new THREE.SphereGeometry(1.5, 8, 8);
             const organicMesh = new THREE.InstancedMesh(organicGeo, organicMat, splatPositions.length);
             splatPositions.forEach((m, i) => {
                  const matrix = new THREE.Matrix4();
                  const pos = new THREE.Vector3().setFromMatrixPosition(m);
                  // Push to the floor or slightly above, maybe shift offcenter
                  pos.y = 0.05 + Math.random() * 0.1; 
                  pos.x += (Math.random() - 0.5) * 5;
                  pos.z += (Math.random() - 0.5) * 5;
                  
                  const randomScale = new THREE.Vector3(0.5 + Math.random() * 2, 0.05 + Math.random() * 0.1, 0.5 + Math.random() * 2);
                  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
                  matrix.compose(pos, quat, randomScale);
                  organicMesh.setMatrixAt(i, matrix);
             });
             scene.add(organicMesh);
        }
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
    const entityMat = new THREE.MeshStandardMaterial({ map: stalkerTex, roughness: 0.8, metalness: 0.2 });
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
    
    // Ambient soundscapes
    let ambientWhisperGain: GainNode | null = null;
    let ambientWhisperOsc: OscillatorNode | null = null;
    let ambientGroanGain: GainNode | null = null;
    let ambientGroanOsc: OscillatorNode | null = null;
    let ambientDripTimer = 0;

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

        // Ambient Whispers
        ambientWhisperOsc = audioCtx.createOscillator();
        ambientWhisperOsc.type = 'sawtooth';
        ambientWhisperOsc.frequency.value = 50; 
        
        ambientWhisperGain = audioCtx.createGain();
        ambientWhisperGain.gain.value = 0;
        
        const whisperFilter = audioCtx.createBiquadFilter();
        whisperFilter.type = 'bandpass';
        whisperFilter.frequency.value = 2000;
        whisperFilter.Q.value = 10;
        
        ambientWhisperOsc.connect(whisperFilter);
        whisperFilter.connect(ambientWhisperGain);
        ambientWhisperGain.connect(masterGain);
        ambientWhisperOsc.start();
        
        // Ambient Groans
        ambientGroanOsc = audioCtx.createOscillator();
        ambientGroanOsc.type = 'sine';
        ambientGroanOsc.frequency.value = 40;
        
        ambientGroanGain = audioCtx.createGain();
        ambientGroanGain.gain.value = 0;
        
        const groanDistortion = audioCtx.createWaveShaper();
        const curve = new Float32Array(400);
        for (let i = 0; i < 400; i++) {
            const x = i * 2 / 400 - 1;
            curve[i] = ( 3 + 10 ) * x * 20 * Math.PI / ( Math.PI + 10 * Math.abs(x) );
        }
        groanDistortion.curve = curve;
        
        ambientGroanOsc.connect(groanDistortion);
        groanDistortion.connect(ambientGroanGain);
        ambientGroanGain.connect(masterGain);
        ambientGroanOsc.start();

        // Heartbeat Sound Setup
        heartbeatOsc = audioCtx.createOscillator();
        heartbeatOsc.type = 'sine';
        heartbeatOsc.frequency.value = 40; // Low thump
        const heartbeatGain = audioCtx.createGain();
        heartbeatGain.gain.value = 0;
        heartbeatOsc.connect(heartbeatGain);
        heartbeatGain.connect(masterGain);
        heartbeatOsc.start();
        (window as any).heartbeatGain = heartbeatGain;

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
              
              if (item.type === 'save_point') {
                  saveGameAtCheckpoint();
                  paranoiaRef.current = 0.0;
                  setReadingNote({
                      id: "save_success",
                      type: "save_point",
                      name: "Luminous Shrine",
                      message: "Progress secured. Heart rate stabilized."
                  });
                  controls.unlock();
                  return;
              }
              
              collectItemLocally(item.id); 
              
              if (item.paranoiaEffect && !unsavedNotesRef.current.includes(item.id) && !savedNotes.includes(item.id)) {
                   paranoiaRef.current += item.paranoiaEffect;
                   paranoiaRef.current = Math.max(0, Math.min(1, paranoiaRef.current));
              }

              if (item.type === 'note' || item.type === 'artifact' || item.type === 'cabinet' || item.type === 'tape_recorder') {
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
                      } else if (item.type === 'tape_recorder') {
                          // Spooky tape player effect
                          const noise = ctx.createOscillator();
                          noise.type = 'square';
                          noise.frequency.setValueAtTime(100, ctx.currentTime);
                          noise.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 1);
                          const gain = ctx.createGain();
                          gain.gain.setValueAtTime(0.1, ctx.currentTime);
                          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
                          noise.connect(gain);
                          gain.connect(ctx.destination);
                          noise.start();
                          noise.stop(ctx.currentTime + 2);
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
    const dustGeo = new THREE.TetrahedronGeometry(0.02);
    const dustMat = new THREE.MeshStandardMaterial({
        color: 0xddddcc,
        roughness: 0.6,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const dustParticles = new THREE.InstancedMesh(dustGeo, dustMat, dustCount);
    const dustPhases = new Float32Array(dustCount);
    const dustPos = new Float32Array(dustCount * 3);
    const m = new THREE.Matrix4();
    for (let i = 0; i < dustCount; i++) {
        dustPos[i*3] = Math.random() * mazeSize * unit;
        dustPos[i*3+1] = Math.random() * 3.5;
        dustPos[i*3+2] = Math.random() * mazeSize * unit;
        dustPhases[i] = Math.random() * Math.PI * 2;
        m.setPosition(dustPos[i*3], dustPos[i*3+1], dustPos[i*3+2]);
        dustParticles.setMatrixAt(i, m);
    }
    dustParticles.instanceMatrix.needsUpdate = true;
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
              const fakeChance = stalkerDirectorRef.current.mode === 'gaslight' ? 0.03 : 0.005;
              if (Math.random() < fakeChance) { 
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

      const distToStalker = camera.position.distanceTo(stalker.position);

      // Flashlight flicker (Dynamic based on threat: proximity + paranoia)
      const proximityThreat = Math.max(0, 1 - (distToStalker / 25)); // Increases as stalker gets closer than 25 units
      const threatLevel = Math.max(paranoiaRef.current, proximityThreat); 

      // Increase flicker frequency and intensity as threat rises
      const flickerThreshold = 2.0 - (threatLevel * 1.6); // Triggers more often (down to 0.4s)
      const flickerReset = flickerThreshold + 0.5 - (threatLevel * 0.3); // Resets faster
      
      flickerTimer += delta;
      if (flickerTimer > flickerThreshold) {
         // Higher threat = higher chance to flicker and fail completely
         const flickerChance = 0.90 - (threatLevel * 0.4); 
         const completeFailureChance = threatLevel * 0.45 + (stalkerDirectorRef.current.mode === 'absence' ? 0.2 : 0);

         if (Math.random() > flickerChance) {
             // Severe flickering
             flashLight.intensity = Math.random() * 100 + 10;
             if (Math.random() < completeFailureChance) {
                  // Total blackout
                  flashLight.intensity = 0; 
             }
         } else {
             if (stalkerDirectorRef.current.mode === 'absence' && Math.random() > (0.7 - threatLevel * 0.2)) {
                 flashLight.intensity = 0;
             } else {
                 flashLight.intensity = 300 - (threatLevel * 100); // Shaky baseline power 
             }
         }
         
         // Sometimes stay broken longer
         const failPenalty = (flashLight.intensity === 0 && Math.random() < threatLevel) ? (Math.random() * 0.5) : 0;
         
         if (flickerTimer > (flickerReset + failPenalty)) flickerTimer = 0;
      }
      
      // Update Paranoia
      if (distToStalker < 20) {
          paranoiaRef.current += delta * 0.05;
      } else if (flashLight.intensity < 100) {
          paranoiaRef.current += delta * 0.03;
      } else if (stalkerDirectorRef.current.mode === 'absence') {
          // weaponized absence: tension builds up slowly due to silence
          paranoiaRef.current += delta * 0.02;
      } else {
          paranoiaRef.current -= delta * 0.01;
      }
      paranoiaRef.current = Math.max(0, Math.min(1, paranoiaRef.current));
      
      // Update Decals
      decalsRef.current.forEach(decal => {
          const mat = decal.material as THREE.MeshBasicMaterial;
          if (decal.userData.type === 'scratch') {
              const targetOpacity = paranoiaRef.current > 0.6 ? (paranoiaRef.current - 0.6) * 2.5 : 0;
              mat.opacity += (targetOpacity - mat.opacity) * 0.05;
          } else {
              const targetOpacity = paranoiaRef.current > 0.5 ? (paranoiaRef.current - 0.5) * 2.0 : 0;
              mat.opacity += (targetOpacity - mat.opacity) * 0.05;
          }
      });

      // Ambient Soundscapes updating
      if (audioCtx) {
          const t = audioCtx.currentTime;
          
          // Groan: linked to proximity using proximityThreat
          if (ambientGroanGain && ambientGroanOsc) {
              const targetGroanVol = proximityThreat * 0.15;
              ambientGroanGain.gain.setTargetAtTime(targetGroanVol, t, 0.5);
              if (proximityThreat > 0) {
                  ambientGroanOsc.frequency.setTargetAtTime(40 + (Math.sin(elapsedTime) * 10) + (proximityThreat * 50), t, 0.5);
              }
          }
          
          // Whispers: linked to paranoia
          if (ambientWhisperGain && ambientWhisperOsc) {
              const targetWhisperVol = paranoiaRef.current > 0.3 ? (paranoiaRef.current - 0.3) * 0.1 : 0;
              ambientWhisperGain.gain.setTargetAtTime(targetWhisperVol, t, 0.5);
              if (paranoiaRef.current > 0.3) {
                   ambientWhisperOsc.frequency.setTargetAtTime(50 + (Math.random() * paranoiaRef.current * 200), t, 0.1);
              }
          }
                   // Dripping Water: sudden short sine sweeps (plips) independent but frequency scales with tension
          ambientDripTimer += delta;
          const dripThreshold = 2.0 - (paranoiaRef.current * 1.5);
          if (ambientDripTimer > dripThreshold && Math.random() < 0.05) {
               ambientDripTimer = 0;
               const dripOsc = audioCtx.createOscillator();
               dripOsc.type = 'sine';
               dripOsc.frequency.setValueAtTime(800 + Math.random() * 400, t);
               dripOsc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
               
               const dripGain = audioCtx.createGain();
               dripGain.gain.setValueAtTime(0.0, t);
               dripGain.gain.linearRampToValueAtTime(0.05, t + 0.01);
               dripGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
               
               const dripPanner = audioCtx.createPanner();
               dripPanner.panningModel = 'HRTF';
               dripPanner.positionX.value = camera.position.x + (Math.random() - 0.5) * 10;
               dripPanner.positionY.value = camera.position.y + 2 + Math.random() * 2;
               dripPanner.positionZ.value = camera.position.z + (Math.random() - 0.5) * 10;
               
               dripOsc.connect(dripGain);
               dripGain.connect(dripPanner);
               if (masterGain) dripPanner.connect(masterGain);
               
               dripOsc.start(t);
               dripOsc.stop(t + 0.3);
          }

          // Heartbeat matching new visual balance
          const hGain = (window as any).heartbeatGain as GainNode;
          if (hGain && heartbeatOsc) {
              const bpm = 60 + (paranoiaRef.current * 80);
              const beatFreq = bpm / 60.0;
              const pulse = Math.pow(Math.max(0, Math.sin(t * Math.PI * beatFreq * 2.0)), 4.0);
              // Only audible when paranoia > 0.5, peaking at high tension
              const targetHeartVol = paranoiaRef.current > 0.5 ? (paranoiaRef.current - 0.5) * 0.4 * pulse : 0.0;
              hGain.gain.setTargetAtTime(targetHeartVol, t, 0.05);
          }
      }

      // Camera FOV warping (Loss of Control / Physiological response - Breathing Pulse)
      const baseFov = 75;
      const breathingRate = 1.0 + (paranoiaRef.current * 2.0); // Breathes faster with higher paranoia
      const fovPulse = Math.sin(time * 0.003 * breathingRate) * (paranoiaRef.current * 5.0); // Intensity scales with paranoia
      camera.fov = baseFov + fovPulse;
      camera.updateProjectionMatrix();

      // Phantom visual hallucination
      if (phantomMesh.visible) {
          phantomMesh.lookAt(camera.position);
      }
      if (paranoiaRef.current > 0.6 && !phantomMesh.visible && Math.random() < 0.005) {
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          // Spawn in front of the player randomly
          phantomMesh.position.copy(camera.position).add(forward.multiplyScalar(15 + Math.random() * 15));
          phantomMesh.position.y = 1.1;
          phantomMesh.visible = true;
          
          // Vanish quickly
          setTimeout(() => { if (phantomMesh) phantomMesh.visible = false; }, Math.random() * 400 + 100);
      }

      // Occasional auditory hallucination based on paranoia
      if (audioCtx && masterGain && paranoiaRef.current > 0.4 && time > nextHallucinationTimeRef.current) {
          nextHallucinationTimeRef.current = time + 4000 + (Math.random() * 8000);
          const osc = audioCtx.createOscillator();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(80 + Math.random() * 300, audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
          
          const panner = audioCtx.createPanner();
          panner.panningModel = 'HRTF';
          panner.distanceModel = 'inverse';
          
          // Spawn hallucination directly behind the player's head
          const backVec = new THREE.Vector3(0, 0, 2);
          backVec.applyQuaternion(camera.quaternion);
          const hPos = camera.position.clone().add(backVec);
          panner.positionX.value = hPos.x;
          panner.positionY.value = hPos.y;
          panner.positionZ.value = hPos.z;
          
          const gainNode = audioCtx.createGain();
          gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
          gainNode.gain.linearRampToValueAtTime(paranoiaRef.current * 0.4, audioCtx.currentTime + 0.1);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
          
          osc.connect(gainNode);
          gainNode.connect(panner);
          panner.connect(masterGain);
          
          osc.start();
          osc.stop(audioCtx.currentTime + 1);
      }
      
      // Dynamic Fog Density based on proximity and paranoia
      const fogDensityTarget = 0.12 + Math.max(0, (15 - distToStalker) / 15) * 0.1 + (paranoiaRef.current * 0.05);
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
      const _m = new THREE.Matrix4();
      for (let i = 0; i < dustCount; i++) {
          const idx = i * 3;
          dustPos[idx + 1] += Math.sin(time / 1000 + dustPhases[i]) * 0.002 + 0.001;
          if (dustPos[idx + 1] > 3.5) {
              dustPos[idx + 1] = 0; // Wrap around height
          }
          dustPos[idx] += Math.sin(time / 2000 + dustPhases[i]) * 0.002;
          dustPos[idx + 2] += Math.cos(time / 1500 + dustPhases[i]) * 0.002;
          _m.setPosition(dustPos[idx], dustPos[idx + 1], dustPos[idx + 2]);
          dustParticles.setMatrixAt(i, _m);
      }
      dustParticles.instanceMatrix.needsUpdate = true;
      
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
                     if(mat) mat.emissive.setHex(0x666666);
                 }
            }

            hoveredNoteRef.current = foundHover;
            setHoveredNote(foundHover);
        }
        
        // Dynamic pulsing for current hovered item
        if (hoveredNoteRef.current) {
            const hMesh = interactablesRef.current.find(m => m.userData.id === hoveredNoteRef.current?.id);
            if (hMesh) {
                const mat = hMesh.material as THREE.MeshStandardMaterial;
                if (mat) {
                    const pulse = Math.abs(Math.sin(elapsedTime * 4.0)) * 0.5 + 0.1;
                    mat.emissiveIntensity = pulse;
                }
            }
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

        const baseSpeed = (moveState.run || isRunningJoystick) ? 6.0 : 2.5;
        // Panic paralysis: high paranoia and close entity drastically reduces speed.
        const stDist = camera.position.distanceTo(stalker.position);
        const paralyzeFactor = (stDist < 12 && paranoiaRef.current > 0.6) ? 0.3 : 1.0;
        const speed = baseSpeed * paralyzeFactor;

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

        // --- Behavioral Profiling ---
        const dScore = stalkerDirectorRef.current;
        const sDirData = stalkingDataRef.current;
        
        if (moveState.run) dScore.playerPacingScore += delta * 2.0;
        else if (moveState.forward || moveState.backward || moveState.left || moveState.right) dScore.playerPacingScore += delta * 1.0;
        else dScore.playerPacingScore -= delta * 1.5;
        dScore.playerPacingScore = Math.max(0, Math.min(100, dScore.playerPacingScore));

        const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const lookAngle = sDirData.lastCamForward.angleTo(camForward);
        if (lookAngle > 0.01) {
            dScore.lookingBackScore += lookAngle * 10.0;
        } else {
            dScore.lookingBackScore -= delta * 5.0;
        }
        dScore.lookingBackScore = Math.max(0, Math.min(100, dScore.lookingBackScore));
        sDirData.lastCamForward.copy(camForward);

        if (time - dScore.modeStartTime > dScore.modeDurationMs) {
            dScore.modeStartTime = time;
            const metricsSum = dScore.playerPacingScore + dScore.lookingBackScore + paranoiaRef.current * 100;
            
            if (metricsSum < 40) {
                // Player is calm and slow -> Aggressive Pursuit
                dScore.mode = 'pursuit';
                dScore.modeDurationMs = 8000 + Math.random() * 5000;
            } else if (metricsSum > 220) {
                // Player is highly anxious -> Weaponized Absence
                dScore.mode = 'absence';
                dScore.modeDurationMs = 15000 + Math.random() * 10000;
            } else {
                // Medium tension -> Gaslight or Ambush
                if (Math.random() > 0.5) {
                    dScore.mode = 'gaslight';
                    dScore.modeDurationMs = 12000;
                } else {
                    dScore.mode = 'ambush';
                    dScore.modeDurationMs = 15000;
                }
            }
        }

        // --- Stalker AI (Web Worker Offloaded) ---
        const distToPlayer = stalker.position.distanceTo(camera.position);

        let isStunned = false;
        let isHidden = false;
        let lurePos: { x: number, z: number } | null = null;
        let isSafeZoneFendingOff = false;
        const now = Date.now();

        for (const key in envStatesRef.current) {
             const s = envStatesRef.current[key];
             if (s.stunUntil && s.stunUntil > now) isStunned = true;
             if (s.hissUntil && s.hissUntil > now) isHidden = true;
             if (key.startsWith('safe_')) {
                 const dx = camera.position.x - s.x;
                 const dz = camera.position.z - s.z;
                 const distToSafe = Math.hypot(dx, dz);
                 if (distToSafe < 4.0) {
                     isSafeZoneFendingOff = true;
                 }
             }
        }
        
        if (envStatesRef.current.globalLure && envStatesRef.current.globalLure.time > now) {
             lurePos = envStatesRef.current.globalLure;
        }

        let finalPlayerPos = { x: camera.position.x, z: camera.position.z };
        let currentStalkerSpeed = 1.5;

        // Apply dynamic director modifiers
        if (isSafeZoneFendingOff || dScore.mode === 'absence') {
             const awayDir = stalker.position.clone().sub(camera.position).normalize();
             finalPlayerPos = { x: camera.position.x + awayDir.x * 40, z: camera.position.z + awayDir.z * 40 };
             currentStalkerSpeed = isSafeZoneFendingOff ? 8.0 : 4.0;
        } else if (dScore.mode === 'gaslight') {
             if (distToPlayer < 15) {
                  const awayDir = stalker.position.clone().sub(camera.position).normalize();
                  finalPlayerPos = { x: camera.position.x + awayDir.x * 20, z: camera.position.z + awayDir.z * 20 };
             } else {
                  finalPlayerPos = { x: camera.position.x, z: camera.position.z };
             }
             currentStalkerSpeed = 2.0;

             // Occasional gaslighting audio mimcry directly behind player
             if (Math.random() < 0.005 && audioCtx && deceptionPanner && deceptionGain && deceptionNoise) {
                 const fakePos = camera.position.clone().add(camForward.clone().multiplyScalar(-5));
                 deceptionPanner.positionX.value = fakePos.x;
                 deceptionPanner.positionY.value = fakePos.y;
                 deceptionPanner.positionZ.value = fakePos.z;
                 
                 deceptionNoise.frequency.setValueAtTime(100 + Math.random()*200, audioCtx.currentTime);
                 deceptionGain.gain.setValueAtTime(0.2, audioCtx.currentTime);
                 deceptionGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
             }
        } else if (dScore.mode === 'ambush') {
             // Route to player's predicted forward path
             const expectedPath = camera.position.clone().add(camForward.clone().multiplyScalar(15));
             finalPlayerPos = { x: expectedPath.x, z: expectedPath.z };
             currentStalkerSpeed = 3.5;
        } else if (dScore.mode === 'pursuit') {
             finalPlayerPos = { x: camera.position.x, z: camera.position.z };
             currentStalkerSpeed = 5.0;
        }

        // Overrides
        if (isHidden) {
             finalPlayerPos = { x: stalker.position.x + (Math.random()-0.5)*10, z: stalker.position.z + (Math.random()-0.5)*10 };
        } else if (lurePos) {
             finalPlayerPos = lurePos;
        }

        // Tell worker to compute path
        aiWorker.postMessage({
            playerPos: finalPlayerPos,
            stalkerPos: { x: stalker.position.x, z: stalker.position.z },
            mazeData: maze,
            unit: 2.5
        });

        if (!isStunned) {
            if (distToPlayer > 1.2 || isHidden) {
                // Use Web Worker result
                const workerDir = new THREE.Vector3(aiState.dirX, 0, aiState.dirZ);
                const speedMult = moveState.run ? 1.2 : 1.0;
                currentStalkerSpeed *= speedMult;
                
                if (aiState.dist > 0 && aiState.dist < 50) {
                     const newStalkerPos = stalker.position.clone().add(workerDir.multiplyScalar(currentStalkerSpeed * delta));
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
                         const newStalkerPosX = stalker.position.clone().add(stalkerDirX.multiplyScalar(currentStalkerSpeed * delta));
                         let blockX = false;
                         const sxBox = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(newStalkerPosX.x, 1.5, stalker.position.z), new THREE.Vector3(1, 4, 1));
                         for (let box of boundingBoxes) if(sxBox.intersectsBox(box)) blockX = true;
                         if(!blockX) stalker.position.x = newStalkerPosX.x;
                         else {
                             const stalkerDirZ = new THREE.Vector3(0, 0, aiState.dirZ).normalize();
                             const newStalkerPosZ = stalker.position.clone().add(stalkerDirZ.multiplyScalar(currentStalkerSpeed * delta));
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
                    if (dScore.mode === 'ambush') {
                        // In ambush, it turns off its light to stay completely hidden in the dark
                        stalkerLight.intensity = Math.random() < 0.05 ? 100 : 0;
                    } else if (dScore.mode === 'gaslight') {
                        // Gaslighting flickers wildly
                        stalkerLight.intensity = Math.random() * 200;
                    } else {
                        stalkerLight.intensity = (10 - distToPlayer) * 20; 
                    }
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
          dreadPass.uniforms["distortionIntensity"].value = (intensity * 2.0) + (paranoiaRef.current * 1.5); 
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
      ssaoPass.setSize(window.innerWidth, window.innerHeight);
      if (fxaaPass) {
          const pixelRatio = renderer.getPixelRatio();
          fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
          fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
      }
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
                    <h2 className="text-4xl font-serif text-red-700 mb-8 tracking-widest border-b border-red-900/30 pb-2">LORE DATABASE</h2>
                    <div className="w-full max-h-[60vh] overflow-y-auto pr-4 space-y-4 font-serif italic text-gray-300 pointer-events-auto">
                        {savedNotes.length === 0 ? (
                            <p className="text-center text-gray-600 font-mono not-italic text-sm">No items found yet.</p>
                        ) : (
                            savedNotes.map((noteId, i) => {
                                const note = POSSIBLE_NOTES.find(n => n.id === noteId);
                                const artifact = POSSIBLE_ARTIFACTS.find(a => a.id === noteId);
                                const call = POSSIBLE_CALLS.find(c => c.id === noteId.split('_')[0]); // phone ids are c1_x_y
                                const memory = POSSIBLE_MEMORIES.find(m => m.id === noteId.split('_')[0]); // cabinet ids are m1_x_y
                                
                                const matchedItem = note || artifact || call || memory;

                                if (matchedItem) {
                                    return (
                                        <div key={i} className="p-6 border border-gray-800 bg-gray-900/30">
                                            <h3 className="text-red-800 font-mono uppercase font-bold text-xs tracking-widest border-b border-gray-800 mb-2 pb-2 not-italic">{matchedItem.name}</h3>
                                            <p>&quot;{'text' in matchedItem ? matchedItem.text : matchedItem.message}&quot;</p>
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
             <p className="text-3xl font-serif tracking-widest text-red-700 animate-pulse">
                 {pauseText}
             </p>
             <p className="text-gray-500 mt-6 font-mono text-sm tracking-widest">Click the screen to return</p>
        </div>
      )}
      
      {scare && (
          <div className="absolute inset-0 z-50 bg-black flex items-center justify-center pointer-events-none">
              <div className="absolute inset-0 bg-red-900 mix-blend-color-burn animate-pulse"></div>
              <p className="text-9xl text-white font-serif font-bold opacity-80" style={{ transform: 'scale(1.5, 4)' }}>IT FOUND YOU</p>
          </div>
      )}

      {saveMessage && (
          <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
              <div className="bg-black/60 border border-green-500/30 px-6 py-3 rounded backdrop-blur-md">
                  <p className="text-green-400 font-mono text-sm tracking-[0.3em] font-bold animate-pulse">
                      {saveMessage}
                  </p>
              </div>
          </div>
      )}

      {isStarted && (isLocked || isMobileMode) && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {hoveredNote ? (
                  <div className="w-5 h-5 flex flex-col items-center justify-center relative">
                      <div className="absolute w-[4px] h-[4px] bg-white/80 rounded-full"></div>
                      <div className="absolute w-full h-full border border-white/40 rounded-full animate-ping"></div>
                  </div>
              ) : (
                  <div className="w-[3px] h-[3px] bg-white/40 rounded-full"></div>
              )}
          </div>
      )}

      {isStarted && (isLocked || isMobileMode) && hoveredNote && !readingNote && (
          <div className="absolute top-[55%] left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto text-white z-20 transition-opacity duration-300">
              <div className="bg-black/60 backdrop-blur-md px-4 py-2 border border-white/20 rounded flex flex-col items-center animate-pulse">
                  {hoveredNote.name && (
                      <span className="text-xs text-gray-300 font-mono tracking-wider mb-1 uppercase text-center border-b border-white/10 pb-1 w-full">{hoveredNote.name}</span>
                  )}
                  <p className="font-mono text-sm tracking-widest hidden md:block mt-1">
                      <span className="bg-white/20 px-1.5 py-0.5 rounded mr-2 inline-block">E</span> 
                      {hoveredNote.type === 'tape_recorder' ? 'PLAY LOG' : ['note', 'artifact', 'cabinet'].includes(hoveredNote.type) ? 'READ' : hoveredNote.type === 'phone' ? 'ANSWER' : 'INTERACT'}
                  </p>
                  <button 
                      className="md:hidden mt-2 px-6 py-2 bg-white/10 border border-white/20 rounded font-mono text-sm tracking-widest pointer-events-auto focus:outline-none focus:bg-white/20"
                      onTouchEnd={(e) => {
                           e.stopPropagation();
                           document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
                      }}
                  >
                      TAP TO {hoveredNote.type === 'tape_recorder' ? 'PLAY LOG' : ['note', 'artifact', 'cabinet'].includes(hoveredNote.type) ? 'READ' : hoveredNote.type === 'phone' ? 'ANSWER' : 'INTERACT'}
                  </button>
              </div>
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
             {['tape_recorder', 'phone'].includes(readingNote.type) ? (
                 <div className="absolute bottom-32 w-full px-8 flex flex-col items-center animate-fade-in">
                     <p className="font-mono text-xl text-white uppercase tracking-widest bg-black/60 px-4 py-2 rounded text-center max-w-2xl shadow-xl shadow-black/50">
                        &quot;{readingNote.message}&quot;
                     </p>
                     <p className="mt-4 text-xs font-mono text-gray-500 opacity-80 uppercase tracking-widest bg-black/20 px-2 py-1 rounded">
                         [AUDIO PLAYING...] {(isMobileMode || !isLocked) ? 'TAP OUTSIDE TO CLOSE' : 'PRESS [E] TO CLOSE'}
                     </p>
                 </div>
             ) : (
                 <div className="bg-[#e4dfd0] p-10 max-w-lg min-h-64 shadow-2xl rotate-1 rounded-sm relative m-4" onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
                     <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(0,0,0,0.1)_100%)] pointer-events-none"></div>
                     {readingNote.type !== 'note' && readingNote.name && (
                         <h3 className="font-serif text-xl text-red-950 font-bold border-b border-red-900/20 pb-2 mb-4 uppercase tracking-widest">{readingNote.name}</h3>
                     )}
                     <p className="font-serif text-2xl text-red-950 leading-relaxed font-bold italic mix-blend-color-burn" style={{ fontFamily: '"Playfair Display", serif' }}>
                        {readingNote.message}
                     </p>
                     {readingNote.type !== 'save_point' && (
                         <p className="mt-6 text-xs font-mono text-red-800 opacity-80 uppercase tracking-widest border-t border-red-900/10 pt-4">
                             New Data Acquired. Locate a Shrine to secure progress.
                         </p>
                     )}
                     <p className="absolute text-xs font-mono text-gray-500 opacity-60 pointer-events-none hidden md:block" style={{ bottom: '-30px', right: '0px', color: 'white' }}>[E] Close</p>
                     <button 
                         className="absolute bottom-4 right-4 text-xs font-mono text-gray-700 bg-black/5 px-3 py-2 rounded md:hidden border border-black/10"
                         onTouchEnd={() => {
                             setReadingNote(null);
                         }}
                     >
                         Close
                     </button>
                 </div>
             )}
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
