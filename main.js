import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js';
import { HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const PARTICLE_COUNT = 3500;
const TEMPLATE_ORDER = ['heart', 'flower', 'saturn', 'firework', 'spiral'];

const templateSelect = document.querySelector('#template-select');
const nextButton = document.querySelector('#next-template');
const statusEl = document.querySelector('#status');

const threeRoot = document.querySelector('#three-root');
const video = document.querySelector('#input-video');
const overlayCanvas = document.querySelector('#overlay-canvas');
const overlayCtx = overlayCanvas.getContext('2d');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04060c, 0.02);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
threeRoot.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.2;
controls.enablePan = false;

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const point = new THREE.PointLight(0x66aaff, 1.8, 30);
point.position.set(5, 4, 8);
scene.add(point);

const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const colors = new Float32Array(PARTICLE_COUNT * 3);
const scales = new Float32Array(PARTICLE_COUNT);
const target = new Float32Array(PARTICLE_COUNT * 3);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  const i3 = i * 3;
  positions[i3] = (Math.random() - 0.5) * 18;
  positions[i3 + 1] = (Math.random() - 0.5) * 18;
  positions[i3 + 2] = (Math.random() - 0.5) * 18;

  colors[i3] = 0.4;
  colors[i3 + 1] = 0.7;
  colors[i3 + 2] = 1.0;
  scales[i] = Math.random();
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

const material = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
  uniforms: {
    uSize: { value: 7.0 },
    uTime: { value: 0 },
  },
  vertexShader: `
    attribute float aScale;
    uniform float uTime;
    uniform float uSize;
    varying vec3 vColor;

    void main() {
      vec3 displaced = position;
      displaced += 0.08 * vec3(
        sin(uTime + position.y * 2.0),
        cos(uTime * 1.1 + position.z * 2.0),
        sin(uTime * 0.9 + position.x * 2.0)
      );

      vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = uSize * (1.0 + aScale * 2.0) * (1.0 / -mvPosition.z);
      vColor = color;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;

    void main() {
      float dist = length(gl_PointCoord - vec2(0.5));
      if (dist > 0.5) discard;
      float alpha = smoothstep(0.5, 0.0, dist);
      gl_FragColor = vec4(vColor, alpha);
    }
  `,
});

const particles = new THREE.Points(geometry, material);
scene.add(particles);

const clock = new THREE.Clock();
let currentTemplate = 'heart';
let handLandmarker;
let pinchStrength = 0;
let palmOpen = 0;
let normalizedX = 0;
let normalizedY = 0;
let lastGestureLabel = 'No hand detected';

function paletteForGesture() {
  if (pinchStrength > 0.72) return [1.0, 0.34, 0.66];
  if (palmOpen > 0.7) return [0.25, 0.65, 1.0];
  return [0.65, 0.93, 0.52];
}

function heartTemplate(t, index) {
  const a = t * Math.PI * 2;
  const radiusNoise = 0.1 + (index % 31) / 160;
  const x = 16 * Math.pow(Math.sin(a), 3);
  const y =
    13 * Math.cos(a) -
    5 * Math.cos(2 * a) -
    2 * Math.cos(3 * a) -
    Math.cos(4 * a);
  const z = (Math.random() - 0.5) * 3;
  return [x * 0.12 * (1 + radiusNoise), y * 0.12 * (1 + radiusNoise), z];
}

function flowerTemplate(t, index) {
  const petals = 8;
  const a = t * Math.PI * 2;
  const radial = Math.cos(petals * a) * 2.3 + 3.2;
  const stem = ((index % 80) / 80 - 0.5) * 1.6;
  return [Math.cos(a) * radial * 0.45, Math.sin(a) * radial * 0.45, stem];
}

function saturnTemplate(t, index) {
  const ring = (index % 4) + 1;
  const angle = t * Math.PI * 2 * ring;
  const ringRadius = 1.3 + ring * 0.6;
  const tilt = 0.35;
  const x = Math.cos(angle) * ringRadius;
  const y = Math.sin(angle) * ringRadius * tilt;
  const z = Math.sin(angle) * ringRadius;
  return [x, y, z];
}

function fireworkTemplate(t, index) {
  const theta = Math.acos(1 - 2 * t);
  const phi = Math.PI * (1 + Math.sqrt(5)) * index;
  const shell = 0.5 + ((index % 71) / 71) * 4.2;
  return [
    shell * Math.sin(theta) * Math.cos(phi),
    shell * Math.cos(theta),
    shell * Math.sin(theta) * Math.sin(phi),
  ];
}

function spiralTemplate(t, index) {
  const angle = t * Math.PI * 20;
  const r = 0.2 + t * 4.5;
  const h = ((index % 120) / 120 - 0.5) * 2;
  return [Math.cos(angle) * r, h, Math.sin(angle) * r];
}

const templateFns = {
  heart: heartTemplate,
  flower: flowerTemplate,
  saturn: saturnTemplate,
  firework: fireworkTemplate,
  spiral: spiralTemplate,
};

function setTemplate(name) {
  currentTemplate = name;
  templateSelect.value = name;
  const fn = templateFns[name];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const [x, y, z] = fn(i / PARTICLE_COUNT, i);
    target[i3] = x;
    target[i3 + 1] = y;
    target[i3 + 2] = z;
  }
}

function drawHandOverlay(landmarks) {
  overlayCanvas.width = video.videoWidth || 320;
  overlayCanvas.height = video.videoHeight || 240;
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  if (!landmarks) return;

  overlayCtx.strokeStyle = 'rgba(116, 255, 227, 0.75)';
  overlayCtx.lineWidth = 2;
  overlayCtx.fillStyle = 'rgba(214, 255, 246, 0.85)';

  for (const p of landmarks) {
    overlayCtx.beginPath();
    overlayCtx.arc((1 - p.x) * overlayCanvas.width, p.y * overlayCanvas.height, 4, 0, Math.PI * 2);
    overlayCtx.fill();
  }
}

function updateGesture(landmarks) {
  if (!landmarks) {
    pinchStrength *= 0.92;
    palmOpen *= 0.92;
    lastGestureLabel = 'No hand detected';
    return;
  }

  const thumb = landmarks[4];
  const index = landmarks[8];
  const wrist = landmarks[0];
  const pinkyBase = landmarks[17];
  const middleTip = landmarks[12];

  const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y, thumb.z - index.z);
  const palmDist = Math.hypot(wrist.x - middleTip.x, wrist.y - middleTip.y);
  const palmWidth = Math.hypot(wrist.x - pinkyBase.x, wrist.y - pinkyBase.y);

  pinchStrength = THREE.MathUtils.clamp(1 - pinchDist * 6.5, 0, 1);
  palmOpen = THREE.MathUtils.clamp((palmDist / Math.max(0.0001, palmWidth) - 1.1) * 1.7, 0, 1);

  normalizedX = (index.x - 0.5) * -2;
  normalizedY = (index.y - 0.5) * -2;
  lastGestureLabel = pinchStrength > 0.72 ? 'Pinch detected' : palmOpen > 0.7 ? 'Open palm' : 'Tracking hand';
}

async function initHandTracking() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });

    video.srcObject = stream;
    await video.play();

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      },
      numHands: 1,
      runningMode: 'VIDEO',
    });

    statusEl.textContent = 'Hand tracking active. Move your hand in front of the camera.';
  } catch (err) {
    statusEl.textContent = 'Camera or model initialization failed. You can still switch templates manually.';
    console.error(err);
  }
}

function runHandTracking(timeMs) {
  if (!handLandmarker || video.readyState < 2) {
    drawHandOverlay(null);
    updateGesture(null);
    return;
  }

  const results = handLandmarker.detectForVideo(video, timeMs);
  const landmarks = results.landmarks?.[0];
  drawHandOverlay(landmarks);
  updateGesture(landmarks);
}

function animate() {
  const elapsed = clock.getElapsedTime();
  runHandTracking(performance.now());

  const baseColor = paletteForGesture();
  const expansion = 0.82 + pinchStrength * 1.25;
  const attraction = 0.03 + palmOpen * 0.02;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;

    positions[i3] += (target[i3] * expansion - positions[i3]) * attraction;
    positions[i3 + 1] += (target[i3 + 1] * expansion - positions[i3 + 1]) * attraction;
    positions[i3 + 2] += (target[i3 + 2] * expansion - positions[i3 + 2]) * attraction;

    const twinkle = 0.5 + 0.5 * Math.sin(elapsed * 2.5 + i * 0.03 + pinchStrength * 4.0);
    colors[i3] = THREE.MathUtils.clamp(baseColor[0] * twinkle, 0, 1);
    colors[i3 + 1] = THREE.MathUtils.clamp(baseColor[1] * (0.9 + twinkle * 0.4), 0, 1);
    colors[i3 + 2] = THREE.MathUtils.clamp(baseColor[2] * (1.2 - twinkle * 0.2), 0, 1);
  }

  material.uniforms.uTime.value = elapsed;
  material.uniforms.uSize.value = 7 + pinchStrength * 5 + palmOpen * 1.5;

  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;

  particles.rotation.y = elapsed * 0.05 + normalizedX * 0.24;
  particles.rotation.x = normalizedY * 0.14;

  point.position.x = 5 + normalizedX * 2;
  point.position.y = 4 + normalizedY * 2;

  statusEl.textContent = `${lastGestureLabel} | pinch=${pinchStrength.toFixed(2)} open=${palmOpen.toFixed(2)}`;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

templateSelect.addEventListener('change', (event) => {
  setTemplate(event.target.value);
});

nextButton.addEventListener('click', () => {
  const index = TEMPLATE_ORDER.indexOf(currentTemplate);
  const next = TEMPLATE_ORDER[(index + 1) % TEMPLATE_ORDER.length];
  setTemplate(next);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

setTemplate(currentTemplate);
initHandTracking();
animate();
