'use client';

import { useEffect, useRef, useState } from 'react';
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial, SRGBColorSpace } from 'three';
import { useThree } from '@react-three/fiber';

type ScreenDisplay = {
  texture: CanvasTexture;
  cursor: { position: [number, number, number]; size: [number, number] };
};

function createTerminalDisplay(fontFamily: string): ScreenDisplay {
  const width = 1024, height = 576;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Unable to create the left-monitor terminal texture.');

  context.fillStyle = '#0b1011';
  context.fillRect(0, 0, width, height);
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  context.font = `700 168px ${fontFamily}, "SFMono-Regular", Consolas, monospace`;
  const title = 'PROJECTS';
  const titleWidth = context.measureText(title).width;
  const titleX = 56;
  const titleBaseline = 344;

  context.fillStyle = '#a5b0aa';
  context.font = `700 20px ${fontFamily}, "SFMono-Regular", Consolas, monospace`;
  context.fillText('MYVERSE / TERMINAL', 56, 64);
  context.textAlign = 'right';
  context.fillStyle = '#8bc99c';
  context.beginPath();
  context.arc(902, 57, 5, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#9aa99e';
  context.font = `400 18px ${fontFamily}, "SFMono-Regular", Consolas, monospace`;
  context.fillText('ONLINE', 966, 64);

  context.textAlign = 'left';
  context.fillStyle = '#aeb8b1';
  context.font = `400 23px ${fontFamily}, "SFMono-Regular", Consolas, monospace`;
  context.fillText('$ cd ~/selected-works', 56, 172);

  context.fillStyle = '#edf0e9';
  context.font = `700 168px ${fontFamily}, "SFMono-Regular", Consolas, monospace`;
  context.fillText(title, titleX, titleBaseline);

  context.fillStyle = '#89958d';
  context.font = `400 19px ${fontFamily}, "SFMono-Regular", Consolas, monospace`;
  context.fillText('SELECTED WORKS / CREATIVE DEVELOPMENT', 56, 408);

  context.fillStyle = '#8f9b93';
  context.font = `400 17px ${fontFamily}, "SFMono-Regular", Consolas, monospace`;
  context.textAlign = 'left';
  context.fillText('DHOMHAFIZ.DEV', 56, 532);
  context.textAlign = 'right';
  context.fillText('SYSTEM READY', 966, 532);

  context.font = `700 168px ${fontFamily}, "SFMono-Regular", Consolas, monospace`;
  const cursorWidth = context.measureText('_').width * 0.8;
  const cursorX = titleX + titleWidth + 9;
  const cursorY = titleBaseline + 5;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;

  return {
    texture,
    cursor: {
      position: [
        ((cursorX + cursorWidth / 2) / width - 0.5) * 0.81,
        (0.5 - cursorY / height) * 0.455,
        0.032,
      ],
      size: [cursorWidth / width * 0.81, 9 / height * 0.455],
    },
  };
}

export default function LeftMonitorDisplay({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const { invalidate } = useThree();
  const cursorMaterial = useRef<MeshBasicMaterial | null>(null);
  const [display, setDisplay] = useState<ScreenDisplay | null>(null);

  useEffect(() => {
    let disposed = false;
    let texture: CanvasTexture | null = null;
    const prepare = async () => {
      const fontFamily = getComputedStyle(document.body).getPropertyValue('--font-space-mono').trim() || 'monospace';
      const font = `700 168px ${fontFamily}, "SFMono-Regular", Consolas, monospace`;
      try {
        await document.fonts.load(font);
      } catch (error) {
        console.warn('Unable to load Space Mono for the left-monitor display; using the monospace fallback.', error);
      }
      if (disposed) return;
      try {
        const result = createTerminalDisplay(fontFamily);
        texture = result.texture;
        setDisplay(result);
        invalidate();
      } catch (error) {
        console.error('Unable to render the left-monitor display:', error);
      }
    };
    void prepare();
    return () => {
      disposed = true;
      texture?.dispose();
    };
  }, [invalidate]);

  useEffect(() => {
    const material = cursorMaterial.current;
    if (!material || !display) return;
    material.opacity = 1;
    invalidate();
    if (!active || reducedMotion) return;
    let visible = true;
    const interval = window.setInterval(() => {
      visible = !visible;
      material.opacity = visible ? 1 : 0;
      invalidate();
    }, 560);
    return () => {
      window.clearInterval(interval);
      material.opacity = 1;
      invalidate();
    };
  }, [active, display, invalidate, reducedMotion]);

  return <>
    <mesh position={[0, 0, 0.025]}>
      <boxGeometry args={[0.81, 0.455, 0.009]} />
      <meshStandardMaterial color="#101617" emissive="#101617" emissiveIntensity={0.18} roughness={0.78} />
    </mesh>
    {display && <>
      <mesh position={[0, 0, 0.0305]}>
        <planeGeometry args={[0.81, 0.455]} />
        <meshBasicMaterial map={display.texture} toneMapped={false} />
      </mesh>
      <mesh position={display.cursor.position}>
        <planeGeometry args={display.cursor.size} />
        <meshBasicMaterial ref={cursorMaterial} color="#edf0e9" transparent opacity={1} depthWrite={false} toneMapped={false} />
      </mesh>
    </>}
  </>;
}
