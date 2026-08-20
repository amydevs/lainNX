import * as THREE from "three";
import site_a_json from "./static/json/site_a.json";
import site_b_json from "./static/json/site_b.json";
import frag_gray_ring from "./static/shaders/gray_ring.frag?raw";
import vert_gray_ring from "./static/shaders/gray_ring.vert?raw";
import frag_purple_ring from "./static/shaders/purple_ring.frag?raw";
import vert_purple_ring from "./static/shaders/purple_ring.vert?raw";
import vert_middle_ring from "./static/shaders/middle_ring.vert?raw";
import frag_middle_ring from "./static/shaders/middle_ring.frag?raw";
import frag_star from "./static/shaders/star.frag?raw";
import vert_star from "./static/shaders/star.vert?raw";
import frag_orb from "./static/shaders/orb.frag?raw";
import vert_orb from "./static/shaders/orb.vert?raw";
import frag_crystal from "./static/shaders/crystal.frag?raw";
import vert_crystal from "./static/shaders/crystal.vert?raw";
import {
    Key,
    ModelKind,
    TimeContext,
    get_texture_atlas,
    get_texture,
    SceneUpdateResult,
    SceneUpdateContext,
    play_audio,
    SceneKind,
    SceneEvent,
    process_scene_events,
    SFX,
    pause_audio,
} from "./engine";
import {
    Node,
    NodeMesh,
    NodeData,
    create_node_mesh,
    find_next_node,
    get_node,
    is_node_visible,
    get_node_name,
    find_first_node_on_level,
    NodeKind,
    get_node_display_text,
    get_node_throw_animations,
    get_node_rip_animations,
    get_node_segment_matrix,
    get_node_explode_animations,
    get_node_knock_and_fall_animations,
    reset_node,
    get_node_knock_animations,
    NodeRip,
    update_node_bias_uniform,
    is_node_viewed,
    WordSearchResult,
    activate_node,
    deactivate_node,
    move_horizontal_and_find_next_node,
    get_formatted_protocol_lines,
    NodeExplode,
} from "./node";
import { Lain, LainAnimationKind } from "./lain";
import {
    random_from,
    split_digits,
    vec3,
    euler,
    random_between,
    secs_to_ms,
    any_key_pressed,
    get_height,
    deep_clone,
    create_LCG,
} from "./util";
import { LevelSelector } from "./level_selector";
import { BigFontColors, BigFontText, MediumFontText } from "./text";
import {
    animate_light_intensity,
    animate_number_towards,
    animate_object_position,
    animate_object_x_rotation,
    AnimationProperty,
    Animations,
    create_point_light,
    Euler,
    GLBModel,
    Group,
    Mesh,
    PositionYAnimation,
    ShaderUniformAnimation,
    Sprite2D,
    Sprite3D,
    Vec3,
} from "./objects";
import { PauseMenu, PauseMenuItem, PauseMenuMode } from "./pause";
import { Texture } from "./textures";
import { SSknScene } from "./sskn";
import { MediaScene } from "./media";
import { PromptAction } from "./prompt";
import { IdleScene } from "./idle";
import { GateScene } from "./gate";
import { GameState, get_current_location, Progress, save_state } from "./save";
import { get_polytan_part_from_node_name, PolytanPart, PolytanScene } from "./polytan";
import { ChangeSiteScene } from "./change_site";
import { TaKScene } from "./tak";
import { LoadingScene } from "./loading";
import { Status, LoadStatusPopup as StatusPopup } from "./status-popup";

const COLORS = THREE.Color.NAMES;

export type CursorLocation = {
    node_matrix_position: MatrixPosition2D;
    level: number;
    site_segment: number;
    site_kind: SiteKind;
};

export type MatrixPosition2D = {
    row: number;
    col: number;
};

type Nullable<T> = T | null;

export type ActiveNode = {
    data: NodeData;
    mesh: NodeMesh;
};

const DESCRIPTOR_POS_Z = -5;
const SITE_Z = -3.2;

export type SiteRow<T> = [
    Nullable<T>,
    Nullable<T>,
    Nullable<T>,
    Nullable<T>,
    Nullable<T>,
    Nullable<T>,
    Nullable<T>,
    Nullable<T>
];
export type SiteLevel<T> = [SiteRow<T>, SiteRow<T>, SiteRow<T>];
export type SiteLayout<T = Node> = SiteLevel<T>[];

export const SITE_A_NODES = site_a_json as SiteLayout<NodeData>;
export const SITE_B_NODES = site_b_json as SiteLayout<NodeData>;

export type NodeSegmentMatrixRow<T> = [Nullable<T>, Nullable<T>, Nullable<T>, Nullable<T>];
export type NodeSegmentMatrix<T> = [
    NodeSegmentMatrixRow<T>,
    NodeSegmentMatrixRow<T>,
    NodeSegmentMatrixRow<T>
];

const MIDDLE_RING_POS_Y = -0.14;
const MIDDLE_RING_POS_Z = -2.6;

const LEVEL_HEIGHT = 1.5;

export enum SiteKind {
    A = "a",
    B = "b",
}

export enum Direction {
    Up,
    Down,
    Left,
    Right,
}

export function get_level_y(level: number): number {
    return LEVEL_HEIGHT * -3 + level * LEVEL_HEIGHT;
}

export function get_level_count(site: SiteKind): number {
    switch (site) {
        case SiteKind.A:
            return 22;
        case SiteKind.B:
            return 13;
    }
}

function get_node_name_position(node_matrix_position: MatrixPosition2D): Vec3 {
    let y = 0;
    let x = 0;

    const { col, row } = node_matrix_position;
    switch (row) {
        case 0:
            y = 0.71;
            break;
        case 1:
            y = -0.14;
            break;
        case 2:
            y = -1;
            break;
    }

    switch (col) {
        case 0:
            x = -1;
            break;
        case 1:
            x = -0.43;

            switch (row) {
                case 0:
                    y -= 0.45;
                    break;
                case 2:
                    y += 0.46;
                    break;
            }

            break;
        case 2:
            x = 0.73;

            switch (row) {
                case 0:
                    y -= 0.45;
                    break;
                case 2:
                    y += 0.46;
                    break;
            }

            break;
        case 3:
            x = 1.28;
            break;
    }

    return vec3(x, y, DESCRIPTOR_POS_Z);
}

function calculate_jump_speed(current_level: number, target_level: number): number {
    const levels_to_travel = Math.abs(target_level - current_level);

    let speed_for_one_level = 0;
    if (target_level < current_level) {
        speed_for_one_level = 1.1;
    } else {
        speed_for_one_level = 1.8;
    }

    return levels_to_travel * speed_for_one_level;
}

function calculate_rotation_speed(current_rotation: number, target_rotation: number): number {
    let angle_diff = Math.abs(target_rotation - current_rotation);
    if (angle_diff > Math.PI) {
        angle_diff = 2 * Math.PI - angle_diff;
    }

    const segments_to_travel = Math.max(1, angle_diff / (Math.PI / 4));

    const speed_for_one_segment = 0.4;

    return speed_for_one_segment * segments_to_travel;
}

function create_site_layout(site_kind: SiteKind, progress: Progress): SiteLayout {
    const nodes = site_kind === SiteKind.A ? SITE_A_NODES : SITE_B_NODES;

    return nodes.map((level) =>
        level.map((row) =>
            row.map((node_data) => {
                if (node_data === null || !is_node_visible(node_data, progress)) {
                    return null;
                } else {
                    return {
                        ...node_data,
                        mesh: create_node_mesh(node_data, is_node_viewed(node_data.id, progress)),
                    };
                }
            })
        )
    );
}

const FULL_CIRCLE = Math.PI * 2;

export function get_rotation_for_site_segment(segment: number, prev_rotation?: number): Euler {
    const rotation = (Math.PI / 4) * segment - (Math.PI / 8) * 5;

    if (prev_rotation !== undefined) {
        // circle count
        const cc = Math.floor(prev_rotation / FULL_CIRCLE);

        // original angle
        const o = rotation + cc * FULL_CIRCLE;
        // positive coterminal angle
        const pc = rotation + FULL_CIRCLE + cc * FULL_CIRCLE;
        // negative coterminal
        const nc = rotation - FULL_CIRCLE - cc * FULL_CIRCLE;

        // distance from originally calculated value
        const od = Math.abs(o - prev_rotation);
        // distance from positive coterminal
        const pcd = Math.abs(pc - prev_rotation);
        // distance from negative
        const ncd = Math.abs(nc - prev_rotation);

        switch (Math.min(od, pcd, ncd)) {
            case od:
                return euler(0, o, 0);
            case pcd:
                return euler(0, pc, 0);
            case ncd:
                return euler(0, nc, 0);
        }
    }

    return euler(0, rotation, 0);
}

const MIDDLE_RING_BACK_Z = -0.15;
const MIDDLE_RING_BACK_SCALE = vec3(1, 1, 1);

const MIDDLE_RING_FRONT_Z = -0.1;
const MIDDLE_RING_FRONT_SCALE = vec3(0.99, 0.99, 0.99);

// stacking transparent objects are awful to deal with.
// we're dealing with that situation here - our middle ring is transparent, so is lain.
// simply making this ring one mesh and placing lain in the middle of it leads to visual bugs.
// the workaround to these visual bugs in our case is to split the ring into two parts.
class MiddleRing extends Group {
    front_side: Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
    back_side: Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
    spinning: boolean;
    is_locked: boolean;

    constructor() {
        const texture = get_texture(Texture.Middle_Ring);

        const make_ring_material = (side: THREE.Side) =>
            new THREE.ShaderMaterial({
                uniforms: THREE.UniformsUtils.merge([
                    THREE.UniformsLib.lights,
                    {
                        atlas: { value: get_texture_atlas() },
                        tex_repeat: { value: texture.repeat },
                        tex_offset: { value: texture.offset },
                        time: { value: 1 },
                        wobble_amplifier: { value: 0 },
                        noise_amplifier: { value: 0.03 },
                        gap_size: { value: 0.0 },
                    },
                ]),
                vertexShader: vert_middle_ring,
                fragmentShader: frag_middle_ring,
                side,
                transparent: true,
                lights: true,
            });

        const make_ring_geometry = () => new THREE.CylinderGeometry(0.75, 0.75, 0.033, 64, 64, true);

        const front_side = new Mesh(make_ring_geometry(), make_ring_material(THREE.FrontSide), {
            position: vec3(0, MIDDLE_RING_POS_Y, MIDDLE_RING_FRONT_Z),
            scale: MIDDLE_RING_FRONT_SCALE,
        });

        const back_side = new Mesh(make_ring_geometry(), make_ring_material(THREE.BackSide), {
            position: vec3(0, MIDDLE_RING_POS_Y, MIDDLE_RING_BACK_Z),
            scale: MIDDLE_RING_BACK_SCALE,
        });

        const scale = 0.75;
        super({
            position: vec3(0, 0, MIDDLE_RING_POS_Z),
            scale: vec3(scale, scale, scale),
            children: [front_side, back_side],
        });

        this.front_side = front_side;
        this.back_side = back_side;

        this.spinning = true;
        this.is_locked = false;
    }

    wobble_animation(target: number): ShaderUniformAnimation {
        return {
            key: "wobble_amplifier",
            speed: 3,
            target,
        };
    }

    noise_animation(target: number): ShaderUniformAnimation {
        return {
            key: "noise_amplifier",
            target,
            speed: 0.5,
        };
    }

    pos_y_offset_animation(target_y_offset: number, speed: number): PositionYAnimation {
        return {
            target: MIDDLE_RING_POS_Y + target_y_offset,
            speed,
        };
    }

    set_animations(animations: Animations[]): void {
        this.front_side.clear_animations();
        this.back_side.clear_animations();

        const cloned_animations = deep_clone(animations);

        this.back_side.add_animations(animations);
        this.front_side.add_animations(cloned_animations);
    }

    set_word_jump_animation(): void {
        this.is_locked = true;

        const y = MIDDLE_RING_POS_Y - 0.3;

        this.front_side.position.set(0, y, MIDDLE_RING_FRONT_Z);
        this.back_side.position.set(0, y, MIDDLE_RING_BACK_Z);

        this.set_animations([
            {
                [AnimationProperty.PositionY]: this.pos_y_offset_animation(0.1, 1),
                [AnimationProperty.RotationX]: {
                    target: -0.2,
                    speed: 5,
                },
            },
            {
                [AnimationProperty.PositionY]: this.pos_y_offset_animation(0, 0.3),
                [AnimationProperty.RotationX]: {
                    target: 0.15,
                    speed: 1.5,
                },
            },
            {
                [AnimationProperty.RotationX]: {
                    target: 0,
                    speed: 0.3,
                },
                end_cb: () => {
                    this.is_locked = false;
                },
            },
            {
                delay: 3000,
                [AnimationProperty.ShaderUniforms]: [this.noise_animation(0.03)],
            },
        ]);
    }

    set_jump_up_animation(lain_jump_speed: number): void {
        this.set_animations([
            {
                delay: 500,
                [AnimationProperty.ShaderUniforms]: [this.wobble_animation(0.2), this.noise_animation(0)],
            },
            {
                delay: 650,
                [AnimationProperty.ShaderUniforms]: [this.wobble_animation(-0.3)],
                [AnimationProperty.PositionY]: this.pos_y_offset_animation(-1.2, lain_jump_speed),
            },
            {
                delay: 250,
                start_cb: () => {
                    this.spinning = true;
                },
                [AnimationProperty.ShaderUniforms]: [this.wobble_animation(0)],
            },
            {
                [AnimationProperty.PositionY]: this.pos_y_offset_animation(0.1, 0.8),
                [AnimationProperty.RotationX]: {
                    target: -0.2,
                    speed: 5,
                },
            },
            {
                [AnimationProperty.PositionY]: this.pos_y_offset_animation(0, 0.3),
                [AnimationProperty.RotationX]: {
                    target: 0.15,
                    speed: 1.5,
                },
            },
            {
                [AnimationProperty.RotationX]: {
                    target: 0,
                    speed: 0.3,
                },
            },
            {
                delay: 3000,
                [AnimationProperty.ShaderUniforms]: [this.noise_animation(0.03)],
            },
        ]);
    }

    set_jump_down_animation(lain_jump_speed: number): void {
        this.is_locked = true;

        this.set_animations([
            {
                delay: 600,
                [AnimationProperty.ShaderUniforms]: [this.noise_animation(0.06)],
            },
            {
                delay: 600,
                [AnimationProperty.PositionY]: this.pos_y_offset_animation(1.6, lain_jump_speed),
            },
            {
                delay: 800,
                [AnimationProperty.PositionY]: this.pos_y_offset_animation(-0.05, 1.4),
                [AnimationProperty.ShaderUniforms]: [this.noise_animation(0)],
            },
            {
                [AnimationProperty.RotationX]: {
                    target: 0.4,
                    speed: 1.6,
                },
            },
            {
                [AnimationProperty.PositionY]: this.pos_y_offset_animation(0, 0.1),
                [AnimationProperty.RotationX]: {
                    target: -0.2,
                    speed: 0.5,
                },
            },
            {
                [AnimationProperty.RotationX]: {
                    target: 0,
                    speed: 0.2,
                },
                end_cb: () => {
                    this.is_locked = false;
                },
            },
            {
                delay: 3000,
                [AnimationProperty.ShaderUniforms]: [this.noise_animation(0.03)],
            },
        ]);
    }

    set_rotate_animation(direction: Direction.Left | Direction.Right): void {
        let rot_z_values = [0.07, -0.03];
        if (direction === Direction.Right) {
            rot_z_values = rot_z_values.map((v) => v * -1);
        }

        let x_position = 0.2;
        if (direction === Direction.Right) {
            x_position *= -1;
        }

        this.set_animations([
            {
                delay: 1300,
                [AnimationProperty.PositionX]: {
                    target: x_position,
                    speed: 0.1,
                },
            },
            {
                [AnimationProperty.PositionX]: {
                    target: 0,
                    speed: 0.1,
                },
                [AnimationProperty.RotationZ]: {
                    target: rot_z_values[0],
                    speed: 0.1,
                },
                [AnimationProperty.ShaderUniforms]: [this.noise_animation(0.06)],
            },
            {
                [AnimationProperty.RotationZ]: {
                    target: rot_z_values[1],
                    speed: 0.1,
                },
            },
            {
                [AnimationProperty.RotationZ]: {
                    target: 0,
                    speed: 0.1,
                },
                [AnimationProperty.ShaderUniforms]: [this.noise_animation(0.03)],
            },
        ]);
    }

    set_pause_animation(): void {
        const big_scale = 1.1;
        const reverse_scale = 1 / big_scale;

        this.set_animations([
            {
                [AnimationProperty.PositionY]: this.pos_y_offset_animation(0.64, 0.5),
                [AnimationProperty.ShaderUniforms]: [this.noise_animation(0)],
                start_cb: () => {
                    this.spinning = false;
                },
            },
            {
                delay: 500,
                [AnimationProperty.RelativeScale]: {
                    multiplier: vec3(big_scale, 1, big_scale),
                    speed: 0.5,
                },
            },
            {
                [AnimationProperty.RelativeScale]: {
                    multiplier: vec3(reverse_scale, 1, reverse_scale),
                    speed: 0.5,
                },
            },
            {
                delay: 500,
                [AnimationProperty.RelativeScale]: { multiplier: vec3(big_scale, 1, big_scale), speed: 0.5 },
            },
            {
                [AnimationProperty.RelativeScale]: {
                    multiplier: vec3(reverse_scale, 1, reverse_scale),
                    speed: 0.5,
                },
            },
            {
                delay: 1050,
                [AnimationProperty.ShaderUniforms]: [{ key: "gap_size", speed: 0.6, target: 0.8 }],
                [AnimationProperty.RelativeScale]: { multiplier: vec3(10, 1, 10), speed: 5 },
            },
        ]);
    }

    set_site_enter_animation(): void {
        this.is_locked = true;
        this.visible = true;

        const y = MIDDLE_RING_POS_Y - 1;

        this.front_side.scale.copy(MIDDLE_RING_FRONT_SCALE);
        this.front_side.position.set(0, y, MIDDLE_RING_FRONT_Z);
        this.front_side.rotation.set(0, 0, 0);
        this.front_side.set_uniform("gap_size", 0);

        this.back_side.scale.copy(MIDDLE_RING_BACK_SCALE);
        this.back_side.position.set(0, y, MIDDLE_RING_BACK_Z);
        this.back_side.rotation.set(0, 0, 0);
        this.back_side.set_uniform("gap_size", 0);

        this.set_animations([
            {
                start_cb: () => {
                    this.spinning = true;
                },
                [AnimationProperty.ShaderUniforms]: [this.wobble_animation(0)],
            },
            {
                [AnimationProperty.ShaderUniforms]: [this.noise_animation(0.03)],
                [AnimationProperty.PositionY]: this.pos_y_offset_animation(0.1, 1.8),
                [AnimationProperty.RotationX]: {
                    target: -0.2,
                    speed: 5,
                },
            },
            {
                [AnimationProperty.PositionY]: this.pos_y_offset_animation(0, 0.3),
                [AnimationProperty.RotationX]: {
                    target: 0.15,
                    speed: 1.5,
                },
            },
            {
                [AnimationProperty.RotationX]: {
                    target: 0,
                    speed: 0.3,
                },
            },
            {
                delay: 100,
                [AnimationProperty.ShaderUniforms]: [this.noise_animation(0.03)],
                end_cb: () => {
                    this.is_locked = false;
                },
            },
        ]);
    }

    update(time_ctx: TimeContext): void {
        const { delta } = time_ctx;

        this.back_side.process_animation_queue(time_ctx);
        this.front_side.process_animation_queue(time_ctx);

        if (this.spinning) {
            this.front_side.rotation.y += 3 * delta;
            this.back_side.rotation.y += 3 * delta;
        }
    }
}

const HUD_SPEED = 1;
const HUD_ELEMENT_HIDE_OFFSET = 0.5;

class NodeHUD extends Group {
    big: Sprite3D;
    medium: Sprite3D;
    boring: Sprite3D;
    title: MediumFontText;
    protocol_lines: Sprite3D[];
    protocol_line_texts: MediumFontText[];

    constructor(title: string, protocol_lines: string[], matrix_position: MatrixPosition2D) {
        super({ position: vec3(0, 0, -0.529) });

        const make_big_hud = (visible: boolean = true) =>
            new Sprite3D(Texture.Big_Hud, {
                scale_factor: 1.35,
                side: THREE.DoubleSide,
                render_order: 999,
                visible,
            });

        const make_big_hud_text = (text: string, visible: boolean = true) => {
            const result = new MediumFontText(text, 1.3, vec3(0, 0, 0));
            result.visible = visible;
            return result;
        };

        this.big = make_big_hud();

        this.boring = new Sprite3D(Texture.Boring_Hud, {
            scale_factor: 1.35,
            side: THREE.DoubleSide,
            render_order: 998,
        });

        this.medium = new Sprite3D(Texture.Medium_Hud, {
            scale_factor: 1.35,
            side: THREE.DoubleSide,
            render_order: 998,
        });

        this.protocol_lines = protocol_lines.map((_) => make_big_hud(false));
        this.protocol_line_texts = protocol_lines.map((line) => make_big_hud_text(line, false));

        this.title = make_big_hud_text(title);

        this.set_node_matrix_position(matrix_position);

        this.add(
            this.boring,
            ...this.protocol_lines,
            ...this.protocol_line_texts,
            this.medium,
            this.big,
            this.title
        );
    }

    get_all_elements(): (Sprite3D | MediumFontText)[] {
        return [
            this.boring,
            this.big,
            this.medium,
            this.title,
            ...this.protocol_lines,
            ...this.protocol_line_texts,
        ];
    }

    get_all_non_text_elements(): Sprite3D[] {
        return [this.boring, this.big, this.medium, ...this.protocol_lines];
    }

    hide(): void {
        for (const el of this.get_all_elements()) {
            const target_pos = el.position.clone();

            if (el.position.x < 0) {
                target_pos.x -= HUD_ELEMENT_HIDE_OFFSET;
            } else {
                target_pos.x += HUD_ELEMENT_HIDE_OFFSET;
            }

            el.add_position_animation(target_pos, HUD_SPEED);
        }
    }

    set(title: string, protocol_lines: string[], position: MatrixPosition2D): void {
        this.set_node_matrix_position(position, true);

        for (const el of this.get_all_elements()) {
            const target_pos = el.position.clone();

            if (el.position.x < 0) {
                target_pos.x += HUD_ELEMENT_HIDE_OFFSET;
            } else {
                target_pos.x -= HUD_ELEMENT_HIDE_OFFSET;
            }

            el.add_position_animation(target_pos, HUD_SPEED);
        }

        this.title.set_text(title);

        for (let i = 0; i < protocol_lines.length; i++) {
            this.protocol_line_texts[i].set_text(protocol_lines[i]);
        }
    }

    set_instant(title: string, protocol_lines: string[], position: MatrixPosition2D): void {
        this.set_node_matrix_position(position);

        this.title.set_text(title);

        for (let i = 0; i < protocol_lines.length; i++) {
            this.protocol_line_texts[i].set_text(protocol_lines[i]);
        }
    }

    adjust_protocol_lines(col: number, row: number): void {
        const VERTICAL_GAP = get_height(this.big) + 0.003;
        const HORIZONTAL_GAP = 0.01;

        const is_flipped = col > 1;
        const is_above = row === 2 && col !== 1;

        const vertical_direction = is_above ? 1 : -1;
        const horizontal_direction = is_flipped === is_above ? -1 : 1;

        this.protocol_lines.forEach((element, index) => {
            const offset = index + 1;

            element.position.copy(this.big.position);
            element.position.y += VERTICAL_GAP * offset * vertical_direction;
            element.position.x += HORIZONTAL_GAP * offset * horizontal_direction;
        });
    }

    set_node_matrix_position(node_matrix_position: MatrixPosition2D, hide_instantly: boolean = false): void {
        const { row, col } = node_matrix_position;

        const should_be_flipped = col > 1;
        for (const el of this.get_all_non_text_elements()) {
            if (el.is_flipped_x() !== should_be_flipped) {
                el.flip_x();
            }

            el.clear_animations();
        }

        this.title.clear_animations();
        this.protocol_line_texts.forEach((line) => line.clear_animations());

        if (col === 1 || col === 2) {
            switch (row) {
                case 0:
                    this.position.y = 0;
                    break;
                case 1:
                    this.position.y = -0.043;
                    break;
                case 2:
                    this.position.y = -0.085;
                    break;
            }
        } else {
            switch (row) {
                case 0:
                    this.position.y = 0;
                    break;
                case 1:
                    this.position.y = -0.09;
                    break;
                case 2:
                    this.position.y = -0.18;
                    break;
            }
        }

        switch (col) {
            case 0:
                {
                    this.boring.position.set(0.16, 0.065, 0);
                    this.medium.position.set(-0.16, 0.058, 0);
                    if (row === 2) {
                        this.big.position.set(0.09, 0.07, 0);
                    } else {
                        this.big.position.set(0.12, 0.049, 0);
                    }
                }
                break;
            case 1:
                {
                    this.boring.position.set(0.22, 0.018, 0);
                    this.medium.position.set(-0.1, 0.01, 0);
                    this.big.position.set(0.12, 0.002, 0);
                }
                break;
            case 2:
                {
                    this.boring.position.set(-0.11, 0.018, 0);
                    this.medium.position.set(0.22, 0.01, 0);

                    if (row === 2) {
                        this.big.position.set(-0.1, 0.0234, 0);
                    } else {
                        this.big.position.set(-0.12, 0.002, 0);
                    }
                }
                break;
            case 3:
                {
                    this.boring.position.set(-0.05, 0.065, 0);
                    this.medium.position.set(0.275, 0.058, 0);
                    if (row === 2) {
                        this.big.position.set(-0.09, 0.07, 0);
                    } else {
                        this.big.position.set(-0.12, 0.049, 0);
                    }
                }
                break;
        }

        this.adjust_protocol_lines(col, row);

        const big_font_text_offset = 0.075;

        this.title.position.copy(this.big.position);
        this.title.position.x -= big_font_text_offset;

        for (let i = 0; i < 3; i++) {
            this.protocol_line_texts[i].position.copy(this.protocol_lines[i].position);
            this.protocol_line_texts[i].position.x -= big_font_text_offset;
        }

        if (hide_instantly) {
            for (const el of this.get_all_elements()) {
                if (el.position.x < 0) {
                    el.position.x -= HUD_ELEMENT_HIDE_OFFSET;
                } else {
                    el.position.x += HUD_ELEMENT_HIDE_OFFSET;
                }
            }
        }
    }

    update(time_ctx: TimeContext): void {
        for (const elem of this.get_all_elements()) {
            elem.process_animation_queue(time_ctx);
        }
    }

    toggle_protocol_lines(): void {
        this.protocol_lines.forEach((line) => (line.visible = !line.visible));
        this.protocol_line_texts.forEach((line) => (line.visible = !line.visible));
    }
}

class Star extends Mesh<THREE.BoxGeometry, THREE.ShaderMaterial> {
    speed: number;
    initial_position: Vec3;
    reset_threshold?: number;

    constructor(position: Vec3, color: THREE.ColorRepresentation, reset_threshold?: number) {
        const scale_mult = 1.5;

        super(
            new THREE.BoxGeometry(),
            new THREE.ShaderMaterial({
                uniforms: {
                    atlas: { value: get_texture_atlas() },
                    color1: { value: new THREE.Color(0xfff) },
                    color2: { value: new THREE.Color(color) },
                },
                vertexShader: vert_star,
                fragmentShader: frag_star,
                transparent: true,
                depthTest: false,
            }),
            { position, scale: vec3(0.01 * scale_mult, 2 * scale_mult, 0.01 * scale_mult), render_order: -4 }
        );

        this.initial_position = position;
        this.speed = random_between(1, 5);
        this.reset_threshold = reset_threshold;
    }

    update(delta: number, boost: number = 1): void {
        if (this.reset_threshold !== undefined && this.position.y > this.reset_threshold) {
            this.position.copy(this.initial_position);
            this.speed = random_between(1, 5);
        }

        this.position.y += delta * this.speed * boost;
    }
}

class Starfield extends Group {
    speed_boost: number;
    stars: Star[];
    paused: boolean;

    constructor() {
        const lcg = create_LCG(4);

        const scale_xz = 1e-9;
        const scale_y = 1e-10;
        const gen_star_position = () => vec3(lcg() * scale_xz, lcg() * scale_y, lcg() * scale_xz);

        const left_reset_threshold = 18;
        const gen_left_star = (color: THREE.ColorRepresentation) =>
            new Star(gen_star_position(), color, left_reset_threshold);

        const right_reset_threshold = 19;
        const gen_right_star = (color: THREE.ColorRepresentation) =>
            new Star(gen_star_position(), color, right_reset_threshold);

        const right_stars: Star[] = [];
        const left_stars: Star[] = [];

        const add_horizontal_stars = (color: THREE.ColorRepresentation, count: number) => {
            for (let i = 0; i < count; i++) {
                right_stars.push(gen_left_star(color));
                left_stars.push(gen_right_star(color));
            }
        };

        add_horizontal_stars(COLORS.blue, 8);
        add_horizontal_stars(COLORS.cyan, 4);
        add_horizontal_stars(COLORS.white, 2);

        const right_star_group = new Group({
            children: [...right_stars],
            rotation: euler(0, 0.6, Math.PI / 2),
            position: vec3(8, -1, -12),
        });

        const left_star_group = new Group({
            children: [...left_stars],
            rotation: euler(0, 2.4, Math.PI / 2),
            position: vec3(-12.5, -2, -11),
        });

        super({ children: [right_star_group, left_star_group], position: vec3(0, 0, -5) });

        this.stars = [...left_stars, ...right_stars];
        this.speed_boost = 1;
        this.paused = false;
    }

    update(delta: number): void {
        if (!this.paused) {
            this.stars.forEach((star) => star.update(delta, this.speed_boost));
            this.speed_boost = animate_number_towards(this.speed_boost, 1, delta * 4);
        }
    }
}

class GrayLine extends Mesh {
    constructor(position: Vec3) {
        const width = 0.02;
        super(
            new THREE.PlaneGeometry(),
            new THREE.MeshBasicMaterial({
                color: 0xd3d3d3,
                opacity: 0.2,
                side: THREE.DoubleSide,
                transparent: true,
            }),
            {
                scale: vec3(width, 20, width),
                position,
            }
        );
    }

    update(x: number, z: number, delta: number): void {
        this.position.set(x, 0, z);
        this.rotation.y -= delta;
    }
}

class GrayLines extends Group {
    lines: GrayLine[];
    pivot: Group;
    line_angles: number[];
    x_radius: number;
    z_radius: number;

    constructor() {
        const oval_size = 0.6;
        const x_radius = oval_size;
        const z_radius = oval_size / 4;

        const oval_position = (angle: number): Vec3 => {
            const x = x_radius * Math.cos(angle);
            const z = z_radius * Math.sin(angle);
            return vec3(x, 0, z);
        };

        const lines = [];
        const angles = [];

        for (let i = 0; i < 7; i++) {
            const angle = Math.random() * 2 * Math.PI;
            angles.push(angle);
            lines.push(new GrayLine(oval_position(angle)));
        }

        const pivot = new Group({ children: lines, position: vec3(0, 0, 0) });
        super({ children: [pivot], position: vec3(0, 0, -3.8) });

        this.x_radius = x_radius;
        this.z_radius = z_radius;

        this.lines = lines;
        this.pivot = pivot;
        this.line_angles = angles;
    }

    update(delta: number): void {
        for (let i = 0; i < this.lines.length; i++) {
            this.line_angles[i] += delta * 1.2;

            const x = this.x_radius * Math.cos(this.line_angles[i]);
            const z = this.z_radius * Math.sin(this.line_angles[i]);

            this.lines[i].update(x, z, delta);
        }
    }
}

type GrayRingGeometry = { geometry: THREE.CylinderGeometry; center: THREE.Vector3 };

function create_gray_ring(
    level: number,
    geometries: GrayRingGeometry[],
    material: THREE.ShaderMaterial
): Group {
    const meshes = geometries.map(({ geometry, center }) => {
        return new Mesh(geometry, material, {
            position: center,
        });
    });

    const scale = 33;
    return new Group({
        children: meshes,
        scale: vec3(scale, scale, scale),
        position: vec3(0, get_level_y(level) - 0.37, 0),
    });
}

function create_gray_rings(site_kind: SiteKind): Group[] {
    const level_count = get_level_count(site_kind);

    // geometries
    const shared_geometries = [];
    const qty = 8;
    const theta_len = (360 / qty) * THREE.MathUtils.DEG2RAD;

    for (let i = 0; i < qty; i++) {
        const theta_start = i * theta_len;
        const geometry = new THREE.CylinderGeometry(
            0.036,
            0.036,
            0.003,
            64,
            64,
            true,
            theta_start,
            theta_len
        );

        for (let j = 0; j < geometry.attributes.uv.array.length; j += 2) {
            geometry.attributes.uv.array[j + 0] = geometry.attributes.uv.array[j + 0] / qty + i / qty;
        }

        geometry.computeBoundingSphere();
        const center = geometry.boundingSphere!.center.clone();
        geometry.translate(center.x * -1, center.y * -1, center.z * -1);

        shared_geometries.push({ geometry, center });
    }

    // material
    const lof_texture = get_texture(Texture.Gray_Ring_Lof);
    const life_texture = get_texture(Texture.Gray_Ring_Life);
    const sides_texture = get_texture(Texture.Gray_Ring_Sides);

    const shared_material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.lights,
            {
                atlas: { value: get_texture_atlas() },
                lof_repeat: { value: lof_texture.repeat },
                lof_offset: { value: lof_texture.offset },
                life_repeat: { value: life_texture.repeat },
                life_offset: { value: life_texture.offset },
                sides_repeat: { value: sides_texture.repeat },
                sides_offset: { value: sides_texture.offset },
            },
        ]),
        vertexShader: vert_gray_ring,
        fragmentShader: frag_gray_ring,
        side: THREE.DoubleSide,
        transparent: true,
        lights: true,
    });

    const rings: Group[] = [];

    for (let level = 0; level <= level_count; level++) {
        rings.push(create_gray_ring(level, shared_geometries, shared_material));
    }

    return rings;
}

enum OrbCurve {
    UpToDown,
    DownToUp,
}

const ORB_LIGHT_FRONT_INTENSITY = 0.2;
const ORB_LIGHT_BACK_INTENSITY = 0;
const ORB_LIGHT_FRONT_Z = 8;
const ORB_LIGHT_BACK_Z = 5;
const ORB_FRONT_RENDER_ORDER = 999;
const ORB_BACK_RENDER_ORDER = 0;
const ORB_Z = -10;

// TODO: looks different in the original game.
class Orb extends Group {
    orb_mesh: Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    up_to_down_curve: THREE.QuadraticBezierCurve3;
    down_to_up_curve: THREE.QuadraticBezierCurve3;
    current_curve: OrbCurve;
    progress_on_curve: number;
    increasing: boolean;
    target_brightness: number;
    transitioning: boolean;
    light: THREE.PointLight;

    constructor() {
        const texture = get_texture(Texture.Orb);

        const atlas = get_texture_atlas().clone();

        const scale = 2;

        const orb_mesh = new Mesh(
            new THREE.PlaneGeometry(),
            new THREE.ShaderMaterial({
                uniforms: THREE.UniformsUtils.merge([
                    {
                        atlas: { value: atlas },
                        tex_repeat: { value: texture.repeat },
                        tex_offset: { value: texture.offset },
                        brightness: { value: 1 },
                    },
                ]),
                vertexShader: vert_orb,
                fragmentShader: frag_orb,
                transparent: true,
                depthTest: false,
                blending: THREE.AdditiveBlending,
            }),
            {
                scale: vec3(scale, scale, 0),
                render_order: ORB_BACK_RENDER_ORDER,
            }
        );

        const light_color = 0xfffecf;

        const light = create_point_light({
            position: vec3(0, 0, ORB_LIGHT_BACK_Z),
            intensity: ORB_LIGHT_BACK_INTENSITY,
            color: light_color,
        });

        super({ children: [orb_mesh, light], position: vec3(0, 0, -10) });

        this.orb_mesh = orb_mesh;
        this.light = light;

        this.up_to_down_curve = new THREE.QuadraticBezierCurve3(
            vec3(5, -1, ORB_Z),
            vec3(0.5, -4, ORB_Z),
            vec3(-5, 4, ORB_Z)
        );

        this.down_to_up_curve = new THREE.QuadraticBezierCurve3(
            vec3(-5, -3, ORB_Z),
            vec3(-0.5, 3, ORB_Z),
            vec3(5, 1, ORB_Z)
        );

        this.current_curve = OrbCurve.UpToDown;

        this.progress_on_curve = 0;

        this.increasing = true;

        this.target_brightness = 1;

        this.transitioning = false;

        this.add(this.light);
    }

    update(time_ctx: TimeContext): boolean {
        const { delta } = time_ctx;

        const move_speed = delta / 4;
        const transition_speed = move_speed * 12;
        const brightness_speed = delta * 4;
        const scale_speed = delta * 5;

        if (this.transitioning) {
            this.renderOrder = ORB_FRONT_RENDER_ORDER;

            this.scale.x += scale_speed;
            this.scale.y += scale_speed;

            const is_in_center = this.position_towards(vec3(0, 0, ORB_Z), transition_speed);

            return is_in_center;
        }

        switch (this.current_curve) {
            case OrbCurve.UpToDown:
                if (this.increasing) {
                    this.progress_on_curve += move_speed;
                    if (this.progress_on_curve >= 1) {
                        // finished top left
                        this.increasing = false;
                        this.renderOrder = ORB_FRONT_RENDER_ORDER;
                    }
                } else {
                    this.progress_on_curve -= move_speed;
                    if (this.progress_on_curve <= 0) {
                        // finished bottom right
                        this.increasing = true;
                        this.current_curve = OrbCurve.DownToUp;
                        this.increasing = false;
                        this.progress_on_curve = 1;
                    }
                }
                break;
            case OrbCurve.DownToUp:
                if (this.increasing) {
                    this.progress_on_curve += move_speed;
                    if (this.progress_on_curve >= 1) {
                        // finished top right
                        this.increasing = true;
                        this.current_curve = OrbCurve.UpToDown;
                        this.renderOrder = ORB_BACK_RENDER_ORDER;
                        this.progress_on_curve = 0;
                    }
                } else {
                    this.progress_on_curve -= move_speed;
                    if (this.progress_on_curve <= 0) {
                        // finished bottom left
                        this.increasing = true;
                        this.renderOrder = ORB_BACK_RENDER_ORDER;
                    }
                }
                break;
        }

        if (this.orb_mesh.uniform_number_towards("brightness", this.target_brightness, brightness_speed)) {
            this.target_brightness = random_between(1, 1.5);
        }

        let light_target_z;
        let light_target_intensity;
        if (this.renderOrder === ORB_FRONT_RENDER_ORDER) {
            light_target_z = ORB_LIGHT_FRONT_Z;
            light_target_intensity = ORB_LIGHT_FRONT_INTENSITY;
        } else {
            light_target_z = ORB_LIGHT_BACK_Z;
            light_target_intensity = ORB_LIGHT_BACK_INTENSITY;
        }

        animate_object_position(
            this.light,
            vec3(this.light.position.x, this.light.position.y, light_target_z),
            delta * 10
        );

        animate_light_intensity(this.light, light_target_intensity, delta);

        let curve;
        switch (this.current_curve) {
            case OrbCurve.UpToDown:
                curve = this.up_to_down_curve;
                break;
            case OrbCurve.DownToUp:
                curve = this.down_to_up_curve;
                break;
        }

        const position = curve.getPoint(this.progress_on_curve);
        this.position.copy(position);

        return false;
    }

    reset(via_scale: boolean = false): void {
        if (via_scale) {
            this.scale_show();
        } else {
            this.visible = true;
        }

        this.light.position.z = ORB_LIGHT_BACK_Z;
        this.current_curve = OrbCurve.UpToDown;
        this.progress_on_curve = 0;
        this.increasing = true;
    }
}

function create_purple_rings(site_kind: SiteKind): Mesh[] {
    let level_count = get_level_count(site_kind);
    let site_texture: THREE.Texture;
    switch (site_kind) {
        case SiteKind.A:
            site_texture = get_texture(Texture.Purple_Ring_Site_A);
            break;
        case SiteKind.B:
            site_texture = get_texture(Texture.Purple_Ring_Site_B);
            break;
    }

    const rings = [];
    for (let level = 0; level <= level_count; level++) {
        const digits = split_digits(level);

        // at the time of writing this comment, this part of the code was written about 5 years ago. i genuinely have no idea
        // what is going on here, or how this part of the fragment shader even works - all i know is that it does, and that it's very ugly.
        // considering that we will never have to touch it i will not bother looking into this.
        // if you find the proper way to render these digits, feel free to send a pr.
        const offsets = [0.031, 0.026, 0.0218, 0.0176, 0.0131, 0.009, 0.005, 0.001, 0.039, 0.035];

        const level_font_texture = get_texture(Texture.Purple_Ring_Level_Font);

        const scale = 32;

        const purple_ring = new Mesh(
            new THREE.CylinderGeometry(0.036, 0.036, 0.003, 64, 64, true),
            new THREE.ShaderMaterial({
                uniforms: THREE.UniformsUtils.merge([
                    THREE.UniformsLib.lights,
                    {
                        atlas: { value: get_texture_atlas() },
                        site_repeat: { value: site_texture.repeat },
                        site_offset: { value: site_texture.offset },
                        level_font_repeat: {
                            value: level_font_texture.repeat,
                        },
                        level_font_offset: {
                            value: level_font_texture.offset,
                        },
                        first_digit_offset: { value: offsets[digits[0]] },
                        second_digit_offset: { value: offsets[digits[1]] },
                    },
                ]),
                side: THREE.DoubleSide,
                vertexShader: vert_purple_ring,
                fragmentShader: frag_purple_ring,
                transparent: true,
                lights: true,
            }),
            { scale: vec3(scale, scale, scale), position: vec3(0, get_level_y(level) + 0.46, 0) }
        );

        rings.push(purple_ring);
    }

    return rings;
}

function create_crystals(site_kind: SiteKind): any[] {
    const level_count = get_level_count(site_kind);

    const crystals = [];

    const scale = 5;
    for (let level = 0; level <= level_count; level++) {
        const crystal_material = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights]),
            side: THREE.DoubleSide,
            vertexShader: vert_crystal,
            fragmentShader: frag_crystal,
            transparent: true,
            lights: true,
        });

        const crystal = new GLBModel(ModelKind.Crystal, crystal_material, {
            scale: vec3(scale, scale * 2, scale),
            position: vec3(-1, get_level_y(level) - 0.6, 0.4),
            rotation: euler(0, -1.1, 0),
        });

        crystals.push(crystal);
    }

    return crystals;
}

function set_node(
    site: SiteScene,
    new_cursor_location: CursorLocation,
    time: number,
    is_instant: boolean = false
): void {
    if (site.lain.is_navigating() || site.lain.is_selecting_node() || site.descriptor.is_animating()) {
        return;
    }

    if (site.active_node) {
        deactivate_node(site.active_node.mesh);
    }

    site.active_node = get_node(new_cursor_location, site.layout);

    set_location(site, new_cursor_location);

    const { name, title, protocol_lines } = get_node_display_text(new_cursor_location, site.layout);

    if (is_instant) {
        site.descriptor.set_instant(
            name,
            get_node_name_position(new_cursor_location.node_matrix_position),
            BigFontColors.FirstOrange
        );

        site.node_hud.set_instant(title, protocol_lines, new_cursor_location.node_matrix_position);

        if (site.active_node) {
            activate_node(site.active_node.mesh, time);
        }
    } else {
        site.descriptor.set(
            name,
            get_node_name_position(new_cursor_location.node_matrix_position),
            BigFontColors.FirstOrange,
            {
                on_expand: () =>
                    site.node_hud.set(title, protocol_lines, new_cursor_location.node_matrix_position),
                on_complete: (time: number) => {
                    if (site.active_node) {
                        activate_node(site.active_node.mesh, time);
                    }
                },
            }
        );

        site.node_hud.hide();
    }
}

type SitePositionAnimationContext = {
    jump_speed: number;
    target_position: Vec3;
};

function get_site_position_animation_ctx(
    current_level: number,
    target_level: number
): SitePositionAnimationContext {
    const target_position = vec3(0, get_level_y(target_level) * -1, SITE_Z);

    const jump_speed = calculate_jump_speed(current_level, target_level);

    return { jump_speed, target_position };
}

type SiteRotationAnimationContext = {
    rotation_speed: number;
    target_rotation: Euler;
};

function get_site_rotation_animation_ctx(
    current_segment: number,
    current_rotation: number
): SiteRotationAnimationContext {
    const target_rotation = get_rotation_for_site_segment(current_segment, current_rotation);

    return {
        target_rotation,
        rotation_speed: calculate_rotation_speed(current_rotation, target_rotation.y),
    };
}

function set_jump_animations(
    site: SiteScene,
    target_level: number,
    time: number,
    is_level_selector = false
): void {
    const current_level = site.cursor_location.level;

    if (current_level === target_level) {
        return;
    }

    const site_position_animation_ctx = get_site_position_animation_ctx(current_level, target_level);

    const { jump_speed, target_position } = site_position_animation_ctx;

    site.main_handle.add_position_animation(target_position, jump_speed, {
        delay: 1300,
        start_cb: () => {
            play_audio(SFX.SND_10);
            play_audio(SFX.SND_9);
        },
    });

    let descriptor_speed = 0;
    let descriptor_y = 0;

    const direction = current_level < target_level ? Direction.Up : Direction.Down;

    const matrix_position = site.cursor_location.node_matrix_position;
    switch (matrix_position.col) {
        case 0:
        case 3:
            descriptor_speed = jump_speed * 2.5;
            descriptor_y = direction === Direction.Up ? -2 : 2;
            break;
        case 1:
        case 2:
            descriptor_speed = jump_speed * 1.2;
            if (direction === Direction.Up) {
                descriptor_y = matrix_position.row === 0 ? -1.5 : -2;
                if (is_level_selector) {
                    descriptor_y -= 1;
                }
            } else {
                descriptor_y = matrix_position.row === 2 ? 1.3 : 2;
                if (is_level_selector) {
                    descriptor_y += 1;
                }
            }

            break;
    }

    site.descriptor.move_as_group_vertical(descriptor_y, descriptor_speed, 1300);

    if (direction === Direction.Up) {
        site.lain.set_animation(LainAnimationKind.Jump_Up, time);
        site.middle_ring.set_jump_up_animation(jump_speed);
    } else if (direction === Direction.Down) {
        site.lain.set_animation(LainAnimationKind.Jump_Down, time);
        site.middle_ring.set_jump_down_animation(jump_speed);
    }

    play_audio(SFX.SND_13);

    site.events.push({
        apply: () => {
            play_audio(SFX.SND_8);
        },
        apply_time: time + 3000,
    });
}

function jump_to_level_via_selector(site: SiteScene, target_level: number, time: number): void {
    const current_level = site.cursor_location.level;

    if (target_level === current_level) {
        return;
    }

    if (!site.lain.is_standing() || site.descriptor.is_animating()) {
        return;
    }

    const node_matrix_position = find_first_node_on_level(
        site.layout,
        target_level,
        site.cursor_location.site_segment
    );

    set_jump_animations(site, target_level, time, true);

    site.cursor_location.level = target_level;
    site.cursor_location.node_matrix_position = node_matrix_position;

    site.level_selector.close();
}

function navigate(site: SiteScene, direction: Direction, time: number, rotate_immediately?: boolean): void {
    let node_search_result = null;
    if (rotate_immediately && (direction === Direction.Left || direction === Direction.Right)) {
        node_search_result = move_horizontal_and_find_next_node(site, direction);
    } else {
        node_search_result = find_next_node(site, direction, true);
    }

    if (node_search_result === null) {
        return;
    }

    const { cursor_location, did_move } = node_search_result;

    if (did_move) {
        if (!site.lain.is_standing() || site.descriptor.is_animating() || site.middle_ring.is_locked) {
            return;
        }

        if (site.active_node) {
            deactivate_node(site.active_node.mesh);
        }

        switch (direction) {
            case Direction.Up:
            case Direction.Down:
                set_jump_animations(site, cursor_location.level, time);
                break;
            case Direction.Left:
            case Direction.Right:
                const { target_rotation, rotation_speed } = get_site_rotation_animation_ctx(
                    cursor_location.site_segment,
                    site.main_handle.rotation.y
                );

                site.main_handle.add_rotation_animation(target_rotation, rotation_speed, {
                    delay: 1300,
                    start_cb: () => {
                        play_audio(SFX.SND_34);
                    },
                });

                let descriptor_speed = 0;
                let descriptor_x = 0;

                const matrix_position = site.cursor_location.node_matrix_position;
                switch (matrix_position.col) {
                    case 0:
                        descriptor_speed = rotation_speed * 2.9;
                        descriptor_x = direction === Direction.Left ? 2.28 : -1.9;
                        break;
                    case 1:
                        descriptor_speed = rotation_speed * 1.35;
                        descriptor_x = direction === Direction.Left ? -1 : 1.16;
                        break;
                    case 2:
                        descriptor_speed = rotation_speed * (direction === Direction.Left ? 1.35 : 1.2);
                        descriptor_x = direction === Direction.Left ? -1.16 : 0.9;
                        break;
                    case 3:
                        descriptor_speed = rotation_speed * (direction === Direction.Left ? 2 : 2.9);
                        descriptor_x = direction === Direction.Left ? 2.28 : -2.28;
                        break;
                }

                site.descriptor.move_as_group_horizontal(descriptor_x, descriptor_speed, 1300);

                if (direction === Direction.Left) {
                    site.lain.set_animation(LainAnimationKind.Walk_Left, time);
                } else {
                    site.lain.set_animation(LainAnimationKind.Walk_Right, time);
                }

                site.middle_ring.set_rotate_animation(direction);

                play_audio(SFX.SND_6);

                break;
        }

        set_location(site, cursor_location);

        site.node_hud.hide();
    } else {
        if (site.lain.is_navigating() || site.lain.is_selecting_node() || site.descriptor.is_animating()) {
            return;
        }

        set_node(site, cursor_location, time);

        play_audio(SFX.SND_1);
    }
}

function attempt_enter_node(site: SiteScene, progress: Progress, time: number): void {
    if (!site.lain.is_standing() || site.descriptor.is_animating() || !site.active_node) {
        return;
    }

    const node = site.active_node;

    // causes all sorts of visual bugs without it
    node.mesh.material.depthTest = false;

    if (
        node.upgrade_requirement > progress.sskn_level ||
        node.required_final_video_viewcount > progress.final_video_view_count
    ) {
        const animation = random_from([
            LainAnimationKind.Knock_Node,
            LainAnimationKind.Knock_And_Fall_Node,
            LainAnimationKind.Explode_Node,
        ]);

        site.lain.set_animation(animation, time);

        play_audio(SFX.SND_0);

        switch (animation) {
            case LainAnimationKind.Knock_Node:
                node.mesh.add_animations(get_node_knock_animations(node, site.main_handle.rotation.y));

                site.events.push(
                    {
                        apply: () => {
                            play_audio(SFX.SND_18);
                        },
                        apply_time: time + 1200,
                    },
                    {
                        apply: () => {
                            node.mesh.material.depthTest = true;
                        },
                        apply_time: time + 3400,
                    }
                );

                break;
            case LainAnimationKind.Knock_And_Fall_Node:
                node.mesh.add_animations(
                    get_node_knock_and_fall_animations(node, site.main_handle.rotation.y)
                );

                site.events.push(
                    {
                        apply: () => {
                            play_audio(SFX.SND_18);
                        },
                        apply_time: time + 1200,
                    },
                    {
                        apply: () => {
                            node.mesh.visible = false;
                            play_audio(SFX.SND_19);
                        },
                        apply_time: time + 3500,
                    },
                    {
                        apply: () => {
                            reset_node(node);
                            play_audio(SFX.SND_33);
                        },
                        apply_time: time + 6500,
                    }
                );
                break;
            case LainAnimationKind.Explode_Node:
                node.mesh.add_animations(get_node_explode_animations(node, site.main_handle.rotation.y));

                site.events.push(
                    {
                        apply: () => {
                            node.mesh.visible = false;
                            site.node_explode = new NodeExplode(node.mesh);
                            site.add(site.node_explode);
                        },
                        apply_time: time + 1350,
                    },
                    {
                        apply: () => {
                            site.node_explode!.show_lines = true;
                            node.mesh.renderOrder = 999;

                            play_audio(SFX.SND_17);
                        },
                        apply_time: time + 2350,
                    },
                    {
                        apply: () => {
                            node.mesh.visible = false;
                            play_audio(SFX.SND_33);
                        },
                        apply_time: time + 3300,
                    },
                    {
                        apply: () => {
                            site.node_explode?.dispose();
                            site.node_explode = null;
                            reset_node(node);
                        },
                        apply_time: time + 3600,
                    }
                );
                break;
        }
    } else {
        const animation = Math.random() < 0.4 ? LainAnimationKind.Throw_Node : LainAnimationKind.Rip_Node;

        site.lain.set_animation(animation, time);

        switch (animation) {
            case LainAnimationKind.Throw_Node:
                node.mesh.add_animations(get_node_throw_animations(node, site.main_handle.rotation.y));

                play_audio(SFX.SND_0);

                const node_matrix = get_node_segment_matrix(
                    site.cursor_location.site_segment,
                    site.cursor_location.level,
                    site.layout
                );

                // because we need to hide the current node behind lain for some time
                // we modify lain's render order. this causes objects to cover the front nodes,
                // so we need to make sure node's render order is higher.
                const nodes_to_modify = [node_matrix[1][0], node_matrix[1][3], node_matrix[2][3]].filter(
                    (n) => n && n.id !== node.id
                );

                site.events.push(
                    {
                        apply: () => {
                            play_audio(SFX.SND_12);
                        },
                        apply_time: time + 1500,
                    },
                    {
                        apply: (site: SiteScene) => {
                            site.middle_ring.front_side.renderOrder = 1;
                            site.lain.renderOrder = 1;
                            nodes_to_modify.forEach((node) => {
                                if (node) {
                                    node.mesh.renderOrder = 2;
                                }
                            });
                        },
                        apply_time: time + 2600,
                    },
                    {
                        apply: (site: SiteScene) => {
                            site.middle_ring.front_side.renderOrder = 0;
                            site.lain.renderOrder = 0;
                            nodes_to_modify.forEach((node) => {
                                if (node) {
                                    node.mesh.renderOrder = 0;
                                }
                            });

                            play_audio(SFX.SND_13);
                            play_audio(SFX.SND_14);
                        },
                        apply_time: time + 3100,
                    }
                );

                break;
            case LainAnimationKind.Rip_Node:
                node.mesh.add_animations(get_node_rip_animations(node, site.main_handle.rotation.y));

                play_audio(SFX.SND_0);

                site.events.push(
                    {
                        apply: () => {
                            play_audio(SFX.SND_12);
                        },
                        apply_time: time + 1500,
                    },
                    {
                        apply: (site: SiteScene) => {
                            site.node_rip = new NodeRip(node.mesh);
                            site.add(site.node_rip);
                        },
                        apply_time: time + 4100,
                    }
                );

                break;
        }
    }
}

function handle_finished_lain_animation(
    site: SiteScene,
    lain_animation: LainAnimationKind,
    progress: Progress,
    player_name: string,
    time: number
): SceneUpdateResult {
    switch (lain_animation) {
        case LainAnimationKind.Jump_Up:
        case LainAnimationKind.Jump_Down:
            set_node(site, site.cursor_location, time);
            break;
        case LainAnimationKind.Walk_Left:
        case LainAnimationKind.Walk_Right:
            set_node(site, site.cursor_location, time);
            break;
        case LainAnimationKind.Rip_Node:
        case LainAnimationKind.Throw_Node:
            const node = get_node(site.cursor_location, site.layout);
            if (node === null) {
                console.warn("finished node animation while it was null, ignoring");
                return {};
            }

            switch (node.type) {
                case NodeKind.Polytan:
                    const part = get_polytan_part_from_node_name(node.name);

                    switch (part) {
                        case PolytanPart.Head:
                            progress.polytan_parts.head = true;
                            break;
                        case PolytanPart.RightArm:
                            progress.polytan_parts.right_arm = true;
                            break;
                        case PolytanPart.LeftArm:
                            progress.polytan_parts.left_arm = true;
                            break;
                        case PolytanPart.RightLeg:
                            progress.polytan_parts.right_leg = true;
                            break;
                        case PolytanPart.LeftLeg:
                            progress.polytan_parts.left_leg = true;
                            break;
                        case PolytanPart.Body:
                            progress.polytan_parts.body = true;
                            break;
                    }

                    return {
                        new_scene: new PolytanScene(progress.polytan_parts, time, site.cursor_location, node),
                    };
                case NodeKind.Gate:
                    progress.gate_level++;

                    return {
                        new_scene: new GateScene(time, progress.gate_level, site.cursor_location, node.id),
                    };
                case NodeKind.Sskn:
                    return { new_scene: new SSknScene(site.cursor_location, node.id) };
                case NodeKind.Tak:
                    return { new_scene: new TaKScene(site.cursor_location, node) };
                case NodeKind.Cou:
                case NodeKind.Dc:
                case NodeKind.Dia:
                case NodeKind.Lda:
                case NodeKind.Tda:
                    return {
                        new_scene: new LoadingScene(
                            time,
                            () => new MediaScene(site.cursor_location, player_name, node)
                        ),
                    };
            }
            break;
        case LainAnimationKind.Rip_Middle_Ring:
            play_audio(SFX.SND_23);
            hide_hud(site);
            site.middle_ring.visible = false;
            site.background_sprite.add_position_y_animation(3, 2);
            site.main_handle_pivot.add_animations([
                {
                    [AnimationProperty.RotationX]: { target: Math.PI / 2, speed: 1 },
                    [AnimationProperty.Position]: { target: vec3(0, -3, -3), speed: 2.7 },
                    end_cb: () => {
                        site.pause_menu.open(time);
                        site.gray_lines.visible = false;
                        site.is_pausing = false;
                    },
                },
            ]);

            break;
    }

    return {};
}

const CAMERA_TILT = 0.1;

function cycle_camera_tilt(site: SiteScene, camera: THREE.PerspectiveCamera): void {
    // NOTE: due to OrbitControls this function doesn't work in debug mode but it's fine maybe.
    if (
        camera.rotation.x !== site.camera_tilt.target_value ||
        site.lain.is_navigating() ||
        site.descriptor.is_animating()
    ) {
        return;
    }

    switch (site.camera_tilt.target_value) {
        case 0:
            if (site.camera_tilt.previous_tilt_value === CAMERA_TILT) {
                site.camera_tilt.previous_tilt_value = -CAMERA_TILT;
                site.camera_tilt.target_value = -CAMERA_TILT;
            } else {
                site.camera_tilt.previous_tilt_value = CAMERA_TILT;
                site.camera_tilt.target_value = CAMERA_TILT;
            }
            break;
        case CAMERA_TILT:
        case -CAMERA_TILT:
            site.camera_tilt.previous_tilt_value = site.camera_tilt.target_value;
            site.camera_tilt.target_value = 0;
    }
}

function reset_camera_tilt(site: SiteScene): void {
    site.camera_tilt.previous_tilt_value = -CAMERA_TILT;
    site.camera_tilt.target_value = 0;
}

function handle_keys(
    site: SiteScene,
    key_states: boolean[],
    camera: THREE.PerspectiveCamera,
    time_ctx: TimeContext,
    game_state: GameState
): SceneUpdateResult {
    const { time } = time_ctx;
    const { progress } = game_state;

    if (site.word_not_found_popup.visible) {
        if (key_states[Key.Circle]) {
            site.word_not_found_popup.visible = false;
            show_hud(site);
        }
    } else if (site.pause_menu.is_open()) {
        if (site.pause_menu.permission_denied_popup.visible) {
            if (any_key_pressed(key_states)) {
                site.pause_menu.permission_denied_popup.visible = false;
            }
        } else if (site.pause_menu.about.visible) {
            if (any_key_pressed(key_states)) {
                site.pause_menu.about.visible = false;
                play_audio(SFX.Site_Theme, true);
                pause_audio(SFX.About_Theme);
            }
        } else if (site.pause_menu.prompt.is_open()) {
            switch (site.pause_menu.prompt.handle_keys(key_states)) {
                case PromptAction.Yes:
                    switch (site.pause_menu.current_item) {
                        case PauseMenuItem.Change:
                            game_state.site = game_state.site === SiteKind.A ? SiteKind.B : SiteKind.A;

                            save_state(game_state);

                            return {
                                new_scene: new ChangeSiteScene(
                                    time_ctx.time,
                                    get_current_location(game_state)
                                ),
                            };
                        case PauseMenuItem.Load:
                            site.status_popup.succeed_load(time);
                            break;
                        case PauseMenuItem.Save:
                            site.pause_menu.prompt.close();
                            save_state(game_state);
                            site.status_popup.succeed_save(time);
                            break;
                    }
                    break;
            }
        } else {
            if (site.pause_menu.can_interact()) {
                if (key_states[Key.Up]) {
                    play_audio(SFX.SND_1);
                    site.pause_menu.move_up();
                } else if (key_states[Key.Down]) {
                    play_audio(SFX.SND_1);
                    site.pause_menu.move_down();
                } else if (key_states[Key.Circle]) {
                    switch (site.pause_menu.current_item) {
                        case PauseMenuItem.About:
                            pause_audio(SFX.Site_Theme);
                            play_audio(SFX.About_Theme, true);
                            play_audio(SFX.SND_0);
                            site.pause_menu.show_about();
                            break;
                        case PauseMenuItem.Change:
                            play_audio(SFX.SND_0);

                            if (progress.gate_level < 4) {
                                site.pause_menu.permission_denied_popup.visible = true;
                            } else {
                                site.pause_menu.prompt.open();
                            }

                            break;
                        case PauseMenuItem.Load:
                        case PauseMenuItem.Save:
                            play_audio(SFX.SND_0);
                            site.pause_menu.prompt.open();
                            break;
                        case PauseMenuItem.Exit:
                            play_audio(SFX.SND_0);

                            site.gray_lines.visible = true;

                            site.pause_menu.set_mode(PauseMenuMode.Closing_1, time);
                            site.pause_menu.set_item(PauseMenuItem.None);

                            site.background_sprite.add_position_y_animation(0, 2);

                            site.main_handle_pivot.add_animations([
                                {
                                    [AnimationProperty.RotationX]: { target: 0, speed: 1 },
                                    [AnimationProperty.Position]: { target: vec3(0, 0, 0), speed: 2.7 },
                                    end_cb: () => {
                                        show_hud(site);
                                        site.pause_menu.reset();
                                        site.middle_ring.set_site_enter_animation();
                                    },
                                },
                            ]);
                            break;
                    }
                }
            }
        }
    } else if (site.level_selector.is_open) {
        if (!site.descriptor.is_animating()) {
            if (key_states[Key.Up]) {
                site.level_selector.move_up(time);
            } else if (key_states[Key.Down]) {
                site.level_selector.move_down(time);
            } else if (key_states[Key.Circle]) {
                jump_to_level_via_selector(site, site.level_selector.selected_level, time);
                save_state(game_state);
            } else if (key_states[Key.Cross]) {
                const { name, title, protocol_lines } = get_node_display_text(
                    site.cursor_location,
                    site.layout
                );

                site.descriptor.set(
                    name,
                    get_node_name_position(site.cursor_location.node_matrix_position),
                    BigFontColors.FirstOrange
                );

                site.node_hud.set(title, protocol_lines, site.cursor_location.node_matrix_position);
                site.level_selector.close();

                play_audio(SFX.SND_1);
            }
        }
    } else {
        if (key_states[Key.Up]) {
            reset_camera_tilt(site);
            navigate(site, Direction.Up, time);
            save_state(game_state);
        } else if (key_states[Key.Down]) {
            reset_camera_tilt(site);
            navigate(site, Direction.Down, time);
            save_state(game_state);
        } else if (key_states[Key.Left]) {
            reset_camera_tilt(site);
            navigate(site, Direction.Left, time);
            save_state(game_state);
        } else if (key_states[Key.L1]) {
            reset_camera_tilt(site);
            navigate(site, Direction.Left, time, true);
            save_state(game_state);
        } else if (key_states[Key.R1]) {
            reset_camera_tilt(site);
            navigate(site, Direction.Right, time, true);
            save_state(game_state);
        } else if (key_states[Key.Right]) {
            reset_camera_tilt(site);
            navigate(site, Direction.Right, time);
            save_state(game_state);
        } else if (key_states[Key.Circle]) {
            reset_camera_tilt(site);
            attempt_enter_node(site, progress, time);
        } else if (key_states[Key.Square]) {
            if (!site.descriptor.is_animating() && !site.lain.is_navigating()) {
                site.node_hud.toggle_protocol_lines();
            }
        } else if (key_states[Key.L2]) {
            reset_camera_tilt(site);
            if (!site.descriptor.is_animating() && !site.lain.is_navigating()) {
                site.descriptor.set("Jump To", vec3(-0.2, 0, DESCRIPTOR_POS_Z), BigFontColors.AllOrange);
                site.node_hud.hide();
                site.level_selector.open(site.cursor_location.level);
                play_audio(SFX.SND_1);
            }
        } else if (key_states[Key.Triangle] || key_states[Key.Select]) {
            reset_camera_tilt(site);
            if (site.lain.is_standing() && !site.descriptor.is_animating() && !site.middle_ring.is_locked) {
                site.lain.set_animation(LainAnimationKind.Rip_Middle_Ring, time);
                site.middle_ring.set_pause_animation();
                play_audio(SFX.SND_7);
                site.is_pausing = true;
            }
        } else if (key_states[Key.R2]) {
            cycle_camera_tilt(site, camera);
        }
    }

    return {};
}

function set_location(site: SiteScene, new_location: CursorLocation): void {
    Object.assign(site.cursor_location, new_location);
}

function hide_hud(site: SiteScene): void {
    site.descriptor.scale_hide();
    site.node_hud.scale_hide();
    site.orb.scale_hide();
}

function show_hud(site: SiteScene): void {
    site.descriptor.scale_show();
    site.node_hud.scale_show();
    site.orb.reset(true);
}

const IDLE_MEDIA_DELAY = 30;
const MIN_IDLE_ANIMATION_DELAY = 7.5;
const MAX_IDLE_ANIMATION_DELAY = 10;

export type SiteSceneParameters = {
    word_not_found?: boolean;
    word_search_result?: WordSearchResult;
    intro?: boolean;
};

type CameraTilt = {
    target_value: number;
    previous_tilt_value: number;
};

class Intro extends Group {
    stars: Star[];

    constructor() {
        const lcg = create_LCG(44);

        const scale_xz = 1e-9;
        const scale_y = 1e-10;
        const gen_star_position = (y_multiplier: number = 1) =>
            vec3(lcg() * scale_xz, lcg() * scale_y * y_multiplier, lcg() * scale_xz);

        const stars = [];
        for (const color of [COLORS.blue, COLORS.cyan, COLORS.white]) {
            for (let i = 0; i < 15; i++) {
                stars.push(new Star(gen_star_position(), color));
                stars.push(new Star(gen_star_position(15), color));
                stars.push(new Star(gen_star_position(20), color));
            }
        }

        super({ children: stars, position: vec3(-2.3, -8, -4) });

        this.stars = stars;
    }

    put_lain_in_camera_front(lain: Lain, camera: THREE.Camera): void {
        camera.updateMatrixWorld(true);

        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);

        const up = new THREE.Vector3(0, 1, 0);
        up.transformDirection(camera.matrixWorld);

        lain.position.copy(camera.position).add(direction.multiplyScalar(2.7)).add(up.multiplyScalar(-0.15));
    }

    update(site: SiteScene, camera: THREE.Camera, time_ctx: TimeContext): void {
        const { delta } = time_ctx;

        this.stars.forEach((star) => star.update(delta * 4));

        const is_done_animating = animate_object_position(camera, vec3(0, 0, 0), delta * 6);

        camera.lookAt(0, 0, -4);

        if (!is_done_animating) {
            this.put_lain_in_camera_front(site.lain, camera);
        } else {
            this.put_lain_in_camera_front(site.lain, camera);

            site.intro?.dispose();

            site.intro = null;

            show_hud(site);

            site.middle_ring.scale_show();
            site.middle_ring.set_site_enter_animation();

            site.level_selector.scale_show();

            site.levels.forEach((level) => level.scale_show());
        }

        if (camera.position.y <= 5 && site.gray_lines.is_hidden_by_scale()) {
            site.starfield.paused = false;
            site.gray_lines.scale_show();
            site.background_sprite.visible = true;
        }

        if (camera.position.y <= 5) {
            site.background_sprite.position_y_towards(0, delta * 4);
        }

        if (camera.position.y <= 1) {
            site.lain.update(time_ctx);
        }
    }

    dispose(): void {
        this.stars.forEach((star) => {
            star.geometry.dispose();
            star.material.dispose();
        });

        this.removeFromParent();
    }
}

export class SiteScene extends THREE.Scene {
    scene_kind: SceneKind.Site;
    // majority of the site (nodes, purple rings, gray rings, crystals, etc).
    // having a separate handle for this is useful for managing rotation/movement of the site as a whole
    main_handle: Group;
    // used to animate pause, tilt
    main_handle_pivot: Group;
    purple_rings: Mesh[];
    layout: SiteLayout;
    middle_ring: MiddleRing;
    active_node: Node | null;
    node_rip: NodeRip | null;
    node_explode: NodeExplode | null;
    // direct reference to game_state's location objects - very important to use the set_location function to modify this.
    cursor_location: CursorLocation;
    lain: Lain;
    descriptor: BigFontText;
    level_selector: LevelSelector;
    is_pausing: boolean;
    pause_menu: PauseMenu;
    node_hud: NodeHUD;
    starfield: Starfield;
    gray_lines: GrayLines;
    orb: Orb;
    last_keypress_time: number;
    last_idle_animation_play_time: number;
    idle_animation_delay: number;
    word_not_found_popup: Group;
    events: SceneEvent<SiteScene>[];
    is_jumping_to_word: boolean;
    camera_tilt: CameraTilt;
    intro: Intro | null;
    background_sprite: Sprite2D;
    levels: Group[] = [];
    status_popup: StatusPopup;
    is_settings_modal_open: boolean;

    constructor(
        progress: Progress,
        cursor_location: CursorLocation,
        time: number,
        camera: THREE.Camera,
        { word_not_found = false, word_search_result = undefined, intro = false }: SiteSceneParameters = {}
    ) {
        super();

        this.events = [];

        this.camera_tilt = { target_value: 0, previous_tilt_value: -CAMERA_TILT };

        this.scene_kind = SceneKind.Site;

        this.cursor_location = cursor_location;

        const { level, site_segment } = cursor_location;

        this.layout = create_site_layout(cursor_location.site_kind, progress);

        this.node_rip = null;
        this.node_explode = null;

        this.descriptor = new BigFontText(get_node_name(cursor_location, this.layout), {
            speed: 5,
            position: get_node_name_position(cursor_location.node_matrix_position),
            scale_factor: 15,
        });

        this.gray_lines = new GrayLines();

        this.middle_ring = new MiddleRing();

        this.lain = new Lain(vec3(0, -0.15, -2.7));

        this.active_node = get_node(cursor_location, this.layout);
        if (this.active_node != null) {
            activate_node(this.active_node.mesh, time);
            this.node_hud = new NodeHUD(
                this.active_node.title,
                get_formatted_protocol_lines(this.active_node),
                cursor_location.node_matrix_position
            );
        } else {
            this.node_hud = new NodeHUD("", ["", "", ""], cursor_location.node_matrix_position);
        }

        this.level_selector = new LevelSelector(
            cursor_location.level,
            get_level_count(cursor_location.site_kind)
        );

        this.is_pausing = false;
        this.pause_menu = new PauseMenu();

        this.starfield = new Starfield();

        this.orb = new Orb();

        this.purple_rings = create_purple_rings(cursor_location.site_kind);
        const gray_rings = create_gray_rings(cursor_location.site_kind);
        const crystals = create_crystals(cursor_location.site_kind);

        this.levels = [];
        for (let i = 0; i <= get_level_count(cursor_location.site_kind); i++) {
            this.levels.push(
                new Group({
                    children: [
                        this.purple_rings[i],
                        gray_rings[i],
                        crystals[i],
                        ...this.layout[i]
                            .flatMap((row) => row.filter((item) => item !== null))
                            .map((n) => n.mesh),
                    ],
                })
            );
        }

        this.main_handle = new Group({
            position: vec3(0, get_level_y(level) * -1, SITE_Z),
            rotation: get_rotation_for_site_segment(site_segment),
            children: [...this.levels],
        });

        this.main_handle_pivot = new Group({
            children: [
                this.gray_lines,
                this.main_handle,
                this.starfield,
                create_point_light({ color: 0xffffff, intensity: 0.65, position: vec3(0, 0, 7) }),
                create_point_light({ color: 0xffffff, intensity: 0.8, position: vec3(0, 0, -7) }),
                create_point_light({ color: 0x7f7f7f, intensity: 1.5, position: vec3(0, 10, 0) }),
                create_point_light({ color: 0xffffff, intensity: 0.2, position: vec3(8, 0, 0) }),
                create_point_light({ color: 0x7f7f7f, intensity: 0.2, position: vec3(-8, 0, 0) }),
            ],
        });

        this.last_keypress_time = time;
        this.last_idle_animation_play_time = -1;
        this.idle_animation_delay = MAX_IDLE_ANIMATION_DELAY;

        const word_not_found_render_order = 9999999;
        const word_not_found_scale = 10;

        this.word_not_found_popup = new Group({
            position: vec3(0, 0, -3.8),
            children: [
                new Sprite3D(Texture.Not_Found, {
                    scale_factor: word_not_found_scale,
                    render_order: word_not_found_render_order,
                    depth_test: false,
                    opacity: 0.8,
                }),
                new Sprite3D(Texture.Not_Found_Lof, {
                    scale_factor: word_not_found_scale,
                    render_order: word_not_found_render_order,
                    depth_test: false,
                    position: vec3(-0.8, 0.08, 0),
                }),
            ],
            visible: false,
        });

        this.status_popup = new StatusPopup(SceneKind.Site);

        this.background_sprite = new Sprite2D(get_texture(Texture.Main_Scene_Bg), {
            scale: vec3(10, 0.65, 1),
            position: vec3(0, 0, -3.5),
            render_order: -5,
            depth_test: false,
        });

        this.add(
            this.status_popup,
            this.word_not_found_popup,
            this.main_handle_pivot,
            this.pause_menu,
            this.middle_ring,
            this.lain,
            this.orb,
            this.descriptor,
            this.node_hud,
            this.level_selector,
            this.background_sprite
        );

        if (word_not_found) {
            play_audio(SFX.SND_30);

            hide_hud(this);

            this.word_not_found_popup.visible = true;
        }

        this.is_jumping_to_word = false;

        if (word_search_result) {
            play_audio(SFX.SND_29);

            this.is_jumping_to_word = true;

            this.descriptor.visible = false;
            this.node_hud.visible = false;
            this.middle_ring.visible = false;
            this.lain.visible = false;

            const target_cursor_location = word_search_result.cursor_location;

            const { target_position } = get_site_position_animation_ctx(
                this.cursor_location.level,
                target_cursor_location.level
            );

            const { target_rotation } = get_site_rotation_animation_ctx(
                target_cursor_location.site_segment,
                this.main_handle.rotation.y
            );

            const animations: Animations[] = [
                {
                    [AnimationProperty.Position]: { target: target_position, speed: 16 },
                },
                {
                    [AnimationProperty.Rotation]: { target: target_rotation, speed: 1.6 },
                    end_cb: () => {
                        this.descriptor.visible = true;
                        this.node_hud.visible = true;
                        this.middle_ring.visible = true;
                        this.lain.visible = true;

                        this.middle_ring.set_word_jump_animation();
                        this.lain.set_glowing();

                        this.is_jumping_to_word = false;
                    },
                },
            ];

            this.main_handle.add_animations(animations);

            set_node(this, target_cursor_location, time, true);
        }

        if (intro) {
            play_audio(SFX.SND_32);

            camera.position.y = 25;
            camera.position.z = -2.5;

            hide_hud(this);

            this.middle_ring.scale_hide();
            this.level_selector.scale_hide();
            this.gray_lines.scale_hide();

            this.background_sprite.position.y += 3;
            this.background_sprite.visible = false;

            this.intro = new Intro();

            this.intro.put_lain_in_camera_front(this.lain, camera);
            this.lain.set_animation(LainAnimationKind.Intro, time);

            this.starfield.speed_boost = 10;
            this.starfield.paused = true;

            const start = Math.max(0, level - 3);
            const end = Math.min(get_level_count(cursor_location.site_kind) + 1, level + 3);

            for (let i = 0; i < start; i++) {
                this.levels[i].scale_hide();
            }

            for (let i = end; i <= get_level_count(cursor_location.site_kind); i++) {
                this.levels[i].scale_hide();
            }

            this.add(this.intro);
        } else {
            this.intro = null;
        }

        this.is_settings_modal_open = false;

        play_audio(SFX.Site_Theme, true);
    }
}

function handle_status(
    site: SiteScene,
    game_state: GameState,
    camera: THREE.Camera,
    time: number
): SceneUpdateResult {
    switch (site.status_popup.status) {
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
        case Status.SaveSuccess:
        case Status.LoadFail:
        case Status.None:
            site.status_popup.close();
            break;
    }

    return {};
}

export function update_site_scene(site: SiteScene, ctx: SceneUpdateContext): SceneUpdateResult {
    const { key_states, time_ctx, game_state, camera } = ctx;
    const { progress } = game_state;

    const { time, delta } = time_ctx;

    if (any_key_pressed(key_states)) {
        site.last_keypress_time = time;
        site.last_idle_animation_play_time = -1;
        site.idle_animation_delay = MAX_IDLE_ANIMATION_DELAY;
    }

    process_scene_events(site, site.events, time);

    const has_submenu_or_popup_open =
        site.pause_menu.is_open() ||
        site.level_selector.is_open ||
        site.word_not_found_popup.visible ||
        site.status_popup.visible;

    if (
        time >= site.last_keypress_time + secs_to_ms(site.idle_animation_delay) &&
        time >= site.last_idle_animation_play_time + secs_to_ms(site.idle_animation_delay) &&
        !site.is_pausing &&
        !has_submenu_or_popup_open
    ) {
        site.lain.play_idle_animation(time);
        site.last_idle_animation_play_time = time;
        site.idle_animation_delay = MIN_IDLE_ANIMATION_DELAY;
    }

    if (
        time > site.last_keypress_time + secs_to_ms(IDLE_MEDIA_DELAY) &&
        !site.orb.transitioning &&
        !site.is_pausing &&
        !site.is_settings_modal_open &&
        !has_submenu_or_popup_open
    ) {
        play_audio(SFX.SND_32);
        site.orb.transitioning = true;
    }

    if (
        !site.orb.transitioning &&
        !site.intro &&
        !site.is_jumping_to_word &&
        !site.status_popup.visible &&
        !site.is_pausing
    ) {
        const scene_update = handle_keys(site, key_states, camera, time_ctx, game_state);
        if (scene_update.new_scene) {
            return scene_update;
        }
    }

    if (site.status_popup.has_status_to_handle(time)) {
        const scene_update = handle_status(site, game_state, camera, time);
        if (scene_update.new_scene) {
            return scene_update;
        }
    }

    site.purple_rings.forEach((ring) => (ring.rotation.y += delta / 3));

    site.descriptor.update(time_ctx);

    if (site.intro) {
        site.intro.update(site, camera, time_ctx);
    } else {
        animate_object_x_rotation(camera, site.camera_tilt.target_value, 1 * delta);

        const { finished_animation } = site.lain.update(time_ctx);
        if (finished_animation !== null) {
            const scene_update = handle_finished_lain_animation(
                site,
                finished_animation,
                progress,
                game_state.name,
                time
            );

            if (scene_update.new_scene) {
                return scene_update;
            }
        }
    }

    site.middle_ring.update(time_ctx);

    site.main_handle.process_animation_queue(time_ctx);

    site.main_handle_pivot.process_animation_queue(time_ctx);

    if (site.active_node) {
        update_node_bias_uniform(site.active_node.mesh, time);
        site.active_node.mesh.process_animation_queue(time_ctx);
    }

    site.level_selector.update(time_ctx);

    site.pause_menu.update(time_ctx, camera);

    site.node_hud.update(time_ctx);

    site.starfield.update(delta);

    site.gray_lines.update(delta);

    site.background_sprite.process_animation_queue(time_ctx);

    if (site.node_rip) {
        site.node_rip.update(time_ctx);
    }

    if (site.node_explode) {
        site.node_explode.update(time_ctx);
    }

    const should_play_idle_scene = site.orb.update(time_ctx);
    if (should_play_idle_scene) {
        return { new_scene: new IdleScene(site.cursor_location, progress.polytan_parts, time) };
    }

    return {};
}
