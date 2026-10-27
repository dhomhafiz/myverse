'use client';

import { useEffect, useMemo } from 'react';
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';

export default function PhoneContactScreen() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Unable to create the iPhone contact screen texture.');

    context.fillStyle = '#091115';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#99c4ca';
    context.font = '700 22px monospace';
    context.fillText('MYVERSE', 26, 64);
    context.fillStyle = '#dfe9e8';
    context.font = '700 36px monospace';
    context.fillText('CONTACT', 26, 244);
    context.fillStyle = '#78c7d1';
    context.fillRect(26, 270, 56, 3);
    context.fillStyle = '#9eafb2';
    context.font = '400 16px monospace';
    context.fillText("LET'S CONNECT", 26, 314);

    const screen = new CanvasTexture(canvas);
    screen.colorSpace = SRGBColorSpace;
    screen.magFilter = LinearFilter;
    screen.minFilter = LinearMipmapLinearFilter;
    screen.generateMipmaps = true;
    return screen;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  return <mesh position={[0, 0, 0.0097]}>
    <planeGeometry args={[0.066, 0.14]} />
    <meshBasicMaterial map={texture} toneMapped={false} />
  </mesh>;
}
