import * as THREE from "three";
import { Cue } from "subtitle";
import { varPreLine } from "uwrap";
import { MediaAudio } from "./media_audio";

function place_plane_for_z(mesh: THREE.Mesh, face_z: number, camera: THREE.PerspectiveCamera): void {
    const height = 2 * Math.tan(((camera.fov / 2) * Math.PI) / 180) * face_z;
    const width = height * camera.aspect;
    mesh.scale.set(width, height, 1);

    const offset = new THREE.Vector3(0, 0, -face_z);
    offset.applyQuaternion(camera.quaternion);
    mesh.position.copy(camera.position).add(offset);
    mesh.quaternion.copy(camera.quaternion);
}

// video singleton to be used by all media players
const video = new Video();

export function get_video(): Video {
    return video;
}

// canvas and texture for rendering the video onto a 3D mesh
let should_video_rerender = false;
const enable_rerender_cb = () => (should_video_rerender = true);
const disable_rerender_cb = () => (should_video_rerender = false);
for (const event of ["loadedmetadata", "canplay", "play"]) {
    video.addEventListener(event, enable_rerender_cb);
}
for (const event of ["pause", "ended"]) {
    video.addEventListener(event, disable_rerender_cb);
}
const video_canvas = new OffscreenCanvas(320, 240);
const video_canvas_ctx = video_canvas.getContext("2d");
const video_texture = new THREE.CanvasTexture(video_canvas);
video_texture.minFilter = THREE.LinearFilter;
video_texture.magFilter = THREE.LinearFilter;
const video_mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
        map: video_texture,
    }),
);
export function get_video_mesh(): THREE.Mesh {
    return video_mesh;
}

export function update_video_mesh(camera: THREE.PerspectiveCamera): void {
    if (!should_video_rerender) {
        return;
    }
    place_plane_for_z(video_mesh, 10, camera);
    video_canvas_ctx.drawImage(video, 0, 0, video_canvas.width, video_canvas.height);
    video_texture.needsUpdate = true;
}

// TODO: change this when fixes get pushed to nx.js that allow for video audio playback to not break
// audio player to get around video audio issues in nx.js

const media_audio = new MediaAudio();

export function get_media_audio(): MediaAudio {
    return media_audio;
}

// subtitle handling
const active_cues: Set<Cue> = new Set();
let should_subtitle_rerender = false;
let cues_by_start: Cue[] = [];
let cues_by_end: Cue[] = [];
let si = 0;
let ei = 0;
let last_time = 0;

export function update_active_cues(): void {
    let active_cues_updated = false;
    const media = video.src === "" ? media_audio : video;
    const current_time = media.currentTime * 1000;
    if (current_time >= last_time) {
        while (si < cues_by_start.length && cues_by_start[si].start <= current_time) {
            active_cues.add(cues_by_start[si++]);
            active_cues_updated = true;
        }
        while (ei < cues_by_end.length && cues_by_end[ei].end < current_time) {
            active_cues.delete(cues_by_end[ei++]);
            active_cues_updated = true;
        }
    } else {
        active_cues.clear();
        cues_by_start.forEach((cue) => {
            if (cue.start <= current_time && cue.end >= current_time) active_cues.add(cue);
        });
        // Reset sweep pointers to match current state
        si = cues_by_start.findIndex((s) => s.start > current_time);
        if (si === -1) si = cues_by_start.length;
        ei = cues_by_end.findIndex((e) => e.end >= current_time);
        if (ei === -1) ei = cues_by_end.length;
        active_cues_updated = true;
    }
    last_time = current_time;
    should_subtitle_rerender = active_cues_updated;
}

export function get_active_cues(): Set<Cue> {
    return active_cues;
}

export function set_cues(new_cues: Cue[]): void {
    cues_by_start = [...new_cues].sort((a, b) => a.start - b.start);
    cues_by_end = [...new_cues].sort((a, b) => a.end - b.end);
    active_cues.clear();
    si = 0;
    ei = 0;
    last_time = 0;
}

const subtitles_canvas = new OffscreenCanvas(640, 480);
const subtitles_canvas_ctx = subtitles_canvas.getContext("2d");
const font_px = 24;
const line_height = 1.2 * font_px;
subtitles_canvas_ctx.font = `${font_px}px system-ui`;
subtitles_canvas_ctx.textAlign = "center";
// to initialize letterspacing for uwrap
(subtitles_canvas_ctx as any).letterSpacing = "0px";
console.debug(`${subtitles_canvas_ctx.measureText("test").width}`);
const { split } = varPreLine(subtitles_canvas_ctx as unknown as CanvasRenderingContext2D);
const subtitles_texture = new THREE.CanvasTexture(subtitles_canvas);
subtitles_texture.minFilter = THREE.LinearFilter;
subtitles_texture.magFilter = THREE.LinearFilter;
const subtitles_mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
        map: subtitles_texture,
        transparent: true,
    }),
);
export function get_subtitles_mesh(): THREE.Mesh {
    return subtitles_mesh;
}

export function update_subtitles_mesh(camera: THREE.PerspectiveCamera): void {
    if (!should_subtitle_rerender) {
        return;
    }
    place_plane_for_z(subtitles_mesh, 1, camera);
    subtitles_canvas_ctx.clearRect(0, 0, subtitles_canvas.width, subtitles_canvas.height);
    for (const cue of active_cues) {
        const lines = split(cue.text, subtitles_canvas.width * 0.75);
        for (const [i, line] of lines.entries()) {
            const line_x = subtitles_canvas.width / 2;
            const line_y = subtitles_canvas.height - (lines.length - i) * line_height;
            const line_length = subtitles_canvas_ctx.measureText(line);
            const background_padding_x_px = (line_height - font_px) / 2;
            subtitles_canvas_ctx.fillStyle = "black";
            subtitles_canvas_ctx.fillRect(
                line_x - line_length.width / 2 - background_padding_x_px,
                line_y - font_px,
                line_length.width + background_padding_x_px * 2,
                line_height,
            );
            subtitles_canvas_ctx.fillStyle = "white";
            subtitles_canvas_ctx.fillText(line, line_x, line_y);
        }
    }
    subtitles_texture.needsUpdate = true;
    should_subtitle_rerender = false;
}
