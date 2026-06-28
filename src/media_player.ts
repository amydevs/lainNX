import * as THREE from "three";
import {
    get_video,
    get_video_mesh as _get_video_mesh,
    stop_audio,
    is_audio_paused,
    set_audio_buffer,
    get_audio_context,
    start_audio,
    get_audio_source,
    get_audio_current_time,
} from "./media_singletons";
import { get_user_language } from "./engine";
import { update_video_texture } from "./media_singletons";

export function get_video_mesh(): THREE.Mesh {
    return _get_video_mesh();
}

export function update_media_player(camera: THREE.PerspectiveCamera) {
    update_video_texture(camera);
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
    media_src: string | null;
    media_can_play_promise: Promise<void> | null;
    // TODO: re-enable subtitle support
    // track_el: HTMLTrackElement;
    // subtitle_el: HTMLParagraphElement;
    // current_text_track: TextTrack | null = null;
    bound_cue_change: (e: any) => void;

    constructor(media_src?: string, track_src?: string) {
        this.media_src = null;
        this.media_can_play_promise = null;

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

    // TODO: hacky way to determine if media is audio or video, fix this at some point
    is_audio(): boolean {
        return this.media_src?.startsWith(`${__ROOT_PATH__}/media/audio/`) ?? false;
    }

    is_paused(): boolean {
        if (this.is_audio()) {
            return is_audio_paused();
        }
        return get_video().paused;
    }

    reset_and_pause(): void {
        if (this.is_audio()) {
            return stop_audio();
        }
        get_video().pause();
        get_video().currentTime = 0;
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
        this.media_src = media_src;
        // TODO: re-enable subtitle support
        // if (this.current_text_track) {
        //     this.current_text_track.removeEventListener("cuechange", this.bound_cue_change);
        //     this.current_text_track = null;
        // }

        // if (this.track_el.parentNode) {
        //     this.track_el.parentNode.removeChild(this.track_el);
        //     this.subtitle_el.textContent = "";
        // }

        if (this.is_audio()) {
            this.media_can_play_promise = fetch(media_src)
                .then((r) => r.arrayBuffer())
                .then(async (data_buffer) => {
                    const audio_buffer = await get_audio_context().decodeAudioData(data_buffer);
                    await set_audio_buffer(audio_buffer);
                });
        } else {
            this.media_can_play_promise = new Promise((resolve, reject) => {
                const can_play_cb = () => {
                    get_video().removeEventListener("canplay", can_play_cb);
                    resolve();
                };
                get_video().addEventListener("canplay", can_play_cb, { once: true });
                const error_cb = (e: unknown) => {
                    get_video().removeEventListener("error", error_cb);
                    reject(e);
                };
                get_video().addEventListener("error", error_cb, { once: true });
                // TODO: find a better way of getting around idle scenes not being able to play due to
                // immediately playing after loading. This is a hacky solution that waits 200ms before resolving the promise.
                setTimeout(() => {
                    get_video().removeEventListener("canplay", can_play_cb);
                    get_video().removeEventListener("error", error_cb);
                    resolve();
                }, 200);
            });
            get_video().src = media_src;
            get_video().load();
            this.reset_and_pause();
        }

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
        await this.media_can_play_promise!;
        if (this.is_audio()) {
            start_audio();
        } else {
            await get_video().play();
        }
    }

    get_elapsed_percentage(): number {
        if (this.is_audio()) {
            const audioSource = get_audio_source();
            const duration = audioSource?.buffer?.duration ?? 0;
            if (duration > 0) {
                const pct = (get_audio_current_time() / duration) * 100;
                return Math.min(100, Math.ceil(pct));
            }
        }
        if (get_video().readyState >= 1 && get_video().duration > 0) {
            const pct = (get_video().currentTime / get_video().duration) * 100;
            return Math.min(100, Math.ceil(pct));
        }

        return 0;
    }

    log_error(err: any): void {
        console.error(`failed to play media ${this.media_src}\n${err}`);
        // console.error(
        //     `failed to play media ${this.video_si.src} ${
        //         this.track_el.src ? `(track: ${this.track_el.src})` : ""
        //     }\n${err}`
        // );
    }
}
