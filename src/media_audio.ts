// TODO: timeupdate event not being dispatched

export class MediaAudio extends EventTarget {
    media_src: string | null;
    audio_context: AudioContext;
    audio_buffer: AudioBuffer | null;
    audio_source: AudioBufferSourceNode | null;
    audio_source_ended: boolean;
    audio_can_play_promise: Promise<void> | null;
    audio_load_abort_controller: AbortController | null;
    started_at: number;
    resume_time: number;
    constructor(media_src?: string) {
        super();
        this.media_src = media_src ?? null;
        this.audio_context = new AudioContext();
        this.audio_buffer = null;
        this.audio_source = null;
        this.audio_source_ended = false;
        this.audio_can_play_promise = null;
        this.audio_load_abort_controller = null;
        this.started_at = 0;
        this.resume_time = 0;

        if (this.media_src != null) {
            this.load();
        }
    }

    get src(): string {
        return this.media_src ?? "";
    }

    set src(media_src: string) {
        if (this.media_src === media_src) {
            return;
        }
        this.stopAudio();
        this.resume_time = 0;
        this.media_src = media_src;
        if (media_src.length !== 0) {
            this.audio_can_play_promise = null;
            this.audio_load_abort_controller?.abort();
            this.load()
        }
    }

    get paused(): boolean {
        return this.audio_source == null;
    }

    get currentTime(): number {
        return !this.paused ? this.audio_context.currentTime - this.started_at : this.resume_time;
    }

    set currentTime(time: number) {
        this.resume_time = time;
        this.audio_source_ended = false;
        if (this.paused) {
            return;
        }
        this.dispatchEvent(new Event("seeking"));
        this.startAudio(0, time);
        this.dispatchEvent(new Event("seeked"));
    }

    get duration(): number {
        return this.audio_buffer?.duration ?? 0;
    }

    get ended(): boolean {
        return this.audio_source_ended;
    }

    startAudio(when?: number, offset?: number, duration?: number): void {
        if (!this.audio_buffer) {
            return;
        }
        this.stopAudio();
        this.audio_source = this.audio_context.createBufferSource();
        this.audio_source.addEventListener("ended", () => {
            this.audio_source_ended = true;
            this.dispatchEvent(new Event("ended"));
        });
        this.audio_source.buffer = this.audio_buffer;
        this.audio_source.connect(this.audio_context.destination);
        this.audio_source.start(when, offset, duration);
        this.started_at = this.audio_context.currentTime - (offset ?? 0);
    }

    stopAudio(): void {
        this.audio_source?.stop();
        this.audio_source?.disconnect();
        this.audio_source = null;
    }

    play(): Promise<void> {
        if (!this.paused) {
            return Promise.resolve();
        }
        this.startAudio(0, this.resume_time);
        this.dispatchEvent(new Event("play"));
        return Promise.resolve();
    }

    pause(): void {
        if (this.paused) {
            return;
        }
        this.resume_time = this.currentTime;
        this.stopAudio();
        this.dispatchEvent(new Event("pause"));
    }

    load(): void {
        if (!this.media_src || this.audio_can_play_promise != null) {
            return;
        }
        this.audio_load_abort_controller = new AbortController();
        this.audio_can_play_promise = fetch(this.media_src, { signal: this.audio_load_abort_controller.signal })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load audio file: ${response.status} ${response.statusText}`);
                }
                return response;
            })
            .then((r) => r.arrayBuffer())
            .then((data_buffer) => this.audio_context.decodeAudioData(data_buffer))
            .then((audio_buffer) => {
                this.audio_buffer = audio_buffer;
                this.audio_source_ended = false;
                this.dispatchEvent(new Event("loadedmetadata"));
                this.dispatchEvent(new Event("canplay"));
                this.dispatchEvent(new Event("canplaythrough"));
            })
            .catch((error) => {
                if (error.name === "AbortError") {
                    return;
                }
                this.dispatchEvent(new ErrorEvent("error", { error }));
            });
    }
}
