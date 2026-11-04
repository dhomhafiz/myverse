import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { useThree } from '@react-three/fiber';
import { room } from '@/lib/room-config';

const NEON_TEXT = '("Hello, World!")';
const CLOCK_CLEAR_TOP = 94;
type Segment = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';
const DIGIT_SEGMENTS: Record<string, readonly Segment[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'g', 'e', 'c', 'd'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
};

type ClockDisplay = {
  texture: CanvasTexture;
  context: CanvasRenderingContext2D;
  fontFamily: string;
};

function formatLocalTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function drawClockTime(context: CanvasRenderingContext2D, time: string) {
  context.clearRect(0, CLOCK_CLEAR_TOP, context.canvas.width, context.canvas.height - CLOCK_CLEAR_TOP);
  const digitWidth = 92;
  const digitHeight = 128;
  const colonWidth = 18;
  const gap = 11;
  const displayWidth = 6 * digitWidth + 2 * colonWidth + 7 * gap;
  const startX = (context.canvas.width - displayWidth) / 2;
  const startY = 108;
  const segmentLines: Record<Segment, [[number, number], [number, number]]> = {
    a: [[12, 8], [digitWidth - 12, 8]],
    b: [[digitWidth - 8, 14], [digitWidth - 8, 56]],
    c: [[digitWidth - 8, 72], [digitWidth - 8, digitHeight - 14]],
    d: [[12, digitHeight - 8], [digitWidth - 12, digitHeight - 8]],
    e: [[8, 72], [8, digitHeight - 14]],
    f: [[8, 14], [8, 56]],
    g: [[12, digitHeight / 2], [digitWidth - 12, digitHeight / 2]],
  };
  context.strokeStyle = '#edfaff';
  context.fillStyle = '#edfaff';
  context.shadowColor = '#a9e7ff';
  context.shadowBlur = 14;
  context.lineWidth = 8;
  context.lineCap = 'round';
  const drawDigit = (digit: string, x: number, yOffset = 0) => {
    for (const segment of DIGIT_SEGMENTS[digit] ?? []) {
      const [[x1, y1], [x2, y2]] = segmentLines[segment];
      context.beginPath();
      context.moveTo(x + x1, startY + yOffset + y1);
      context.lineTo(x + x2, startY + yOffset + y2);
      context.stroke();
    }
  };
  let x = startX;
  for (const character of time) {
    if (character === ':') {
      context.beginPath();
      context.arc(x + colonWidth / 2, startY + 43, 5, 0, Math.PI * 2);
      context.arc(x + colonWidth / 2, startY + 85, 5, 0, Math.PI * 2);
      context.fill();
      x += colonWidth + gap;
      continue;
    }
    drawDigit(character, x);
    x += digitWidth + gap;
  }
  context.shadowBlur = 0;
}

function drawHelloWorld(context: CanvasRenderingContext2D, fontFamily: string) {
  context.clearRect(0, 0, context.canvas.width, CLOCK_CLEAR_TOP);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `700 56px ${fontFamily}, "SFMono-Regular", Consolas, monospace`;
  context.shadowColor = '#a9e7ff';
  context.shadowBlur = 10;
  context.fillStyle = '#dff7ff';
  context.fillText(NEON_TEXT, context.canvas.width / 2, 48);
  context.shadowBlur = 0;
}

function createClockDisplay(fontFamily: string): ClockDisplay {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create the left-wall clock texture.');

  const initialTime = formatLocalTime();
  drawHelloWorld(context, fontFamily);
  drawClockTime(context, initialTime);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, context, fontFamily };
}

function createPosterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1200;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create the left-wall poster texture.');

  context.fillStyle = '#eeeae0';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#252c30';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 106px Arial, sans-serif';
  ['EAT.', 'SLEEP.', 'CODE.', 'REPEAT.'].forEach((line, index) => {
    context.fillText(line, canvas.width / 2, 280 + index * 215);
  });
  context.fillStyle = '#8197a1';
  context.fillRect(360, 1030, 180, 5);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export default function LeftWallFeature({ active }: { active: boolean }) {
  const { invalidate } = useThree();
  const clock = useMemo(() => {
    const fontFamily = getComputedStyle(document.body).getPropertyValue('--font-space-mono').trim() || 'monospace';
    return createClockDisplay(fontFamily);
  }, []);
  const contextRef = useRef(clock.context);
  const textureRef = useRef(clock.texture);
  const posterTexture = useMemo(() => createPosterTexture(), []);
  const { position, rotation, posterSize, neonSize, neonOffsetY } = room.leftWallFeature;

  useEffect(() => {
    let disposed = false;
    const refreshFont = async () => {
      try {
        await document.fonts.load(`700 56px ${clock.fontFamily}, "SFMono-Regular", Consolas, monospace`);
      } catch (error) {
        console.warn('Unable to load Space Mono for the wall clock; using the monospace fallback.', error);
        return;
      }
      if (disposed) return;
      drawHelloWorld(contextRef.current, clock.fontFamily);
      const now = new Date();
      const time = formatLocalTime(now);
      drawClockTime(contextRef.current, time);
      textureRef.current.needsUpdate = true;
      invalidate();
    };
    void refreshFont();
    return () => { disposed = true; };
  }, [clock.fontFamily, invalidate]);

  useLayoutEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    const clearTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const refresh = () => {
      clearTimer();
      if (document.visibilityState !== 'visible') return;
      const now = new Date();
      const time = formatLocalTime(now);
      drawClockTime(contextRef.current, time);
      textureRef.current.needsUpdate = true;
      invalidate();
      timer = window.setTimeout(refresh, 1000 - (now.getTime() % 1000) + 1);
    };
    const updateVisibility = () => {
      clearTimer();
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', updateVisibility);
    refresh();
    return () => {
      clearTimer();
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, [active, invalidate]);

  return (
    <group name="left_wall_feature" position={position} rotation={rotation}>
      <group name="hello_world_neon" position={[0, neonOffsetY, 0]}>
        <mesh position={[0, 0, 0.026]}>
          <planeGeometry args={neonSize} />
          <meshStandardMaterial map={clock.texture} emissive="#b7eaff" emissiveMap={clock.texture}
            emissiveIntensity={0.9} color="#000000" transparent toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
      <group name="developer_typography_poster">
        <mesh>
          <boxGeometry args={[posterSize[0] + 0.08, posterSize[1] + 0.08, 0.04]} />
          <meshStandardMaterial color="#171b1e" roughness={0.66} />
        </mesh>
        <mesh position={[0, 0, 0.021]}>
          <planeGeometry args={posterSize} />
          <meshBasicMaterial map={posterTexture} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
