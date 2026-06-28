import * as THREE from "three";
import { type Node, parseSync as parseVttSync } from "subtitle";
import {
    get_video,
    get_video_mesh as _get_video_mesh,
    get_media_audio,
    update_active_cues,
    set_cues,
    update_subtitles_mesh,
} from "./media_singletons";
import { get_user_language } from "./engine";
import { update_video_mesh } from "./media_singletons";
import { MediaAudio } from "./media_audio";

export function get_video_mesh(): THREE.Mesh {
    return _get_video_mesh();
}

export function update_media_player(camera: THREE.PerspectiveCamera) {
    update_active_cues();
    update_subtitles_mesh(camera);
    update_video_mesh(camera);
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
    audio: MediaAudio;
    _is_audio: boolean;
    media_can_play_promise: Promise<void> | null;
    subtitles_can_play_promise: Promise<void> | null;
    subtitles_fetch_abort_controller: AbortController | null;
    // TODO: re-enable subtitle support
    // track_el: HTMLTrackElement;
    // subtitle_el: HTMLParagraphElement;
    // current_text_track: TextTrack | null = null;
    bound_cue_change: (e: any) => void;

    constructor(media_src?: string, track_src?: string) {
        this.video = get_video();
        this.audio = get_media_audio();
        this._is_audio = false;
        this.media_can_play_promise = null;
        this.subtitles_can_play_promise = null;
        this.subtitles_fetch_abort_controller = null;

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

    get media(): Video | MediaAudio {
        return this._is_audio ? this.audio : this.video;
    }

    // TODO: hacky way to determine if media is audio or video, fix this at some point
    is_audio(): boolean {
        return this._is_audio;
    }

    is_paused(): boolean {
        return this.media.paused;
    }

    reset_and_pause(): void {
        const media = this.media;
        media.pause();
        media.currentTime = 0;
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
        if (media_src.startsWith(`${__ROOT_PATH__}/media/audio/`)) {
            this._is_audio = true;
            this.video.src = "";
        } else {
            this._is_audio = false;
            this.audio.src = "";
        }
        // TODO: re-enable subtitle support
        // if (this.current_text_track) {
        //     this.current_text_track.removeEventListener("cuechange", this.bound_cue_change);
        //     this.current_text_track = null;
        // }

        // if (this.track_el.parentNode) {
        //     this.track_el.parentNode.removeChild(this.track_el);
        //     this.subtitle_el.textContent = "";
        // }

        this.media_can_play_promise = new Promise<void>((resolve, reject) => {
            const can_play_cb = () => {
                this.media.removeEventListener("canplay", can_play_cb);
                resolve();
            };
            this.media.addEventListener("canplay", can_play_cb, { once: true });
            const error_cb = (e: unknown) => {
                this.media.removeEventListener("error", error_cb);
                reject(e);
            };
            this.media.addEventListener("error", error_cb, { once: true });
            // TODO: find a better way of getting around idle scenes not being able to play due to
            // immediately playing after loading. This is a hacky solution that waits 200ms before resolving the promise.
            setTimeout(() => {
                this.media.removeEventListener("canplay", can_play_cb);
                this.media.removeEventListener("error", error_cb);
                resolve();
            }, 200);
        });
        this.media.src = media_src;
        this.media.load();
        this.reset_and_pause();

        // this.track_el = document.createElement("track");
        // this.track_el.id = "track";
        // this.track_el.kind = "subtitles";
        // this.track_el.default = true;

        set_cues([]);
        this.subtitles_fetch_abort_controller?.abort();
        if (track_src) {
            this.subtitles_fetch_abort_controller = new AbortController();
            this.subtitles_can_play_promise = fetch(track_src, { signal: this.subtitles_fetch_abort_controller.signal })
                .then((response) => response.text())
                .then((vtt_text) => {
                    const nodes: Node[] = parseVttSync(vtt_text);
                    set_cues(nodes.filter((e) => e.type === "cue").map((e) => e.data));
                })
                .catch(() => {});
        }

        // this.video_si.appendChild(this.track_el);
    }

    async play(): Promise<void> {
        // this.subtitle_el.style.visibility = "visible";
        await this.media_can_play_promise!;
        await this.media.play();
    }

    get_elapsed_percentage(): number {
        if (this._is_audio) {
            if (this.audio.duration > 0) {
                const pct = (this.audio.currentTime / this.audio.duration) * 100;
                return Math.min(100, Math.ceil(pct));
            }
        } else {
            if (this.video.readyState >= 1 && this.video.duration > 0) {
                const pct = (this.video.currentTime / this.video.duration) * 100;
                return Math.min(100, Math.ceil(pct));
            }
        }

        return 0;
    }

    log_error(err: any): void {
        console.error(`failed to play media ${this.media.src}\n${err}`);
        // console.error(
        //     `failed to play media ${this.video_si.src} ${
        //         this.track_el.src ? `(track: ${this.track_el.src})` : ""
        //     }\n${err}`
        // );
    }
}
