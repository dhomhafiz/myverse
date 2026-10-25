import { useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { room } from '@/lib/room-config';

function createNeonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create the left-wall neon texture.');

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '600 104px Arial, sans-serif';
  context.lineJoin = 'round';
  context.shadowColor = '#a9e7ff';
  context.shadowBlur = 24;
  context.strokeStyle = 'rgba(150, 222, 255, 0.86)';
  context.lineWidth = 12;
  context.strokeText('Hello, World!', canvas.width / 2, canvas.height / 2);
  context.shadowBlur = 9;
  context.strokeStyle = 'rgba(220, 247, 255, 0.95)';
  context.lineWidth = 5;
  context.strokeText('Hello, World!', canvas.width / 2, canvas.height / 2);
  context.shadowBlur = 4;
  context.fillStyle = '#f5fcff';
  context.fillText('Hello, World!', canvas.width / 2, canvas.height / 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
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

export default function LeftWallFeature() {
  const neonTexture = useMemo(() => createNeonTexture(), []);
  const posterTexture = useMemo(() => createPosterTexture(), []);
  const { position, rotation, posterSize, neonSize, neonOffsetY } = room.leftWallFeature;

  return (
    <group name="left_wall_feature" position={position} rotation={rotation}>
      <group name="hello_world_neon" position={[0, neonOffsetY, 0]}>
        <mesh position={[0, 0, 0.026]}>
          <planeGeometry args={neonSize} />
          <meshBasicMaterial map={neonTexture} transparent toneMapped={false} depthWrite={false} />
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
