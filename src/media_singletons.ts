import * as THREE from "three";

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

// TODO: change this when fixes get pushed to nx.js that allow for video audio playback to not break
// audio player to get around video audio issues in nx.js
const audio_context = new AudioContext();
export let audio_buffer: AudioBuffer | null = null;
let audio_source: AudioBufferSourceNode | null = null;
let started_at = 0;
export function stop_audio() {
    audio_source?.stop();
    audio_source?.disconnect();
    audio_source = null;
}

export function start_audio(when?: number, offset?: number, duration?: number) {
    if (!audio_buffer) {
        throw new Error("audio buffer was not set before calling audio_start");
    }
    stop_audio();
    audio_source = audio_context.createBufferSource();
    audio_source.buffer = audio_buffer;
    audio_source.connect(audio_context.destination);
    audio_source.start(when, offset, duration);
    started_at = audio_context.currentTime - (offset ?? 0);
}

export function is_audio_paused(): boolean {
    return audio_source == null;
}

export function get_audio_current_time(): number {
    return audio_source ? audio_context.currentTime - started_at : 0;
}

export function get_audio_source(): AudioBufferSourceNode | null {
    return audio_source;
}

export function get_audio_context(): AudioContext {
    return audio_context;
}

export function set_audio_buffer(buffer: AudioBuffer): void {
    audio_buffer = buffer;
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
