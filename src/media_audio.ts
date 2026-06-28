export class MediaAudio extends EventTarget {
    media_src: string | null;
    audio_context: AudioContext;
    audio_buffer: AudioBuffer | null;
    audio_source: AudioBufferSourceNode | null;
    audio_can_play_promise: Promise<void> | null;
    started_at: number;
    resume_time: number;
    constructor(media_src?: string) {
        super();
        this.media_src = media_src ?? null;
        this.audio_context = new AudioContext();
        this.audio_buffer = null;
        this.audio_source = null;
        this.audio_can_play_promise = null;
        this.started_at = 0;
        this.resume_time = 0;

        if (this.media_src != null) {
            this.load();
        }
    }

    get src(): string | null {
        return this.media_src;
    }

    set src(media_src: string | null) {
        this.stopAudio();
        this.media_src = media_src;
        this.resume_time = 0;
    }

    get paused(): boolean {
        return this.audio_source == null;
    }

    get currentTime(): number {
        return !this.paused ? this.audio_context.currentTime - this.started_at : this.resume_time;
    }

    set currentTime(time: number) {
        this.resume_time = time;
        if (this.paused) {
            return;
        }
        this.startAudio(0, time);
    }

    get duration(): number {
        return this.audio_buffer?.duration ?? 0;
    }

    startAudio(when?: number, offset?: number, duration?: number) {
        if (!this.audio_buffer) {
            throw new Error("audio buffer was not set before calling audio_start");
        }
        this.stopAudio();
        this.audio_source = this.audio_context.createBufferSource();
        this.audio_source.buffer = this.audio_buffer;
        this.audio_source.connect(this.audio_context.destination);
        this.audio_source.start(when, offset, duration);
        this.started_at = this.audio_context.currentTime - (offset ?? 0);
    }

    stopAudio() {
        this.audio_source?.stop();
        this.audio_source?.disconnect();
        this.audio_source = null;
    }

    play() {
        if (!this.paused) {
            return;
        }
        this.startAudio(0, this.resume_time);
        this.dispatchEvent(new Event("play"));
    }

    pause() {
        if (this.paused) {
            return;
        }
        this.resume_time = this.currentTime;
        this.stopAudio();
        this.dispatchEvent(new Event("pause"));
    }

    load(media_src?: string) {
        if (media_src != null) {
            this.media_src = media_src;
        }

        if (!this.media_src) {
            return;
        }
        this.audio_can_play_promise = fetch(this.media_src)
            .then((r) => r.arrayBuffer())
            .then((data_buffer) => this.audio_context.decodeAudioData(data_buffer))
            .then((audio_buffer) => {
                this.audio_buffer = audio_buffer;
                this.dispatchEvent(new Event("canplay"));
                this.dispatchEvent(new Event("canplaythrough"));
            });
    }
}
