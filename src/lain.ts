import * as THREE from "three";
import lain_animations_json from "./static/json/lain_animations.json";
import lain_talk_animations_json from "./static/json/lain_talk_animations.json";
import { get_lapk, get_talk_lapk, TimeContext } from "./engine";
import { random_from, secs_to_ms } from "./util";
import { Sprite2D, Vec3 } from "./objects";

// site lain
export enum LainAnimationKind {
    Jump_Up,
    Jump_Down,
    Naruto,
    Spin,
    Think,
    Eureka,
    Blush,
    Look_Up,
    Intro,
    Knock_Node,
    Knock_And_Fall_Node,
    Walk_Left,
    Walk_Right,
    Stand,
    Throw_Node,
    Rip_Node,
    Explode_Node,
    Lean_Forward,
    Lean_Left,
    Lean_Right,
    Look_Around,
    Play_With_Hair,
    Ponder,
    Pray,
    Rip_Middle_Ring,
    Scratch_Head,
    Stretch,
    Stretch_2,
    Fix_Sleeves,
    Angry,
    Open_The_Next,
    Count,
    Hug_Self,
}

const GLOW_COLOR = new THREE.Color(2, 2, 2);
const REGULAR_COLOR = new THREE.Color(1, 1, 1);
const LAIN_FPS = 10;

function get_lain_animation_frame(kind: LainAnimationKind, frame_number: number): THREE.Texture {
    return get_lapk(lain_animations_json[kind][frame_number]);
}

type LainUpdateResult = {
    finished_animation: LainAnimationKind | null;
};

export class Lain extends Sprite2D {
    animation: LainAnimationKind;
    elapsed_frame_count: number;
    last_update_time: number;

    constructor(position: Vec3) {
        const animation = LainAnimationKind.Stand;

        super(get_lain_animation_frame(animation, 0), {
            proportional_scale: 7,
            position,
        });

        this.elapsed_frame_count = 0;
        this.last_update_time = -1;
        this.animation = animation;
    }

    set_animation(animation: LainAnimationKind, time: number, start_frame: number = 0): void {
        this.material.map = get_lain_animation_frame(animation, start_frame);

        this.elapsed_frame_count = start_frame;
        this.animation = animation;
        this.last_update_time = time;
    }

    is_on_last_frame(): boolean {
        return this.elapsed_frame_count === lain_animations_json[this.animation].length - 1;
    }

    is_standing(): boolean {
        return this.animation === LainAnimationKind.Stand;
    }

    is_ripping_middle_ring(): boolean {
        return this.animation === LainAnimationKind.Rip_Middle_Ring;
    }

    is_navigating(): boolean {
        return (
            this.animation === LainAnimationKind.Jump_Down ||
            this.animation === LainAnimationKind.Jump_Up ||
            this.animation === LainAnimationKind.Walk_Left ||
            this.animation === LainAnimationKind.Walk_Right
        );
    }

    is_selecting_node(): boolean {
        return (
            this.animation === LainAnimationKind.Throw_Node ||
            this.animation === LainAnimationKind.Rip_Node ||
            this.animation === LainAnimationKind.Knock_And_Fall_Node ||
            this.animation === LainAnimationKind.Explode_Node ||
            this.animation === LainAnimationKind.Knock_Node
        );
    }

    should_set_next_frame(time: number): boolean {
        return time >= this.last_update_time + secs_to_ms(1 / LAIN_FPS);
    }

    update(time_ctx: TimeContext): LainUpdateResult {
        const { time, delta } = time_ctx;

        let finished_animation = null;

        if (this.should_set_next_frame(time)) {
            this.last_update_time = time;

            if (this.is_on_last_frame()) {
                finished_animation = this.animation;
                this.set_animation(LainAnimationKind.Stand, time);
            } else {
                this.elapsed_frame_count++;
            }

            this.material.map = get_lain_animation_frame(this.animation, this.elapsed_frame_count);
        }

        this.material.color.lerp(REGULAR_COLOR, delta * 4);

        return { finished_animation };
    }

    set_glowing(): void {
        this.material.color = GLOW_COLOR;
    }

    play_idle_animation(time: number): void {
        const animation = random_from([
            LainAnimationKind.Pray,
            LainAnimationKind.Fix_Sleeves,
            LainAnimationKind.Think,
            LainAnimationKind.Stretch_2,
            LainAnimationKind.Stretch,
            LainAnimationKind.Spin,
            LainAnimationKind.Scratch_Head,
            LainAnimationKind.Blush,
            LainAnimationKind.Naruto,
            LainAnimationKind.Hug_Self,
            LainAnimationKind.Count,
            LainAnimationKind.Angry,
            LainAnimationKind.Ponder,
            LainAnimationKind.Lean_Forward,
            LainAnimationKind.Lean_Left,
            LainAnimationKind.Lean_Right,
            LainAnimationKind.Look_Around,
            LainAnimationKind.Play_With_Hair,
            LainAnimationKind.Eureka,
            LainAnimationKind.Open_The_Next,
        ]);

        this.set_animation(animation, time);
    }
}

// TaK/End scene lain
const LAIN_TALK_FPS = 10;

export enum LainTalkAnimationKind {
    Intro,
    Outro,
    None,
}

function get_lain_talk_animation_frame(kind: LainTalkAnimationKind, frame_number: number): THREE.Texture {
    return get_talk_lapk(lain_talk_animations_json[kind][frame_number]);
}

function get_lain_talk_frame_for_rms(rms: number): THREE.Texture {
    if (rms >= 130) {
        return get_talk_lapk(0);
    } else if (rms >= 129 && rms <= 130) {
        return get_talk_lapk(33);
    } else if (rms > 128 && rms <= 129) {
        return get_talk_lapk(32);
    } else {
        return get_talk_lapk(31);
    }
}

type LainTalkUpdateResult = {
    finished_animation: LainTalkAnimationKind | null;
};

export class LainTalk extends Sprite2D {
    animation: LainTalkAnimationKind;
    elapsed_frame_count: number;
    last_update_time: number;

    constructor() {
        const animation = LainTalkAnimationKind.Intro;

        super(get_lain_talk_animation_frame(LainTalkAnimationKind.Intro, 0), {});

        this.elapsed_frame_count = 0;
        this.last_update_time = -1;
        this.animation = animation;
    }

    should_set_next_frame(time: number): boolean {
        return time >= this.last_update_time + secs_to_ms(1 / LAIN_TALK_FPS);
    }

    is_on_last_frame(): boolean {
        return this.elapsed_frame_count === lain_talk_animations_json[this.animation].length - 1;
    }

    set_animation(animation: LainTalkAnimationKind, time: number, start_frame: number = 0): void {
        this.material.map = get_lain_talk_animation_frame(animation, start_frame);

        this.elapsed_frame_count = start_frame;
        this.animation = animation;
        this.last_update_time = time;
    }

    unset_animation(): void {
        this.animation = LainTalkAnimationKind.None;
    }

    update(time: number): LainTalkUpdateResult {
        let finished_animation = null;

        switch (this.animation) {
            case LainTalkAnimationKind.Intro:
            case LainTalkAnimationKind.Outro:
                if (this.should_set_next_frame(time)) {
                    this.last_update_time = time;

                    if (this.is_on_last_frame()) {
                        finished_animation = this.animation;
                    } else {
                        this.elapsed_frame_count++;
                    }

                    this.material.map = get_lain_talk_animation_frame(
                        this.animation,
                        this.elapsed_frame_count
                    );
                }
                break;
            case LainTalkAnimationKind.None:
                // TODO: audio analyser
                // this.material.map = get_lain_talk_frame_for_rms(get_audio_analyser_rms());
                break;
        }

        return { finished_animation };
    }
}
