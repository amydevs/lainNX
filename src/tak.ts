import * as THREE from "three";
import { LainTalk, LainTalkAnimationKind } from "./lain";
import { CursorLocation, SiteScene } from "./site";
import { NodeData, set_node_as_viewed } from "./node";
import { SceneKind, SceneUpdateContext, SceneUpdateResult } from "./engine";
import { get_audio_media_file_path, get_track_path, MediaPlayer } from "./media_player";

export function update_tak_scene(tak: TaKScene, ctx: SceneUpdateContext): SceneUpdateResult {
    const { time_ctx, game_state, camera } = ctx;
    const { time } = time_ctx;
    const { progress } = game_state;

    const elapsed_percentage = tak.media_player.get_elapsed_percentage();

    if (elapsed_percentage === 100 && tak.lain.animation !== LainTalkAnimationKind.Outro) {
        tak.lain.set_animation(LainTalkAnimationKind.Outro, time);
    }

    const { finished_animation } = tak.lain.update(time);
    if (finished_animation !== null) {
        switch (finished_animation) {
            case LainTalkAnimationKind.Intro:
                tak.lain.unset_animation();
                tak.media_player.play().catch((err) => {
                    tak.lain.set_animation(LainTalkAnimationKind.Outro, time);
                    tak.media_player.log_error(err);
                });
                break;
            case LainTalkAnimationKind.Outro:
                tak.media_player.reset_and_pause();

                set_node_as_viewed(tak.node.id, game_state);

                return {
                    new_scene: new SiteScene(progress, tak.enter_location, time, camera),
                };
        }
    }

    return {};
}

export class TaKScene extends THREE.Scene {
    scene_kind: SceneKind.TaK;
    enter_location: CursorLocation;
    lain: LainTalk;
    media_player: MediaPlayer;
    node: NodeData;

    constructor(enter_location: CursorLocation, node: NodeData) {
        super();

        this.scene_kind = SceneKind.TaK;
        this.enter_location = enter_location;

        const track_path = get_track_path(node.name);
        this.media_player = new MediaPlayer(get_audio_media_file_path(node.media_file), track_path);

        this.lain = new LainTalk();
        this.lain.position.set(0.25, 1, -5);
        this.lain.set_scale_proportionally(22);

        this.node = node;

        this.add(this.lain);
    }
}
