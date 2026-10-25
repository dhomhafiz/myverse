import { useLoader } from '@react-three/fiber';
import { room } from '@/lib/room-config';
import { SRGBColorSpace, TextureLoader } from 'three';

const panelImages = [
  '/images/cycling-panel-left.webp',
  '/images/cycling-panel-center.webp',
  '/images/cycling-panel-right.webp',
];

export default function CyclingTriptych() {
  const { position, rotation, panelSize, panelGap } = room.cyclingTriptych;
  const textures = useLoader(TextureLoader, panelImages);
  textures.forEach(texture => {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
  });

  const frameBorder = 0.005;
  const frameWidth = panelSize[0] + frameBorder * 2;
  const frameHeight = panelSize[1] + frameBorder * 2;
  const panelStep = frameWidth + panelGap;
  const frameDepth = 0.035;

  return (
    <group name="cycling_triptych" position={position} rotation={rotation}>
      {textures.map((texture, index) => (
        <group key={index} name={`cycling_triptych_panel_${index + 1}`}
          position={[(index - 1) * panelStep, 0, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[frameWidth, frameHeight, frameDepth]} />
            <meshStandardMaterial color="#141719" roughness={0.92} metalness={0.04} />
          </mesh>
          <mesh position={[0, 0, frameDepth / 2 + 0.001]}>
            <planeGeometry args={panelSize} />
            <meshStandardMaterial map={texture} roughness={1} metalness={0} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
