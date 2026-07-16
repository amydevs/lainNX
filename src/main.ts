import { engine_create } from "./engine";
import { check_if_legacy_save_and_upgrade } from "./save";
import { Button } from "@nx.js/constants";

(async () => {
    // due to nx.js 1.0.0-beta.6, init needs to happen in a separate import for whatever reason
    await import("./init").then((e) => e.init());
    console.log("loading engine...");

    check_if_legacy_save_and_upgrade();

    let is_page_visible = true;
    // let animation_id: number;
    let last_time = 0;
    // let pause_time = 0;
    let time_paused = 0;

    const engine = await engine_create();

    const axis_deadzone = 0.25;
    const axis_map: Record<number, { positive: Button; negative: Button }> = {
        0: {
            positive: Button.Right,
            negative: Button.Left,
        },
        1: {
            positive: Button.Down,
            negative: Button.Up,
        },
    };
    function update_controls() {
        const pads = navigator.getGamepads();
        const player_one = pads[0];
        if (player_one) {
            const buttons_pressed_arr = player_one.buttons.map((button) => button.pressed);
            // handle axis
            for (const [i, axis] of player_one.axes.entries()) {
                const axis_map_value = axis_map[i];
                if (axis_map_value != null) {
                    if (axis > axis_deadzone) {
                        buttons_pressed_arr[axis_map_value.positive] = true;
                    } else if (axis < -1 * axis_deadzone) {
                        buttons_pressed_arr[axis_map_value.negative] = true;
                    }
                }
            }
            // handle button presses
            for (const [i, pressed] of buttons_pressed_arr.entries()) {
                const i_str = i.toString();
                const is_repeat_pressed = engine.pressed_keys.has(i_str);
                if (!is_repeat_pressed && pressed) {
                    engine.pressed_keys.add(i_str);
                } else if (is_repeat_pressed && !pressed) {
                    engine.pressed_keys.delete(i_str);
                }
                const psx_key = engine.key_mappings[i_str];
                if (psx_key != null && !is_repeat_pressed && pressed) {
                    engine.key_states[psx_key] = true;
                }
            }
        }
    }

    function animate(): void {
        if (!is_page_visible) {
            return;
        }

        // TODO: emote wheel
        // animation_id = requestAnimationFrame(animate);
        requestAnimationFrame(animate);

        const current_time = performance.now() - time_paused;

        if (last_time === 0) {
            last_time = current_time;
        }

        const delta = (current_time - last_time) / 1000;

        update_controls();
        engine.update(current_time, delta);

        last_time = current_time;
    }

    // window.addEventListener("updatekeybindings", (_: Event) => {
    //     engine.key_mappings = read_key_mappings();
    // });

    // window.addEventListener("updatelanguage", (_: Event) => {
    //     const track_el = document.getElementById("track") as HTMLTrackElement;
    //     if (track_el && track_el.src) {
    //         track_el.src = track_el.src.replace(/webvtt\/.*?\//, `webvtt/${get_user_language().code}/`);
    //     }
    // });

    // window.addEventListener("opensettings", (_: Event) => {
    //     if (engine.scene?.scene_kind === SceneKind.Site) {
    //         engine.scene.is_settings_modal_open = true;
    //     }
    // });

    // window.addEventListener("closesettings", (_: Event) => {
    //     if (engine.scene?.scene_kind === SceneKind.Site) {
    //         engine.scene.events.push({
    //             apply: (site: SiteScene, time: number) => {
    //                 site.last_keypress_time = time;
    //                 site.last_idle_animation_play_time = -1;
    //                 site.is_settings_modal_open = false;
    //             },
    //             apply_time: -1,
    //         });
    //     }
    // });

    // window.addEventListener("doidle", (e: any) => {
    //     if (engine.scene?.scene_kind === SceneKind.Site) {
    //         engine.scene.events.push({
    //             apply: (site: SiteScene, time: number) => {
    //                 if (site.lain.is_standing()) {
    //                     site.lain.set_animation(e.detail.id, time);
    //                     site.last_keypress_time = time;
    //                     site.last_idle_animation_play_time = time;
    //                 }
    //             },
    //             apply_time: -1,
    //         });
    //     }
    // });

    // document.addEventListener("visibilitychange", () => {
    //     if (document.visibilityState === "visible") {
    //         is_page_visible = true;

    //         if (pause_time > 0) {
    //             const current_time = performance.now();
    //             time_paused += current_time - pause_time;
    //             last_time = current_time - time_paused;
    //         }

    //         if (!animation_id) {
    //             animate();
    //         }
    //     } else {
    //         is_page_visible = false;
    //         pause_time = performance.now();

    //         if (animation_id) {
    //             cancelAnimationFrame(animation_id);
    //             animation_id = 0;
    //         }
    //     }
    // });

    animate();
})();
