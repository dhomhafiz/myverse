'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, CanvasTexture, InstancedMesh, MeshStandardMaterial, Object3D, PlaneGeometry, SRGBColorSpace } from 'three';
import type { CompanionRobotActivity } from '@/lib/companion-robot-config';

const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 272;
const GRID_PITCH = 8;
const MESSAGE = 'Hello, World!';
const MESSAGE_FONT_SIZE = 60;
const FRAME_WIDTH = 0.218;
const FRAME_HEIGHT = 0.12;
const SCREEN_WIDTH = 0.194;
const SCREEN_HEIGHT = 0.1;
const BAR_COUNT = 11;
const BAR_WIDTH = 0.0035;
const BAR_STEP = 0.0059;
const BAR_BOTTOM = -0.039;
const BAR_DEPTH = 0.0012;
const IDLE_LEVELS = [0.18, 0.3, 0.48, 0.72, 0.4, 0.88, 0.56, 0.76, 0.44, 0.65, 0.26];

const GLYPHS: Record<string, readonly string[]> = {
  '>': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'],
  U: ['1001', '1001', '1001', '1001', '1001', '1001', '0110'],
  N: ['1001', '1101', '1101', '1011', '1011', '1001', '1001'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  T: ['1111', '0110', '0110', '0110', '0110', '0110', '0110'],
  '-': ['000', '000', '000', '111', '000', '000', '000'],
  '0': ['0110', '1001', '1011', '1101', '1001', '1001', '0110'],
  '1': ['010', '110', '010', '010', '010', '010', '111'],
};

function glyphWidth(glyph: readonly string[], character: string) {
  return character === ' ' ? 3 : Math.max(...glyph.map(row => row.length));
}

function drawPixelText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  cellSize: number,
  color: string,
) {
  context.save();
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 3;
  let cursorX = x;
  [...text].forEach((character, characterIndex) => {
    const glyph = GLYPHS[character];
    if (!glyph) throw new Error(`Missing LED display glyph: ${character}`);
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((pixel, columnIndex) => {
        if (pixel !== '1') return;
        context.beginPath();
        context.arc(
          cursorX + (columnIndex + 0.5) * cellSize,
          y + (rowIndex + 0.5) * cellSize,
          Math.max(1, cellSize * 0.29),
          0,
          Math.PI * 2,
        );
        context.fill();
      });
    });
    cursorX += (glyphWidth(glyph, character) + (characterIndex < text.length - 1 ? 1 : 0)) * cellSize;
  });
  context.restore();
}

function createLedTexture(fontFamily: string) {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create the companion LED display texture.');

  context.fillStyle = '#030a0d';
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context.fillStyle = '#07515b';
  for (let row = 0; row < TEXTURE_HEIGHT / GRID_PITCH; row++) {
    for (let column = 0; column < TEXTURE_WIDTH / GRID_PITCH; column++) {
      context.beginPath();
      context.arc(GRID_PITCH / 2 + column * GRID_PITCH, GRID_PITCH / 2 + row * GRID_PITCH, 1.65, 0, Math.PI * 2);
      context.fill();
    }
  }

  drawPixelText(context, '>>>', 18, 19, 4, '#38f2ff');
  context.strokeStyle = '#ff9d27';
  context.lineWidth = 2;
  context.strokeRect(363, 13, 132, 28);
  drawPixelText(context, 'UNIT-01', 371, 16, 3.2, '#ffb53b');

  context.save();
  context.font = `700 ${MESSAGE_FONT_SIZE}px ${fontFamily}`;
  const maxMessageWidth = TEXTURE_WIDTH - 48;
  const messageWidth = context.measureText(MESSAGE).width;
  const messageFontSize = Math.min(MESSAGE_FONT_SIZE, MESSAGE_FONT_SIZE * maxMessageWidth / messageWidth);
  context.font = `700 ${messageFontSize}px ${fontFamily}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#42efff';
  context.shadowColor = '#00eaff';
  context.shadowBlur = 3;
  context.fillText(MESSAGE, TEXTURE_WIDTH / 2, 136);
  context.restore();

  context.fillStyle = '#38f2ff';
  context.shadowColor = '#00eaff';
  context.shadowBlur = 3;
  const cornerPixels = [
    [3, 30], [4, 30], [3, 29], [3, 28],
    [60, 30], [59, 30], [60, 29], [60, 28],
  ];
  cornerPixels.forEach(([column, row]) => {
    context.beginPath();
    context.arc(GRID_PITCH / 2 + column * GRID_PITCH, GRID_PITCH / 2 + row * GRID_PITCH, 2.25, 0, Math.PI * 2);
    context.fill();
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function barLevel(activity: CompanionRobotActivity, index: number, elapsed: number) {
  const idle = IDLE_LEVELS[index];
  if (activity === 'thinking') return 0.22 + 0.7 * (0.5 + 0.5 * Math.sin(elapsed * 4.2 - index * 0.9));
  if (activity === 'response') return 0.18 + 0.78 * (0.5 + 0.5 * Math.sin(elapsed * 7 - index * 1.45));
  return idle + Math.sin(elapsed * 1.2 + index * 0.7) * 0.035;
}

export default function CompanionLedDisplay({
  activity,
  active,
  reducedMotion,
}: {
  activity: CompanionRobotActivity;
  active: boolean;
  reducedMotion: boolean;
}) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  const textureRef = useRef<CanvasTexture | null>(null);
  const cyanFrame = useRef<InstancedMesh>(null);
  const amberAccents = useRef<InstancedMesh>(null);
  const equalizer = useRef<InstancedMesh>(null);
  const mounted = useRef(false);
  const elapsed = useRef(0);
  const transform = useMemo(() => new Object3D(), []);
  const frameGeometry = useMemo(() => new BoxGeometry(FRAME_WIDTH, FRAME_HEIGHT, 0.014), []);
  const frameMaterial = useMemo(() => new MeshStandardMaterial({
    color: '#202a31',
    metalness: 0.78,
    roughness: 0.34,
  }), []);
  const screenGeometry = useMemo(() => new PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT), []);
  const screenMaterial = useMemo(() => new MeshStandardMaterial({
    color: '#071014',
    map: texture,
    emissive: '#ffffff',
    emissiveMap: texture,
    emissiveIntensity: 1.3,
    metalness: 0.18,
    roughness: 0.36,
    toneMapped: false,
  }), [texture]);
  const railGeometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const cyanMaterial = useMemo(() => new MeshStandardMaterial({
    color: '#41efff',
    emissive: '#00dff3',
    emissiveIntensity: 2,
    metalness: 0.2,
    roughness: 0.25,
    toneMapped: false,
  }), []);
  const amberMaterial = useMemo(() => new MeshStandardMaterial({
    color: '#ff9d27',
    emissive: '#ff7200',
    emissiveIntensity: 1.5,
    metalness: 0.35,
    roughness: 0.3,
    toneMapped: false,
  }), []);
  const barGeometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const barMaterial = useMemo(() => new MeshStandardMaterial({
    color: '#43f0ff',
    emissive: '#00eaff',
    emissiveIntensity: 2.1,
    metalness: 0.08,
    roughness: 0.25,
    toneMapped: false,
  }), []);

  useEffect(() => {
    let cancelled = false;
    const loadTexture = async () => {
      try {
        const fontFamily = getComputedStyle(document.body).getPropertyValue('--font-pixelify-sans').trim();
        if (!fontFamily) throw new Error('Pixelify Sans Bold is not configured for the companion LED display.');
        const loadedFonts = await document.fonts.load(`700 ${MESSAGE_FONT_SIZE}px ${fontFamily}`, MESSAGE);
        if (loadedFonts.length === 0) throw new Error('Pixelify Sans Bold did not load for the companion LED display.');
        const ledTexture = createLedTexture(fontFamily);
        if (cancelled) {
          ledTexture.dispose();
          return;
        }
        textureRef.current = ledTexture;
        setTexture(ledTexture);
      } catch (error) {
        console.error('Unable to load Pixelify Sans Bold for the companion LED display:', error);
      }
    };
    void loadTexture();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (mounted.current) return;
        textureRef.current?.dispose();
        frameGeometry.dispose();
        frameMaterial.dispose();
        screenGeometry.dispose();
        screenMaterial.dispose();
        railGeometry.dispose();
        cyanMaterial.dispose();
        amberMaterial.dispose();
        barGeometry.dispose();
        barMaterial.dispose();
      });
    };
  }, [frameGeometry, frameMaterial, screenGeometry, screenMaterial, railGeometry, cyanMaterial,
    amberMaterial, barGeometry, barMaterial]);

  useLayoutEffect(() => {
    const cyan = cyanFrame.current;
    if (cyan) {
      const rails = [
        [0, SCREEN_HEIGHT / 2 - 0.0007, SCREEN_WIDTH, 0.0014],
        [0, -SCREEN_HEIGHT / 2 + 0.0007, SCREEN_WIDTH, 0.0014],
        [-SCREEN_WIDTH / 2 + 0.0007, 0, 0.0014, SCREEN_HEIGHT],
        [SCREEN_WIDTH / 2 - 0.0007, 0, 0.0014, SCREEN_HEIGHT],
      ];
      rails.forEach(([x, y, width, height], index) => {
        transform.position.set(x, y, 0.0077);
        transform.scale.set(width, height, 0.0012);
        transform.updateMatrix();
        cyan.setMatrixAt(index, transform.matrix);
      });
      cyan.instanceMatrix.needsUpdate = true;
      cyan.computeBoundingSphere();
    }

    const amber = amberAccents.current;
    if (amber) {
      [-1, 1].forEach((side, index) => {
        transform.position.set(side * 0.073, -FRAME_HEIGHT / 2 + 0.005, 0.0079);
        transform.scale.set(0.034, 0.002, 0.0012);
        transform.updateMatrix();
        amber.setMatrixAt(index, transform.matrix);
      });
      amber.instanceMatrix.needsUpdate = true;
      amber.computeBoundingSphere();
    }
  }, [transform]);

  const updateBars = useCallback((time: number, motionEnabled: boolean) => {
    const mesh = equalizer.current;
    if (!mesh) return;
    for (let index = 0; index < BAR_COUNT; index++) {
      const level = motionEnabled ? barLevel(activity, index, time) : IDLE_LEVELS[index];
      const height = 0.0035 + level * 0.016;
      transform.position.set(
        (index - (BAR_COUNT - 1) / 2) * BAR_STEP,
        BAR_BOTTOM + height / 2,
        0.0092,
      );
      transform.scale.set(BAR_WIDTH, height, BAR_DEPTH);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [activity, transform]);

  useLayoutEffect(() => {
    elapsed.current = 0;
    updateBars(0, false);
  }, [activity, reducedMotion, updateBars]);

  useFrame((_, delta) => {
    if (!active || reducedMotion) return;
    elapsed.current += Math.min(delta, 0.05);
    updateBars(elapsed.current, true);
  });

  return (
    <group name="companion_chest_led_display" position={[0, 0.166, 0.07]}>
      <mesh name="companion_led_gunmetal_frame" geometry={frameGeometry} material={frameMaterial} castShadow receiveShadow />
      <mesh name="companion_led_matrix" geometry={screenGeometry} material={screenMaterial} position={[0, 0, 0.0074]} />
      <instancedMesh ref={cyanFrame} args={[railGeometry, cyanMaterial, 4]} />
      <instancedMesh ref={amberAccents} args={[railGeometry, amberMaterial, 2]} />
      <instancedMesh ref={equalizer} args={[barGeometry, barMaterial, BAR_COUNT]} />
    </group>
  );
}
