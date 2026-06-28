import * as THREE from "three";
import { MediaAudio } from "./media_audio";

// video singleton to be used by all media players
const video = new Video();
video.muted = true;
let should_video_rerender = false;
const enable_rerender_cb = () => (should_video_rerender = true);
const disable_rerender_cb = () => (should_video_rerender = false);
for (const event of ["loadedmetadata", "canplay", "play"]) {
    video.addEventListener(event, enable_rerender_cb);
}
for (const event of ["pause", "ended"]) {
    video.addEventListener(event, disable_rerender_cb);
}

export function get_video(): Video {
    return video;
}

// canvas and texture for rendering the video onto a 3D mesh
const canvas = new OffscreenCanvas(320, 240);
const canvas_ctx = canvas.getContext("2d");
const canvas_texture = new THREE.CanvasTexture(canvas);
canvas_texture.minFilter = THREE.LinearFilter;
canvas_texture.magFilter = THREE.LinearFilter;
const video_mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
        map: canvas_texture,
        // wireframe: true,
        side: THREE.BackSide,
    }),
);
export function get_video_mesh(): THREE.Mesh {
    return video_mesh;
}

export function update_video_texture(camera: THREE.PerspectiveCamera): void {
    if (!should_video_rerender) {
        return;
    }
    const height = 40;
    const width = height * camera.aspect;
    const face_z = height / 2 / Math.tan(((camera.fov / 2) * Math.PI) / 180);
    const depth = 2 * (face_z - camera.position.z) * -1;
    video_mesh.scale.set(width, height, depth);
    canvas_ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas_texture.needsUpdate = true;
}

// TODO: change this when fixes get pushed to nx.js that allow for video audio playback to not break
// audio player to get around video audio issues in nx.js

export const media_audio = new MediaAudio();

export function get_media_audio(): MediaAudio {
    return media_audio;
}
