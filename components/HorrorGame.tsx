'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { auth, db } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getLogger } from '../lib/gameLogger';
import SafeModeTerminal from './SafeModeTerminal';
import BugReportModal from './BugReportModal';


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
    type: 'note' | 'artifact' | 'pipe' | 'switch' | 'phone' | 'cabinet' | 'save_point' | 'tape_recorder' | 'battery';
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

const ARTIFACT_SECRETS: Record<string, { secret: string; detail: string }> = {
    a1: {
        secret: "SCRATCH ON PINION GEARS",
        detail: "scratched into deep gears: '...they are listening. There is a secondary speaker beneath the casing...'"
    },
    a2: {
        secret: "ETCHED INSIDE THE SOLE",
        detail: "stamped inside raw leather sole: '0xFF-01A. Target was lost in Sector 4.'"
    },
    a3: {
        secret: "REVERSE CONTACT EMBOSSING",
        detail: "embossed on back plate: An inverted star insignia flanked by 'V.H.S-1979'."
    },
    a4: {
        secret: "FADED MARGINALIA SCRAWL",
        detail: "scrawled in margins: 'If they blink, the walls reset. Run between the heartbeats.'"
    },
    a5: {
        secret: "SYRINGE CORE IMPRINT",
        detail: "stamped near tip: 'DO NOT ADMINISTER TO PATIENTS DISCOVERY-09'."
    },
    a6: {
        secret: "NOSEBRIDGE STEEL CARVING",
        detail: "carved in brass bridge: 'I saw through its glamour. It has no teeth, yet it eats.'"
    },
    a7: {
        secret: "INTERNAL SHANK GLYPH",
        detail: "inscribed on inner ring: '...till the cycle breaks us. 11/14/2042.'"
    },
    a8: {
        secret: "MOLDY INNER SLEEVE NOTE",
        detail: "wrinkled in hidden fold: 'Item #002. Total spatial compression has occurred. The exit is a lie.'"
    }
};

function buildDetailedArtifactMesh(id: string): THREE.Group {
    const group = new THREE.Group();
    
    // Default materials
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.65, metalness: 0.85 });
    const rustMetal = new THREE.MeshStandardMaterial({ color: 0x422d21, roughness: 0.8, metalness: 0.3 });
    const goldMetal = new THREE.MeshStandardMaterial({ color: 0xe5c158, roughness: 0.25, metalness: 0.95 });
    const silverMetal = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.3, metalness: 0.85 });
    const bloodRed = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.45, metalness: 0.1 });
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d5, roughness: 0.9, metalness: 0.05 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xa5f3fc, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.35 });

    if (id === 'a1') {
        // Shattered Tape Recorder
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.25), darkMetal);
        group.add(body);
        
        const acrylicWindowMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.4 });
        const windowPane = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.26), acrylicWindowMat);
        windowPane.position.set(0, -0.05, 0.01);
        group.add(windowPane);
        
        const reelMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5, metalness: 0.2 });
        const centerPinMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.2, metalness: 0.9 });
        
        const reelL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), reelMat);
        reelL.rotation.x = Math.PI / 2;
        reelL.position.set(-0.16, -0.05, 0.07);
        const pinL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 12), centerPinMat);
        pinL.rotation.x = Math.PI / 2;
        pinL.position.set(-0.16, -0.05, 0.1);
        group.add(reelL);
        group.add(pinL);
        
        const reelR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), reelMat);
        reelR.rotation.x = Math.PI / 2;
        reelR.position.set(0.16, -0.05, 0.07);
        const pinR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 12), centerPinMat);
        pinR.rotation.x = Math.PI / 2;
        pinR.position.set(0.16, -0.05, 0.1);
        group.add(reelR);
        group.add(pinR);

        const buttonMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.4, metalness: 0.8 });
        for (let i = 0; i < 4; i++) {
            const btn = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), buttonMat);
            btn.position.set(-0.25 + i * 0.16, 0.29, 0.04);
            group.add(btn);
        }
        
    } else if (id === 'a2') {
        const shoeRed = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.82, metalness: 0.05 });
        const rubberSoleMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.9, metalness: 0.1 });
        
        // Sole
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.95), rubberSoleMat);
        sole.position.y = -0.22;
        group.add(sole);
        
        // Heel
        const heel = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.35, 0.4), shoeRed);
        heel.position.set(0, -0.05, -0.2);
        group.add(heel);
        
        // Toe
        const toe = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.45), shoeRed);
        toe.position.set(0, -0.11, 0.2);
        group.add(toe);
        
        // Collar
        const collar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.15, 0.28), darkMetal);
        collar.position.set(0, 0.13, -0.18);
        group.add(collar);
        
        // Laces
        const laceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
        for (let i = 0; i < 3; i++) {
            const lace = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.02), laceMat);
            lace.position.set(0, -0.02 + i * 0.06, 0.1);
            lace.rotation.y = (i % 2 === 0 ? 0.2 : -0.2);
            group.add(lace);
        }
        
    } else if (id === 'a3') {
        group.rotation.x = -0.3;
        
        const badgeMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.5, metalness: 0.1 });
        const card = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.025), badgeMat);
        group.add(card);
        
        const clip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.08), silverMetal);
        clip.position.set(0, 0.45, 0);
        group.add(clip);
        
        const smear = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.005), bloodRed);
        smear.position.set(0.05, 0.1, 0.015);
        smear.rotation.z = -0.4;
        group.add(smear);
        
        const photo = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.005), darkMetal);
        photo.position.set(-0.12, -0.1, 0.015);
        group.add(photo);
        
    } else if (id === 'a4') {
        const paperGrp = new THREE.Group();
        const segments = 5;
        for (let s = 0; s < segments; s++) {
            const zAngle = Math.sin((s / segments) * Math.PI) * 0.08;
            const slice = new THREE.Mesh(new THREE.BoxGeometry(0.6 / segments, 0.85, 0.015), paperMat);
            slice.position.set(-0.3 + (s * (0.6 / segments)) + (0.3 / segments), 0, zAngle);
            slice.rotation.y = (s - 2) * 0.06;
            paperGrp.add(slice);
        }
        group.add(paperGrp);
        
        const charcoal = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.95 });
        for (let i = 0; i < 6; i++) {
            const line = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.012, 0.02), charcoal);
            line.position.set(0, 0.25 - i * 0.1, 0.04);
            group.add(line);
        }
        
    } else if (id === 'a5') {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.65, 12), glassMat);
        barrel.rotation.z = Math.PI / 2;
        group.add(barrel);
        
        const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 8), silverMetal);
        plunger.rotation.z = Math.PI / 2;
        plunger.position.set(0.25, 0, 0);
        group.add(plunger);
        
        const plungerCap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8), silverMetal);
        plungerCap.rotation.z = Math.PI / 2;
        plungerCap.position.set(0.67, 0, 0);
        group.add(plungerCap);
        
        const serumMat = new THREE.MeshStandardMaterial({ color: 0x4a044e, emissive: 0x1e013a, roughness: 0.1, metalness: 0.4 });
        const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 12), serumMat);
        fluid.rotation.z = Math.PI / 2;
        fluid.position.set(-0.06, 0, 0);
        group.add(fluid);
        
        const needleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 8), darkMetal);
        needleBase.rotation.z = Math.PI / 2;
        needleBase.position.set(-0.35, 0, 0);
        group.add(needleBase);
        
        const needleSegment1 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.18, 6), silverMetal);
        needleSegment1.rotation.z = Math.PI / 2;
        needleSegment1.position.set(-0.44, 0, 0);
        group.add(needleSegment1);
        
        const needleSegment2 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.18, 6), silverMetal);
        needleSegment2.rotation.z = Math.PI / 2 + 0.7;
        needleSegment2.position.set(-0.55, 0.06, 0);
        group.add(needleSegment2);
        
    } else if (id === 'a6') {
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.4, metalness: 0.85 });
        const rimL = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 16), frameMat);
        rimL.rotation.x = Math.PI / 2;
        rimL.position.set(-0.25, 0, 0);
        group.add(rimL);
        
        const rimR = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 16), frameMat);
        rimR.rotation.x = Math.PI / 2;
        rimR.position.set(0.25, 0, 0);
        group.add(rimR);
        
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), frameMat);
        bridge.position.set(0, 0.05, 0);
        group.add(bridge);
        
        const lensL = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.02, 16), glassMat);
        lensL.rotation.x = Math.PI / 2;
        lensL.position.set(-0.25, 0, 0);
        group.add(lensL);
        
        const crackLine = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.015, 0.03), darkMetal);
        crackLine.position.set(-0.25, 0, 0.015);
        crackLine.rotation.z = 0.6;
        group.add(crackLine);
        
        const templeArm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.65), frameMat);
        templeArm.position.set(-0.48, 0.02, -0.3);
        templeArm.rotation.y = 0.05;
        group.add(templeArm);
        
    } else if (id === 'a7') {
        const numSegments = 14;
        const radius = 0.28;
        const thickness = 0.045;
        
        for (let s = 0; s < numSegments; s++) {
            let angle = (s / numSegments) * Math.PI * 2;
            let currentRadius = radius;
            
            if (s > 2 && s < 6) currentRadius *= 0.72;
            if (s > 9 && s < 12) currentRadius *= 0.65;
            
            const px = Math.cos(angle) * currentRadius;
            const py = Math.sin(angle) * currentRadius * 1.3;
            
            const segment = new THREE.Mesh(new THREE.CylinderGeometry(thickness, thickness, 0.15, 8), goldMetal);
            segment.position.set(px, py, 0);
            
            segment.rotation.z = angle + Math.PI / 2 + (Math.sin(s) * 0.15);
            segment.rotation.x = 0.05 * Math.cos(s);
            group.add(segment);
        }
        
    } else {
        const brownLeather = new THREE.MeshStandardMaterial({ color: 0x3f2d21, roughness: 0.85, metalness: 0.1 });
        const flap1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.06), brownLeather);
        flap1.position.set(-0.2, 0, 0.07);
        flap1.rotation.y = 0.35;
        group.add(flap1);
        
        const flap2 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.06), brownLeather);
        flap2.position.set(0.2, 0, 0.07);
        flap2.rotation.y = -0.35;
        group.add(flap2);
        
        const moldMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9, metalness: 0.05 });
        const bill = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 0.02), moldMat);
        bill.position.set(0, 0.13, -0.01);
        bill.rotation.y = 0.05;
        group.add(bill);
    }
    
    const secretInscribeMat = new THREE.MeshStandardMaterial({ 
        color: 0x22c55e,
        emissive: 0x15803d, 
        roughness: 0.2 
    });
    const scratchMark = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), secretInscribeMat);
    scratchMark.position.set(0, -0.15, -0.12);
    group.add(scratchMark);

    group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return group;
}

export function ArtifactExaminer({
  item,
  audioCtx,
  unlocked,
  onUnlock,
  onClose
}: {
  item: InteractableItem;
  audioCtx: AudioContext | null;
  unlocked: boolean;
  onUnlock: () => void;
  onClose: () => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [progress, setProgress] = useState(unlocked ? 100 : 0);
    const [isScanning, setIsScanning] = useState(false);
    
    // Ref storage to pass variables without re-triggering useEffect
    const dragRef = useRef({
        isDragging: false,
        lastX: 0,
        lastY: 0,
        accumulatedRotation: unlocked ? 500 : 0,
        targetRotX: 0,
        targetRotY: 0,
        currentRotX: 0,
        currentRotY: 0
    });

    const secretInfo = ARTIFACT_SECRETS[item.id] || { 
        secret: "GENERIC PATTERNS DECODED", 
        detail: "Standard diagnostic records. Trace background echoes matched." 
    };

    useEffect(() => {
        if (!canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        
        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height, false);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10);
        camera.position.set(0, 0, 2.2);

        const ambient = new THREE.AmbientLight(0x0f1115, 3.0);
        scene.add(ambient);
        
        const spotLight = new THREE.SpotLight(0xf8fafc, 62.0, 10, Math.PI / 6, 0.5, 1);
        spotLight.position.set(2, 3, 2);
        spotLight.castShadow = true;
        spotLight.shadow.mapSize.width = 1024;
        spotLight.shadow.mapSize.height = 1024;
        spotLight.shadow.bias = -0.001;
        scene.add(spotLight);

        const fillLight = new THREE.DirectionalLight(0xb91c1c, 8.0);
        fillLight.position.set(-2, -1, -1);
        scene.add(fillLight);

        const artifactGroup = buildDetailedArtifactMesh(item.id);
        scene.add(artifactGroup);
        artifactGroup.scale.set(1.3, 1.3, 1.3);

        let animationFrameId: number;
        let lastTime = performance.now();

        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const now = performance.now();
            const dt = (now - lastTime) / 1000;
            lastTime = now;

            if (!dragRef.current.isDragging) {
                dragRef.current.targetRotY += dt * 0.18;
                dragRef.current.targetRotX = Math.sin(now * 0.0012) * 0.15;
            }

            dragRef.current.currentRotY += (dragRef.current.targetRotY - dragRef.current.currentRotY) * 0.15;
            dragRef.current.currentRotX += (dragRef.current.targetRotX - dragRef.current.currentRotX) * 0.15;

            artifactGroup.rotation.y = dragRef.current.currentRotY;
            artifactGroup.rotation.x = dragRef.current.currentRotX;

            renderer.render(scene, camera);
        };

        animate();

        const handleResize = () => {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h, false);
        };
        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(canvas);

        return () => {
            cancelAnimationFrame(animationFrameId);
            resizeObserver.disconnect();
            renderer.dispose();
            artifactGroup.traverse((node) => {
                if (node instanceof THREE.Mesh) {
                    node.geometry?.dispose();
                    if (Array.isArray(node.material)) {
                        node.material.forEach((mat) => mat.dispose());
                    } else {
                        node.material?.dispose();
                    }
                }
            });
        };
    }, [item.id, unlocked]);

    const handleDragStart = (x: number, y: number) => {
        dragRef.current.isDragging = true;
        dragRef.current.lastX = x;
        dragRef.current.lastY = y;
        setIsScanning(true);
    };

    const handleDragMove = (x: number, y: number) => {
        if (!dragRef.current.isDragging) return;
        const dx = x - dragRef.current.lastX;
        const dy = y - dragRef.current.lastY;
        dragRef.current.lastX = x;
        dragRef.current.lastY = y;

        dragRef.current.targetRotY += dx * 0.009;
        dragRef.current.targetRotX += dy * 0.009;
        dragRef.current.targetRotX = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, dragRef.current.targetRotX));

        if (!unlocked && progress < 100) {
            const motionDelta = Math.abs(dx) + Math.abs(dy);
            if (motionDelta > 0.5) {
                dragRef.current.accumulatedRotation += motionDelta * 0.42;
                const nextProgress = Math.min(100, Math.floor(dragRef.current.accumulatedRotation / 2.5));
                if (nextProgress > progress) {
                    setProgress(nextProgress);
                    
                    if (nextProgress % 12 === 0 && audioCtx) {
                        try {
                            const now = audioCtx.currentTime;
                            const osc = audioCtx.createOscillator();
                            osc.type = "sine";
                            osc.frequency.setValueAtTime(400 + (nextProgress * 4), now);
                            const gain = audioCtx.createGain();
                            gain.gain.setValueAtTime(0.04, now);
                            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                            osc.connect(gain);
                            gain.connect(audioCtx.destination);
                            osc.start();
                            osc.stop(now + 0.05);
                        } catch(e) {}
                    }

                    if (nextProgress === 100) {
                        onUnlock();
                        if (audioCtx) {
                            try {
                                const now = audioCtx.currentTime;
                                const osc = audioCtx.createOscillator();
                                osc.type = "sawtooth";
                                osc.frequency.setValueAtTime(220, now);
                                osc.frequency.linearRampToValueAtTime(880, now + 0.4);
                                const osc2 = audioCtx.createOscillator();
                                osc2.type = "sine";
                                osc2.frequency.setValueAtTime(660, now);
                                osc2.frequency.linearRampToValueAtTime(1320, now + 0.5);
                                
                                const gain = audioCtx.createGain();
                                gain.gain.setValueAtTime(0.12, now);
                                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                                osc.connect(gain);
                                osc2.connect(gain);
                                gain.connect(audioCtx.destination);
                                
                                osc.start();
                                osc.stop(now + 0.5);
                                osc2.start();
                                osc2.stop(now + 0.5);
                            } catch(e) {}
                        }
                    }
                }
            }
        }
    };

    const handleDragEnd = () => {
        dragRef.current.isDragging = false;
        setIsScanning(false);
    };

    return (
        <div 
            className="flex flex-col md:flex-row w-full max-w-4xl bg-stone-950 border-2 border-red-950/90 rounded relative overflow-hidden text-gray-100 font-mono animate-scale-up shadow-[0_0_35px_rgba(0,0,0,0.85)]" 
            onClick={(e) => e.stopPropagation()} 
            onTouchEnd={(e) => e.stopPropagation()}
        >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-green-500/10 pointer-events-none animate-[scanline_6s_linear_infinite]" />
            
            <div className="w-full md:w-1/2 p-4 flex flex-col relative border-b md:border-b-0 md:border-r border-red-950/50">
                <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                        <span className="text-[10px] tracking-widest text-red-500 font-bold uppercase">PHYSICAL CORE INTERACTION</span>
                    </div>
                </div>

                <div 
                    className="relative flex-1 min-h-[320px] md:min-h-[380px] bg-black/60 rounded-sm border border-white/5 overflow-hidden group cursor-grab active:cursor-grabbing select-none"
                    onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
                    onMouseMove={(e) => handleDragMove(e.clientX, e.clientY)}
                    onMouseUp={handleDragEnd}
                    onMouseLeave={handleDragEnd}
                    onTouchStart={(e) => {
                        const touch = e.touches[0];
                        handleDragStart(touch.clientX, touch.clientY);
                    }}
                    onTouchMove={(e) => {
                        const touch = e.touches[0];
                        handleDragMove(touch.clientX, touch.clientY);
                    }}
                    onTouchEnd={handleDragEnd}
                >
                    <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm border border-white/10 px-2 py-1 rounded text-[10px] text-gray-400 pointer-events-none tracking-widest uppercase">
                        Drag mouse or swipe to rotate
                    </div>

                    <canvas ref={canvasRef} className="w-full h-full block absolute inset-0 pointer-events-none" />

                    <div className={`absolute inset-x-0 h-1 bg-red-600/30 blur-sm pointer-events-none ${isScanning ? "animate-[bounce_3s_infinite]" : "hidden"}`} />
                </div>
            </div>

            <div className="w-full md:w-1/2 p-6 flex flex-col justify-between bg-zinc-950 relative">
                <div>
                    <div className="flex items-center justify-between text-[11px] text-gray-500 pb-3 border-b border-white/5">
                        <span className="tracking-widest uppercase">{item.type} ANALYTICAL DATABANK</span>
                        <span className="bg-white/5 px-2 py-0.5 rounded font-mono text-[9px]">ID: {item.id.toUpperCase()}</span>
                    </div>

                    <h2 className="text-2xl font-serif text-red-500 tracking-wider font-bold mt-4 uppercase border-b border-red-950/20 pb-2">
                        {item.name || "UNIDENTIFIED OBJECT"}
                    </h2>

                    <p className="mt-4 text-xs font-serif italic text-gray-300 leading-relaxed bg-black/40 p-4 border border-white/5 rounded-sm">
                        &quot;{item.message}&quot;
                    </p>

                    <div className="mt-6 space-y-4">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-[10px]">
                                <span className="text-gray-400 font-mono tracking-widest uppercase">SPECTRAL EXAMINATION PROGRESS:</span>
                                <span className={`font-mono font-bold tracking-widest ${progress === 100 ? "text-green-400 animate-pulse" : "text-amber-500"}`}>
                                    {progress}% {progress === 100 ? "COMPLETE" : "SCANNING"}
                                </span>
                            </div>

                            <div className="w-full bg-white/5 h-2 rounded overflow-hidden border border-white/10 p-0.5 flex">
                                <div 
                                    className={`h-full transition-all duration-300 rounded-sm ${
                                        progress === 100 
                                            ? "bg-green-500" 
                                            : "bg-amber-500 animate-pulse"
                                    }`}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>

                        <div className={`transition-all duration-700 overflow-hidden border ${
                            progress === 100 
                                ? "max-h-[160px] opacity-100 border-green-500/30 bg-green-950/5 p-4 mt-2" 
                                : "max-h-0 opacity-0 border-transparent p-0 mt-0"
                        }`}>
                            <div className="flex items-center gap-1.5 mb-1 text-green-400 font-bold text-[10px] tracking-widest uppercase animate-pulse">
                                <span className="text-[8px]">▶</span> ANOMALY LOCATED: {secretInfo.secret}
                            </div>
                            <p className="font-mono text-emerald-300 text-xs leading-relaxed uppercase tracking-wider font-bold">
                                {secretInfo.detail}
                            </p>
                        </div>

                        {progress < 100 && (
                            <div className="bg-red-950/10 border border-red-900/30 p-4 rounded-sm text-center text-red-400/80 text-[10px] tracking-wider animate-pulse uppercase">
                                [⚠️] ROTATE AND SCRUTINIZE ALL SIDES IN THE VIEWPORT TO BREAK SPECTRAL SEAL AND UNCOVER HIDDEN TEXT
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-8 pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-3">
                    <button 
                        onClick={onClose}
                        className="flex-1 py-2.5 bg-red-950/20 hover:bg-red-900/40 border border-red-900/50 rounded text-red-400 hover:text-red-100 text-xs font-bold tracking-widest transition-all cursor-pointer pointer-events-auto shadow-sm"
                    >
                        DISMISS INTERACTION
                    </button>
                </div>
            </div>
        </div>
    );
}

function createUpgradedStalker(stalkerTex: THREE.Texture) {
    const stalkerGroup = new THREE.Group();

    // Use a wet, visceral, fleshy bone material that reacts dynamically to light
    const bodyMat = new THREE.MeshStandardMaterial({
        map: stalkerTex,
        bumpMap: stalkerTex,
        bumpScale: 0.12,
        roughness: 0.75,
        metalness: 0.15,
        color: 0x5a4f4f
    });

    const mechanicalMat = new THREE.MeshStandardMaterial({
        color: 0x18181a,
        bumpMap: stalkerTex,
        bumpScale: 0.03,
        roughness: 0.32,
        metalness: 0.95
    });

    // 1. Torso & Segmented Sternum/Ribcage Frame
    const torso = new THREE.Group();
    torso.position.y = 1.3;
    stalkerGroup.add(torso);

    // Main central biomechanical core (increased segments to 32 for perfect roundness)
    const spineGeo = new THREE.CylinderGeometry(0.12, 0.08, 1.4, 32);
    const spine = new THREE.Mesh(spineGeo, mechanicalMat);
    torso.add(spine);

    // Detailed rib segments - Torus segments upgraded to 16 radial, 48 tubular segments for smooth bones
    for (let r = 0; r < 6; r++) {
        const width = 0.42 - r * 0.03;
        const ribGeo = new THREE.TorusGeometry(width, 0.035, 16, 48, Math.PI);
        const rib = new THREE.Mesh(ribGeo, bodyMat);
        rib.rotation.x = Math.PI / 2;
        rib.position.set(0, 0.5 - r * 0.16, 0.05);
        torso.add(rib);
    }

    // 2. Head with Upper Skull and Articulated Lower Scream Jaw
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.75, 0.05); // local relative to torso, placing head at ~2.05m total height
    torso.add(headGroup);

    // Upper Skull - subdivided for better shading normals
    const skullGeo = new THREE.BoxGeometry(0.3, 0.22, 0.3, 4, 4, 4);
    const skull = new THREE.Mesh(skullGeo, bodyMat);
    skull.position.set(0, 0.1, 0);
    headGroup.add(skull);

    // Smooth skull cap - highly detailed dome
    const capGeo = new THREE.SphereGeometry(0.15, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const cap = new THREE.Mesh(capGeo, bodyMat);
    cap.position.set(0, 0.2, 0);
    headGroup.add(cap);

    // Lower Jaw (articulated for expressive screaming expression!)
    const jawPivot = new THREE.Group();
    jawPivot.position.set(0, -0.05, -0.05); // hinge at back of jaw
    headGroup.add(jawPivot);

    const jawGeo = new THREE.BoxGeometry(0.24, 0.08, 0.22, 4, 2, 4);
    const jawMesh = new THREE.Mesh(jawGeo, bodyMat);
    jawMesh.position.set(0, -0.04, 0.11); // offset from pivot point
    jawPivot.add(jawMesh);

    // Jagged teeth lines on upper and lower jaw - cones upgraded to 12 segments
    const toothMat = new THREE.MeshBasicMaterial({ color: 0xeaeada });
    const toothGeo = new THREE.ConeGeometry(0.015, 0.06, 12);

    // Upper teeth
    for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        const tooth = new THREE.Mesh(toothGeo, toothMat);
        tooth.rotation.x = Math.PI;
        tooth.position.set(i * 0.05, -0.02, 0.13);
        skull.add(tooth);
    }
    // Lower teeth
    for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        const tooth = new THREE.Mesh(toothGeo, toothMat);
        tooth.position.set(i * 0.045, 0.04, 0.18);
        jawPivot.add(tooth);
    }

    // Glowing pupil-less red biological eyes - detailed spheres
    const eyeGeo = new THREE.SphereGeometry(0.045, 16, 16);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0a0a });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.1, 0.08, 0.14);
    rightEye.position.set(0.1, 0.08, 0.14);
    headGroup.add(leftEye);
    headGroup.add(rightEye);

    // 3. Legs (Anatomically jointed long slender creeping legs)
    const legMat = bodyMat;

    // Left Leg Setup
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.25, -0.7, 0); // attached to bottom of spine
    torso.add(leftLegGroup);

    const leftThighGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.8, 20);
    const leftThigh = new THREE.Mesh(leftThighGeo, legMat);
    leftThigh.position.y = -0.4;
    leftLegGroup.add(leftThigh);

    const leftCalfGroup = new THREE.Group();
    leftCalfGroup.position.set(0, -0.8, 0); // relative to thigh bottom
    leftLegGroup.add(leftCalfGroup);

    const leftCalfGeo = new THREE.CylinderGeometry(0.05, 0.03, 0.8, 20);
    const leftCalf = new THREE.Mesh(leftCalfGeo, legMat);
    leftCalf.position.y = -0.4;
    leftCalfGroup.add(leftCalf);

    // Right Leg Setup
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.25, -0.7, 0); 
    torso.add(rightLegGroup);

    const rightThighGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.8, 20);
    const rightThigh = new THREE.Mesh(rightThighGeo, legMat);
    rightThigh.position.y = -0.4;
    rightLegGroup.add(rightThigh);

    const rightCalfGroup = new THREE.Group();
    rightCalfGroup.position.set(0, -0.8, 0);
    rightLegGroup.add(rightCalfGroup);

    const rightCalfGeo = new THREE.CylinderGeometry(0.05, 0.03, 0.8, 20);
    const rightCalf = new THREE.Mesh(rightCalfGeo, legMat);
    rightCalf.position.y = -0.4;
    rightCalfGroup.add(rightCalf);


    // 4. Arms (Slender segmented cybernetic appendages)
    // Left Arm Setup
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.4, 0.5, 0); // connected to shoulder
    torso.add(leftArmGroup);

    const leftUpperArmGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.9, 20);
    leftUpperArmGeo.translate(0, -0.45, 0); // move pivot to shoulder
    const leftUpperArm = new THREE.Mesh(leftUpperArmGeo, bodyMat);
    leftArmGroup.add(leftUpperArm);

    const leftLowerArmGroup = new THREE.Group();
    leftLowerArmGroup.position.set(0, -0.9, 0);
    leftArmGroup.add(leftLowerArmGroup);

    const leftLowerArmGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.8, 20);
    leftLowerArmGeo.translate(0, -0.4, 0);
    const leftLowerArm = new THREE.Mesh(leftLowerArmGeo, bodyMat);
    leftLowerArmGroup.add(leftLowerArm);

    // Spiky elongated hand claw - cones to 16 segments
    const clawGeo = new THREE.ConeGeometry(0.03, 0.4, 16);
    clawGeo.rotateX(Math.PI);
    const leftClaw = new THREE.Mesh(clawGeo, mechanicalMat);
    leftClaw.position.set(0, -0.9, 0.08);
    leftLowerArmGroup.add(leftClaw);


    // Right Arm Setup
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.4, 0.5, 0); // connected to shoulder
    torso.add(rightArmGroup);

    const rightUpperArmGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.9, 20);
    rightUpperArmGeo.translate(0, -0.45, 0);
    const rightUpperArm = new THREE.Mesh(rightUpperArmGeo, bodyMat);
    rightArmGroup.add(rightUpperArm);

    const rightLowerArmGroup = new THREE.Group();
    rightLowerArmGroup.position.set(0, -0.9, 0);
    rightArmGroup.add(rightLowerArmGroup);

    const rightLowerArmGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.8, 20);
    rightLowerArmGeo.translate(0, -0.4, 0);
    const rightLowerArm = new THREE.Mesh(rightLowerArmGeo, bodyMat);
    rightLowerArmGroup.add(rightLowerArm);

    // Spiky Claw Right
    const rightClaw = new THREE.Mesh(clawGeo, mechanicalMat);
    rightClaw.position.set(0, -0.9, 0.08);
    rightLowerArmGroup.add(rightClaw);


    // 5. Dynamic Tattered Clothing and Rags (Armor system reacting to movement/decay)
    const clothingStrips: THREE.Mesh[] = [];
    const clipCount = 12;
    const clothingMat = new THREE.MeshStandardMaterial({
        color: 0x110d0d,
        roughness: 0.95,
        opacity: 0.9,
        transparent: true,
        side: THREE.DoubleSide
    });

    for (let c = 0; c < clipCount; c++) {
        const length = 0.8 + Math.random() * 0.7;
        const width = 0.06 + Math.random() * 0.08;
        const clothGeo = new THREE.PlaneGeometry(width, length, 1, 4);
        clothGeo.translate(0, -length / 2, 0); // pivot at top of strip
        
        const cloth = new THREE.Mesh(clothGeo, clothingMat);
        
        // Distribute hanging from chest/shoulders
        const angle = (c / clipCount) * Math.PI * 2;
        const radius = 0.32;
        cloth.position.set(Math.cos(angle) * radius, 0.4 - Math.random() * 0.3, Math.sin(angle) * radius);
        cloth.rotation.y = -angle;
        cloth.rotation.x = 0.15; // slightly leaning outwards
        
        torso.add(cloth);
        clothingStrips.push(cloth);
    }

    // Ensure shadows work for the entire group hierarchy
    stalkerGroup.traverse((node) => {
        if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    return {
        mesh: stalkerGroup,
        parts: {
            torso,
            headGroup,
            jawPivot,
            leftEye,
            rightEye,
            leftLegGroup,
            rightLegGroup,
            leftCalfGroup,
            rightCalfGroup,
            leftArmGroup,
            rightArmGroup,
            leftLowerArmGroup,
            rightLowerArmGroup,
            clothingStrips
        }
    };
}

// --- Procedural Texture Generators (Eliminates Network 404 Errors & Stalls) ---
function createPhantomTexture() {
    if (typeof window === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();
    
    ctx.clearRect(0, 0, 256, 256);
    
    // Smooth ghostly white/grey base radial gradient
    const grad = ctx.createRadialGradient(128, 128, 5, 128, 128, 100);
    grad.addColorStop(0, 'rgba(230, 230, 240, 0.7)');
    grad.addColorStop(0.5, 'rgba(100, 110, 120, 0.4)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    
    // Draw hollow eyes
    ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
    // Left eye
    ctx.beginPath();
    ctx.ellipse(108, 110, 14, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    // Right eye
    ctx.beginPath();
    ctx.ellipse(148, 110, 14, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Faint glowing red pupil dots
    ctx.fillStyle = 'rgba(255, 30, 30, 0.9)';
    ctx.beginPath();
    ctx.arc(108, 110, 3, 0, Math.PI * 2);
    ctx.arc(148, 110, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw screaming mouth
    ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
    ctx.beginPath();
    ctx.ellipse(128, 168, 16, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw wispy lines/wrinkles
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(110, 85); ctx.lineTo(146, 85);
    ctx.moveTo(115, 90); ctx.lineTo(141, 90);
    // tear lines
    ctx.moveTo(108, 128); ctx.lineTo(105, 145);
    ctx.moveTo(148, 128); ctx.lineTo(151, 145);
    ctx.stroke();
    
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}

function createStalkerTexture() {
    if (typeof window === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();
    
    // Base pitch black skin
    ctx.fillStyle = '#060608';
    ctx.fillRect(0, 0, 512, 512);
    
    // Draw chaotic dark-grey/charcoal muscle/skin fibers
    ctx.strokeStyle = '#1a1a20';
    ctx.lineWidth = 1;
    for (let i = 0; i < 150; i++) {
        const y = Math.random() * 512;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y + (Math.random() - 0.5) * 40);
        ctx.stroke();
    }
    for (let i = 0; i < 80; i++) {
        const x = Math.random() * 512;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (Math.random() - 0.5) * 40, 512);
        ctx.stroke();
    }
    
    // Draw dark crimson blood veins and creeping decay
    ctx.strokeStyle = 'rgba(110, 10, 10, 0.45)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 25; i++) {
        let x = Math.random() * 512;
        let y = Math.random() * 512;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 0; j < 5; j++) {
            const nx = x + (Math.random() - 0.5) * 35;
            const ny = y + Math.random() * 55;
            ctx.lineTo(nx, ny);
            x = nx; y = ny;
        }
        ctx.stroke();
    }
    
    // Add multiple glowing red biological node segments / eyes
    for (let i = 0; i < 20; i++) {
        const rx = Math.random() * 512;
        const ry = Math.random() * 512;
        const radius = Math.random() * 3 + 2;
        
        const bloom = ctx.createRadialGradient(rx, ry, 0, rx, ry, radius * 3);
        bloom.addColorStop(0, 'rgba(255, 30, 30, 1)');
        bloom.addColorStop(0.3, 'rgba(255, 0, 0, 0.4)');
        bloom.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(rx, ry, radius * 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(rx, ry, radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function createDecalTexture() {
    if (typeof window === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();
    
    ctx.clearRect(0, 0, 256, 256);
    
    ctx.strokeStyle = '#8a0707';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // 4 groups of tallies
    for (let g = 0; g < 3; g++) {
        const ox = 50 + g * 55 + (Math.random() - 0.5) * 15;
        const oy = 60 + (Math.random() - 0.5) * 25;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            ctx.moveTo(ox + i * 10, oy);
            ctx.lineTo(ox + i * 10 + (Math.random() - 0.5) * 4, oy + 40 + (Math.random() - 0.5) * 6);
        }
        ctx.moveTo(ox - 5, oy + 32);
        ctx.lineTo(ox + 35, oy + 8);
        ctx.stroke();
    }
    
    // Scream eye doodle inside decal
    ctx.beginPath();
    ctx.arc(128, 160, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(128, 160, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#8a0707';
    ctx.fill();
    
    ctx.lineWidth = 1.5;
    for (let a = 0; a < 8; a++) {
        const angle = (a / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(128 + Math.cos(angle) * 25, 160 + Math.sin(angle) * 25);
        ctx.lineTo(128 + Math.cos(angle) * 38, 160 + Math.sin(angle) * 38);
        ctx.stroke();
    }
    
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}

function createWallScratchesTexture() {
    if (typeof window === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();
    
    ctx.clearRect(0, 0, 256, 256);
    
    ctx.strokeStyle = '#120404';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    
    for (let line = 0; line < 3; line++) {
        const ox = 50 + line * 55;
        const oy = 30 + Math.random() * 20;
        
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        let cx = ox;
        let cy = oy;
        for (let segment = 0; segment < 4; segment++) {
            const nx = cx + (Math.random() - 0.3) * 15;
            const ny = cy + 40 + Math.random() * 10;
            ctx.lineTo(nx, ny);
            cx = nx; cy = ny;
        }
        ctx.stroke();
    }
    
    ctx.strokeStyle = '#520202';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(30 + Math.random() * 180, 20 + Math.random() * 100);
        ctx.lineTo(30 + Math.random() * 180, 160 + Math.random() * 80);
        ctx.stroke();
    }
    
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}

function createDragMarksTexture() {
    if (typeof window === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();
    
    ctx.clearRect(0, 0, 512, 256);
    
    const bandColor = 'rgba(70, 5, 5, 0.4)';
    const darkBandColor = 'rgba(30, 2, 2, 0.65)';
    
    const startY = 128;
    const count = 4;
    const spacing = 16;
    
    for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * spacing;
        const cy = startY + offset;
        
        const grad = ctx.createLinearGradient(40, cy, 460, cy);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.12, darkBandColor);
        grad.addColorStop(0.25, bandColor);
        grad.addColorStop(0.75, 'rgba(100, 15, 15, 0.15)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.strokeStyle = grad;
        ctx.lineWidth = 9 + Math.random() * 5;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(40, cy);
        let cx = 40;
        for (let step = 0; step < 9; step++) {
            const nx = cx + 50;
            const ny = cy + offset + Math.sin(step) * 5 + (Math.random() - 0.5) * 6;
            ctx.lineTo(nx, ny);
            cx = nx;
        }
        ctx.stroke();
    }
    
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}

function createBloodPoolTexture() {
    if (typeof window === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();
    
    ctx.clearRect(0, 0, 512, 512);
    
    const cx = 256;
    const cy = 256;
    const radius = 120 + Math.random() * 30;
    
    ctx.fillStyle = '#3a0202';
    ctx.beginPath();
    const pointsCount = 36;
    for (let i = 0; i <= pointsCount; i++) {
        const angle = (i / pointsCount) * Math.PI * 2;
        const rOffset = Math.sin(angle * 4) * 22 + Math.cos(angle * 8) * 12 + Math.sin(angle * 14) * 6;
        const curRadius = radius + rOffset;
        const px = cx + Math.cos(angle) * curRadius;
        const py = cy + Math.sin(angle) * curRadius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#650202';
    ctx.beginPath();
    for (let i = 0; i <= pointsCount; i++) {
        const angle = (i / pointsCount) * Math.PI * 2;
        const rOffset = Math.sin(angle * 4) * 16 + Math.cos(angle * 8) * 8 + Math.sin(angle * 14) * 4;
        const curRadius = (radius * 0.72) + rOffset;
        const px = cx + Math.cos(angle) * curRadius;
        const py = cy + Math.sin(angle) * curRadius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    
    for (let d = 0; d < 25; d++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = radius + 15 + Math.random() * 100;
        const dx = cx + Math.cos(angle) * dist;
        const dy = cy + Math.sin(angle) * dist;
        const size = Math.random() * 6 + 2;
        
        ctx.fillStyle = Math.random() > 0.4 ? '#3a0202' : '#650202';
        ctx.beginPath();
        ctx.arc(dx, dy, size, 0, Math.PI * 2);
        ctx.fill();
        
        if (Math.random() > 0.5) {
            ctx.lineWidth = size * 0.3;
            ctx.strokeStyle = ctx.fillStyle;
            ctx.beginPath();
            ctx.moveTo(dx, dy);
            ctx.lineTo(dx - Math.cos(angle) * size * 2.2, dy - Math.sin(angle) * size * 2.2);
            ctx.stroke();
        }
    }
    
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}

export default function HorrorGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [scare, setScare] = useState(false);
  
  // Diagnostics & Error Handling States
  const [isGraphicsFailed, setIsGraphicsFailed] = useState(false);
  const [isAudioFailed, setIsAudioFailed] = useState(false);
  const [showDiagnosticsConsole, setShowDiagnosticsConsole] = useState(false);
  const [isRecoveryInProgress, setIsRecoveryInProgress] = useState(false);
  const logger = getLogger();

  useEffect(() => {
    const unbind = logger.bindGlobalErrorHandlers();
    logger.info("Initializing Liminal game client instance...", "SYSTEM");
    return () => {
      unbind?.();
    };
  }, [logger]);

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
  const [unlockedArtifacts, setUnlockedArtifacts] = useState<Record<string, boolean>>(() => {
      if (typeof window !== 'undefined') {
          try {
              const saved = localStorage.getItem('liminal_unlocked_artifacts');
              return saved ? JSON.parse(saved) : {};
          } catch (e) {
              return {};
          }
      }
      return {};
  });

  const markArtifactAsUnlocked = (id: string) => {
      setUnlockedArtifacts(prev => {
          const next = { ...prev, [id]: true };
          if (typeof window !== 'undefined') {
              try {
                  localStorage.setItem('liminal_unlocked_artifacts', JSON.stringify(next));
              } catch (e) {}
          }
          return next;
      });
  };
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [audioCtxState, setAudioCtxState] = useState<AudioContext | null>(null);
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

  // --- Stamina and Environmental Interaction States & Refs ---
  const [stamina, setStamina] = useState<number>(100.0);
  const staminaRef = useRef<number>(100.0);
  const [isStaminaExhausted, setIsStaminaExhausted] = useState<boolean>(false);
  const isStaminaExhaustedRef = useRef<boolean>(false);

  const [isCrouching, setIsCrouching] = useState<boolean>(false);
  const isCrouchingRef = useRef<boolean>(false);

  const [isClimbing, setIsClimbing] = useState<boolean>(false);
  const isClimbingRef = useRef<boolean>(false);
  const climbOffsetRef = useRef<number>(0.0);
  const [climbOffset, setClimbOffset] = useState<number>(0.0);

  // --- Combat States & Refs ---
  const [attackCooldown, setAttackCooldown] = useState<number>(0); // remaining ms for visualization
  const [parryCooldown, setParryCooldown] = useState<number>(0);
  const [dodgeCooldown, setDodgeCooldown] = useState<number>(0);
  const attackCooldownRef = useRef<number>(0); // absolute timestamp
  const parryCooldownRef = useRef<number>(0); // absolute timestamp
  const parryWindowRef = useRef<number>(0); // parry gate window timestamp
  const dodgeCooldownRef = useRef<number>(0); // absolute timestamp
  const dodgeTimeRef = useRef<number>(0); // active remaining seconds
  const dodgeDirRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const stalkerStunnedUntilRef = useRef<number>(0); // absolute timestamp for heavy stun
  
  const [slashAnimActive, setSlashAnimActive] = useState<boolean>(false);
  const [parryFlashActive, setParryFlashActive] = useState<boolean>(false);
  const [combatFeed, setCombatFeed] = useState<string>("");
  const combatFeedRef = useRef<string>("");
  const combatFeedTimeRef = useRef<number>(0); // clear time

  const [isMobileMode, _setIsMobileMode] = useState<boolean>(() => {
      if (typeof window === 'undefined') return false;
      return window.innerWidth < 1024 || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  });
  const isMobileModeRef = useRef(isMobileMode);
  const setIsMobileMode = (val: boolean) => {
      _setIsMobileMode(val);
      isMobileModeRef.current = val;
  };
  const [useVirtualControls, _setUseVirtualControls] = useState<boolean>(() => {
      if (typeof window === 'undefined') return false;
      return window.innerWidth < 1024 || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  });
  const useVirtualControlsRef = useRef(useVirtualControls);
  const setUseVirtualControls = (val: boolean) => {
      _setUseVirtualControls(val);
      useVirtualControlsRef.current = val;
  };
  const [sprintToggle, setSprintToggle] = useState<boolean>(false);
  const [flashlightOn, setFlashlightOn] = useState<boolean>(true);
  const [battery, setBattery] = useState<number>(100.0);
  const flashlightOnRef = useRef<boolean>(true);
  const batteryRef = useRef<number>(100.0);
  const moveStateRef = useRef({ forward: false, backward: false, left: false, right: false, run: false, space: false });
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
     isMobileModeRef.current = isMobileMode;
     useVirtualControlsRef.current = useVirtualControls;
  }, [isMobileMode, useVirtualControls]);

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
    const fogColor = new THREE.Color(0x07090b); // sick cold blue-grey/dark room tone
    scene.background = fogColor;
    scene.fog = new THREE.Fog(fogColor, 15.0, 60.0); 

    const phantomTex = createPhantomTexture();
    const stalkerTex = createStalkerTexture();
    const decalTex = createDecalTexture();
    const dragMarksTex = createDragMarksTexture();
    const wallScratchesTex = createWallScratchesTexture();
    const bloodPoolTex = createBloodPoolTexture();


    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.y = 1.4; 
    
    if (startPosRef.current) {
        camera.position.x = startPosRef.current.x;
        camera.position.z = startPosRef.current.z;
    } else {
        camera.position.x = 2.5; // starting cell (1 * unit)
        camera.position.z = 2.5;
    }
    // Rotate 180 degrees around Y-axis to face positive Z down the open starting runway corridor
    camera.rotation.set(0, Math.PI, 0);

    const isDeviceMobile = typeof window !== 'undefined' ? (window.innerWidth < 768) : false;
    
    let renderer: THREE.WebGLRenderer;
    try {
        renderer = new THREE.WebGLRenderer({ 
            antialias: !isDeviceMobile, 
            powerPreference: "high-performance",
            precision: isDeviceMobile ? "mediump" : "highp"
        });
    } catch (e: any) {
        console.error("Critical GL Core Failure during init", e);
        logger.fatal(`Failed to instantiate primary WebGL display context: ${e.message}`, "GRAPHICS_ENGINE");
        setTimeout(() => {
            setIsGraphicsFailed(true);
        }, 0);
        return;
    }

    const handleContextLost = (event: Event) => {
        event.preventDefault();
        logger.warn("WebGL Context Lost! GPU pipeline disconnected. Initiating automated recovery attempt...", "GRAPHICS_ENGINE");
        setIsRecoveryInProgress(true);
        
        setTimeout(() => {
            logger.info("WebGL Context auto-recovery timed out. Transitioning player layout safely to raw text terminal safe-mode.", "GRAPHICS_ENGINE");
            setIsRecoveryInProgress(false);
            setIsGraphicsFailed(true);
            if (controlsRef.current) {
                controlsRef.current.unlock();
            }
        }, 2500);
    };

    const canvasElement = renderer.domElement;
    canvasElement.addEventListener('webglcontextlost', handleContextLost, false);

    (window as any).simulateWebGLContextLoss = () => {
        logger.warn("Debugging trigger: Simulating synthetic GPU WebGL context loss event.", "FAULT_INJECTOR");
        const glCtx = renderer.getContext();
        const extension = glCtx ? (glCtx as any).getExtension('WEBGL_lose_context') : null;
        if (extension) {
            extension.loseContext();
        } else {
            const fakeEvent = new Event('webglcontextlost', { bubbles: true, cancelable: true });
            canvasElement.dispatchEvent(fakeEvent);
        }
    };

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

    let ssaoPass: SSAOPass | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    if (!isDeviceMobile) {
        ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
        ssaoPass.kernelRadius = 0.5; // tightened radius for crevices
        ssaoPass.minDistance = 0.0005;
        ssaoPass.maxDistance = 0.05;
        ssaoPass.output = SSAOPass.OUTPUT.Default;
        composer.addPass(ssaoPass);

        // UnrealBloomPass: strength, radius, threshold
        bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.45, // strength
            0.5,  // radius
            0.85  // threshold
        );
        composer.addPass(bloomPass);
    }

    const DreadShader = {
        defines: {
            "MOBILE": isDeviceMobile ? 1 : 0
        },
        uniforms: {
            "tDiffuse": { value: null },
            "time": { value: 0.0 },
            "distortionIntensity": { value: 0.0 }, // scales with stalker proximity
            "flickerState": { value: 0.0 },
            "uMotionBlur": { value: new THREE.Vector2(0, 0) },
            "uParanoia": { value: 0.0 }
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
            uniform vec2 uMotionBlur;
            uniform float uParanoia;
            varying vec2 vUv;

            // Hash pseudo-random noise generator
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            void main() {
                vec2 uv = vUv;
                
                #if MOBILE == 1
                
                // Optimized fast-path for mobile devices to maintain 60 FPS
                // Lens pincushion distortion (radial projection warping)
                vec2 center = vec2(0.5);
                vec2 toCenter = uv - center;
                float distToCenter = length(toCenter);
                float k = 0.005 + distortionIntensity * 0.015;
                vec2 distortedUv = uv + toCenter * k * (distToCenter * distToCenter);
                
                if (distortedUv.x < 0.0 || distortedUv.x > 1.0 || distortedUv.y < 0.0 || distortedUv.y > 1.0) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }
                
                // Color sampling & Vignette
                vec4 color = texture2D(tDiffuse, distortedUv);
                float vignette = 1.0 - smoothstep(0.38, 0.86, distToCenter) * (0.6 + uParanoia * 0.15);
                color.rgb *= vignette;
                gl_FragColor = color;
                
                #else
                
                // High-End cinematic post-pipeline: Lens Distortion, Chromatic Aberration, Vector Blur, Grain, Color Grading
                vec2 center = vec2(0.5);
                vec2 toCenter = uv - center;
                float distToCenter = length(toCenter);
                
                // Radial distortion factor (pincushion effect)
                float k = 0.008 + distortionIntensity * 0.012 + uParanoia * 0.006;
                vec2 distortedUv = uv + toCenter * k * (distToCenter * distToCenter);
                
                // Clamp boundary check
                if (distortedUv.x < 0.0 || distortedUv.x > 1.0 || distortedUv.y < 0.0 || distortedUv.y > 1.0) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }
                
                // Chromatic Aberration (radial R/B offset along distorted coordinate)
                float caScale = 0.0004 + distortionIntensity * 0.001 + uParanoia * 0.0005;
                float rSplit = distortedUv.x + caScale * distToCenter;
                float bSplit = distortedUv.x - caScale * distToCenter;
                
                vec4 finalColorSource = vec4(1.0);
                
                // Rotational movement vector-blur
                if (length(uMotionBlur) > 0.0005) {
                    vec2 blurVector = clamp(uMotionBlur * 0.15, vec2(-0.025), vec2(0.025));
                    vec4 sum = vec4(0.0);
                    sum += texture2D(tDiffuse, vec2(rSplit, distortedUv.y) - blurVector * 2.0) * 0.06;
                    sum += texture2D(tDiffuse, vec2(distortedUv.x, distortedUv.y) - blurVector) * 0.16;
                    sum += texture2D(tDiffuse, distortedUv) * 0.56;
                    sum += texture2D(tDiffuse, vec2(distortedUv.x, distortedUv.y) + blurVector) * 0.16;
                    sum += texture2D(tDiffuse, vec2(bSplit, distortedUv.y) + blurVector * 2.0) * 0.06;
                    finalColorSource = sum;
                } else {
                    finalColorSource.r = texture2D(tDiffuse, vec2(rSplit, distortedUv.y)).r;
                    finalColorSource.g = texture2D(tDiffuse, distortedUv).g;
                    finalColorSource.b = texture2D(tDiffuse, vec2(bSplit, distortedUv.y)).b;
                    finalColorSource.a = texture2D(tDiffuse, distortedUv).a;
                }
                
                // Filmic Color Grading (cold desaturated shadows, slightly raw high contrast)
                float luminance = dot(finalColorSource.rgb, vec3(0.299, 0.587, 0.114));
                vec3 bleakColor = mix(finalColorSource.rgb, vec3(luminance), 0.38); // desaturate slightly
                
                // Cold shadow tinting and warm highlight grading mapping
                vec3 shadowGrading = vec3(0.85, 0.94, 1.0) * 0.95; // steel slate tint
                vec3 highlightGrading = vec3(1.05, 1.0, 0.92); // decaying yellowish bulb glow
                vec3 graded = mix(bleakColor * shadowGrading, bleakColor * highlightGrading, luminance);
                
                // Emphasize red splatters/blood/organic matter during grading
                if (finalColorSource.r > finalColorSource.g * 1.4 && finalColorSource.r > finalColorSource.b * 1.4) {
                    graded.r = mix(graded.r, finalColorSource.r * 1.35, 0.45);
                    graded.g *= 0.85;
                    graded.b *= 0.85;
                }
                
                finalColorSource.rgb = graded;
                
                // Real-time Film Grain/Atmospheric static
                float grainFreq = 0.038 + uParanoia * 0.045;
                float noiseVal = (hash(distortedUv * (time + 1.0)) - 0.5) * grainFreq;
                finalColorSource.rgb += vec3(noiseVal);
                
                // Cloistered vignette for absolute claustrophobia
                float vignetteDarkness = smoothstep(0.35, 0.88, distToCenter) * (0.7 + uParanoia * 0.22);
                finalColorSource.rgb *= (1.0 - vignetteDarkness);
                
                gl_FragColor = finalColorSource;
                
                #endif
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
    const ambientLight = new THREE.AmbientLight(0x06080a, 0.15); // sick atmospheric fluorescent hallway ambient glow
    scene.add(ambientLight);
    
    // Add a dim hemisphere light for better shading
    const hemiLight = new THREE.HemisphereLight(0x0e1115, 0x010203, 0.25);
    scene.add(hemiLight);

    const flashLight = new THREE.SpotLight(0xfff8e7, 100); // physically correct spotlight intensity
    flashLight.position.set(0, 0, 0);
    flashLight.target.position.set(0, 0, -1);
    flashLight.angle = Math.PI / 4.2;
    flashLight.penumbra = 0.95;
    flashLight.decay = 2; // more realistic distance decay
    flashLight.distance = 40;
    flashLight.castShadow = true;
    flashLight.shadow.mapSize.width = isDeviceMobile ? 512 : 1024;
    flashLight.shadow.mapSize.height = isDeviceMobile ? 512 : 1024;
    flashLight.shadow.bias = -0.001;

    camera.add(flashLight);
    camera.add(flashLight.target);
    scene.add(camera);

    // Dynamic simulated environment tracking
    let environmentTimeOfDay = 0.0;
    let ambientTemperature = 10.0;
    let humidityLevel = 0.8;

    // Swaying ceiling elements
    const swayingVines: THREE.Group[] = [];

    // Footstep audio timers
    let playerFootstepTimer = 0.0;
    let stalkerFootstepTimer = 0.0;

    let flickerTimer = 0;
    
    // --- Maze Generation ---
    const mazeSize = 25;
    
    // --- Procedural Textures ---
    const createNoiseTexture = (baseColor: string, noiseColor: string, tileSize: number = 10, isCheckerboard: boolean = false) => {
        const resolution = isDeviceMobile ? 128 : 256;
        const canvas = document.createElement('canvas');
        canvas.width = resolution;
        canvas.height = resolution;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = baseColor;
            ctx.fillRect(0, 0, resolution, resolution);

            if (isCheckerboard) {
                ctx.fillStyle = noiseColor;
                for (let i = 0; i < resolution; i += tileSize) {
                    for (let j = 0; j < resolution; j += tileSize) {
                        if (((i / tileSize) % 2 === (j / tileSize) % 2)) {
                            ctx.fillRect(i, j, tileSize, tileSize);
                        }
                    }
                }
            }

            // Add noise and grunge
            const noisePoints = resolution === 128 ? 10000 : 25000;
            for (let i = 0; i < noisePoints; i++) {
                ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)';
                ctx.fillRect(Math.random() * resolution, Math.random() * resolution, Math.random() * 3, Math.random() * 3);
            }

            // Subdued vertical and horizontal streaks
            for (let i = 0; i < 15; i++) {
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.fillRect(Math.random() * resolution, 0, Math.random() * 4, resolution);
                ctx.fillRect(0, Math.random() * resolution, resolution, Math.random() * 4);
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

    const ceilingTex = createNoiseTexture('#1a1a1a', '#0a0a0a', isDeviceMobile ? 16 : 32, false);

    const createAdvancedWallTextures = () => {
        const resolution = isDeviceMobile ? 128 : 256;
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
        const grungePoints = resolution === 128 ? 10000 : 25000;
        for (let i = 0; i < grungePoints; i++) {
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

    const advancedWall = generateCrumblingConcreteTexture(isDeviceMobile ? 512 : 1024);
    const wallTex = advancedWall.diffuseTex;
    const wallRoughTex = advancedWall.roughTex;
    const wallNormalTex = advancedWall.normalTex;

    // Apply repeat scaling to prevent stretching on horizontal wall segments
    wallTex.repeat.set(2.0, 1.0);
    wallRoughTex.repeat.set(2.0, 1.0);
    wallNormalTex.repeat.set(2.0, 1.0);

    const createGrungeTexture = () => {
        const resolution = isDeviceMobile ? 64 : 128;
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
        const resolution = isDeviceMobile ? 512 : 1024;
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

    const advancedFloor = createAdvancedFloorTextures(isDeviceMobile ? 64 : 128);
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
    maze[1][2] = 0; // Carve open runway corridor in front of player spawn
    maze[1][3] = 0; // Extend starting runway corridor for a beautiful distant perspective

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

                // Add physical Baseboards and Ceiling Coving moldings to break flat vertical-to-horizontal seams
                const baseboardMat = new THREE.MeshStandardMaterial({ color: 0x151514, roughness: 0.85, metalness: 0.1 });
                const covingMat = new THREE.MeshStandardMaterial({ color: 0x121211, roughness: 0.9, metalness: 0.05 });
                
                // West Wall Face
                if (x > 0 && maze[x-1][y] === 0) {
                    const bGeo = new THREE.BoxGeometry(0.06, 0.14, unit);
                    const bMesh = new THREE.Mesh(bGeo, baseboardMat);
                    bMesh.position.set(x * unit - unit/2 + 0.03, 0.07, y * unit);
                    bMesh.receiveShadow = true;
                    scene.add(bMesh);
                    
                    const cGeo = new THREE.BoxGeometry(0.08, 0.08, unit);
                    const cMesh = new THREE.Mesh(cGeo, covingMat);
                    cMesh.position.set(x * unit - unit/2 + 0.04, 2.46, y * unit);
                    cMesh.receiveShadow = true;
                    scene.add(cMesh);
                }
                // East Wall Face
                if (x < mazeSize - 1 && maze[x+1][y] === 0) {
                    const bGeo = new THREE.BoxGeometry(0.06, 0.14, unit);
                    const bMesh = new THREE.Mesh(bGeo, baseboardMat);
                    bMesh.position.set(x * unit + unit/2 - 0.03, 0.07, y * unit);
                    bMesh.receiveShadow = true;
                    scene.add(bMesh);

                    const cGeo = new THREE.BoxGeometry(0.08, 0.08, unit);
                    const cMesh = new THREE.Mesh(cGeo, covingMat);
                    cMesh.position.set(x * unit + unit/2 - 0.04, 2.46, y * unit);
                    cMesh.receiveShadow = true;
                    scene.add(cMesh);
                }
                // North Wall Face
                if (y > 0 && maze[x][y-1] === 0) {
                    const bGeo = new THREE.BoxGeometry(unit, 0.14, 0.06);
                    const bMesh = new THREE.Mesh(bGeo, baseboardMat);
                    bMesh.position.set(x * unit, 0.07, y * unit - unit/2 + 0.03);
                    bMesh.receiveShadow = true;
                    scene.add(bMesh);

                    const cGeo = new THREE.BoxGeometry(unit, 0.08, 0.08);
                    const cMesh = new THREE.Mesh(cGeo, covingMat);
                    cMesh.position.set(x * unit, 2.46, y * unit - unit/2 + 0.04);
                    cMesh.receiveShadow = true;
                    scene.add(cMesh);
                }
                // South Wall Face
                if (y < mazeSize - 1 && maze[x][y+1] === 0) {
                    const bGeo = new THREE.BoxGeometry(unit, 0.14, 0.06);
                    const bMesh = new THREE.Mesh(bGeo, baseboardMat);
                    bMesh.position.set(x * unit, 0.07, y * unit + unit/2 - 0.03);
                    bMesh.receiveShadow = true;
                    scene.add(bMesh);

                    const cGeo = new THREE.BoxGeometry(unit, 0.08, 0.08);
                    const cMesh = new THREE.Mesh(cGeo, covingMat);
                    cMesh.position.set(x * unit, 2.46, y * unit + unit/2 - 0.04);
                    cMesh.receiveShadow = true;
                    scene.add(cMesh);
                }
                
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
                
                // Construct the wall's collision box mathematically based on its grid position
                const halfUnit = unit / 2;
                const minX = x * unit - halfUnit;
                const maxX = x * unit + halfUnit;
                const minZ = y * unit - halfUnit;
                const maxZ = y * unit + halfUnit;
                const box = new THREE.Box3(
                    new THREE.Vector3(minX, 0.0, minZ),
                    new THREE.Vector3(maxX, 2.5, maxZ)
                );
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

                // Spawn swaying electrical cables from the ceiling of the maze hallways
                if (Math.random() < 0.16) {
                    const vineGroup = new THREE.Group();
                    vineGroup.position.set(
                        x * unit + (Math.random() - 0.5) * 1.5,
                        2.48,
                        y * unit + (Math.random() - 0.5) * 1.5
                    );
                    
                    const segmentGeo = new THREE.CylinderGeometry(0.012, 0.008, 0.45, 4);
                    segmentGeo.translate(0, -0.225, 0); // pivot at top of segment
                    const segmentMat = new THREE.MeshStandardMaterial({ 
                        color: 0x111612, 
                        roughness: 0.95, 
                        metalness: 0.1 
                    });
                    
                    const seg1 = new THREE.Mesh(segmentGeo, segmentMat);
                    const seg2 = new THREE.Mesh(segmentGeo, segmentMat);
                    const seg3 = new THREE.Mesh(segmentGeo, segmentMat);
                    
                    seg2.position.y = -0.45;
                    seg3.position.y = -0.45;
                    
                    seg1.add(seg2);
                    seg2.add(seg3);
                    vineGroup.add(seg1);
                    scene.add(vineGroup);
                    
                    swayingVines.push(vineGroup);
                }

                if (Math.random() > 0.05 && Math.random() < 0.12 && (x !== 1 && y !== 1)) {
                    // Frost Glass Panes (barriers)
                    const glass = new THREE.Mesh(glassGeo, glassMat);
                    glass.position.set(x * unit, 1.25, y * unit);
                    const isRotated = Math.random() > 0.5;
                    if (isRotated) glass.rotation.y = Math.PI / 2;
                    scene.add(glass);
                    // Add it to collision mathematically
                    const halfX = isRotated ? 0.05 : unit / 2;
                    const halfZ = isRotated ? unit / 2 : 0.05;
                    const box = new THREE.Box3(
                        new THREE.Vector3(x * unit - halfX, 0.0, y * unit - halfZ),
                        new THREE.Vector3(x * unit + halfX, 2.5, y * unit + halfZ)
                    );
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
                } else if (Math.random() > 0.97 && (x !== 1 || y !== 1)) {
                    // Spawn a high-contrast heavy duty Lithium battery pack
                    const batteryGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.25, 12);
                    const batteryMat = new THREE.MeshStandardMaterial({ 
                        color: 0x3b82f6, // Sleek cyber blue casing
                        roughness: 0.3,
                        metalness: 0.8,
                        emissive: 0x011e4d // subtle dark blue glow so it stands out in the shadows
                    });
                    
                    const batteryMesh = new THREE.Mesh(batteryGeo, batteryMat);
                    // Add yellow battery contacts
                    const capGeo = new THREE.CylinderGeometry(0.081, 0.081, 0.03, 12);
                    const capMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.2, metalness: 0.9 });
                    const capTop = new THREE.Mesh(capGeo, capMat);
                    capTop.position.set(0, 0.125 + 0.015, 0);
                    batteryMesh.add(capTop);
                    
                    const capBot = new THREE.Mesh(capGeo, capMat);
                    capBot.position.set(0, -0.125 - 0.015, 0);
                    batteryMesh.add(capBot);
                    
                    batteryMesh.position.set(
                        x * unit + (Math.random() - 0.5) * unit * 0.4, 
                        0.15, 
                        y * unit + (Math.random() - 0.5) * unit * 0.4
                    );
                    batteryMesh.rotation.set(Math.PI / 2, Math.random() * Math.PI, 0);
                    batteryMesh.castShadow = true;
                    
                    const batId = `bat_${x}_${y}`;
                    batteryMesh.userData = {
                        type: 'battery',
                        id: batId,
                        name: "Heavy-Duty Lithium Core",
                        message: "A high-capacity cell. Ideal for revitalizing depleted optics."
                    } as InteractableItem;
                    
                    scene.add(batteryMesh);
                    interactablesRef.current.push(batteryMesh);
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
                            const beaconMat = new THREE.MeshStandardMaterial({ 
                                color: 0x011a0b, 
                                emissive: 0x22ffaa, 
                                emissiveIntensity: 2.8,
                                roughness: 0.1,
                                metalness: 0.95
                            });
                            const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
                            beaconMesh.position.y = 0.6;
                            shrineGroup.add(beaconMesh);
                            
                            // Soothing light - increased radius for smoother falloff
                            const safeLight = new THREE.PointLight(0x22ffaa, 200, 18, 2);
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
                            // Leaking Pipe (highly detailed cylinder with flange connectors and rusted red hand valve wheel)
                            const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 3, 24);
                            const pipeMat = new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.6, metalness: 0.8 });
                            const pipeMesh = new THREE.Mesh(pipeGeo, pipeMat);
                            
                            // High-detail bolt-on flange rings
                            const flangeMat = new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.7, metalness: 0.95 });
                            for (let f = -1.2; f <= 1.2; f += 1.2) {
                                const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 24), flangeMat);
                                flange.position.y = f;
                                pipeMesh.add(flange);
                            }

                            // Horizontal valve stem and oxidized rusted turn-wheel
                            const valveMat = new THREE.MeshStandardMaterial({ color: 0xa4361e, roughness: 0.82, metalness: 0.45 });
                            const valveStem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.15, 8), flangeMat);
                            valveStem.position.set(0, 0, 0.12);
                            valveStem.rotation.x = Math.PI / 2;
                            pipeMesh.add(valveStem);

                            const valveWheel = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.016, 8, 24), valveMat);
                            valveWheel.position.set(0, 0, 0.192);
                            valveWheel.rotation.x = Math.PI / 2;
                            pipeMesh.add(valveWheel);
                            
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
                            // Rotary Phone (Upgraded with numerical mechanical plate, cradle metal levers, and double-ended handset Receiver)
                            const phoneMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.65, metalness: 0.35 });
                            const phoneMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.12), phoneMat);
                            
                            // Retro circular dialing plate
                            const dialMat = new THREE.MeshStandardMaterial({ color: 0xdbd9cb, roughness: 0.3, metalness: 0.6 });
                            const dialMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20), dialMat);
                            dialMesh.rotation.x = Math.PI / 2;
                            dialMesh.position.set(0, -0.02, 0.062);
                            phoneMesh.add(dialMesh);

                            // Metal cradle lever forks
                            const metalMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.32, metalness: 0.88 });
                            const cradleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.02), metalMat);
                            cradleMesh.position.set(0, 0.13, 0);
                            phoneMesh.add(cradleMesh);

                            // Curved horizontal Handset receiver assembly
                            const handleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 12), phoneMat);
                            handleMesh.rotation.z = Math.PI / 2;
                            handleMesh.position.set(0, 0.155, 0);
                            phoneMesh.add(handleMesh);

                            const leftCup = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.04, 16), phoneMat);
                            leftCup.rotation.z = Math.PI / 2;
                            leftCup.position.set(-0.11, 0.155, 0);
                            phoneMesh.add(leftCup);

                            const rightCup = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.04, 16), phoneMat);
                            rightCup.rotation.z = Math.PI / 2;
                            rightCup.position.set(0.11, 0.155, 0);
                            phoneMesh.add(rightCup);
                            
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
                            // Filing Cabinet (Refined with 3 segmented drawer panels and metal drawer handle pullbars)
                            const cabinetMat = new THREE.MeshStandardMaterial({ 
                                color: 0x3d473d, 
                                roughness: 0.75, 
                                metalness: 0.45 
                            });
                            const cabinetMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), cabinetMat);
                            
                            // Beveled overlay drawers & steel pull bars
                            const drawerPanelMat = new THREE.MeshStandardMaterial({ color: 0x334033, roughness: 0.8, metalness: 0.35 });
                            const gripBarMat = new THREE.MeshStandardMaterial({ color: 0x909090, roughness: 0.25, metalness: 0.95 });
                            
                            for (let d = 0; d < 3; d++) {
                                const dy = 0.35 - d * 0.35;
                                const panel = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.3, 0.02), drawerPanelMat);
                                panel.position.set(0, dy, 0.301);
                                cabinetMesh.add(panel);

                                const grip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.035), gripBarMat);
                                grip.position.set(0, dy, 0.315);
                                cabinetMesh.add(grip);
                            }
                            
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
                    // Add occasional atmospheric emergency industrial ceiling cage lights
                    const pointLight = new THREE.PointLight(0xe5331a, 130, 16, 2); // rich bloody emergency red
                    pointLight.position.set(x * unit, 3.1, y * unit);
                    scene.add(pointLight);

                    const lightGroup = new THREE.Group();
                    lightGroup.position.set(x * unit, 3.4, y * unit);
                    
                    // Ceiling bracket base
                    const bracketGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 8);
                    const bracketMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.85, roughness: 0.65 });
                    const bracket = new THREE.Mesh(bracketGeo, bracketMat);
                    bracket.position.y = -0.04;
                    lightGroup.add(bracket);
                    
                    // Emissive glass bulb
                    const bulbGeo = new THREE.SphereGeometry(0.12, 12, 12);
                    const bulbMat = new THREE.MeshStandardMaterial({ 
                        color: 0x3d0000, 
                        emissive: 0xff4422, 
                        emissiveIntensity: 4.5,
                        roughness: 0.05,
                        metalness: 0.95
                    });
                    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
                    bulb.position.y = -0.16;
                    lightGroup.add(bulb);
                    
                    // Protective cage shroud
                    const cageGeo = new THREE.CylinderGeometry(0.16, 0.14, 0.26, 6, 1, true);
                    const cageMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.95, roughness: 0.45, wireframe: true });
                    const cage = new THREE.Mesh(cageGeo, cageMat);
                    cage.position.y = -0.18;
                    lightGroup.add(cage);
                    
                    scene.add(lightGroup);
                    emergencyLights.push({ light: pointLight, baseIntensity: 130, flickerOffset: Math.random() * 100 });
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
        const organicMat = new THREE.MeshStandardMaterial({ 
            color: 0x330000, 
            emissive: 0xaa0601, 
            emissiveIntensity: 0.85, 
            roughness: 0.15, 
            metalness: 0.5 
        });
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

    let steamParticles: THREE.Points | null = null;
    let steamCount = 0;

    if (leakPositions.length > 0) {
        // 1. Water Drop Instantiator
        waterCount = leakPositions.length * 20; // 20 drops per leak
        const waterGeo = new THREE.BufferGeometry();
        const waterPos = new Float32Array(waterCount * 3);
        const waterPhases = new Float32Array(waterCount);
        for (let i = 0; i < leakPositions.length; i++) {
            for (let j = 0; j < 20; j++) {
                 const idx = (i * 20 + j);
                 waterPos[idx*3] = leakPositions[i].x;
                 waterPos[idx*3+1] = 0; // Starts floor/ceiling according to age
                 waterPos[idx*3+2] = leakPositions[i].z;
                 waterPhases[idx] = Math.random(); // staggered offsets
            }
        }
        waterGeo.setAttribute('position', new THREE.BufferAttribute(waterPos, 3));
        waterGeo.setAttribute('phase', new THREE.BufferAttribute(waterPhases, 1));
        const waterMat = new THREE.PointsMaterial({
            color: 0x99ccd9,
            size: 0.055,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        waterParticles = new THREE.Points(waterGeo, waterMat);
        scene.add(waterParticles);

        // 2. Steam Vapor Instantiator (translucent ambient thermal smoke rising from pipe leaks)
        steamCount = leakPositions.length * 30; // 30 steam clouds per pipe vent
        const steamGeo = new THREE.BufferGeometry();
        const steamPos = new Float32Array(steamCount * 3);
        const steamPhases = new Float32Array(steamCount);
        for (let i = 0; i < leakPositions.length; i++) {
            for (let j = 0; j < 30; j++) {
                const idx = (i * 30 + j);
                steamPos[idx*3] = leakPositions[i].x;
                steamPos[idx*3+1] = 1.5; // pipe chest-height level
                steamPos[idx*3+2] = leakPositions[i].z;
                steamPhases[idx] = Math.random();
            }
        }
        steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3));
        steamGeo.setAttribute('phase', new THREE.BufferAttribute(steamPhases, 1));
        
        const steamMat = new THREE.PointsMaterial({
            color: 0xa0b2bc,
            size: 0.45,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        steamParticles = new THREE.Points(steamGeo, steamMat);
        scene.add(steamParticles);
    }

    // --- The Stalker (Entity) ---
    const stalkerData = createUpgradedStalker(stalkerTex);
    const stalker = stalkerData.mesh;
    // Start stalker far away in the maze
    stalker.position.set((mazeSize - 2) * unit, 1.5, (mazeSize - 2) * unit);
    stalker.castShadow = true;
    scene.add(stalker);
    
    // Light from stalker
    const stalkerLight = new THREE.PointLight(0xff0000, 0, 15, 2); // hidden until close (will be up to 150 intensity)
    stalkerLight.position.set(0, 1.5, 0.2);
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
        audioCtxRef.current = audioCtx;
        setAudioCtxState(audioCtx);
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
    const moveState = moveStateRef.current;
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    
    // Rotation vector for calculating camera motion blur velocities
    const prevRotation = new THREE.Vector2();

    // Performance frame-time tracking metrics
    const lastFrameTimeRef = { current: performance.now() };
    const smoothFrameTimeRef = { current: 16.6 };
    const resolutionCheckTimerRef = { current: 1.0 };

    const playFlashlightClick = () => {
        if (!audioCtx) return;
        try {
            const ctx = audioCtx;
            const now = ctx.currentTime;
            
            // High frequency direct click
            const osc1 = ctx.createOscillator();
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(800, now);
            osc1.frequency.exponentialRampToValueAtTime(100, now + 0.05);
            
            const gain1 = ctx.createGain();
            gain1.gain.setValueAtTime(0.15, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.06);

            // Low frequency metallic thud
            const osc2 = ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(120, now);
            osc2.frequency.setValueAtTime(150, now + 0.02);
            
            const gain2 = ctx.createGain();
            gain2.gain.setValueAtTime(0.1, now);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now);
            osc2.stop(now + 0.12);
        } catch (e) {
            console.error(e);
        }
    };

    const toggleFlashlight = () => {
        if (batteryRef.current <= 0) {
            playFlashlightClick();
            return;
        }
        flashlightOnRef.current = !flashlightOnRef.current;
        setFlashlightOn(flashlightOnRef.current);
        playFlashlightClick();
    };
    (window as any).toggleFlashlight = toggleFlashlight;

    const showCombatFeed = (msg: string) => {
        combatFeedRef.current = msg;
        combatFeedTimeRef.current = Date.now() + 2000;
        setCombatFeed(msg);
    };

    const triggerAttack = () => {
        if (!isStarted || gameOver || readingNote || scare) return;
        const now = Date.now();
        if (now < attackCooldownRef.current) return;
        attackCooldownRef.current = now + 800; // 0.8s cooldown
        setAttackCooldown(800);

        // Sound effect
        if (audioCtx) {
            try {
                const ctx = audioCtx;
                const osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.15);
                const rawGain = ctx.createGain();
                rawGain.gain.setValueAtTime(0.2, ctx.currentTime);
                rawGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                osc.connect(rawGain);
                rawGain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.15);
            } catch (e) {}
        }

        // Trigger screen slash animation state
        setSlashAnimActive(true);
        setTimeout(() => setSlashAnimActive(false), 260);

        // Check if stalker is in range and in front of the camera
        const distToStalker = camera.position.distanceTo(stalker.position);
        if (distToStalker < 4.0) {
            const dirToStalker = stalker.position.clone().sub(camera.position).normalize();
            const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            lookDir.y = 0;
            lookDir.normalize();
            dirToStalker.y = 0;
            dirToStalker.normalize();
            
            const dot = lookDir.dot(dirToStalker);
            if (dot > 0.4) { // within ~66 degrees of front look
                stalkerStunnedUntilRef.current = now + 1800; // 1.8s heavy stun
                showCombatFeed("⚡ STALKER STUNG: HEAVY COUNTER-BLOW [1.8s STUN]");
                
                // Attack spark hit sound
                if (audioCtx) {
                    try {
                        const ctx = audioCtx;
                        const osc = ctx.createOscillator();
                        osc.type = 'triangle';
                        osc.frequency.setValueAtTime(100, ctx.currentTime);
                        osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.1);
                        const rawGain = ctx.createGain();
                        rawGain.gain.setValueAtTime(0.35, ctx.currentTime);
                        rawGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
                        osc.connect(rawGain);
                        rawGain.connect(ctx.destination);
                        osc.start();
                        osc.stop(ctx.currentTime + 0.25);
                     } catch (e) {}
                 }
             } else {
                 showCombatFeed("⚔ SWIPED WILDLY (STALKER OUT OF LINE OF SIGHT)");
             }
         } else {
             showCombatFeed("⚔ SWIPED AT THE EMPTY SHADOWS");
         }
     };

     const triggerParry = () => {
         if (!isStarted || gameOver || readingNote || scare) return;
         const now = Date.now();
         if (now < parryCooldownRef.current) return;
         
         // Active parry shield window for next 500ms
         parryWindowRef.current = now + 500;
         parryCooldownRef.current = now + 1800; // 1.8s cooldown
         setParryCooldown(1800);

         // Lift sound
         if (audioCtx) {
             try {
                 const ctx = audioCtx;
                 const osc = ctx.createOscillator();
                 osc.type = 'sine';
                 osc.frequency.setValueAtTime(250, ctx.currentTime);
                 osc.frequency.linearRampToValueAtTime(550, ctx.currentTime + 0.15);
                 const rawGain = ctx.createGain();
                 rawGain.gain.setValueAtTime(0.18, ctx.currentTime);
                 rawGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                 osc.connect(rawGain);
                 rawGain.connect(ctx.destination);
                 osc.start();
                 osc.stop(ctx.currentTime + 0.15);
             } catch (e) {}
         }

         showCombatFeed("🛡 PARRY SYSTEM ENGAGED: BROADCASTING SHIELD");

         // Trigger blue shield ripple effect
         setParryFlashActive(true);
         setTimeout(() => setParryFlashActive(false), 220);
     };

     const triggerDodge = () => {
         if (!isStarted || gameOver || readingNote || scare) return;
         const now = Date.now();
         if (now < dodgeCooldownRef.current) return;
         if (staminaRef.current < 25.0) {
             showCombatFeed("⚠ INSUFFICIENT ENERGY TO DODGE");
             return;
         }

         staminaRef.current = Math.max(0.0, staminaRef.current - 25.0);
         setStamina(Math.floor(staminaRef.current));

         dodgeCooldownRef.current = now + 1200; // 1.2s cooldown
         setDodgeCooldown(1200);

         // Compute slide look vector in camera flat direction
         const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
         lookDir.y = 0;
         lookDir.normalize();

         const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
         rightDir.y = 0;
         rightDir.normalize();

         // Check input direction from move state holds to dash in that direction
         const moveState = moveStateRef.current;
         let dx = Number(moveState.right) - Number(moveState.left);
         let dz = Number(moveState.forward) - Number(moveState.backward);

         let finalDodgeDir = new THREE.Vector3();
         if (dx !== 0 || dz !== 0) {
             // Combine movement vectors
             finalDodgeDir.addScaledVector(lookDir, dz).addScaledVector(rightDir, dx).normalize();
         } else {
             // Default dodge is rapid retreat backward
             finalDodgeDir.copy(lookDir).multiplyScalar(-1.0);
         }

         dodgeTimeRef.current = 0.25; // 0.25s dash duration
         dodgeDirRef.current.copy(finalDodgeDir);

         // Whoosh sound
         if (audioCtx) {
             try {
                 const ctx = audioCtx;
                 const osc = ctx.createOscillator();
                 osc.type = 'triangle';
                 osc.frequency.setValueAtTime(1000, ctx.currentTime);
                 osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.25);
                 const rawGain = ctx.createGain();
                 rawGain.gain.setValueAtTime(0.2, ctx.currentTime);
                 rawGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
                 osc.connect(rawGain);
                 rawGain.connect(ctx.destination);
                 osc.start();
                 osc.stop(ctx.currentTime + 0.25);
             } catch (e) {}
         }

         showCombatFeed("⚡ EVASIVE DODGE OVERDRIVE ACTIVATED");
     };

    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyC':
        case 'ControlLeft':
            if (isStarted && !readingNote && !scare) {
                isCrouchingRef.current = !isCrouchingRef.current;
                setIsCrouching(isCrouchingRef.current);
            }
            break;
        case 'Space':
            moveState.space = true;
            break;
        case 'KeyQ':
            if (isStarted && !readingNote && !scare) {
                triggerDodge();
            }
            break;
        case 'KeyR':
        case 'KeyV':
            if (isStarted && !readingNote && !scare) {
                triggerParry();
            }
            break;
        case 'KeyF':
            if (isStarted && !readingNote && !scare) {
                toggleFlashlight();
            }
            break;
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
              
              if (item.type === 'battery') {
                  batteryRef.current = 100.0;
                  setBattery(100.0);
                  flashlightOnRef.current = true;
                  setFlashlightOn(true);
                  if (audioCtx) {
                      const ctx = audioCtx;
                      const osc = ctx.createOscillator();
                      osc.type = 'sine';
                      osc.frequency.setValueAtTime(300, ctx.currentTime);
                      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3);
                      const gainNode = ctx.createGain();
                      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
                      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                      osc.connect(gainNode);
                      gainNode.connect(ctx.destination);
                      osc.start();
                      osc.stop(ctx.currentTime + 0.3);
                  }
                  setSaveMessage("REPLACEMENT BATTERY SECURED [100%]");
                  setTimeout(() => setSaveMessage(null), 3000);
                  const batteryMesh = interactablesRef.current.find(m => m.userData.id === item.id);
                  if (batteryMesh) {
                       scene.remove(batteryMesh);
                       interactablesRef.current = interactablesRef.current.filter(m => m.userData.id !== item.id);
                  }
                  setHoveredNote(null);
                  hoveredNoteRef.current = null;
                  return;
              }

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
                      flashLight.intensity = Math.random() > 0.5 ? 5 : 20;
                      
                      // Lure stalker to sound
                      const mesh = interactablesRef.current.find(m => m.userData.id === item.id);
                      if (mesh) {
                           envStatesRef.current.globalLure = { x: mesh.position.x, z: mesh.position.z, time: Date.now() + 8000 };
                      }
                  } else if (st === 'off') {
                      envStatesRef.current[item.id].state = 'shorted';
                      flashLight.intensity = 350; // blinding flash (toned down)
                      envStatesRef.current[item.id].stunUntil = Date.now() + 3000; // stuns stalker
                      setTimeout(() => { flashLight.intensity = 0; }, 200);
                  } else {
                      envStatesRef.current[item.id].state = 'on';
                      flashLight.intensity = 100;
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
        case 'Space': moveState.space = false; break;
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

    const mouseLookState = {
        isDragging: false,
        lastX: 0,
        lastY: 0,
        deltaX: 0,
        deltaY: 0
    };

    const onMouseDown = (event: MouseEvent) => {
        if (!isStarted || gameOver || readingNote) return;
        
        const target = event.target as HTMLElement;
        if (target && (target.tagName === 'BUTTON' || target.closest('button') || target.tagName === 'INPUT')) {
            return;
        }

        if (controls && controls.isLocked) {
            if (event.button === 0) {
                triggerAttack();
            } else if (event.button === 2) {
                triggerParry();
            }
        } else if (controls && !controls.isLocked) {
           if (event.clientX < window.innerWidth / 3) {
               touchLeftRef.current = {
                   active: true,
                   id: 999,
                   start: new THREE.Vector2(event.clientX, event.clientY),
                   current: new THREE.Vector2(event.clientX, event.clientY)
               };
           } else {
               mouseLookState.isDragging = true;
               mouseLookState.lastX = event.clientX;
               mouseLookState.lastY = event.clientY;
           }
        }
    };

    const onMouseMove = (event: MouseEvent) => {
        if (!isStarted || gameOver || readingNote) return;
        
        if (touchLeftRef.current.active && touchLeftRef.current.id === 999) {
            touchLeftRef.current.current.set(event.clientX, event.clientY);
        } else if (mouseLookState.isDragging && controls && !controls.isLocked) {
            const dx = event.clientX - mouseLookState.lastX;
            const dy = event.clientY - mouseLookState.lastY;
            mouseLookState.deltaX += dx;
            mouseLookState.deltaY += dy;
            mouseLookState.lastX = event.clientX;
            mouseLookState.lastY = event.clientY;
        }
    };

    const onMouseUp = () => {
        if (touchLeftRef.current.active && touchLeftRef.current.id === 999) {
            touchLeftRef.current.active = false;
        }
        mouseLookState.isDragging = false;
    };

    const onContextMenu = (event: MouseEvent) => {
        if (controls && controls.isLocked) {
            event.preventDefault();
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('contextmenu', onContextMenu);
    
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
    const dustVelocities = new Float32Array(dustCount * 3);
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

    // --- Floor Embers Particle System (glowing biological floor spores and thermal cinders) ---
    const emberCount = 350;
    const emberGeo = new THREE.BufferGeometry();
    const emberPos = new Float32Array(emberCount * 3);
    const emberPhases = new Float32Array(emberCount);
    const emberCenters = new Float32Array(emberCount * 3);
    
    for (let i = 0; i < emberCount; i++) {
        const ex = Math.random() * mazeSize * unit;
        const ez = Math.random() * mazeSize * unit;
        emberCenters[i * 3] = ex;
        emberCenters[i * 3 + 1] = 0.05;
        emberCenters[i * 3 + 2] = ez;
        
        emberPos[i * 3] = ex;
        emberPos[i * 3 + 1] = 0.05 + Math.random() * 0.4;
        emberPos[i * 3 + 2] = ez;
        
        emberPhases[i] = Math.random() * Math.PI * 2;
    }
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    emberGeo.setAttribute('phase', new THREE.BufferAttribute(emberPhases, 1));
    emberGeo.setAttribute('center', new THREE.BufferAttribute(emberCenters, 3));

    const emberMat = new THREE.PointsMaterial({
        color: 0xff4f15, // hot bioluminescent ember glow
        size: 0.12,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const emberParticles = new THREE.Points(emberGeo, emberMat);
    scene.add(emberParticles);

    // --- Precision Asset Pre-Warming ---
    // Compile shaders and pipelines before the first frame runs so jump scares don't stutter 
    renderer.compile(scene, camera);

    // --- Procedural Footstep and Ambiance Generators ---
    const triggerUnderfootRustle = (pos: THREE.Vector3, isPlayer: boolean, relativeVolume: number = 1.0) => {
        if (!audioCtx) return;
        
        const bufferSize = audioCtx.sampleRate * 0.16; // 160ms organic decay crunch
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            const noise = Math.random() * 2.0 - 1.0;
            const fade = Math.pow(1.0 - (i / bufferSize), 2.0); // exponential fade
            const snap = Math.random() > 0.95 ? (Math.random() * 0.6) : 0.04;
            data[i] = noise * fade * (snap * 0.28 * relativeVolume);
        }
        
        const noiseNode = audioCtx.createBufferSource();
        noiseNode.buffer = buffer;
        
        const filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'bandpass';
        filterNode.frequency.value = isPlayer ? (1000 + Math.random() * 500) : (650 + Math.random() * 300);
        filterNode.Q.value = 1.8;
        
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = isPlayer ? 0.07 : 0.03;
        
        noiseNode.connect(filterNode);
        filterNode.connect(gainNode);
        
        if (isPlayer) {
            gainNode.connect(masterGain || audioCtx.destination);
        } else {
            const rustlePanner = audioCtx.createPanner();
            rustlePanner.panningModel = 'HRTF';
            rustlePanner.distanceModel = 'inverse';
            rustlePanner.refDistance = 1;
            rustlePanner.maxDistance = 15;
            rustlePanner.positionX.value = pos.x;
            rustlePanner.positionY.value = pos.y;
            rustlePanner.positionZ.value = pos.z;
            
            gainNode.connect(rustlePanner);
            if (masterGain) rustlePanner.connect(masterGain);
            else rustlePanner.connect(audioCtx.destination);
        }
        
        noiseNode.start();
    };

    const spawnStepParticles = (pos: THREE.Vector3) => {
        for (let p = 0; p < 10; p++) {
            const randId = Math.floor(Math.random() * dustCount);
            const idx = randId * 3;
            dustPos[idx] = pos.x + (Math.random() - 0.5) * 0.45;
            dustPos[idx + 1] = 0.05 + Math.random() * 0.15;
            dustPos[idx + 2] = pos.z + (Math.random() - 0.5) * 0.45;
            
            dustVelocities[idx] = (Math.random() - 0.5) * 1.6;
            dustVelocities[idx + 1] = 1.5 + Math.random() * 2.2;
            dustVelocities[idx + 2] = (Math.random() - 0.5) * 1.6;
        }
    };

    const triggerHorrorScreech = () => {
        if (!audioCtx) return;
        const t = audioCtx.currentTime;
        
        const oscs = 4;
        const screechGroup = audioCtx.createGain();
        screechGroup.gain.setValueAtTime(0.001, t);
        screechGroup.gain.exponentialRampToValueAtTime(0.12, t + 0.15);
        screechGroup.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
        screechGroup.connect(masterGain || audioCtx.destination);
        
        const baseFreq = 850 + Math.random() * 350;
        
        for (let i = 0; i < oscs; i++) {
            const osc = audioCtx.createOscillator();
            const lfo = audioCtx.createOscillator();
            const lfoGain = audioCtx.createGain();
            
            osc.type = Math.random() > 0.5 ? 'sawtooth' : 'triangle';
            osc.frequency.setValueAtTime(baseFreq * (1.0 + i * 0.35) + (Math.random() - 0.5) * 40, t);
            
            lfo.frequency.setValueAtTime(5 + i * 3, t);
            lfoGain.gain.setValueAtTime(45 * (i + 1), t);
            
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            osc.connect(screechGroup);
            
            osc.start(t);
            lfo.start(t);
            osc.stop(t + 2.9);
            lfo.stop(t + 2.9);
        }
    };

    // ==========================================
    // --- Centralized Anomaly Manager ---
    // ==========================================
    let corruptionLevel = 0.0; // scales from 0.0 to 1.0 based on elapsed time
    let anomalyActive = false;
    let anomalyType: 'none' | 'light' | 'ember' | 'peripheral_mold' | 'glitch' = 'none';
    let anomalyTimer = 0.0;
    let anomalyDuration = 10.0; // seconds
    let lastAnomalyTime = 0.0;
    const ANOMALY_COOLDOWN = 18.0; // delay between anomalies in seconds
    let chosenLightIndex = -1;
    let chosenLightOriginalIntensity = 130.0;
    let glitchDistortionOffset = 0.0;
    
    // Peripheral Mold Anomaly resources
    let peripheralMoldActive = false;
    const peripheralMoldPosition = new THREE.Vector3();
    const peripheralMoldGroup = new THREE.Group();
    scene.add(peripheralMoldGroup);
    
    // Create organic segmented tumor/mold meshes
    const moldMat = new THREE.MeshStandardMaterial({
        color: 0x1a0202,
        emissive: 0xaa0000,
        emissiveIntensity: 0.15,
        roughness: 0.25,
        metalness: 0.85
    });
    
    // Fleshy tumor biological core
    const moldCoreGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const moldCore = new THREE.Mesh(moldCoreGeo, moldMat);
    peripheralMoldGroup.add(moldCore);
    
    // Add satellite bulbs of random sizes to make it look fleshy and organic
    for (let i = 0; i < 6; i++) {
        const satelliteGeo = new THREE.SphereGeometry(0.12 + Math.random() * 0.15, 12, 12);
        const satellite = new THREE.Mesh(satelliteGeo, moldMat);
        const angle = (i / 6) * Math.PI * 2;
        const radius = 0.25 + Math.random() * 0.12;
        satellite.position.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 0.15, Math.sin(angle) * radius);
        peripheralMoldGroup.add(satellite);
    }
    
    // Ambient tumor pulsing sound generator/oscillator (spatialized)
    let moldOsc: OscillatorNode | null = null;
    let moldGain: GainNode | null = null;
    let moldPanner: PannerNode | null = null;
    
    const initPeripheralAudio = (pos: THREE.Vector3) => {
        if (!audioCtx || !masterGain) return;
        try {
            moldOsc = audioCtx.createOscillator();
            moldGain = audioCtx.createGain();
            moldPanner = audioCtx.createPanner();
            
            moldOsc.type = 'triangle';
            moldOsc.frequency.setValueAtTime(58, audioCtx.currentTime); // low breathing organic drone
            
            moldPanner.panningModel = 'HRTF';
            moldPanner.distanceModel = 'inverse';
            moldPanner.positionX.value = pos.x;
            moldPanner.positionY.value = pos.y;
            moldPanner.positionZ.value = pos.z;
            
            moldGain.gain.setValueAtTime(0, audioCtx.currentTime);
            
            moldOsc.connect(moldGain);
            moldGain.connect(moldPanner);
            moldPanner.connect(masterGain);
            
            moldOsc.start();
        } catch (err) {
            console.error(err);
        }
    };
    
    const stopPeripheralAudio = () => {
        if (moldOsc) {
            try {
                moldOsc.stop();
                moldOsc.disconnect();
            } catch (err) {}
            moldOsc = null;
        }
        if (moldGain) {
            try { moldGain.disconnect(); } catch (err) {}
            moldGain = null;
        }
        if (moldPanner) {
            try { moldPanner.disconnect(); } catch (err) {}
            moldPanner = null;
        }
    };

    peripheralMoldGroup.visible = false;

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

      // --- Refresh Combat UI indicators & Cooldown meters ---
      const rn = Date.now();
      if (attackCooldownRef.current > rn) {
          setAttackCooldown(Math.max(0, attackCooldownRef.current - rn));
      } else {
          setAttackCooldown(0);
      }
      if (parryCooldownRef.current > rn) {
          setParryCooldown(Math.max(0, parryCooldownRef.current - rn));
      } else {
          setParryCooldown(0);
      }
      if (dodgeCooldownRef.current > rn) {
          setDodgeCooldown(Math.max(0, dodgeCooldownRef.current - rn));
      } else {
          setDodgeCooldown(0);
      }
      if (combatFeedTimeRef.current > 0 && combatFeedTimeRef.current < rn) {
          combatFeedTimeRef.current = 0;
          setCombatFeed("");
      }

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

      // Flashlight Battery check and drain simulation
      if (flashlightOnRef.current && batteryRef.current > 0) {
          batteryRef.current = Math.max(0, batteryRef.current - delta * 0.5); // drain battery (takes ~200s to empty)
          if (batteryRef.current <= 0) {
              flashlightOnRef.current = false;
              setFlashlightOn(false);
              playFlashlightClick();
          }
      }

      // Throttle React state updates to avoid sluggish rendering thread performance (update every 10 frames)
      if (frameCount % 10 === 0) {
          setBattery(Math.round(batteryRef.current));
      }

      // Flashlight intensity depends on battery and toggled state
      if (flashlightOnRef.current && batteryRef.current > 0) {
          // Add extremely subtle, natural bulb flicker when battery is critical (below 25%)
          if (batteryRef.current < 25.0) {
              const flickerAmt = 0.7 + Math.random() * 0.3;
              const criticalFlickerChance = (25.0 - batteryRef.current) * 0.015; // higher chance as it reaches 0
              if (Math.random() < criticalFlickerChance) {
                  flashLight.intensity = 100.0 * flickerAmt * (Math.random() > 0.45 ? 0.25 : 1.0);
              } else {
                  // slightly dim if dying
                  flashLight.intensity = 100.0 * (0.55 + (batteryRef.current / 55.0));
              }
          } else {
              flashLight.intensity = 100.0;
          }
      } else {
          flashLight.intensity = 0.0;
      }
      
      const proximityThreat = Math.max(0, 1 - (distToStalker / 25)); // Increases as stalker gets closer than 25 units
      const threatLevel = Math.max(paranoiaRef.current, proximityThreat); 

      // Update Paranoia
      if (distToStalker < 20) {
          paranoiaRef.current += delta * 0.05;
      } else if (flashLight.intensity < 40.0) {
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
      const breathingRate = 0.6 + (paranoiaRef.current * 0.8); // Much slower and more cinematic
      const fovPulse = Math.sin(time * 0.001 * breathingRate) * (paranoiaRef.current * 1.5); // Warm subtle ambient breath
      const targetFov = baseFov + fovPulse;
      camera.fov += (targetFov - camera.fov) * 0.2; // Ultra-smooth interpolation to prevent zoom jitter
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

      // ==========================================
      // --- Anomaly Manager Per-Frame Update ---
      // ==========================================
      const curTimeSecs = time / 1000;
      glitchDistortionOffset = 0.0;
      
      // Corruption increases gradually over 4 minutes of gameplay
      corruptionLevel = Math.min(1.0, (curTimeSecs - startTime / 1000) / 240.0);
      
      // Check trigger conditions if cooldown elapsed and none active
      if (!anomalyActive && curTimeSecs - lastAnomalyTime > ANOMALY_COOLDOWN) {
          // Increase trigger probability proportional to corruption & paranoia
          const triggerThreshold = 0.001 + (corruptionLevel * 0.004) + (paranoiaRef.current * 0.005);
          if (Math.random() < triggerThreshold) {
              anomalyActive = true;
              anomalyTimer = 0.0;
              lastAnomalyTime = curTimeSecs;
              
              // Decide anomaly type
              const rand = Math.random();
              if (rand < 0.25) {
                  // Light & Emission Anomaly
                  if (emergencyLights.length > 0) {
                      anomalyType = 'light';
                      chosenLightIndex = Math.floor(Math.random() * emergencyLights.length);
                      chosenLightOriginalIntensity = emergencyLights[chosenLightIndex].baseIntensity;
                      anomalyDuration = 6.0 + Math.random() * 6.0;
                      console.log('[Central Anomalies] Activated: Red Light Pulse Anomaly');
                  } else {
                      anomalyActive = false; // rollback
                  }
              } else if (rand < 0.50) {
                  // Floor Embers Thermal Surge Anomaly
                  if (emberParticles) {
                      anomalyType = 'ember';
                      anomalyDuration = 8.0 + Math.random() * 5.0;
                      console.log('[Central Anomalies] Activated: Fluidic Ember Surge Anomaly');
                  } else {
                      anomalyActive = false;
                  }
              } else if (rand < 0.75) {
                  // View-Dependent Peripheral Vision Tumor Anomaly
                  anomalyType = 'peripheral_mold';
                  anomalyDuration = 12.0 + Math.random() * 8.0;
                  
                  // Spawn mold on a wall face close to the player, but in their peripheral or blindspot
                  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                  const spawnDist = 4.5 + Math.random() * 2.0;
                  // Put it behind them or to the side
                  const angleOffset = Math.random() > 0.5 ? Math.PI * 0.75 : -Math.PI * 0.75;
                  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                  
                  // Calculate relative behind position
                  const spawnDir = forward.clone().multiplyScalar(Math.cos(angleOffset)).add(right.clone().multiplyScalar(Math.sin(angleOffset))).normalize();
                  const targetSpawnPos = camera.position.clone().add(spawnDir.multiplyScalar(spawnDist));
                  
                  // Constrain height close to typical wall eye-height
                  targetSpawnPos.y = 1.3 + (Math.random() - 0.5) * 0.4;
                  peripheralMoldPosition.copy(targetSpawnPos);
                  peripheralMoldGroup.position.copy(targetSpawnPos);
                  
                  // Orient group facing the player center
                  peripheralMoldGroup.lookAt(camera.position);
                  
                  // Initialize scaling
                  peripheralMoldGroup.scale.set(0.01, 0.01, 0.01);
                  peripheralMoldGroup.visible = true;
                  peripheralMoldActive = true;
                  
                  // Start spatial drone sound
                  initPeripheralAudio(targetSpawnPos);
                  console.log('[Central Anomalies] Activated: Peripheral Bleeding Mold Anomaly', targetSpawnPos);
              } else {
                  // Reality Glitch / Aberration Anomaly
                  anomalyType = 'glitch';
                  anomalyDuration = 5.0 + Math.random() * 4.0;
                  console.log('[Central Anomalies] Activated: Reality Aberration Glitch Anomaly');
              }
          }
      }

      // Process active anomalies
      if (anomalyActive) {
          anomalyTimer += delta;
          
          if (anomalyTimer >= anomalyDuration) {
              // End active anomaly and restore state
              if (anomalyType === 'light' && chosenLightIndex !== -1) {
                  emergencyLights[chosenLightIndex].light.color.setHex(0xe5331a); // default red
              } else if (anomalyType === 'peripheral_mold') {
                  peripheralMoldGroup.visible = false;
                  peripheralMoldActive = false;
                  stopPeripheralAudio();
              }
              
              anomalyActive = false;
              anomalyType = 'none';
              console.log('[Central Anomalies] Anomaly resolved.');
          } else {
              // Smooth progress indicator
              const progress = anomalyTimer / anomalyDuration;
              const bellCurve = Math.sin(progress * Math.PI); // Peaks in the middle (0 to 1 to 0)
              
              if (anomalyType === 'light' && chosenLightIndex !== -1) {
                  const el = emergencyLights[chosenLightIndex];
                  // Rapidly oscillate intensity and shift color toward green/blue anomaly tones
                  const pulseFreq = time * 0.06;
                  const intensityOsc = Math.sin(pulseFreq) * bellCurve * 120;
                  el.light.intensity = Math.max(0, el.baseIntensity + intensityOsc);
                  
                  // Transition from emergency red to absolute spectral decay jade color
                  const startColor = new THREE.Color(0xe5331a);
                  const endColor = new THREE.Color(0x05ff55); // Spectral lime jade
                  el.light.color.copy(startColor).lerp(endColor, bellCurve * 0.95);
                  
                  // Anomaly light spill bloom surge (toned down to avoid blinding glare)
                  if (bloomPass) {
                      bloomPass.strength = 0.45 + bellCurve * 0.4;
                      bloomPass.threshold = 0.85 - bellCurve * 0.25;
                  }
              }
              
              else if (anomalyType === 'ember') {
                  // Floor embers rise up together into an orbiting tornado around the player
                  if (emberParticles) {
                      const ePosAttr = (emberParticles.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
                      const ePhaseArray = (emberParticles.geometry as THREE.BufferGeometry).getAttribute('phase').array as Float32Array;
                      const ePosArray = ePosAttr.array as Float32Array;
                      
                      for (let i = 0; i < emberCount; i++) {
                          const idx = i * 3;
                          const phase = ePhaseArray[i];
                          
                          // Suction towards the player coordinates
                          const toPlayerX = camera.position.x - ePosArray[idx];
                          const toPlayerZ = camera.position.z - ePosArray[idx + 2];
                          const dist = Math.hypot(toPlayerX, toPlayerZ) || 0.01;
                          
                          // Sucking vortex force
                          const vortexPull = (6.0 - Math.min(6.0, dist)) * 0.18;
                          const orbitAngle = time * 0.003 + phase * 6.28;
                          
                          // Rise faster
                          ePosArray[idx + 1] += (0.95 + phase * 0.5) * delta * bellCurve;
                          // Orbit circle
                          ePosArray[idx] += toPlayerX * vortexPull * delta * 2;
                          ePosArray[idx + 2] += toPlayerZ * vortexPull * delta * 2;
                          
                          // Circular swirl offset
                          ePosArray[idx] += Math.sin(orbitAngle) * 0.02 * bellCurve;
                          ePosArray[idx + 2] += Math.cos(orbitAngle) * 0.02 * bellCurve;
                          
                          // Recycle if goes above ceiling line
                          if (ePosArray[idx + 1] > 2.5) {
                              ePosArray[idx + 1] = 0.05;
                          }
                      }
                      ePosAttr.needsUpdate = true;
                  }
              }
              
              else if (anomalyType === 'peripheral_mold' && peripheralMoldActive) {
                  // Compare camera forward direction and our vector to detect look attention
                  const camLookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
                  const toMoldVec = peripheralMoldPosition.clone().sub(camera.position).normalize();
                  const lookDot = camLookDir.dot(toMoldVec); // >0.8 means looking directly
                  
                  // Peripheral mechanics:
                  if (lookDot < 0.35) {
                      // Player is looking away! The tumor grows rapidly and pulses with a blood drone!
                      const currentScale = peripheralMoldGroup.scale.x;
                      // Target scale up to 1.4 during full blindspot growth
                      const targetScale = 0.05 + bellCurve * 1.5;
                      const nextScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.06);
                      peripheralMoldGroup.scale.set(nextScale, nextScale, nextScale);
                      
                      if (moldGain) {
                          // Increase organic humming volume
                          moldGain.gain.setTargetAtTime(Math.min(0.28, bellCurve * 0.25), audioCtx!.currentTime, 0.1);
                      }
                  } else {
                      // Player look attention: player catches it, so it rapidly retracts, shrinks, and resolves early
                      const currentScale = peripheralMoldGroup.scale.x;
                      const nextScale = THREE.MathUtils.lerp(currentScale, 0.01, 0.12);
                      peripheralMoldGroup.scale.set(nextScale, nextScale, nextScale);
                      
                      if (moldGain) {
                          // Shrink humming volume instantly
                          moldGain.gain.setTargetAtTime(0.001, audioCtx!.currentTime, 0.05);
                      }
                      
                      // Enhance panic state on direct look encounter!
                      paranoiaRef.current += delta * 0.045;
                      
                      // Shrink faster and resolve early if it shrinks near zero
                      if (currentScale < 0.05 && anomalyTimer > 2.0) {
                          anomalyTimer = anomalyDuration; // triggers resolution next frame
                      }
                  }
                  
                  // Organic breathing/pulsing animation
                  const pulseScale = 1.0 + Math.sin(time * 0.012) * 0.14;
                  moldCore.scale.set(pulseScale, pulseScale, pulseScale);
              }
              
              else if (anomalyType === 'glitch') {
                  // Extreme reality aberration glitch
                  const screenShake = Math.sin(time * 0.09) * bellCurve * 0.032;
                  camera.rotation.z += screenShake;
                  camera.rotation.x += Math.cos(time * 0.11) * bellCurve * 0.015;
                  
                  // Chromatic and distortion shift (tuned down to keep visual reflection legible)
                  glitchDistortionOffset = bellCurve * 0.5 * (0.7 + Math.random() * 0.6);
                  
                  // Lower postprocessing bloom threshold and spike intensity (softened)
                  if (bloomPass) {
                      bloomPass.strength = 0.45 + bellCurve * 0.7 * (0.8 + Math.random() * 0.4);
                      bloomPass.threshold = Math.max(0.55, 0.85 - bellCurve * 0.25);
                  }
                  
                  // Glitch soundscape
                  if (audioCtx && masterGain && Math.random() < 0.22) {
                      const glitchOsc = audioCtx.createOscillator();
                      glitchOsc.type = 'sawtooth';
                      glitchOsc.frequency.setValueAtTime(45 + Math.random() * 120, audioCtx.currentTime);
                      
                      // Frequency chirp
                      glitchOsc.frequency.linearRampToValueAtTime(800 + Math.random() * 500, audioCtx.currentTime + 0.05);
                      
                      const glitchGainNode = audioCtx.createGain();
                      glitchGainNode.gain.setValueAtTime(bellCurve * 0.1, audioCtx.currentTime);
                      glitchGainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
                      
                      glitchOsc.connect(glitchGainNode);
                      glitchGainNode.connect(masterGain);
                      glitchOsc.start();
                      glitchOsc.stop(audioCtx.currentTime + 0.1);
                  }
              }
          }
      } else {
          // Restore passive visual profiles slowly to baseline
          if (bloomPass) {
              bloomPass.strength += (0.45 - bloomPass.strength) * delta * 2;
              bloomPass.threshold += (0.85 - bloomPass.threshold) * delta * 2;
          }
      }

      // Emergency lights remain fully stable and bright so the player can see
      for (let i = 0; i < emergencyLights.length; i++) {
          const el = emergencyLights[i];
          if (anomalyActive && anomalyType === 'light' && i === chosenLightIndex) {
              continue;
          }
          el.light.intensity = el.baseIntensity;
          el.light.color.setHex(0xe5331a);
      }

      // Dust Particles Animation
      const _m = new THREE.Matrix4();
      for (let i = 0; i < dustCount; i++) {
          const idx = i * 3;
          
          if (Math.abs(dustVelocities[idx + 1]) > 0.01) {
              // Kinetic footstep-splash mode: move with gravity, friction deceleration and air resistance
              dustPos[idx] += dustVelocities[idx] * delta;
              dustPos[idx + 1] += dustVelocities[idx + 1] * delta;
              dustPos[idx + 2] += dustVelocities[idx + 2] * delta;
              
              dustVelocities[idx] *= 0.96;         // horizontal air drag friction
              dustVelocities[idx + 1] -= 9.8 * delta; // gravitational constant downward pull
              dustVelocities[idx + 2] *= 0.96;
              
              if (dustPos[idx + 1] < 0) {
                  dustPos[idx + 1] = 0;
                  dustVelocities[idx] = 0;
                  dustVelocities[idx + 1] = 0;
                  dustVelocities[idx + 2] = 0;
              }
          } else {
              // High-Performance Interactive Convective Fluid Field & Player Dispersion Force
              const dx = dustPos[idx] - camera.position.x;
              const dy = dustPos[idx + 1] - camera.position.y;
              const dz = dustPos[idx + 2] - camera.position.z;
              const distToPlayer = Math.hypot(dx, dy, dz) || 0.01;
              
              let pushForceX = 0;
              let pushForceY = 0;
              let pushForceZ = 0;
              
              if (distToPlayer < 2.2) {
                  // Push dust out of the path of the player as they sprint through corridors
                  const forceAmount = (2.2 - distToPlayer) * 0.32;
                  pushForceX = (dx / distToPlayer) * forceAmount;
                  pushForceY = (dy / distToPlayer) * forceAmount * 0.5;
                  pushForceZ = (dz / distToPlayer) * forceAmount;
              }
              
              // Local convective vector fields
              const scaleX = dustPos[idx] * 0.25;
              const scaleY = dustPos[idx + 1] * 0.25;
              const scaleZ = dustPos[idx + 2] * 0.25;
              
              const windX = Math.sin(scaleY + scaleZ + time * 0.0006) * 0.014;
              const windY = (Math.cos(scaleX + scaleZ + time * 0.0004) * 0.008 + 0.011) * 0.45; // slight thermal chimney draft
              const windZ = Math.sin(scaleX + scaleY + time * 0.0005) * 0.014;
              
              dustPos[idx] += (windX + pushForceX) * (delta * 60);
              dustPos[idx + 1] += (windY + pushForceY) * (delta * 60);
              dustPos[idx + 2] += (windZ + pushForceZ) * (delta * 60);
              
              // Seamless boundaries wrap-around
              if (dustPos[idx + 1] > 3.5) {
                  dustPos[idx + 1] = 0.05;
              } else if (dustPos[idx + 1] < 0.01) {
                  dustPos[idx + 1] = 3.45;
              }
              if (dustPos[idx] < 0) dustPos[idx] = mazeSize * unit;
              if (dustPos[idx] > mazeSize * unit) dustPos[idx] = 0;
              if (dustPos[idx + 2] < 0) dustPos[idx + 2] = mazeSize * unit;
              if (dustPos[idx + 2] > mazeSize * unit) dustPos[idx + 2] = 0;
          }
          
          _m.setPosition(dustPos[idx], dustPos[idx + 1], dustPos[idx + 2]);
          dustParticles.setMatrixAt(i, _m);
      }
      dustParticles.instanceMatrix.needsUpdate = true;
      
      // Ember Particles thermal rise, horizontal swirl and decay cycle
      if (anomalyActive && anomalyType === 'ember') {
          // Handled within anomaly manager above
      } else if (emberParticles) {
          const ePosAttr = (emberParticles.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
          const ePhaseArray = (emberParticles.geometry as THREE.BufferGeometry).getAttribute('phase').array as Float32Array;
          const eCenterArray = (emberParticles.geometry as THREE.BufferGeometry).getAttribute('center').array as Float32Array;
          const ePosArray = ePosAttr.array as Float32Array;
          
          for (let i = 0; i < emberCount; i++) {
              const idx = i * 3;
              const phase = ePhaseArray[i];
              
              // Thermal lift rate (between 0.18m/s to 0.33m/s)
              const liftRate = 0.18 + (phase * 9.9 % 0.15);
              ePosArray[idx + 1] += liftRate * delta;
              
              // Convective horizontal swirl drift
              const swirlForce = time * 0.0012 + phase * 6.28;
              ePosArray[idx] = eCenterArray[idx] + Math.sin(swirlForce) * 0.15;
              ePosArray[idx + 2] = eCenterArray[idx + 2] + Math.cos(swirlForce) * 0.15;
              
              // Seamless thermal limit and dissolving recycling
              const maxLiftHeight = 1.4 + (phase * 15.3 % 0.8);
              if (ePosArray[idx + 1] > maxLiftHeight) {
                  ePosArray[idx + 1] = 0.05 + (phase * 3.7 % 0.12);
              }
          }
          ePosAttr.needsUpdate = true;
      }

      // Sway emergency ceiling lights slowly to shift shadows creeping down the tunnels
      emergencyLights.forEach((el) => {
          if (el.light.userData.baseX === undefined) {
              el.light.userData.baseX = el.light.position.x;
              el.light.userData.baseZ = el.light.position.z;
          }
          const swayPhase = time / 1300 + el.flickerOffset;
          const swayX = Math.sin(swayPhase) * 0.16;
          const swayZ = Math.cos(swayPhase * 0.95) * 0.16;
          el.light.position.x = el.light.userData.baseX + swayX;
          el.light.position.z = el.light.userData.baseZ + swayZ;
      });
      
      // Water Drops with Gravitational Fall Kinematics & High-Speed Radial Floor Splashes
      if (waterParticles && leakPositions.length > 0) {
          const wPositions = (waterParticles.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array;
          const wPhases = (waterParticles.geometry as THREE.BufferGeometry).attributes.phase.array as Float32Array;
          const gravityConstant = 9.81;
          
          for (let i = 0; i < waterCount; i++) {
              const idx = i * 3;
              const leakIdx = Math.floor(i / 20);
              const leak = leakPositions[leakIdx];
              if (!leak) continue;
              
              // 2.2 seconds complete drop sequence
              const cycleLength = 2.2;
              const dropTime = ((time / 1000) + wPhases[i] * cycleLength) % cycleLength;
              
              // Time of contact for y = 2.8 down to y = 0.0 with gravity: ~0.75 seconds
              const fallContactTime = 0.75;
              
              if (dropTime < fallContactTime) {
                  // Fall under real gravitational kinematics: h = 0.5 * g * t^2
                  const fallDistance = 0.5 * gravityConstant * dropTime * dropTime;
                  wPositions[idx] = leak.x + (Math.sin(wPhases[i] * 12.0) * 0.015);
                  wPositions[idx + 1] = 2.8 - fallDistance;
                  wPositions[idx + 2] = leak.z + (Math.cos(wPhases[i] * 12.0) * 0.015);
              } else {
                  // Contact hit! Splash expands outward horizontally on the wet floor slab
                  const splashAge = dropTime - fallContactTime;
                  const splashDuration = cycleLength - fallContactTime; // 1.45 seconds
                  const splashProgress = splashAge / splashDuration;
                  
                  // Exploding ring deceleration curve
                  const radius = Math.pow(splashProgress, 0.4) * 0.32;
                  const angle = wPhases[i] * Math.PI * 2 + (splashAge * 4.0);
                  
                  wPositions[idx] = leak.x + Math.cos(angle) * radius;
                  wPositions[idx + 1] = 0.02; // flat on floor
                  wPositions[idx + 2] = leak.z + Math.sin(angle) * radius;
              }
          }
          (waterParticles.geometry as THREE.BufferGeometry).attributes.position.needsUpdate = true;
      }

      // Steam Leaks venting warm vapor code
      if (steamParticles && leakPositions.length > 0) {
          const sPositions = (steamParticles.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array;
          const sPhases = (steamParticles.geometry as THREE.BufferGeometry).attributes.phase.array as Float32Array;
          
          for (let i = 0; i < steamCount; i++) {
              const idx = i * 3;
              const leakIdx = Math.floor(i / 30);
              const leak = leakPositions[leakIdx];
              if (!leak) continue;
              
              // 1.8 seconds puff cycle
              const cycleLength = 1.8;
              const puffTime = ((time / 1000) + sPhases[i] * cycleLength) % cycleLength;
              const progress = puffTime / cycleLength;
              
              // Cone spreading velocity
              const angle = sPhases[i] * Math.PI * 2;
              const radius = progress * 0.48;
              const rise = progress * 1.35;
              
              sPositions[idx] = leak.x + Math.cos(angle) * radius;
              sPositions[idx + 1] = 1.5 + rise; // rises from pipe height
              sPositions[idx + 2] = leak.z + Math.sin(angle) * radius;
          }
          (steamParticles.geometry as THREE.BufferGeometry).attributes.position.needsUpdate = true;
      }
      
      // Update wall shader uniforms for psychological distortion effect
      wallUniforms.uTime.value = time / 1000;
      wallUniforms.uFlicker.value = flashLight.intensity;

      const isWebControlsActive = isMobileMode || useVirtualControlsRef.current;

      if (controls.isLocked === true || (isWebControlsActive && isStarted)) {
        // --- Camera Rotation (Touch or Mouse Drag fallbacks) ---
        if (isMobileMode && touchRightRef.current.active) {
             const euler = new THREE.Euler(0, 0, 0, 'YXZ');
             euler.setFromQuaternion(camera.quaternion);
             euler.y -= touchRightRef.current.deltaX * 0.005;
             euler.x -= touchRightRef.current.deltaY * 0.005;
             euler.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, euler.x));
             camera.quaternion.setFromEuler(euler);
             
             touchRightRef.current.deltaX = 0;
             touchRightRef.current.deltaY = 0;
        } else if (!controls.isLocked && mouseLookState.isDragging) {
             const euler = new THREE.Euler(0, 0, 0, 'YXZ');
             euler.setFromQuaternion(camera.quaternion);
             euler.y -= mouseLookState.deltaX * 0.003;
             euler.x -= mouseLookState.deltaY * 0.003;
             euler.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, euler.x));
             camera.quaternion.setFromEuler(euler);
             
             mouseLookState.deltaX = 0;
             mouseLookState.deltaY = 0;
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

        // Player Movement & Combat Damping
        velocity.x -= velocity.x * 10 * delta;
        velocity.z -= velocity.z * 10 * delta;

        let inputDirection = new THREE.Vector3();
        let isRunningJoystick = false;

        if (isWebControlsActive && touchLeftRef.current.active) {
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
        } else {
             inputDirection.z = Number(moveState.forward) - Number(moveState.backward);
             inputDirection.x = Number(moveState.right) - Number(moveState.left);
             inputDirection.normalize(); 
        }

        // Project forward/right vectors of the camera onto the horizontal ground plane
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0;
        right.normalize();

        // --- Environmental Interaction: Crouching & Climbing Checks ---
        const isAgainstWall = 
             checkCollision(controls.object.position.clone().addScaledVector(forward, 0.45)) ||
             checkCollision(controls.object.position.clone().addScaledVector(forward, -0.45)) ||
             checkCollision(controls.object.position.clone().addScaledVector(right, 0.45)) ||
             checkCollision(controls.object.position.clone().addScaledVector(right, -0.45));

        // Climbing execution
        const tryClimb = moveState.space && isAgainstWall && staminaRef.current > 0;
        if (tryClimb) {
            if (!isClimbingRef.current) {
                isClimbingRef.current = true;
                setIsClimbing(true);
                showCombatFeed("✦ VERTICAL SCALING ENGAGED [CLIMBING]");
            }
            if (moveState.forward) {
                climbOffsetRef.current = Math.min(2.5, climbOffsetRef.current + 1.2 * delta);
            } else if (moveState.backward) {
                climbOffsetRef.current = Math.max(0.0, climbOffsetRef.current - 1.2 * delta);
            }
            // Drain stamina while climbing or hanging on walls
            staminaRef.current = Math.max(0.0, staminaRef.current - 14.0 * delta);
            setClimbOffset(climbOffsetRef.current);
        } else {
            // Gravity slide if not climbing or stamina depleted
            if (climbOffsetRef.current > 0) {
                climbOffsetRef.current = Math.max(0, climbOffsetRef.current - 4.5 * delta);
                setClimbOffset(climbOffsetRef.current);
            } else if (isClimbingRef.current) {
                isClimbingRef.current = false;
                setIsClimbing(false);
            }
        }

        // Adaptive Stamina mechanics
        const isTryingToRun = (moveState.run || isRunningJoystick) && (inputDirection.lengthSq() > 0.01);
        const isSprinting = isTryingToRun && !isStaminaExhaustedRef.current && !isClimbingRef.current;
        
        if (isSprinting) {
            staminaRef.current = Math.max(0.0, staminaRef.current - 16.0 * delta);
        } else if (!tryClimb) {
            // Recover stamina
            const recRate = isCrouchingRef.current ? 16.0 : (Math.abs(velocity.x) < 0.1 && Math.abs(velocity.z) < 0.1) ? 12.0 : 7.0;
            staminaRef.current = Math.min(100.0, staminaRef.current + recRate * delta);
        }

        if (staminaRef.current <= 0.05) {
            isStaminaExhaustedRef.current = true;
            setIsStaminaExhausted(true);
        } else if (isStaminaExhaustedRef.current && staminaRef.current >= 20.0) {
            isStaminaExhaustedRef.current = false;
            setIsStaminaExhausted(false);
        }

        if (frameCount % 4 === 0) {
            setStamina(Math.floor(staminaRef.current));
        }

        // Horizontal velocity calculations (completely bypassed when actively climbing or dodging)
        const isActivelyClimbing = isClimbingRef.current && climbOffsetRef.current > 0.05;
        const isDodging = dodgeTimeRef.current > 0;

        if (isDodging) {
            dodgeTimeRef.current = Math.max(0, dodgeTimeRef.current - delta);
            const dodgeStep = dodgeDirRef.current.clone().multiplyScalar(15.0 * delta); // 15m/s dash speed
            const nextPosX = controls.object.position.clone().add(new THREE.Vector3(dodgeStep.x, 0, 0));
            if (!checkCollision(nextPosX)) controls.object.position.x = nextPosX.x;
            const nextPosZ = controls.object.position.clone().add(new THREE.Vector3(0, 0, dodgeStep.z));
            if (!checkCollision(nextPosZ)) controls.object.position.z = nextPosZ.z;
        } else if (isActivelyClimbing) {
            // Bypassed horizontal moves while hanging on wall
            velocity.set(0, 0, 0);
        } else {
            // Run normal input motion
            const baseSpeed = isSprinting ? 5.0 : isCrouchingRef.current ? 1.4 : 2.6;
            const stDist = camera.position.distanceTo(stalker.position);
            const paralyzeFactor = (stDist < 12 && paranoiaRef.current > 0.6) ? 0.3 : 1.0;
            const speed = baseSpeed * paralyzeFactor;

            if (inputDirection.z !== 0) velocity.z -= inputDirection.z * speed * 10.0 * delta;
            if (inputDirection.x !== 0) velocity.x -= inputDirection.x * speed * 10.0 * delta;

            const stepX = -velocity.x * delta;
            const stepZ = -velocity.z * delta;

            const moveVec = new THREE.Vector3()
                .addScaledVector(forward, stepZ)
                .addScaledVector(right, stepX);
            
            const nextPosX = controls.object.position.clone().add(new THREE.Vector3(moveVec.x, 0, 0));
            if (!checkCollision(nextPosX)) {
                controls.object.position.x = nextPosX.x;
            }

            const nextPosZ = controls.object.position.clone().add(new THREE.Vector3(0, 0, moveVec.z));
            if (!checkCollision(nextPosZ)) {
                controls.object.position.z = nextPosZ.z;
            }
        }

        // Camera heights (incorporate Crouch and Climb offsets smoothly)
        const targetY = (isCrouchingRef.current ? 0.75 : 1.4) + climbOffsetRef.current;

        // Head bobbing and footstep sounds
        const isMovingHorizontally = (Math.abs(velocity.x) > 0.1 || Math.abs(velocity.z) > 0.1) && !isActivelyClimbing && !isDodging;
        if (isMovingHorizontally) {
            const bobSpeed = isSprinting ? 12 : isCrouchingRef.current ? 4 : 7;
            const bobHeight = isSprinting ? 0.05 : isCrouchingRef.current ? 0.015 : 0.035;
            camera.position.y = targetY + Math.sin(elapsedTime * bobSpeed) * bobHeight;
            
            if (audioCtx && filter) {
                filter.frequency.value = 120 + Math.abs(Math.sin(elapsedTime * bobSpeed)) * 30;
            }

            playerFootstepTimer -= delta;
            if (playerFootstepTimer <= 0) {
                playerFootstepTimer = isSprinting ? 0.30 : isCrouchingRef.current ? 0.72 : 0.52;
                triggerUnderfootRustle(controls.object.position, true);
                spawnStepParticles(controls.object.position);
            }
        } else {
             camera.position.y += (targetY - camera.position.y) * 0.12; 
             if (audioCtx && filter) filter.frequency.value += (120 - filter.frequency.value) * 0.05;
             playerFootstepTimer = 0.0;
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
             // Route to player's predicted forward path if lights are on, if offline, wait entirely
             if (flashLight.intensity < 40.0) {
                 finalPlayerPos = { x: stalker.position.x, z: stalker.position.z }; // Wait in the dark
                 currentStalkerSpeed = 0.5;
             } else {
                 const expectedPath = camera.position.clone().add(camForward.clone().multiplyScalar(15));
                 finalPlayerPos = { x: expectedPath.x, z: expectedPath.z };
                 currentStalkerSpeed = 3.5;
             }
        } else if (dScore.mode === 'pursuit') {
             // If light is off, player is hiding, stalker gets confused if far, or hones in
             if (flashLight.intensity < 40.0 && distToPlayer > 8) {
                 finalPlayerPos = { x: camera.position.x + (Math.random()-0.5)*20, z: camera.position.z + (Math.random()-0.5)*20 }; // Searching randomly around
                 currentStalkerSpeed = 3.0; // Slow down
             } else {
                 finalPlayerPos = { x: camera.position.x, z: camera.position.z };
                 currentStalkerSpeed = 5.0; // Aggressive
             }
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

        const playerProtectedByDodge = dodgeTimeRef.current > 0;
        const playerParriedOnTime = parryWindowRef.current > Date.now();
        const isClimbingHigh = climbOffsetRef.current > 1.2;

        if (!isStunned) {
             if (playerProtectedByDodge) {
                 // Active dodge invulnerability - step stalker back slightly to prevent collision loops
                 const workerDir = new THREE.Vector3(aiState.dirX, 0, aiState.dirZ);
                 stalker.position.addScaledVector(workerDir, -2.5 * delta);
             } else if (playerParriedOnTime) {
                 // Active parry shield deflection triggers!
                 parryWindowRef.current = 0; // Consume window
                 stalkerStunnedUntilRef.current = Date.now() + 4000; // 4.0s heavy stun
                 
                 // Deflect & knockback stalker
                 const pushDir = stalker.position.clone().sub(camera.position);
                 pushDir.y = 0;
                 pushDir.normalize();
                 stalker.position.addScaledVector(pushDir, 8.5);
                 
                 showCombatFeed("✦ PERFECT PARRY: STALKER BLOWN BACK & STUNNED [4.0s]");
                 
                 // Metal deflection audio
                 if (audioCtx) {
                     try {
                         const ctx = audioCtx;
                         const osc = ctx.createOscillator();
                         osc.type = 'triangle';
                         osc.frequency.setValueAtTime(700, ctx.currentTime);
                         osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.4);
                         const rawGain = ctx.createGain();
                         rawGain.gain.setValueAtTime(0.5, ctx.currentTime);
                         rawGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
                         osc.connect(rawGain);
                         rawGain.connect(ctx.destination);
                         osc.start();
                         osc.stop(ctx.currentTime + 0.4);
                     } catch (e) {}
                 }
             } else if (isClimbingHigh) {
                 // Player is safely high on wall, out of reach. Stalker stands growling below
                 stalker.position.y = 0;
                 stalker.lookAt(new THREE.Vector3(camera.position.x, 0, camera.position.z));
             } else if (distToPlayer > 1.2 || isHidden) {
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
                
                // Stalker footstep audio feedback cracks and physical particle splashes
                stalkerFootstepTimer -= delta;
                if (stalkerFootstepTimer <= 0) {
                    stalkerFootstepTimer = currentStalkerSpeed > 4.0 ? 0.22 : 0.44;
                    triggerUnderfootRustle(stalker.position, false);
                    spawnStepParticles(stalker.position);
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

      // Post Processing Uniform Updates & Custom Atmosphere/Locomotion Engines
      if (dreadPass) {
          dreadPass.uniforms["time"].value = elapsedTime;
          const distToStalker = camera.position.distanceTo(stalker.position);
          const proximityFalloff = Math.max(0, (15 - distToStalker) / 15);
          dreadPass.uniforms["distortionIntensity"].value = (proximityFalloff * 2.0) + (paranoiaRef.current * 1.5) + glitchDistortionOffset; 
          dreadPass.uniforms["flickerState"].value = flashLight.intensity > 40.0 ? 1.0 : 0.0;
          dreadPass.uniforms["uParanoia"].value = paranoiaRef.current;

          // Compute Rotational Motion Blur vectors
          const curRotX = camera.rotation.x;
          const curRotY = camera.rotation.y;
          const motionDeltaX = curRotY - prevRotation.y;
          const motionDeltaY = curRotX - prevRotation.x;
          prevRotation.set(curRotX, curRotY);
          
          dreadPass.uniforms["uMotionBlur"].value.set(motionDeltaX, motionDeltaY);
      }

      // 1. Physical bobbing/sway for flashlight and volumetric light scattering beam
      const isWalking = Math.abs(velocity.x) > 0.1 || Math.abs(velocity.z) > 0.1;
      const bobSpd = moveState.run ? 14.0 : 9.0;
      const bobAmt = moveState.run ? 0.07 : 0.035;
      
      if (controls.isLocked || isDeviceMobile) {
          if (isWalking) {
              flashLight.position.x = Math.sin(time / 1000 * bobSpd) * bobAmt * 0.5;
              flashLight.position.y = Math.cos(time / 1000 * bobSpd * 2.0) * bobAmt * 0.3;
          } else {
              flashLight.position.x = Math.sin(time / 1000 * 1.5) * 0.01;
              flashLight.position.y = Math.cos(time / 1000 * 1.5) * 0.005;
          }
      }
      
      // 2. Hanging electrical cables sway kinematics
      if (typeof swayingVines !== 'undefined' && swayingVines) {
          swayingVines.forEach((vine, idx) => {
              const distanceToEntity = vine.position.distanceTo(stalker.position);
              // Walking near elements triggers heavy swaying drafts
              const entityDraftFactor = distanceToEntity < 5.0 ? (5.0 - distanceToEntity) : 0.0;
              
              const timeOffset = time / 1000 + idx * 0.45;
              const rateMultiplier = 1.0 + entityDraftFactor * 1.5;
              const swayAngle = Math.sin(timeOffset * 1.8 * rateMultiplier) * (0.05 + entityDraftFactor * 0.28) + Math.cos(timeOffset * 1.25) * 0.015;
              
              const seg1 = vine.children[0];
              if (seg1) {
                  seg1.rotation.z = swayAngle;
                  seg1.rotation.x = swayAngle * 0.4;
                  const seg2 = seg1.children[0];
                  if (seg2) {
                      seg2.rotation.z = swayAngle * 0.85;
                      const seg3 = seg2.children[0];
                      if (seg3) {
                          seg3.rotation.z = swayAngle * 0.6;
                      }
                  }
              }
          });
      }

      // 3. Realistic and Reactive Fog System (interplay of temperature, humidity and timeline parameters)
      environmentTimeOfDay += delta * 0.015;
      humidityLevel = 0.75 + Math.sin(environmentTimeOfDay * 0.5) * 0.15;
      ambientTemperature = 10.0 - paranoiaRef.current * 6.5; 
      
      if (scene.fog && 'near' in scene.fog) {
          const fog = scene.fog as THREE.Fog;
          const targetNear = 12.0 - paranoiaRef.current * 5.0;
          const targetFar = 55.0 - paranoiaRef.current * 20.0;
          fog.near += (targetNear - fog.near) * 0.06;
          fog.far += (targetFar - fog.far) * 0.06;
          
          // Shift fog colors smoothly as panic levels rise to bleed into an organic decay tint
          const rotFogColor = new THREE.Color(0x07090b).lerp(new THREE.Color(0x1a0303), paranoiaRef.current * 0.48);
          scene.background = rotFogColor;
          fog.color.copy(rotFogColor);
      }

      // 4. Biomechanical stalker procedural crawl & scream jaw quivers
      if (typeof stalkerData !== 'undefined' && stalkerData && stalkerData.parts) {
          const parts = stalkerData.parts;
          const climbPhase = time / 1000 * 1.0;
          
          // Slider creep legs articulation
          const walkCycle = Math.sin(climbPhase * 6.2);
          parts.leftLegGroup.rotation.x = walkCycle * 0.45;
          parts.leftCalfGroup.rotation.x = Math.max(0, -walkCycle) * 0.35 + 0.1;
          
          parts.rightLegGroup.rotation.x = -walkCycle * 0.45;
          parts.rightCalfGroup.rotation.x = Math.max(0, walkCycle) * 0.35 + 0.1;
          
          // Clothes flutter in horrific environment draft
          parts.clothingStrips.forEach((cloth: THREE.Mesh, cIdx: number) => {
              cloth.rotation.x = 0.15 + Math.sin(climbPhase * 4.2 + cIdx) * (0.08 + paranoiaRef.current * 0.15);
              cloth.rotation.z = Math.cos(climbPhase * 2.2 + cIdx) * 0.06;
          });

          // Long limb mechanical claws sways
          parts.leftArmGroup.rotation.z = -0.55 + Math.sin(climbPhase * 1.8) * 0.12;
          parts.leftArmGroup.rotation.x = Math.cos(climbPhase * 1.4) * 0.18;
          parts.rightArmGroup.rotation.z = 0.55 + Math.cos(climbPhase * 1.8) * 0.12;
          parts.rightArmGroup.rotation.x = Math.sin(climbPhase * 1.4) * 0.18;

          // Articulated jaw screaming and quivering quakes
          const stDistToCam = camera.position.distanceTo(stalker.position);
          if (stDistToCam < 6.0) {
              const openFactor = Math.max(0, (6.0 - stDistToCam) / 6.0) * 0.7;
              parts.jawPivot.rotation.x = openFactor + Math.sin(time / 15 * Math.PI) * 0.08; // quivering
          } else {
              parts.jawPivot.rotation.x += (0.05 - parts.jawPivot.rotation.x) * 0.1;
          }
      }

      // Trigger occasional horror screech stingers based on high panic levels!
      if (paranoiaRef.current > 0.45 && Math.random() < 0.0004) {
          triggerHorrorScreech();
      }

      // 5. Dynamic Performance-based Resolution scaling pass
      const tNow = performance.now();
      const rollingDelta = tNow - lastFrameTimeRef.current;
      lastFrameTimeRef.current = tNow;
      smoothFrameTimeRef.current = smoothFrameTimeRef.current * 0.95 + rollingDelta * 0.05;

      resolutionCheckTimerRef.current -= delta;
      if (resolutionCheckTimerRef.current <= 0) {
          resolutionCheckTimerRef.current = 1.5;
          const currentFPS = 1000 / smoothFrameTimeRef.current;
          let pRatio = renderer.getPixelRatio();
          
          if (currentFPS < 42 && pRatio > 0.65) {
              const scaledRatio = Math.max(0.65, pRatio - 0.15);
              renderer.setPixelRatio(scaledRatio);
              composer.setSize(window.innerWidth, window.innerHeight);
              if (ssaoPass) ssaoPass.setSize(window.innerWidth, window.innerHeight);
              if (fxaaPass) {
                  fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * scaledRatio);
                  fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * scaledRatio);
              }
              console.log(`[Performance Scaling] Bottleneck detected (${Math.round(currentFPS)} FPS). Rescaling backbuffer viewport to ${Math.round(scaledRatio*100)}%`);
          } else if (currentFPS > 55 && pRatio < window.devicePixelRatio) {
              const scaledRatio = Math.min(window.devicePixelRatio, pRatio + 0.1);
              renderer.setPixelRatio(scaledRatio);
              composer.setSize(window.innerWidth, window.innerHeight);
              if (ssaoPass) ssaoPass.setSize(window.innerWidth, window.innerHeight);
              if (fxaaPass) {
                  fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * scaledRatio);
                  fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * scaledRatio);
              }
              console.log(`[Performance Scaling] High frametime headroom detected. Raising viewport resolution to ${Math.round(scaledRatio*100)}%`);
          }
      }

      // Direct high-performance virtual joystick DOM position updates
      if (joystickBaseRef.current && joystickKnobRef.current) {
          if (touchLeftRef.current.active) {
              joystickBaseRef.current.style.opacity = '1.0';
              joystickBaseRef.current.style.transform = `translate(${touchLeftRef.current.start.x - 48}px, ${touchLeftRef.current.start.y - 48}px)`;
              
              const dx = touchLeftRef.current.current.x - touchLeftRef.current.start.x;
              const dy = touchLeftRef.current.current.y - touchLeftRef.current.start.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              const maxDist = 48;
              const angle = Math.atan2(dy, dx);
              
              const moveX = dist > maxDist ? Math.cos(angle) * maxDist : dx;
              const moveY = dist > maxDist ? Math.sin(angle) * maxDist : dy;
              
              joystickKnobRef.current.style.transform = `translate(${moveX}px, ${moveY}px)`;
          } else {
              joystickBaseRef.current.style.opacity = '0.35';
              const defaultX = 80;
              const defaultY = window.innerHeight - 130;
              joystickBaseRef.current.style.transform = `translate(${defaultX}px, ${defaultY}px)`;
              joystickKnobRef.current.style.transform = `translate(0px, 0px)`;
          }
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
      if (ssaoPass) ssaoPass.setSize(window.innerWidth, window.innerHeight);
      if (bloomPass) bloomPass.setSize(window.innerWidth, window.innerHeight);
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
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onWindowResize);
      if (renderer) {
        if (canvasElement) {
          canvasElement.removeEventListener('webglcontextlost', handleContextLost);
        }
        if (currentMount && renderer.domElement && currentMount.contains(renderer.domElement)) {
          currentMount.removeChild(renderer.domElement);
        }
        renderer.dispose();
      }
      audioCtx?.close();
      delete (window as any).startGame;
      delete (window as any).simulateWebGLContextLoss;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver]);

  // UI Renders
  const isWebControlsActive = isMobileMode || useVirtualControls;

  if (isGraphicsFailed) {
      return (
        <SafeModeTerminal 
            onReboot={() => {
                logger.info("Manual reboot request received. Re-initializing WebGL engines...", "SYSTEM");
                setIsGraphicsFailed(false);
                setGameOver(false);
                setIsStarted(false);
            }}
            onOpenFeedback={() => setShowDiagnosticsConsole(true)}
            savedNotes={savedNotes}
            onNoteDiscovered={(noteId) => {
                setSavedNotes(prev => {
                    if (!prev.includes(noteId)) {
                        return [...prev, noteId];
                    }
                    return prev;
                });
            }}
        />
      );
  }

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
                        
                        <button 
                            onClick={() => setShowDiagnosticsConsole(true)}
                            id="start_screen_diagnostics"
                            className="px-6 py-2.5 border border-amber-900/40 text-amber-500 hover:bg-amber-950/20 hover:border-amber-600 hover:text-amber-300 font-mono text-xs tracking-widest transition-all duration-300 w-full text-center"
                        >
                            ⚙️ DIAGNOSTICS & INTEGRITY WORKBENCH
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

      {isStarted && !isLocked && !isWebControlsActive && !scare && (
        <div 
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md text-white cursor-pointer pointer-events-auto"
            onClick={() => controlsRef.current?.lock()}
        >
             <p className="text-3xl font-serif tracking-widest text-red-700 animate-pulse">
                 {pauseText}
             </p>
             <p className="text-gray-500 mt-6 font-mono text-sm tracking-widest">Click the screen to return</p>
             <button
                 className="mt-3 px-6 py-2 bg-amber-950/20 border border-amber-900/30 rounded font-mono text-xs tracking-[0.1em] text-amber-500 hover:bg-amber-900/20 hover:text-amber-200 transition-all duration-300 pointer-events-auto select-none shadow-[0_0_15px_rgba(245,158,11,0.08)] mb-1"
                 onClick={(e) => {
                     e.stopPropagation();
                     setShowDiagnosticsConsole(true);
                 }}
             >
                 ⚙️ DIAGNOSTICS & SYSTEM INTEGRITY
             </button>
             <button
                 className="mt-6 px-6 py-2.5 bg-red-950/50 border border-red-900/40 rounded font-mono text-xs tracking-[0.1em] text-red-500 hover:bg-[#990000]/25 hover:text-red-200 transition-all duration-300 pointer-events-auto select-none shadow-[0_0_15px_rgba(153,0,0,0.2)]"
                 onClick={(e) => {
                     e.stopPropagation();
                     setUseVirtualControls(true);
                     setIsMobileMode(true);
                 }}
             >
                 🔒 EMBEDDED IFRAME MOUSE LOGIC BLOCKED? CLICK HERE TO BYPASS
             </button>
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

      {isStarted && (isLocked || isWebControlsActive) && (
          <div className="absolute top-6 left-6 z-30 pointer-events-none flex flex-col gap-2 font-mono select-none">
              <div className="bg-black/50 border border-white/5 backdrop-blur-md px-4 py-3 rounded flex flex-col gap-1.5 min-w-[190px]">
                  <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 tracking-wider">OPTICS BATTERY</span>
                      <span className={`text-xs font-bold font-mono tracking-widest ${
                          battery <= 25 ? "text-red-500 animate-pulse" : battery <= 50 ? "text-amber-400" : "text-emerald-400"
                      }`}>
                          {battery}%
                      </span>
                  </div>
                  {/* Dynamic graphical grid bars */}
                  <div className="w-full bg-white/5 h-2.5 rounded border border-white/10 p-0.5 flex gap-0.5 overflow-hidden">
                      {Array.from({ length: 10 }).map((_, i) => {
                          const barPowerThreshold = (i + 1) * 10;
                          const active = battery >= barPowerThreshold;
                          const criticallyLowActive = battery <= 25;
                          return (
                              <div 
                                  key={i} 
                                  className={`h-full flex-1 rounded-sm transition-all duration-300 ${
                                      active 
                                        ? criticallyLowActive 
                                          ? "bg-red-500/80 animate-pulse" 
                                          : battery <= 50 
                                            ? "bg-amber-400/80" 
                                            : "bg-emerald-400/80"
                                        : "bg-transparent"
                                  }`} 
                              />
                          );
                      })}
                  </div>
                  <div className="flex items-center justify-between text-[10px] mt-1 border-t border-white/5 pt-1.5">
                      <span className="text-gray-400">STATE:</span>
                      <span className={`font-bold tracking-widest ${flashlightOn ? "text-amber-400" : "text-gray-500"}`}>
                          {flashlightOn ? "BEAM ACTIVE" : "DARK LOCK"}
                      </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                      <span className="text-gray-400">STEALTH:</span>
                      <span className={`font-bold tracking-widest flex items-center gap-1 ${flashlightOn ? "text-red-500/80" : "text-emerald-400/80 animate-pulse"}`}>
                          <span className="text-[8px]">●</span>
                          {flashlightOn ? "EXPOSED" : "CONCEALED"}
                      </span>
                  </div>
              </div>
              <span className="text-[9px] text-gray-600 tracking-widest mt-1 pl-1">KEY [F] TO TOGGLE OPTICS</span>
          </div>
      )}

      {isStarted && (isLocked || isWebControlsActive) && (
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

      {isStarted && (isLocked || isWebControlsActive) && hoveredNote && !readingNote && (
          <div className="absolute top-[55%] left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto text-white z-20 transition-opacity duration-300">
              <div className="bg-black/60 backdrop-blur-md px-4 py-2 border border-white/20 rounded flex flex-col items-center animate-pulse">
                  {hoveredNote.name && (
                      <span className="text-xs text-gray-300 font-mono tracking-wider mb-1 uppercase text-center border-b border-white/10 pb-1 w-full">{hoveredNote.name}</span>
                  )}
                  <p className="font-mono text-sm tracking-widest hidden md:block mt-1">
                      <span className="bg-white/20 px-1.5 py-0.5 rounded mr-2 inline-block">E</span> 
                      {hoveredNote.type === 'tape_recorder' ? 'PLAY LOG' : hoveredNote.type === 'battery' ? 'SECURE CORE' : ['note', 'artifact', 'cabinet'].includes(hoveredNote.type) ? 'READ' : hoveredNote.type === 'phone' ? 'ANSWER' : 'INTERACT'}
                  </p>
                  {/* Clickable fallback button visible on both mobile devices AND locked pointer issues */}
                  <button 
                      className="mt-2 px-5 py-1.5 bg-red-950/40 border border-red-900/30 hover:bg-red-900/25 text-red-400 rounded font-mono text-xs tracking-widest pointer-events-auto focus:outline-none select-none transition-all"
                      onMouseDown={(e) => {
                           e.stopPropagation();
                           document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
                      }}
                      onTouchEnd={(e) => {
                           e.stopPropagation();
                           document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
                      }}
                  >
                      TAP/CLICK TO {hoveredNote.type === 'tape_recorder' ? 'PLAY LOG' : hoveredNote.type === 'battery' ? 'SECURE CORE' : ['note', 'artifact', 'cabinet'].includes(hoveredNote.type) ? 'READ' : hoveredNote.type === 'phone' ? 'ANSWER' : 'INTERACT'}
                  </button>
              </div>
          </div>
      )}

      {readingNote && (
          <div 
             className="absolute inset-0 z-40 bg-black/80 flex items-center justify-center backdrop-blur-sm pointer-events-auto"
             onClick={() => {
                 setReadingNote(null);
                 if (!isWebControlsActive && !isLocked) controlsRef.current?.lock();
             }}
             onTouchEnd={() => {
                 setReadingNote(null);
                 if (!isWebControlsActive && !isLocked) controlsRef.current?.lock();
             }}
          >
             {readingNote.type === 'phone' ? (
                 <div className="absolute bottom-32 w-full px-8 flex flex-col items-center animate-fade-in" onClick={(e) => e.stopPropagation()}>
                     <p className="font-mono text-xl text-white uppercase tracking-widest bg-black/60 px-4 py-2 rounded text-center max-w-2xl shadow-xl shadow-black/50">
                        &quot;{readingNote.message}&quot;
                     </p>
                     <p className="mt-4 text-xs font-mono text-gray-500 opacity-80 uppercase tracking-widest bg-black/20 px-2 py-1 rounded">
                         [AUDIO PLAYING...] {(isWebControlsActive || !isLocked) ? 'TAP OUTSIDE TO CLOSE' : 'PRESS [E] TO CLOSE'}
                     </p>
                 </div>
             ) : ['artifact', 'tape_recorder'].includes(readingNote.type) ? (
                 <ArtifactExaminer 
                     item={readingNote}
                     audioCtx={audioCtxState}
                     unlocked={!!unlockedArtifacts[readingNote.id]}
                     onUnlock={() => markArtifactAsUnlocked(readingNote.id)}
                     onClose={() => {
                         setReadingNote(null);
                         if (!isWebControlsActive && !isLocked) controlsRef.current?.lock();
                     }}
                 />
             ) : (
                 <div className="bg-[#e4dfd0] p-10 max-w-lg min-h-64 shadow-2xl rotate-1 rounded-sm relative m-4 animate-scale-up" onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
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
                         className="absolute bottom-4 right-4 text-xs font-mono text-red-800 bg-red-950/10 hover:bg-red-950/20 px-3.5 py-1.5 rounded border border-red-900/15 pointer-events-auto"
                         onClick={() => {
                             setReadingNote(null);
                             if (!isWebControlsActive && !isLocked) controlsRef.current?.lock();
                         }}
                         onTouchEnd={() => {
                             setReadingNote(null);
                             if (!isWebControlsActive && !isLocked) controlsRef.current?.lock();
                         }}
                     >
                         Close
                     </button>
                 </div>
             )}
          </div>
      )}
      
      {/* Immersive Gamepad/HUD Controls overlay */}
      {isStarted && isWebControlsActive && !readingNote && !scare && (
         <>
           {/* Top-Right HUD Settings toggler */}
           <div className="absolute top-4 right-4 z-40 pointer-events-auto flex items-center gap-2">
              <button
                  id="toggle-free-look"
                  className={`px-4 py-1.5 border font-mono text-xs tracking-widest rounded transition-all select-none ${
                     useVirtualControls 
                        ? 'bg-red-950/40 text-red-500 border-red-900/40 shadow-[0_0_8px_rgba(153,0,0,0.2)]' 
                        : 'bg-black/60 text-gray-500 border-gray-800 hover:text-gray-300'
                  }`}
                  onClick={() => {
                      setUseVirtualControls(!useVirtualControls);
                      if (!useVirtualControls) {
                          setIsMobileMode(true);
                      }
                  }}
              >
                  {useVirtualControls ? "💻 FREE-LOOK (DRAG) ACTIVE" : "💻 USE FREE-LOOK Fallback"}
              </button>
           </div>

           {/* Direct Virtual Joystick Backdrop Base & Knob */}
           <div 
               ref={joystickBaseRef}
               className="absolute w-24 h-24 border border-red-900/45 bg-black/60 rounded-full flex items-center justify-center pointer-events-none z-30 shadow-[0_0_15px_rgba(153,0,0,0.15)]"
               style={{ left: '0px', top: '0px', display: 'flex' }}
           >
               <div 
                   ref={joystickKnobRef}
                   className="w-10 h-10 bg-red-700/60 border border-red-500/50 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.55)] pointer-events-none"
               />
           </div>

           {/* Mobile-Friendly Status & Look Helper Note in Center Bottom */}
           <p className="absolute bottom-24 left-1/2 -translate-x-1/2 text-[10px] text-gray-400 font-mono tracking-[0.2em] pointer-events-none text-center bg-black/40 px-3 py-1.5 rounded border border-white/5 opacity-80 z-20">
               DRAG ON THE LEFT HALF TO WALK • DRAG ON THE RIGHT HALF TO LOOK AROUND
           </p>

           {/* Tactile On-Screen Arrow D-Pad overlay on Bottom-Left */}
           <div className="absolute bottom-6 left-6 flex flex-col items-center justify-center gap-1.5 pointer-events-auto select-none z-30 scale-90 origin-bottom-left">
                {/* W Button */}
                <button 
                   className="w-13 h-12 border border-red-900/40 bg-black/70 active:bg-red-900/50 text-red-500 font-mono text-base tracking-wider font-bold rounded flex flex-col items-center justify-center transition-all shadow-[0_0_8px_rgba(153,0,0,0.15)] focus:outline-none"
                   onMouseDown={() => { moveStateRef.current.forward = true; }}
                   onMouseUp={() => { moveStateRef.current.forward = false; }}
                   onMouseLeave={() => { moveStateRef.current.forward = false; }}
                   onTouchStart={(e) => { e.preventDefault(); moveStateRef.current.forward = true; }}
                   onTouchEnd={(e) => { e.preventDefault(); moveStateRef.current.forward = false; }}
                >
                   <span className="text-[10px] leading-none opacity-50 mb-0.5">W</span>
                   <span className="leading-none text-red-400">▲</span>
                </button>
                <div className="flex gap-1.5">
                    {/* A Button */}
                    <button 
                      className="w-13 h-12 border border-red-900/40 bg-black/70 active:bg-red-900/50 text-red-500 font-mono text-base tracking-wider font-bold rounded flex flex-col items-center justify-center transition-all shadow-[0_0_8px_rgba(153,0,0,0.15)] focus:outline-none"
                      onMouseDown={() => { moveStateRef.current.left = true; }}
                      onMouseUp={() => { moveStateRef.current.left = false; }}
                      onMouseLeave={() => { moveStateRef.current.left = false; }}
                      onTouchStart={(e) => { e.preventDefault(); moveStateRef.current.left = true; }}
                      onTouchEnd={(e) => { e.preventDefault(); moveStateRef.current.left = false; }}
                    >
                      <span className="text-[10px] leading-none opacity-50 mb-0.5">A</span>
                      <span className="leading-none text-red-400">◀</span>
                    </button>
                    {/* S Button */}
                    <button 
                      className="w-13 h-12 border border-red-900/40 bg-black/70 active:bg-red-900/50 text-red-500 font-mono text-base tracking-wider font-bold rounded flex flex-col items-center justify-center transition-all shadow-[0_0_8px_rgba(153,0,0,0.15)] focus:outline-none"
                      onMouseDown={() => { moveStateRef.current.backward = true; }}
                      onMouseUp={() => { moveStateRef.current.backward = false; }}
                      onMouseLeave={() => { moveStateRef.current.backward = false; }}
                      onTouchStart={(e) => { e.preventDefault(); moveStateRef.current.backward = true; }}
                      onTouchEnd={(e) => { e.preventDefault(); moveStateRef.current.backward = false; }}
                    >
                      <span className="text-[10px] leading-none opacity-50 mb-0.5">S</span>
                      <span className="leading-none text-red-400">▼</span>
                    </button>
                    {/* D Button */}
                    <button 
                      className="w-13 h-12 border border-red-900/40 bg-black/70 active:bg-red-900/50 text-red-500 font-mono text-base tracking-wider font-bold rounded flex flex-col items-center justify-center transition-all shadow-[0_0_8px_rgba(153,0,0,0.15)] focus:outline-none"
                      onMouseDown={() => { moveStateRef.current.right = true; }}
                      onMouseUp={() => { moveStateRef.current.right = false; }}
                      onMouseLeave={() => { moveStateRef.current.right = false; }}
                      onTouchStart={(e) => { e.preventDefault(); moveStateRef.current.right = true; }}
                      onTouchEnd={(e) => { e.preventDefault(); moveStateRef.current.right = false; }}
                    >
                      <span className="text-[10px] leading-none opacity-50 mb-0.5">D</span>
                      <span className="leading-none text-red-400">▶</span>
                    </button>
                </div>
           </div>

            {/* Bottom-Right Tactile Action Buttons layout (Sprint + Interact) */}
            <div className="absolute bottom-6 right-6 flex items-center gap-3.5 pointer-events-auto select-none z-30 scale-95 origin-bottom-right">
                 {/* Virtual/Mobile Flashlight Toggle Button */}
                 <button 
                    className={`w-15 h-15 rounded-full border flex flex-col items-center justify-center text-xs font-mono font-bold transition-all duration-300 focus:outline-none ${
                        flashlightOn 
                          ? "bg-amber-600/20 text-amber-200 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.35)]" 
                          : "bg-black/70 text-gray-500 border-gray-800"
                    }`}
                    onClick={() => {
                        if ((window as any).toggleFlashlight) {
                            (window as any).toggleFlashlight();
                        }
                    }}
                 >
                    <span className="text-[9px] opacity-40 leading-none">KEY [F]</span>
                    <span className="text-xs tracking-wider mt-0.5 border-b border-red-950/15 pb-0.5 w-4/5 text-center">LIGHT</span>
                    <span className={`text-[8px] mt-0.5 opacity-60 bg-black/60 px-1 py-0.2 rounded-sm border border-white/5 ${
                        battery <= 25 ? "text-red-500 animate-pulse border-red-500/30" : "text-white/60"
                    }`}>
                        {battery > 0 ? `${battery}%` : "DEAD"}
                    </span>
                 </button>

                 {/* Sprint Toggle Button */}
                 <button 
                    className={`w-15 h-15 rounded-full border flex flex-col items-center justify-center text-xs font-mono font-bold transition-all duration-300 focus:outline-none ${
                        sprintToggle 
                          ? "bg-red-600/30 text-red-100 shadow-[0_0_15px_rgba(239,68,68,0.5)] border-red-500" 
                          : "bg-black/70 text-red-500 hover:bg-red-950/20 active:bg-red-950/40 border-red-900/30"
                    }`}
                    onClick={() => {
                         moveStateRef.current.run = !moveStateRef.current.run;
                         setSprintToggle(prev => !prev);
                    }}
                 >
                   <span className="text-[9px] opacity-40 leading-none">SHIFT</span>
                   <span className="text-xs tracking-wider mt-0.5 border-b border-red-900/10 pb-0.5 w-4/5 text-center">RUN</span>
                   <span className="text-[8px] mt-0.5 opacity-60 bg-black/50 px-1 py-0.2 rounded-sm border border-white/5">{sprintToggle ? "ON" : "OFF"}</span>
                </button>

                {/* Interact USE action button - dynamically active when near items */}
                <button 
                   disabled={!hoveredNote}
                   className={`w-15 h-15 rounded-full border transition-all duration-300 flex flex-col items-center justify-center text-xs font-mono font-bold focus:outline-none ${
                       hoveredNote 
                         ? "bg-amber-500/20 text-amber-200 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.45)] animate-pulse" 
                         : "bg-black/35 text-gray-600 border-gray-950 cursor-not-allowed opacity-35"
                   }`}
                   onClick={() => {
                        if (hoveredNote) {
                            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
                        }
                   }}
                >
                   <span className="text-[9px] opacity-40 leading-none">KEY [E]</span>
                   <span className="text-xs tracking-wider mt-0.5">USE</span>
                   <span className="text-[8px] mt-0.5 opacity-50 uppercase">{hoveredNote ? hoveredNote.type : "EMPTY"}</span>
                </button>
           </div>
         </>
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

      <BugReportModal 
          isOpen={showDiagnosticsConsole}
          onClose={() => setShowDiagnosticsConsole(false)}
          currentUserEmail={user?.email}
          onForceGraphicsFailure={() => {
              logger.warn("Diagnostic override: Simulating critical WebGL core crash failure profile.", "DIAG_PANEL");
              setIsGraphicsFailed(true);
              setShowDiagnosticsConsole(false);
          }}
          onSimulateContextLoss={() => {
              if ((window as any).simulateWebGLContextLoss) {
                  (window as any).simulateWebGLContextLoss();
              } else {
                  alert("3D graphics system is not online currently.");
              }
          }}
          currentGameStats={{
              isStarted,
              isLocked,
              gameOver,
              battery,
              flashlightOn,
              savedNotesCount: savedNotes.length,
          }}
      />
    </div>
  );
}
