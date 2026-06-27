import * as THREE from "three";
import { get_user_language } from "./engine";

const video = new Video();
let should_video_rerender = false;
const enable_rerender_cb = () => should_video_rerender = true;
const disable_rerender_cb = () => should_video_rerender = false;
for (const event of ["loadedmetadata", "canplay", "play"]) {
    video.addEventListener(event, enable_rerender_cb);
}
for (const event of ["pause", "ended"]) {
    video.addEventListener(event, disable_rerender_cb);
}
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

export function get_video(): Video {
    return video;
}

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

export function get_audio_media_file_path(media_file: string): string {
    return `${__ROOT_PATH__}/media/audio/${media_file}.mp4`;
}

export function get_video_media_file_path(media_file: string): string {
    return `${__ROOT_PATH__}/media/movie/${media_file}.mp4`;
}

export function get_track_path(node_name: string): string {
    return `${__ROOT_PATH__}/webvtt/${get_user_language().code}/${node_name}.vtt`;
}

export function get_voice_syllable_path(syllable: string): string {
    return `${__ROOT_PATH__}/voice/${syllable}.mp4`;
}

export class MediaPlayer {
    video: Video;
    video_can_play_promise: Promise<void> | null;
    // TODO: re-enable subtitle support
    // track_el: HTMLTrackElement;
    // subtitle_el: HTMLParagraphElement;
    // current_text_track: TextTrack | null = null;
    bound_cue_change: (e: any) => void;

    constructor(media_src?: string, track_src?: string) {
        this.video = video;
        this.video_can_play_promise = null;

        // this.track_el = document.getElementById("track") as HTMLTrackElement;
        // this.subtitle_el = document.getElementById("subtitle") as HTMLParagraphElement;
        this.bound_cue_change = this.handle_cue_change.bind(this);

        // this.video_si.textTracks.addEventListener("addtrack", (e) => {
        //     const track = e.track;
        //     if (track) {
        //         track.mode = "hidden";
        //         track.addEventListener("cuechange", this.bound_cue_change);
        //         this.current_text_track = track;
        //     }
        // });

        if (media_src) {
            this.load(media_src, track_src);
        }
    }

    is_paused(): boolean {
        return this.video.paused;
    }

    reset_and_pause(): void {
        this.video.pause();
        this.video.currentTime = 0;
        // this.subtitle_el.style.visibility = "hidden";
    }

    handle_cue_change(_event: any): void {
        // const track = event.target;
        // const { activeCues } = track;
        // if (activeCues && activeCues.length > 0) {
        //     this.subtitle_el.textContent = (activeCues[0] as VTTCue).text;
        // } else {
        //     this.subtitle_el.textContent = "";
        // }
    }

    load(media_src: string, track_src?: string): void {
        // TODO: re-enable subtitle support
        // if (this.current_text_track) {
        //     this.current_text_track.removeEventListener("cuechange", this.bound_cue_change);
        //     this.current_text_track = null;
        // }

        // if (this.track_el.parentNode) {
        //     this.track_el.parentNode.removeChild(this.track_el);
        //     this.subtitle_el.textContent = "";
        // }

        this.video_can_play_promise = new Promise((resolve, reject) => {
            const can_play_cb = () => {
                this.video.removeEventListener("canplay", can_play_cb);
                resolve();
            };
            this.video.addEventListener("canplay", can_play_cb, { once: true });
            const error_cb = (e: unknown) => {
                this.video.removeEventListener("error", error_cb);
                reject(e);
            };
            this.video.addEventListener("error", error_cb, { once: true });
            // TODO: find a better way of getting around idle scenes not being able to play due to
            // immediately playing after loading. This is a hacky solution that waits 200ms before resolving the promise.
            setTimeout(() => {
                this.video.removeEventListener("canplay", can_play_cb);
                this.video.removeEventListener("error", error_cb);
                resolve();
            }, 200);
        });
        this.video.src = media_src;
        this.video.load();
        this.reset_and_pause();

        // this.track_el = document.createElement("track");
        // this.track_el.id = "track";
        // this.track_el.kind = "subtitles";
        // this.track_el.default = true;

        if (track_src) {
            // this.track_el.src = track_src;
        }

        // this.video_si.appendChild(this.track_el);
    }

    async play(): Promise<void> {
        // this.subtitle_el.style.visibility = "visible";
        await this.video_can_play_promise!;
        return await this.video.play();
    }

    get_elapsed_percentage(): number {
        if (this.video.readyState >= 1 && this.video.duration > 0) {
            const pct = (this.video.currentTime / this.video.duration) * 100;
            return Math.min(100, Math.round(pct));
        }

        return 0;
    }

    log_error(err: any): void {
        console.error(`failed to play media ${this.video.src}\n${err}`);
        // console.error(
        //     `failed to play media ${this.video_si.src} ${
        //         this.track_el.src ? `(track: ${this.track_el.src})` : ""
        //     }\n${err}`
        // );
    }
}
