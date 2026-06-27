import {
    get_texture,
    Key,
    play_audio,
    SceneKind,
    SceneUpdateContext,
    SceneUpdateResult,
    SFX,
} from "./engine";
import * as THREE from "three";
import { Texture } from "./textures";
import { animate_light_intensity, create_point_light, Group, Mesh, Sprite3D, Spritesheet3D } from "./objects";
import { LainTalk, LainTalkAnimationKind } from "./lain";
import {
    get_audio_media_file_path,
    get_track_path,
    get_video_mesh,
    get_voice_syllable_path,
    MediaPlayer,
} from "./media_player";
import voice_json from "./static/json/voice.json";
import { are_colors_equal, random_between, vec3 } from "./util";
import { BootScene } from "./boot";
import { SiteKind } from "./site";
import { get_current_location, save_state } from "./save";
import { ChangeSiteScene } from "./change_site";

function get_syllable_filenames(player_name: string): string[] {
    const { translation_table, vowels, voice_file_list } = voice_json;
    // convert name from katakana to romaji
    Object.entries(translation_table).forEach(([romaji, katakana]) => {
        const regex = new RegExp(katakana, "g");
        player_name = player_name.replace(regex, romaji);
    });

    let current_vowel = "";
    let filenames = [];
    let current_syllable = "";

    for (let i = 0; i < player_name.length; ) {
        let filename = "";
        // current character is a vowel
        if (vowels.includes(player_name[i])) {
            // long vowel
            if (player_name[i] === "-") {
                filename = `${current_vowel}_${current_vowel}`;
            }
            // two vowels in a row
            else if (current_vowel !== "") {
                filename = `${current_vowel}_${player_name[i]}`;
                // if double vowel sound does not exist fall back to single vowel
                if (!voice_file_list.includes(filename)) filename = `${player_name[i]}`;
            }
            // single vowel
            else filename = `${player_name[i]}`;
            current_vowel = player_name[i];
            i += 1;
        } else {
            // 2 character long syllable by default
            current_syllable = player_name.slice(i, i + 2);

            if (current_syllable[1] === "Y" || current_syllable[1] === "H") {
                // 3 character long syllable
                current_syllable = player_name.slice(i, i + 3);
                i += 1;
            }

            i += 2;

            if (current_vowel === "") filename = `${current_syllable}`;
            else {
                filename = `${current_vowel}_${current_syllable}`;

                if (!voice_file_list.includes(filename)) filename = `${current_syllable}`;
            }

            if (current_syllable[1] === "Y" || current_syllable[1] === "H")
                current_vowel = current_syllable[2];
            else current_vowel = current_syllable[1];
        }

        // convert filename to katakana
        filenames.push(
            filename
                .split("_")
                .map((c) => translation_table[c as keyof typeof translation_table])
                .join("_")
        );
    }

    return filenames;
}

enum ColorAnimation {
    None,
    Darkening,
    Lightening,
}

function get_lain_visibility_change_interval(): number {
    return random_between(5 * 1000, 30 * 1000);
}

class SelectionLain extends Sprite3D {
    last_visibility_change_time: number;
    next_visibility_change_interval: number;
    color_animation: ColorAnimation;

    constructor(time: number) {
        super(Texture.End_Middle_Lain, {
            scale_factor: 5,
            render_order: 999,
            position: vec3(0, 0, 0),
            opacity: 0.5,
        });
        this.last_visibility_change_time = time;
        this.next_visibility_change_interval = get_lain_visibility_change_interval();
        this.color_animation = ColorAnimation.None;
    }

    update(time: number) {
        if (this.visible) {
            switch (this.color_animation) {
                case ColorAnimation.Darkening:
                    {
                        const target_color = new THREE.Color(0, 0, 0);
                        this.material.color.lerp(target_color, 0.05);

                        if (are_colors_equal(this.material.color, target_color)) {
                            this.visible = false;
                            this.color_animation = ColorAnimation.None;
                            this.last_visibility_change_time = time;
                            this.next_visibility_change_interval = get_lain_visibility_change_interval();
                        }
                    }
                    break;
                case ColorAnimation.Lightening:
                    {
                        const target_color = new THREE.Color(1, 1, 1);
                        this.material.color.lerp(target_color, 0.05);

                        if (are_colors_equal(this.material.color, target_color)) {
                            this.color_animation = ColorAnimation.None;
                            this.last_visibility_change_time = time;
                            this.next_visibility_change_interval = get_lain_visibility_change_interval();
                        }
                    }
                    break;
                case ColorAnimation.None:
                    {
                        if (time >= this.last_visibility_change_time + this.next_visibility_change_interval) {
                            this.color_animation = ColorAnimation.Darkening;
                        }
                    }
                    break;
            }
        } else {
            if (time >= this.last_visibility_change_time + this.next_visibility_change_interval) {
                this.color_animation = ColorAnimation.Lightening;
                this.visible = true;
            }
        }
    }
}

enum EndOption {
    End,
    Continue,
}

const CIRCLE_TOP_Y = 0.13;
const CIRCLE_BOT_Y = -0.21;

class Selection extends Group {
    middle_spritesheets: Spritesheet3D[];
    middle_box: Mesh;
    lain: SelectionLain;
    circle: Spritesheet3D;
    selected_option: EndOption;

    constructor(time: number) {
        super({ position: vec3(0, 0, -1) });

        this.middle_spritesheets = [];

        const rows = 4;
        const columns = 5;
        for (let i = 0; i < 9; i++) {
            this.middle_spritesheets.push(
                new Spritesheet3D(Texture.End_Middle_Spritesheet, {
                    scale_factor: 5,
                    loop: true,
                    position: vec3(-0.61 + i / 6.3, 0, 0),
                    rows,
                    columns,
                    frame_count: columns * rows,
                    frame_update_rate: 24,
                })
            );
        }

        this.lain = new SelectionLain(time);

        const box_scale = 0.04;
        this.middle_box = new Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: 0 }), {
            position: vec3(0, 0, 0),
            scale: vec3(box_scale, box_scale, 1),
        });

        this.selected_option = EndOption.End;

        this.circle = new Spritesheet3D(Texture.End_Circle_Animation, {
            scale_factor: 4,
            loop: true,
            position: vec3(0, CIRCLE_TOP_Y, 0),
            rows: 2,
            columns: 4,
            frame_count: 12,
            frame_update_rate: 24,
        });

        this.add(
            new Sprite3D(Texture.End_End_Text, {
                scale_factor: 4,
                position: vec3(0, 0.2, 0),
            }),
            new Sprite3D(Texture.End_Continue_Text, {
                scale_factor: 4,
                position: vec3(0, -0.15, 0),
            }),
            this.middle_box,
            this.lain,
            ...this.middle_spritesheets,
            this.circle
        );
    }

    update(time: number, delta: number) {
        this.middle_spritesheets.forEach((sprite) => sprite.update(time));
        this.middle_box.rotation.z -= delta / 4;
        this.lain.update(time);
        this.circle.update(time);
    }
}

export class EndScene extends THREE.Scene {
    scene_kind: SceneKind.End;
    blue_sphere: Mesh;
    cyan_spheres: Mesh[];
    spheres_shrinking: boolean;
    lain: LainTalk;
    media_player: MediaPlayer;
    syllables: string[];
    current_syllable_index: number;
    selection: Selection;
    media_load_failed: boolean;
    back_light: THREE.PointLight;

    constructor(player_name: string, time: number) {
        super();

        this.scene_kind = SceneKind.End;

        const blue_sphere_radius = 1;

        const blue_sphere_geom = new THREE.SphereGeometry(
            blue_sphere_radius,
            12,
            4,
            0,
            Math.PI * 2,
            Math.PI * 0.25,
            Math.PI * 0.5
        );

        const uv = blue_sphere_geom.attributes.uv;
        for (let i = 0; i < uv.count; i++) {
            let u = uv.getX(i);
            let v = uv.getY(i);

            const y = blue_sphere_geom.attributes.position.getY(i);
            v = (y + blue_sphere_radius) / (2 * blue_sphere_radius);

            uv.setXY(i, u, v);
        }

        this.blue_sphere = new Mesh(
            blue_sphere_geom,
            new THREE.MeshStandardMaterial({
                map: get_texture(Texture.End_Cylinder_Blue),
                transparent: true,
                side: THREE.DoubleSide,
            }),
            { position: vec3(0, 0, -1.5), render_order: 1 }
        );

        const cyan_sphere_geometry = new THREE.SphereGeometry(
            1,
            12,
            4,
            0,
            Math.PI * 2,
            Math.PI * 0.1,
            Math.PI * 0.8
        );

        const cyan_sphere_material = new THREE.MeshBasicMaterial({
            map: get_texture(Texture.End_Cylinder_2),
            transparent: true,
            side: THREE.DoubleSide,
        });

        this.cyan_spheres = [
            new Mesh(cyan_sphere_geometry, cyan_sphere_material, {
                position: vec3(0.2, 0.3, -0.8),
                scale: vec3(0.1, 0.1, 0.1),
            }),
            new Mesh(cyan_sphere_geometry, cyan_sphere_material, {
                position: vec3(-0.2, 0.3, -0.8),
                scale: vec3(0.15, 0.15, 0.15),
            }),
            new Mesh(cyan_sphere_geometry, cyan_sphere_material, {
                position: vec3(-0.25, -0.2, -0.74),
                scale: vec3(0.13, 0.13, 0.13),
            }),
            new Mesh(cyan_sphere_geometry, cyan_sphere_material, {
                position: vec3(0.25, -0.15, -0.7),
                scale: vec3(0.11, 0.11, 0.11),
            }),
        ];

        this.lain = new LainTalk();
        this.lain.position.set(0.25, 1, -5);
        this.lain.set_scale_proportionally(22);

        this.selection = new Selection(time);
        this.selection.visible = false;

        this.media_player = new MediaPlayer();

        this.syllables = get_syllable_filenames(player_name);
        this.current_syllable_index = 0;

        this.spheres_shrinking = false;

        this.media_load_failed = false;

        this.back_light = create_point_light({ intensity: 0.8, position: vec3(0, 0, -2) });
        this.add(
            ...this.cyan_spheres,
            this.blue_sphere,
            this.lain,
            create_point_light({ intensity: 8, position: vec3(0, 0, 1) }),
            this.back_light,
            this.selection,
            get_video_mesh()
        );
    }
}

export function update_end_scene(end: EndScene, ctx: SceneUpdateContext): SceneUpdateResult {
    const { time_ctx, key_states, game_state } = ctx;
    const { delta, time } = time_ctx;

    if (end.selection.visible) {
        if (key_states[Key.Circle]) {
            switch (end.selection.selected_option) {
                case EndOption.End:
                    play_audio(SFX.SND_0);
                    return { new_scene: new BootScene(time) };
                case EndOption.Continue:
                    game_state.site = game_state.site === SiteKind.A ? SiteKind.B : SiteKind.A;

                    save_state(game_state);

                    return {
                        new_scene: new ChangeSiteScene(time_ctx.time, get_current_location(game_state)),
                    };
            }
        } else if (key_states[Key.Up] && end.selection.selected_option !== EndOption.End) {
            play_audio(SFX.SND_1);
            end.selection.selected_option = EndOption.End;
            end.selection.circle.position.y = CIRCLE_TOP_Y;
        } else if (key_states[Key.Down] && end.selection.selected_option !== EndOption.Continue) {
            play_audio(SFX.SND_1);
            end.selection.selected_option = EndOption.Continue;
            end.selection.circle.position.y = CIRCLE_BOT_Y;
        }
    }

    const rotation_speed = delta * 0.4;

    end.blue_sphere.rotation.y -= rotation_speed;
    end.cyan_spheres.forEach((sphere) => (sphere.rotation.y += rotation_speed));

    const { finished_animation } = end.lain.update(time);
    if (finished_animation !== null) {
        switch (finished_animation) {
            case LainTalkAnimationKind.Intro:
                end.lain.unset_animation();
                end.media_player.load(get_audio_media_file_path("LAIN21.XA[31]"), get_track_path("Xa0001"));
                end.media_player.play().catch((err) => {
                    end.media_load_failed = true;
                    end.media_player.log_error(err);
                });
                break;
            case LainTalkAnimationKind.Outro:
                if (!end.spheres_shrinking) {
                    end.spheres_shrinking = true;
                }
                break;
        }
    }

    if (end.spheres_shrinking) {
        end.blue_sphere.rotation.y -= rotation_speed * 2;

        let all_cyan_spheres_gone = true;
        end.cyan_spheres.forEach((sphere) => {
            sphere.rotation.y += rotation_speed;
            const cyan_sphere_gone = sphere.scale_towards(vec3(0, 0, 0), delta / 2);
            if (!cyan_sphere_gone) {
                all_cyan_spheres_gone = false;
            }
        });

        if (all_cyan_spheres_gone) {
            animate_light_intensity(end.back_light, 0, delta * 2);

            const blue_sphere_gone = end.blue_sphere.scale_towards(vec3(0, 0, 0), delta);
            if (blue_sphere_gone) {
                end.selection.visible = true;
            }
        }
    }

    if (
        end.media_load_failed ||
        (end.media_player.get_elapsed_percentage() === 100 &&
            end.lain.animation === LainTalkAnimationKind.None)
    ) {
        end.media_load_failed = false;

        if (end.current_syllable_index >= end.syllables.length) {
            end.lain.set_animation(LainTalkAnimationKind.Outro, time);
            end.media_player.load(get_audio_media_file_path("LAIN21.XA[16]"));
            end.media_player.play().catch((err) => {
                // we don't set the media_load_failed flag here since it would lead to an infinite loop (this is the last media that's played)
                end.media_player.log_error(err);
            });
        } else {
            end.media_player.load(get_voice_syllable_path(end.syllables[end.current_syllable_index]));
            end.media_player.play().catch((err) => {
                end.media_player.log_error(err);
                end.media_load_failed = true;
            });

            end.current_syllable_index++;
        }
    }

    if (end.selection.visible) {
        end.selection.update(time, delta);
    }

    return {};
}
