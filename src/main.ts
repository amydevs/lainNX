import { FsSaveDataType } from "@nx.js/constants";
import { engine_create, get_user_language, read_key_mappings, SceneKind } from "./engine";
import { check_if_legacy_save_and_upgrade } from "./save";
import { SiteScene } from "./site";

// nx setup stuff
Object.defineProperty(window, "HTMLAudioElement", {
    value: Audio,
    writable: false,
    configurable: false,
    enumerable: true,
});
for (const k of ["log", "warn", "info", "error", "debug"]) {
    Object.defineProperty(console, k, {
        value: console.debug.bind(console, `[${k.toUpperCase()}]`),
        enumerable: true,
        configurable: false,
        writable: false,
    });
}
console.debug(`Application: ${Switch.Application.self.id}`);
let profile = Switch.Profile.current;
while (profile == null) {
    profile = Switch.Profile.select();
}
Switch.Profile.current = profile;
console.debug(`${profile.nickname}: ${profile.uid[0]}.${profile.uid[1]}`);
const lastOpened = localStorage!.getItem("lastOpened");
const lastOpenedString = lastOpened ? new Date(Number(lastOpened)) : 'never';
console.debug(`App last opened: ${lastOpenedString}`);
localStorage!.setItem("lastOpened", Date.now().toString());

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

        engine.update(current_time, delta);

        last_time = current_time;
    }

    // window.addEventListener(
    //     "keydown",
    //     (event: KeyboardEvent) => {
    //         if (event.repeat || event.ctrlKey) {
    //             return;
    //         }

    //         const key = event.key.toLowerCase();
    //         if (key in engine.key_mappings) {
    //             const psx_key = engine.key_mappings[key];
    //             engine.key_states[psx_key] = true;
    //         }

    //         engine.pressed_keys.add(event.key);
    //     },
    //     false
    // );

    // window.addEventListener(
    //     "keyup",
    //     (event: KeyboardEvent) => {
    //         const key = event.key.toLowerCase();
    //         if (key in engine.key_mappings) {
    //             const psx_key = engine.key_mappings[key];
    //             engine.key_states[psx_key] = false;
    //         }

    //         engine.pressed_keys.delete(event.key);
    //     },
    //     false
    // );

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
