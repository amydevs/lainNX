import { FsSaveDataType } from "@nx.js/constants";
import { type Engine, engine_create, get_user_language, read_key_mappings, SceneKind } from "./engine";
import { check_if_legacy_save_and_upgrade } from "./save";
import { SiteScene } from "./site";

// nx setup stuff
// polyfill for three.js audio stuff
Object.defineProperty(window, "HTMLAudioElement", {
    value: Audio,
    writable: false,
    configurable: false,
    enumerable: true,
});
// polyfill for console methods
for (const k of ["log", "warn", "info", "error", "debug"]) {
    Object.defineProperty(console, k, {
        value: console.debug.bind(console, `[${k.toUpperCase()}]`),
        enumerable: true,
        configurable: false,
        writable: false,
    });
}
// save file initialization
console.debug(`Application: ${Switch.Application.self.id}`);
let profile = Switch.Profile.current;
while (profile == null) {
    profile = Switch.Profile.select();
}
Switch.Profile.current = profile;
console.debug(`${profile.nickname}: ${profile.uid[0]}.${profile.uid[1]}`);
// control handling
function update_controls(engine: Engine) {
    const pads = navigator.getGamepads();
    const player_one = pads[0];
    if (player_one) {
        // Handle gamepad controls
        for (const [i, button] of player_one.buttons.entries()) {
            const i_str = i.toString();
            const is_repeat_pressed = engine.pressed_keys.has(i_str);
            if (!is_repeat_pressed && button.pressed) {
                engine.pressed_keys.add(i_str);
            }
            else if (is_repeat_pressed && !button.pressed) {
                engine.pressed_keys.delete(i_str);
            }
            const psx_key = engine.key_mappings[i];
            if (psx_key != null && !is_repeat_pressed && button.pressed) {
                engine.key_states[psx_key] = true;
            }
        }
    }
}
window.addEventListener("beforeunload", (event) => {
    event.preventDefault();
});

(async () => {
    check_if_legacy_save_and_upgrade();

    let is_page_visible = true;
    let animation_id: number;
    let last_time = 0;
    let pause_time = 0;
    let time_paused = 0;

    const engine = await engine_create();

    function animate(): void {
        if (!is_page_visible) {
            return;
        }

        animation_id = requestAnimationFrame(animate);

        const current_time = performance.now() - time_paused;

        if (last_time === 0) {
            last_time = current_time;
        }

        const delta = (current_time - last_time) / 1000;

        update_controls(engine);
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
