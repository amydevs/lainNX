import { Key, play_audio, SceneKind, SceneUpdateContext, SceneUpdateResult, SFX } from "./engine";
import * as THREE from "three";
import {
    create_point_light,
    Group,
    Sprite3D,
    Sprite3DMaterialKind,
    Spritesheet3D,
    StaticSpritesheet3D,
    Vec3,
} from "./objects";
import { Texture } from "./textures";
import { euler, get_bounding_box, secs_to_ms, vec3 } from "./util";
import { Prompt, PromptAction } from "./prompt";
import { MatrixPosition2D, SiteScene } from "./site";
import { JapaneseText } from "./text";
import { GameState, get_current_location, has_valid_save_state, save_state } from "./save";
import { LoadingScene } from "./loading";
import { LoadStatusPopup, Status } from "./status-popup";

const ARROW_POS_Y_1 = -0.31;
const ARROW_POS_Y_2 = -0.34;

const AUTHORIZE_USER_INITIAL_POS = vec3(0, 0.2, 0);
const AUTHORIZE_USER_FINAL_POS = vec3(0.315, 0.425, 0);

const LOAD_DATA_INITIAL_POS = vec3(0, -0.2, 0);
const LOAD_DATA_FINAL_POS = vec3(-0.375, -0.35, 0);

enum BootMenuComponent {
    AuthorizeUser,
    LoadData,
}

enum BootSubmenu {
    Main,
    AuthorizeUser,
    LoadData,
}

const NAME_SELECTION_ROWS = 5;
const NAME_SELECTION_COLS = 13;

function get_name_selection_character_index(position: MatrixPosition2D): number {
    return position.row * NAME_SELECTION_COLS + position.col;
}

function get_name_selection_position(position: MatrixPosition2D, w: number, h: number): Vec3 {
    return vec3(position.col * -w + 6 * w, position.row * h - h * 2, 0);
}

const GLYPH_MATRIX = [
    ["ッ", "ャ", "ァ", "ワ", "ラ", "ヤ", "マ", "ハ", "ナ", "タ", "サ", "カ", "ア"],
    [null, null, "ィ", null, "リ", null, "ミ", "ヒ", "ニ", "チ", "シ", "キ", "イ"],
    ["゛", "ュ", "ｩ", null, "ル", "ユ", "ム", "フ", "ヌ", "ツ", "ス", "ク", "ウ"],
    ["゜", null, "ェ", null, "レ", null, "メ", "ヘ", "ネ", "テ", "セ", "ケ", "エ"],
    ["ー", "ョ", "ォ", "ン", "ロ", "ヨ", "モ", "ホ", "ノ", "ト", "ソ", "コ", "オ"],
];

class NameSelection extends Group {
    matrix_position: MatrixPosition2D;
    back_glyphs: Sprite3D;
    back_glyph_w: number;
    back_glyph_h: number;
    glyph_cover: StaticSpritesheet3D; // to cover the current glyph on 'back_glyphs'
    top_glyph_cover: StaticSpritesheet3D; // to cover the glyph above the current one on 'back_glyphs'
    front_glyph: StaticSpritesheet3D;
    start_to_finish_text: Sprite3D;
    orange_square: Sprite3D;
    entered_name: JapaneseText;

    constructor() {
        super({ visible: false, position: vec3(0, 0, -1) });

        this.matrix_position = { row: 1, col: 7 };

        this.back_glyphs = new Sprite3D(Texture.Authorize_Letters_Inactive, {
            scale_factor: 4.35,
            opacity: 0.6,
            depth_test: false,
            material_kind: Sprite3DMaterialKind.Standard,
        });

        const bbox = get_bounding_box(this.back_glyphs);
        const size = vec3();
        bbox.getSize(size);

        this.back_glyph_w = size.x / NAME_SELECTION_COLS;
        this.back_glyph_h = size.y / NAME_SELECTION_ROWS;

        this.back_glyphs.position.copy(
            get_name_selection_position(this.matrix_position, this.back_glyph_w, this.back_glyph_h)
        );

        const front_glyph_options = {
            scale_factor: 4.35,
            rows: NAME_SELECTION_ROWS,
            columns: NAME_SELECTION_COLS,
            frame_count: NAME_SELECTION_ROWS * NAME_SELECTION_COLS,
            depth_test: false,
        };

        this.glyph_cover = new StaticSpritesheet3D(Texture.Authorize_Letters_Active, {
            ...front_glyph_options,
            initial_frame: get_name_selection_character_index(this.matrix_position),
            scale_factor: 4.35,
            render_order: 998,
            color: 0,
        });

        this.top_glyph_cover = new StaticSpritesheet3D(Texture.Authorize_Letters_Active, {
            ...front_glyph_options,
            initial_frame: get_name_selection_character_index({
                row: this.matrix_position.row - 1,
                col: this.matrix_position.col,
            }),
            position: vec3(0.04, 0, 0.1),
            scale_factor: 4.35,
            render_order: 998,
            color: 0,
        });

        this.front_glyph = new StaticSpritesheet3D(Texture.Authorize_Letters_Active, {
            ...front_glyph_options,
            scale_factor: 8,
            initial_frame: get_name_selection_character_index(this.matrix_position),
            position: vec3(0.02, 0.01, 0.02),
            render_order: 999,
        });

        this.orange_square = new Sprite3D(Texture.Authorize_Orange_Square, {
            scale_factor: 4.35,
            depth_test: false,
            position: vec3(-0.11, -0.09, 0),
            render_order: 999,
        });

        this.entered_name = new JapaneseText(4.5, vec3(-0.185, -0.09, 0));

        this.start_to_finish_text = new Sprite3D(Texture.Authorize_Start_To_Finish, {
            scale_factor: 4.35,
            depth_test: false,
            position: vec3(0.28, 0.34, 0),
            render_order: 999,
            visible: false,
        });

        this.add(
            create_point_light({ position: vec3(0, 0.5, 0.5), intensity: 2, distance: 3 }),
            this.entered_name,
            new Group({
                position: vec3(0.1, 0, -0.3),
                rotation: euler(-0.9, 0, -0.4),
                children: [this.back_glyphs, this.front_glyph, this.top_glyph_cover, this.glyph_cover],
            }),
            new Sprite3D(Texture.Authorize_Glass_Underline, {
                scale_factor: 4.35,
                depth_test: false,
                position: vec3(-0.4, -0.136, 0),
                render_order: 999,
            }),
            new Sprite3D(Texture.Authorize_Glass, {
                scale_factor: 4.35,
                depth_test: false,
                position: vec3(0.075, -0.03, 0),
                render_order: 999,
            }),
            this.orange_square,
            new Sprite3D(Texture.Authorize_Header_Underline, {
                scale_factor: 4.35,
                depth_test: false,
                position: vec3(0.11, 0.38, 0),
                render_order: 999,
            }),
            this.start_to_finish_text
        );
    }

    update_glyphs(): void {
        this.back_glyphs.position.copy(
            get_name_selection_position(this.matrix_position, this.back_glyph_w, this.back_glyph_h)
        );

        const current_frame = get_name_selection_character_index(this.matrix_position);
        this.glyph_cover.set_frame(current_frame);
        this.front_glyph.set_frame(current_frame);

        if (this.matrix_position.row > 0) {
            const upper_glyph_matrix = { row: this.matrix_position.row - 1, col: this.matrix_position.col };
            this.top_glyph_cover.set_frame(get_name_selection_character_index(upper_glyph_matrix));
        }
    }

    move_left(): void {
        if (this.matrix_position.col === 0) {
            return;
        }

        const starting_col = this.matrix_position.col;
        let current_col = starting_col - 1;
        let character = this.get_character({ col: current_col, row: this.matrix_position.row });
        while (character === null && current_col > 0) {
            current_col--;
            character = this.get_character({ col: current_col, row: this.matrix_position.row });
        }

        if (character !== null) {
            this.matrix_position.col = current_col;
        } else {
            this.matrix_position.col = starting_col;
        }

        this.update_glyphs();
    }

    move_right(): void {
        if (this.matrix_position.col + 1 === NAME_SELECTION_COLS) {
            return;
        }

        const starting_col = this.matrix_position.col;
        let current_col = starting_col + 1;
        let character = this.get_character({ col: current_col, row: this.matrix_position.row });
        while (character === null && current_col < NAME_SELECTION_COLS) {
            current_col++;
            character = this.get_character({ col: current_col, row: this.matrix_position.row });
        }

        if (character !== null) {
            this.matrix_position.col = current_col;
        } else {
            this.matrix_position.col = starting_col;
        }

        this.update_glyphs();
    }

    move_up(): void {
        if (this.matrix_position.row === 0) {
            return;
        }

        const starting_row = this.matrix_position.row;
        let current_row = starting_row - 1;
        let character = this.get_character({ row: current_row, col: this.matrix_position.col });
        while (character === null && current_row > 0) {
            current_row--;
            character = this.get_character({ row: current_row, col: this.matrix_position.col });
        }

        if (character !== null) {
            this.matrix_position.row = current_row;
        } else {
            this.matrix_position.row = starting_row;
        }

        this.update_glyphs();
    }

    move_down(): void {
        if (this.matrix_position.row + 1 === NAME_SELECTION_ROWS) {
            return;
        }

        const starting_row = this.matrix_position.row;
        let current_row = starting_row + 1;
        let character = this.get_character({ row: current_row, col: this.matrix_position.col });
        while (character === null && current_row < NAME_SELECTION_ROWS) {
            current_row++;
            character = this.get_character({ row: current_row, col: this.matrix_position.col });
        }

        if (character !== null) {
            this.matrix_position.row = current_row;
        } else {
            this.matrix_position.row = starting_row;
        }

        this.update_glyphs();
    }

    get_character(position: MatrixPosition2D) {
        const { row, col } = position;
        const character = GLYPH_MATRIX[row][col];

        if (character === null) {
            return null;
        }

        return character;
    }

    try_push_current_character(): void {
        if (this.entered_name.get_length() === 8) {
            return;
        }

        const new_character = this.get_character(this.matrix_position);
        if (new_character === null) {
            return;
        }

        this.entered_name.append(new_character);

        const new_len = this.entered_name.get_length();

        if (new_len > 0) {
            this.start_to_finish_text.visible = true;
        }

        if (new_len === 8) {
            this.entered_name.shift_right();
            this.orange_square.visible = false;
        }
    }

    pop(): void {
        this.entered_name.pop();

        const new_len = this.entered_name.get_length();

        if (new_len === 7) {
            this.entered_name.shift_left();
            this.orange_square.visible = true;
        } else if (new_len === 0) {
            this.start_to_finish_text.visible = false;
        }
    }
}

export class BootScene extends THREE.Scene {
    scene_kind: SceneKind.Boot;
    accela: Spritesheet3D;
    accela_group: THREE.Group;
    accela_disappear_time: number;
    post_accela_group: THREE.Group;
    bottom_group: Group;
    square: Sprite3D;
    lof: Sprite3D;
    arrows: Sprite3D;
    status_texts: Spritesheet3D;
    authorize_user: Sprite3D;
    load_data: Sprite3D;
    bg_text_copies: [Sprite3D, Sprite3D];
    bg_text_pivot: THREE.Group;
    distorted_bg_text_copies: [Sprite3D, Sprite3D];
    distorted_bg_text_pivot: THREE.Group;
    active_menu_component: BootMenuComponent;
    status_text_animation_done: boolean;
    load_data_prompt: Prompt;
    name_selection: NameSelection;
    submenu: BootSubmenu;
    load_status_popup: LoadStatusPopup;
    load_data_underline: Sprite3D;

    constructor(creation_time: number) {
        super();

        this.scene_kind = SceneKind.Boot;

        this.accela_disappear_time = creation_time + secs_to_ms(1.5);
        this.accela = new Spritesheet3D(Texture.Login_Intro_Accela_Animation, {
            scale_factor: 5,
            position: vec3(0, 0.1, 0),
            frame_count: 29,
            rows: 3,
            columns: 10,
            frame_update_rate: secs_to_ms(1 / 60),
            loop: true,
        });

        this.accela_group = new Group({
            position: vec3(0, 0, -1),
            children: [
                this.accela,
                new Sprite3D(Texture.Make_Me_Sad, {
                    scale_factor: 4,
                    position: vec3(0, -0.1, 0),
                }),
            ],
        });

        this.square = new Sprite3D(Texture.Boot_Gray_Square, {
            scale_factor: 5,
            position: vec3(0, -0.25, 0),
            render_order: 2,
        });

        this.lof = new Sprite3D(Texture.Boot_Lof, {
            scale_factor: 4.5,
            position: vec3(0, 0, 0),
        });

        this.arrows = new Sprite3D(Texture.Boot_Arrows, {
            scale_factor: 5,
            position: vec3(0.16, ARROW_POS_Y_1, 0),
        });

        this.status_texts = new Spritesheet3D(Texture.Boot_Status_Texts, {
            position: vec3(0.4, -0.4, 0),
            scale_factor: 4.35,
            frame_count: 8,
            rows: 4,
            columns: 2,
            frame_update_rate: -1,
            loop: true,
        });

        this.active_menu_component = BootMenuComponent.AuthorizeUser;
        this.authorize_user = new Sprite3D(Texture.Authorize_User_Active, {
            visible: false,
            scale_factor: 4.2,
            position: AUTHORIZE_USER_INITIAL_POS,
            render_order: 999,
        });

        this.load_data = new Sprite3D(Texture.Load_Data_Inactive, {
            visible: false,
            scale_factor: 4.2,
            position: LOAD_DATA_INITIAL_POS,
            render_order: 999,
        });

        const bg_text_opacity = 0.5;
        const bg_text_scale = 4;

        this.bg_text_copies = [
            new Sprite3D(Texture.Boot_Bg_Text, {
                opacity: bg_text_opacity,
                scale_factor: bg_text_scale,
            }),
            new Sprite3D(Texture.Boot_Bg_Text, {
                opacity: bg_text_opacity,
                scale_factor: bg_text_scale,
            }),
        ];

        this.bg_text_pivot = new Group({
            visible: false,
            rotation: euler(0, 0, -0.1),
            position: vec3(-0.2, 0, 0),
            children: [...this.bg_text_copies],
        });

        const distorted_bg_text_scale = 5;

        this.distorted_bg_text_copies = [
            new Sprite3D(Texture.Boot_Bg_Text, {
                opacity: bg_text_opacity,
                scale_factor: distorted_bg_text_scale,
            }),

            new Sprite3D(Texture.Boot_Bg_Text, {
                opacity: bg_text_opacity,
                scale_factor: distorted_bg_text_scale,
            }),
        ];

        this.distorted_bg_text_copies.forEach((m) => (m.scale.x /= 2.5));

        this.distorted_bg_text_pivot = new Group({
            visible: false,
            rotation: euler(0, 0, 0.5),
            position: vec3(-0.2, 0, 0),
            children: [...this.distorted_bg_text_copies],
        });

        this.load_data_prompt = new Prompt(SceneKind.Boot);

        this.bottom_group = new Group({
            children: [
                this.arrows,
                this.status_texts,
                new Sprite3D(Texture.Boot_Purple_Square, {
                    scale_factor: 5,
                    position: vec3(0, -0.25, 0),
                }),
                new Sprite3D(Texture.Boot_Thing, {
                    scale_factor: 4.35,
                    position: vec3(0, -0.25, 0),
                }),
                new Sprite3D(Texture.Dango_Text, {
                    scale_factor: 4.35,
                    position: vec3(-0.4, -0.36, 0),
                }),
                new Sprite3D(Texture.Miso_Shio, {
                    scale_factor: 4.35,
                    position: vec3(0.3, -0.32, 0),
                }),
            ],
        });

        this.load_status_popup = new LoadStatusPopup(SceneKind.Boot);
        this.load_data_underline = new Sprite3D(Texture.Load_Data_Header_Underline, {
            scale_factor: 4.35,
            depth_test: false,
            position: vec3(-0.11, -0.39, 0),
            render_order: 999,
            visible: false,
        });

        this.post_accela_group = new Group({
            visible: false,
            position: vec3(0, 0, -1),
            children: [
                this.distorted_bg_text_pivot,
                this.bg_text_pivot,
                this.square,
                this.lof,
                this.bottom_group,
                this.authorize_user,
                this.load_data,
                this.load_data_prompt,
                this.load_status_popup,
                this.load_data_underline,
            ],
        });

        this.name_selection = new NameSelection();

        this.status_text_animation_done = false;

        this.submenu = BootSubmenu.Main;

        this.add(this.accela_group, this.post_accela_group, this.name_selection);
    }
}

function get_text_y_placement_below(text: Sprite3D) {
    const bbox = get_bounding_box(text);
    const h = bbox.max.y - bbox.min.y;

    const world_pos = vec3();
    text.getWorldPosition(world_pos);

    return world_pos.y - h;
}

function update_background_text_pair(
    pair: [Sprite3D, Sprite3D],
    swap_threshold: number,
    move_speed: number
): void {
    pair.forEach((mesh) => {
        mesh.position.y += move_speed;
    });

    const [top, bottom] = pair;

    if (top.position.y >= swap_threshold) {
        top.position.y = get_text_y_placement_below(bottom);
    }

    if (bottom.position.y >= swap_threshold) {
        bottom.position.y = get_text_y_placement_below(top);
    }
}

function update_initial_animation(boot: BootScene, time: number): void {
    if (boot.accela.visible) {
        boot.accela.update(time);

        if (time >= boot.accela_disappear_time) {
            boot.accela_group.visible = false;
            boot.post_accela_group.visible = true;
        }
    }

    if (boot.post_accela_group.visible) {
        if (boot.bottom_group.opacity >= 0) {
            if (time % 5 === 0 && Math.random() < 0.4) {
                if (boot.arrows.position.y === ARROW_POS_Y_1) {
                    boot.arrows.position.y = ARROW_POS_Y_2;
                } else {
                    boot.arrows.position.y = ARROW_POS_Y_1;
                }
            }

            const frame_delays = [900, 1200, 1500, 1600, 2100, 2400, 2500, 2800];
            if (boot.status_texts.current_frame < frame_delays.length - 1) {
                const delay = frame_delays[boot.status_texts.current_frame];
                if (time >= boot.accela_disappear_time + delay) {
                    boot.status_texts.set_next_frame(time);
                }
            } else {
                if (!boot.status_text_animation_done) {
                    boot.status_text_animation_done = true;
                    boot.authorize_user.visible = true;
                    boot.load_data.visible = true;
                    boot.bg_text_pivot.visible = true;
                    boot.distorted_bg_text_pivot.visible = true;
                    const [top_text, bottom_text] = boot.bg_text_copies;
                    top_text.position.y = -1.3;
                    bottom_text.position.y = get_text_y_placement_below(top_text);

                    const [top_distorted_text, bottom_distorted_text] = boot.distorted_bg_text_copies;
                    top_distorted_text.position.y = -2.3;
                    bottom_distorted_text.position.y = get_text_y_placement_below(top_distorted_text);

                    boot.square.add_position_animation(vec3(0, 0, 0), 0.5);
                    boot.lof.add_position_animation(vec3(0.4, 0.4, 0), 0.8);
                    boot.bottom_group.add_opacity_animation(0, 4);
                }
            }
        }
    }
}

function handle_keys(
    boot: BootScene,
    game_state: GameState,
    key_states: boolean[],
    camera: THREE.Camera,
    time: number
): SceneUpdateResult {
    if (
        !boot.status_text_animation_done ||
        boot.load_status_popup.visible ||
        boot.authorize_user.is_animating() ||
        boot.load_data.is_animating()
    ) {
        return {};
    }

    switch (boot.submenu) {
        case BootSubmenu.Main:
            if (key_states[Key.Up] && boot.active_menu_component !== BootMenuComponent.AuthorizeUser) {
                play_audio(SFX.SND_1);

                boot.active_menu_component = BootMenuComponent.AuthorizeUser;
                boot.authorize_user.set_texture(Texture.Authorize_User_Active);
                boot.load_data.set_texture(Texture.Load_Data_Inactive);
            } else if (key_states[Key.Down] && boot.active_menu_component !== BootMenuComponent.LoadData) {
                play_audio(SFX.SND_1);

                boot.active_menu_component = BootMenuComponent.LoadData;
                boot.load_data.set_texture(Texture.Load_Data_Active);
                boot.authorize_user.set_texture(Texture.Authorize_User_Inactive);
            } else if (key_states[Key.Circle]) {
                switch (boot.active_menu_component) {
                    case BootMenuComponent.AuthorizeUser:
                        play_audio(SFX.SND_0);

                        if (!boot.authorize_user.position.equals(AUTHORIZE_USER_INITIAL_POS)) {
                            break;
                        }

                        boot.name_selection.entered_name.set_text("");
                        boot.name_selection.start_to_finish_text.visible = false;
                        boot.authorize_user.set_texture(Texture.Authorize_Header);
                        boot.authorize_user.add_position_animation(AUTHORIZE_USER_FINAL_POS, 1, {
                            end_cb: () => {
                                boot.bg_text_pivot.visible = false;
                                boot.distorted_bg_text_pivot.visible = false;
                                boot.name_selection.visible = true;
                            },
                        });

                        boot.load_data.add_opacity_animation(0, 4);
                        boot.lof.add_opacity_animation(0, 4);
                        boot.square.add_opacity_animation(0, 4);

                        boot.submenu = BootSubmenu.AuthorizeUser;
                        break;
                    case BootMenuComponent.LoadData:
                        play_audio(SFX.SND_0);

                        if (!boot.load_data.position.equals(LOAD_DATA_INITIAL_POS)) {
                            break;
                        }

                        boot.load_data.set_texture(Texture.Load_Data_Header);
                        boot.load_data.add_position_animation(LOAD_DATA_FINAL_POS, 1, {
                            end_cb: () => {
                                boot.load_data_prompt.open();
                                boot.load_data_underline.visible = true;
                            },
                        });

                        boot.authorize_user.add_opacity_animation(0, 4);
                        boot.lof.add_opacity_animation(0, 4);
                        boot.square.add_opacity_animation(0, 4);

                        boot.submenu = BootSubmenu.LoadData;
                        break;
                }
            }
            break;
        case BootSubmenu.AuthorizeUser:
            if (boot.authorize_user.position.equals(AUTHORIZE_USER_FINAL_POS)) {
                if (key_states[Key.Cross]) {
                    play_audio(SFX.SND_29);

                    if (boot.name_selection.entered_name.get_length() > 0) {
                        boot.name_selection.pop();
                    } else {
                        boot.name_selection.visible = false;

                        boot.authorize_user.add_position_animation(AUTHORIZE_USER_INITIAL_POS, 1, {
                            end_cb: () => {
                                boot.authorize_user.set_texture(Texture.Authorize_User_Active);
                            },
                        });

                        boot.load_data.add_opacity_animation(1, 4);
                        boot.lof.add_opacity_animation(1, 4);
                        boot.square.add_opacity_animation(1, 4);

                        boot.bg_text_pivot.visible = true;
                        boot.distorted_bg_text_pivot.visible = true;

                        boot.submenu = BootSubmenu.Main;
                    }
                    break;
                } else if (key_states[Key.Left]) {
                    boot.name_selection.move_left();
                } else if (key_states[Key.Right]) {
                    boot.name_selection.move_right();
                } else if (key_states[Key.Up]) {
                    boot.name_selection.move_up();
                } else if (key_states[Key.Down]) {
                    boot.name_selection.move_down();
                } else if (key_states[Key.Circle]) {
                    play_audio(SFX.SND_0);
                    boot.name_selection.try_push_current_character();
                } else if (key_states[Key.Start]) {
                    if (boot.name_selection.entered_name.get_length() > 0) {
                        game_state.name = boot.name_selection.entered_name.get_str_value();

                        save_state(game_state);

                        return {
                            new_scene: new LoadingScene(
                                time,
                                (current_time: number) =>
                                    new SiteScene(
                                        game_state.progress,
                                        get_current_location(game_state),
                                        current_time,
                                        camera,
                                        { intro: true }
                                    )
                            ),
                        };
                    }
                }
                break;
            }
            break;
        case BootSubmenu.LoadData:
            switch (boot.load_data_prompt.handle_keys(key_states)) {
                case PromptAction.No:
                    boot.load_data_underline.visible = false;

                    boot.load_data.add_position_animation(LOAD_DATA_INITIAL_POS, 1, {
                        end_cb: () => {
                            boot.load_data.set_texture(Texture.Load_Data_Active);
                        },
                    });

                    boot.authorize_user.add_opacity_animation(1, 4);
                    boot.lof.add_opacity_animation(1, 4);
                    boot.square.add_opacity_animation(1, 4);

                    boot.submenu = BootSubmenu.Main;
                    break;
                case PromptAction.Yes:
                    if (has_valid_save_state()) {
                        boot.load_status_popup.succeed_load(time);
                    } else {
                        boot.load_status_popup.fail_load(time);
                    }
                    return {};
            }
            break;
    }

    return {};
}

export function update_boot_scene(boot: BootScene, ctx: SceneUpdateContext): SceneUpdateResult {
    const { time_ctx, key_states, game_state, camera } = ctx;
    const { time, delta } = time_ctx;

    const keys_result = handle_keys(boot, game_state, key_states, camera, time);
    if (keys_result.new_scene) {
        return keys_result;
    }

    boot.square.rotation.z -= delta * 5;

    if (!boot.status_text_animation_done) {
        update_initial_animation(boot, time);
        return {};
    }

    if (boot.load_status_popup.has_status_to_handle(time)) {
        switch (boot.load_status_popup.status) {
            case Status.LoadSuccess:
                return {
                    new_scene: new LoadingScene(
                        time,
                        (current_time: number) =>
                            new SiteScene(
                                game_state.progress,
                                get_current_location(game_state),
                                current_time,
                                camera,
                                { intro: true }
                            )
                    ),
                };
            case Status.LoadFail:
                boot.load_status_popup.close();
                break;
            case Status.None:
                boot.load_status_popup.close();
                break;
        }
    }

    update_background_text_pair(boot.bg_text_copies, 1.2, delta * 0.4);
    update_background_text_pair(boot.distorted_bg_text_copies, 1.2, delta * 0.8);

    boot.bottom_group.process_animation_queue(time_ctx);
    boot.square.process_animation_queue(time_ctx);
    boot.lof.process_animation_queue(time_ctx);
    boot.load_data.process_animation_queue(time_ctx);
    boot.authorize_user.process_animation_queue(time_ctx);

    return {};
}
