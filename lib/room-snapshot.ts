import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';

export const ROOM_SNAPSHOT_EXCLUDE = 'excludeFromRoomSnapshot';

export function captureRoomSnapshot(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  const excluded: { object: Object3D; visible: boolean }[] = [];
  const previousTarget = renderer.getRenderTarget();

  scene.traverse(object => {
    if (object.userData[ROOM_SNAPSHOT_EXCLUDE] === true) {
      excluded.push({ object, visible: object.visible });
      object.visible = false;
    }
  });

  try {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    const image = renderer.domElement.toDataURL('image/webp', 0.82);
    if (image === 'data:,') throw new Error('Room canvas has no drawable pixels.');
    return image;
  } finally {
    excluded.forEach(({ object, visible }) => { object.visible = visible; });
    renderer.setRenderTarget(previousTarget);
  }
}
