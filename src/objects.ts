import * as THREE from "three";
import * as uWrap from "uwrap";
import {
    ModelKind,
    SPRITE_ATLAS_DIM,
    TimeContext,
    all_gltfs_loaded,
    get_model,
    get_texture,
    get_texture_atlas,
} from "./engine";
import { euler, extract_frame, vec3 } from "./util";
import { Texture } from "./textures";
import sprite_atlas_json from "./static/json/sprite_atlas.json";
import { MediaAudio } from "./media_audio";
import { Cue } from "subtitle";

export type Vec3 = THREE.Vector3;

export type Euler = THREE.Euler;

export enum AnimationProperty {
    Position,
    PositionY,
    PositionX,
    Rotation,
    RotationX,
    RotationY,
    RotationZ,
    Opacity,
    Scale,
    RelativeScale,
    ShaderUniforms,
    CurvedPosition,
}

type BaseAnimation = {
    delay?: number;
    speed: number;
};

export type PositionAnimation = BaseAnimation & {
    target: Vec3;
};

export type PositionYAnimation = BaseAnimation & {
    target: number;
};

export type PositionXAnimation = BaseAnimation & {
    target: number;
};

type RotationAnimation = BaseAnimation & {
    target: THREE.Euler;
};

type RotationXAnimation = BaseAnimation & {
    target: number;
};

type RotationYAnimation = BaseAnimation & {
    target: number;
};

type RotationZAnimation = BaseAnimation & {
    target: number;
};

type OpacityAnimation = BaseAnimation & {
    target: number;
};

type ScaleAnimation = BaseAnimation & {
    target: Vec3;
};

type RelativeScaleAnimation = BaseAnimation & {
    multiplier: Vec3;
    // late-initialized (we calculate it once when we first process the animation)
    target?: Vec3;
};

export type ShaderUniformAnimation = BaseAnimation & {
    key: string;
    target: number;
};

type ShaderUniformAnimations = ShaderUniformAnimation[];

type CurvedPositionAnimation = BaseAnimation & {
    target_curve: THREE.CatmullRomCurve3;
    reversed?: boolean;
    progress_on_curve?: number; // 0 to 1
};

type CallbackFn = () => void;

export type Animations = {
    delay?: number;
    start_cb?: CallbackFn;
    end_cb?: CallbackFn;
    [AnimationProperty.Position]?: PositionAnimation;
    [AnimationProperty.PositionY]?: PositionYAnimation;
    [AnimationProperty.PositionX]?: PositionXAnimation;
    [AnimationProperty.Rotation]?: RotationAnimation;
    [AnimationProperty.RotationX]?: RotationXAnimation;
    [AnimationProperty.RotationY]?: RotationYAnimation;
    [AnimationProperty.RotationZ]?: RotationZAnimation;
    [AnimationProperty.Opacity]?: OpacityAnimation;
    [AnimationProperty.Scale]?: ScaleAnimation;
    [AnimationProperty.RelativeScale]?: RelativeScaleAnimation;
    [AnimationProperty.ShaderUniforms]?: ShaderUniformAnimations;
    [AnimationProperty.CurvedPosition]?: CurvedPositionAnimation;
};

type AnimationProps = {
    delay?: number;
    start_cb?: CallbackFn;
    end_cb?: CallbackFn;
};

function animate_curved_position(
    object: THREE.Object3D,
    animation_data: CurvedPositionAnimation,
    delta: number,
): boolean {
    if (animation_data.progress_on_curve === undefined) {
        animation_data.progress_on_curve = 0;
    }

    let done_animating = false;
    if (animation_data.reversed) {
        animation_data.progress_on_curve -= delta * animation_data.speed;
        animation_data.progress_on_curve = Math.max(animation_data.progress_on_curve, 0);
        done_animating = animation_data.progress_on_curve <= 0.0;
    } else {
        animation_data.progress_on_curve += delta * animation_data.speed;
        animation_data.progress_on_curve = Math.min(animation_data.progress_on_curve, 1);
        done_animating = animation_data.progress_on_curve >= 1.0;
    }

    const position = animation_data.target_curve.getPoint(animation_data.progress_on_curve);
    object.position.copy(position);

    return done_animating;
}

class AnimationController {
    queue: Animations[] = [];
    current_animation_start_time: number = -1;

    is_too_early_to_animate(animation: Animations | BaseAnimation, time: number): boolean {
        return animation.delay !== undefined && time < this.current_animation_start_time + animation.delay;
    }

    process_animation_queue(object: THREE.Object3D, time_ctx: TimeContext): Animations {
        if (this.queue.length === 0) {
            return {};
        }

        const { delta, time } = time_ctx;

        const animations = this.queue[0];

        if (this.current_animation_start_time === -1) {
            this.current_animation_start_time = time;
        }

        if (this.is_too_early_to_animate(animations, time)) {
            return {};
        }

        if (animations.start_cb) {
            animations.start_cb();
            animations.start_cb = undefined;
        }

        let opacity_animation_done = true;
        const opacity_animation = animations[AnimationProperty.Opacity];
        if (opacity_animation) {
            if (this.is_too_early_to_animate(opacity_animation, time)) {
                opacity_animation_done = false;
            } else {
                const { target, speed } = opacity_animation;

                if (object instanceof Mesh || object instanceof Sprite3D) {
                    opacity_animation_done = animate_object_opacity(object, target, speed * delta);
                } else if (object instanceof Group) {
                    opacity_animation_done = animate_group_opacity(object, target, speed * delta);
                }
            }
        }

        let position_animation_done = true;
        const position_animation = animations[AnimationProperty.Position];
        if (position_animation) {
            if (this.is_too_early_to_animate(position_animation, time)) {
                position_animation_done = false;
            } else {
                const { target, speed } = position_animation;

                position_animation_done = animate_object_position(object, target, speed * delta);
            }
        }

        let position_y_animation_done = true;
        const position_y_animation = animations[AnimationProperty.PositionY];
        if (position_y_animation) {
            if (this.is_too_early_to_animate(position_y_animation, time)) {
                position_y_animation_done = false;
            } else {
                const { target, speed } = position_y_animation;

                position_y_animation_done = animate_object_position_y(object, target, speed * delta);
            }
        }

        let position_x_animation_done = true;
        const position_x_animation = animations[AnimationProperty.PositionX];
        if (position_x_animation) {
            if (this.is_too_early_to_animate(position_x_animation, time)) {
                position_x_animation_done = false;
            } else {
                const { target, speed } = position_x_animation;

                position_x_animation_done = animate_object_position_x(object, target, speed * delta);
            }
        }

        let rotation_animation_done = true;
        const rotation_animation = animations[AnimationProperty.Rotation];
        if (rotation_animation) {
            if (this.is_too_early_to_animate(rotation_animation, time)) {
                rotation_animation_done = false;
            } else {
                const { target, speed } = rotation_animation;

                rotation_animation_done = animate_object_rotation(object, target, speed * delta);
            }
        }

        let rotation_x_animation_done = true;
        const rotation_x_animation = animations[AnimationProperty.RotationX];
        if (rotation_x_animation) {
            if (this.is_too_early_to_animate(rotation_x_animation, time)) {
                rotation_x_animation_done = false;
            } else {
                const { target, speed } = rotation_x_animation;
                rotation_x_animation_done = animate_object_x_rotation(object, target, speed * delta);
            }
        }

        let rotation_y_animation_done = true;
        const rotation_y_animation = animations[AnimationProperty.RotationY];
        if (rotation_y_animation) {
            if (this.is_too_early_to_animate(rotation_y_animation, time)) {
                rotation_y_animation_done = false;
            } else {
                const { target, speed } = rotation_y_animation;
                rotation_y_animation_done = animate_object_y_rotation(object, target, speed * delta);
            }
        }

        let rotation_z_animation_done = true;
        const rotation_z_animation = animations[AnimationProperty.RotationZ];
        if (rotation_z_animation) {
            if (this.is_too_early_to_animate(rotation_z_animation, time)) {
                rotation_z_animation_done = false;
            } else {
                const { target, speed } = rotation_z_animation;
                rotation_z_animation_done = animate_object_z_rotation(object, target, speed * delta);
            }
        }

        let scale_animation_done = true;
        const scale_animation = animations[AnimationProperty.Scale];
        if (scale_animation) {
            if (this.is_too_early_to_animate(scale_animation, time)) {
                scale_animation_done = false;
            } else {
                const { target, speed } = scale_animation;
                scale_animation_done = animate_object_scale(object, target, speed * delta);
            }
        }

        let relative_scale_animation_done = true;
        const relative_scale_animation = animations[AnimationProperty.RelativeScale];
        if (relative_scale_animation) {
            if (this.is_too_early_to_animate(relative_scale_animation, time)) {
                relative_scale_animation_done = false;
            } else {
                const { multiplier, speed } = relative_scale_animation;

                if (!relative_scale_animation.target) {
                    relative_scale_animation.target = vec3(
                        object.scale.x * multiplier.x,
                        object.scale.y * multiplier.y,
                        object.scale.z * multiplier.z,
                    );
                }

                relative_scale_animation_done = animate_object_scale(
                    object,
                    relative_scale_animation.target,
                    speed * delta,
                );
            }
        }

        let uniform_animations_done = true;
        const uniform_animations = animations[AnimationProperty.ShaderUniforms];
        if (uniform_animations) {
            let all_animations_done = true;

            for (const uniform_animation of uniform_animations) {
                if (this.is_too_early_to_animate(uniform_animation, time)) {
                    all_animations_done = false;
                } else {
                    const { target, key, speed } = uniform_animation;

                    if (!(object instanceof Mesh)) {
                        throw new Error("not implemented");
                    }

                    if (!animate_object_uniform_number(object, key, target, speed * delta)) {
                        all_animations_done = false;
                    }
                }
            }

            uniform_animations_done = all_animations_done;
        }

        let curved_position_animation_done = true;
        const curved_position_animation = animations[AnimationProperty.CurvedPosition];
        if (curved_position_animation) {
            if (this.is_too_early_to_animate(curved_position_animation, time)) {
                curved_position_animation_done = false;
            } else {
                curved_position_animation_done = animate_curved_position(
                    object,
                    curved_position_animation,
                    delta,
                );
            }
        }

        const is_animation_finished =
            opacity_animation_done &&
            position_animation_done &&
            position_x_animation_done &&
            position_y_animation_done &&
            rotation_animation_done &&
            scale_animation_done &&
            relative_scale_animation_done &&
            rotation_x_animation_done &&
            rotation_y_animation_done &&
            rotation_z_animation_done &&
            curved_position_animation_done &&
            uniform_animations_done;

        if (is_animation_finished) {
            this.current_animation_start_time = -1;

            const result = this.queue.shift();
            if (result) {
                if (animations.end_cb) {
                    animations.end_cb();
                }

                return result;
            }
        }

        return {};
    }

    queue_empty(): boolean {
        return this.queue.length === 0;
    }

    add_opacity_animation(target: number, speed: number, props?: AnimationProps): void {
        this.queue.push({
            ...props,
            [AnimationProperty.Opacity]: {
                target,
                speed,
            },
        });
    }

    add_position_animation(target: Vec3, speed: number, props?: AnimationProps): void {
        this.queue.push({
            ...props,
            [AnimationProperty.Position]: {
                target,
                speed,
            },
        });
    }

    add_position_y_animation(target: number, speed: number, props?: AnimationProps): void {
        this.queue.push({
            ...props,
            [AnimationProperty.PositionY]: {
                target,
                speed,
            },
        });
    }

    add_rotation_animation(target: Euler, speed: number, props?: AnimationProps): void {
        this.queue.push({
            ...props,
            [AnimationProperty.Rotation]: {
                target,
                speed,
            },
        });
    }

    add_rotation_x_animation(target: number, speed: number, props?: AnimationProps): void {
        this.queue.push({
            ...props,
            [AnimationProperty.RotationX]: {
                target,
                speed,
            },
        });
    }

    add_rotation_y_animation(target: number, speed: number, props?: AnimationProps): void {
        this.queue.push({
            ...props,
            [AnimationProperty.RotationY]: {
                target,
                speed,
            },
        });
    }

    add_scale_animation(target: Vec3, speed: number, props?: AnimationProps): void {
        this.queue.push({
            ...props,
            [AnimationProperty.Scale]: {
                target,
                speed,
            },
        });
    }

    add_animations(animations: Animations[]): void {
        animations.forEach((a) => this.queue.push(a));
    }

    reset(): void {
        this.queue = [];
        this.current_animation_start_time = -1;
    }
}

export enum Sprite3DMaterialKind {
    Basic,
    Standard,
}

type Sprite3DParameters = {
    scale_factor?: number;
    position?: Vec3;
    rotation?: THREE.Euler;
    opacity?: number;
    render_order?: number;
    depth_test?: boolean;
    visible?: boolean;
    color?: THREE.ColorRepresentation;
    material_kind?: Sprite3DMaterialKind;
    side?: THREE.Side;
};

type Sprite3DMaterial = THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;

export class Sprite3D extends THREE.Mesh<THREE.PlaneGeometry, Sprite3DMaterial> {
    scale_factor: number;
    animation_controller: AnimationController;

    constructor(
        textures: Texture,
        {
            scale_factor = 1,
            position = vec3(0, 0, 0),
            rotation = euler(0, 0, 0),
            opacity = 1,
            render_order = 0,
            depth_test = true,
            visible = true,
            material_kind = Sprite3DMaterialKind.Basic,
            side = THREE.FrontSide,
            color = 0xffffff,
        }: Sprite3DParameters,
    ) {
        const texture = get_texture(textures);

        switch (material_kind) {
            case Sprite3DMaterialKind.Standard:
                super(
                    new THREE.PlaneGeometry(),
                    new THREE.MeshStandardMaterial({
                        map: texture,
                        side,
                        color,
                    }),
                );
                break;
            case Sprite3DMaterialKind.Basic:
            default:
                super(
                    new THREE.PlaneGeometry(),
                    new THREE.MeshBasicMaterial({
                        map: texture,
                        side,
                        color,
                    }),
                );
                break;
        }

        this.material.transparent = true;
        this.material.opacity = opacity;
        this.material.depthTest = depth_test;

        this.renderOrder = render_order;
        this.position.copy(position);
        this.rotation.copy(rotation);
        this.visible = visible;

        set_plane_object_scale_proportionally(this, scale_factor);

        this.scale_factor = scale_factor;
        this.animation_controller = new AnimationController();
    }

    process_animation_queue(time_ctx: TimeContext): Animations {
        return this.animation_controller.process_animation_queue(this, time_ctx);
    }

    clear_animations(): void {
        this.animation_controller.reset();
    }

    set_texture(textures: Texture): void {
        this.material.map = get_texture(textures);
        set_plane_object_scale_proportionally(this, this.scale_factor);
    }

    add_opacity_animation(target: number, speed: number, props?: AnimationProps): void {
        this.animation_controller.add_opacity_animation(target, speed, props);
    }

    add_position_animation(target: Vec3, speed: number, props?: AnimationProps): void {
        this.animation_controller.add_position_animation(target, speed, props);
    }

    is_flipped_x(): boolean {
        return this.scale.x < 0;
    }

    flip_x(): void {
        this.scale.x *= -1;
    }

    is_animating(): boolean {
        return !this.animation_controller.queue_empty();
    }
}

export type Spritesheet3DParameters = Sprite3DParameters & {
    frame_count: number;
    rows: number;
    columns: number;
    frame_update_rate: number;
    loop: boolean;
};

export class Spritesheet3D extends THREE.Mesh<THREE.PlaneGeometry, Sprite3DMaterial> {
    last_update_time: number;
    current_frame: number;
    frame_textures: THREE.Texture[];
    frame_update_rate: number;
    loop: boolean;

    constructor(
        textures: Texture,
        {
            scale_factor = 1,
            position = vec3(0, 0, 0),
            rotation = euler(0, 0, 0),
            opacity = 1,
            render_order = 0,
            depth_test = true,
            visible = true,
            frame_count,
            rows,
            columns,
            frame_update_rate,
            loop,
        }: Spritesheet3DParameters,
    ) {
        const [spritesheet_w, spritesheet_h] = [sprite_atlas_json[textures].w, sprite_atlas_json[textures].h];

        const [frame_w, frame_h] = [spritesheet_w / columns, spritesheet_h / rows];

        const frame_textures = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < columns; c++) {
                if (frame_textures.length >= frame_count) {
                    break;
                }

                const frame = extract_frame(
                    get_texture_atlas(),
                    SPRITE_ATLAS_DIM,
                    SPRITE_ATLAS_DIM,
                    sprite_atlas_json[textures].x + frame_w * c,
                    sprite_atlas_json[textures].y + frame_h * r,
                    frame_w,
                    frame_h,
                );

                frame_textures.push(frame);
            }
        }

        super(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: frame_textures[0] }));

        this.current_frame = 0;
        this.frame_textures = frame_textures;
        this.last_update_time = -1;
        this.frame_update_rate = frame_update_rate;
        this.loop = loop;

        this.material.transparent = true;
        this.material.opacity = opacity;
        this.material.depthTest = depth_test;

        this.renderOrder = render_order;
        this.position.copy(position);
        this.rotation.copy(rotation);
        this.visible = visible;

        set_plane_object_scale_proportionally(this, scale_factor);
    }

    update(time: number): void {
        if (this.frame_update_rate != -1 && time >= this.last_update_time + this.frame_update_rate) {
            this.set_next_frame(time);
        }
    }

    set_next_frame(time: number): void {
        this.last_update_time = time;
        this.current_frame++;

        if (this.current_frame >= this.frame_textures.length) {
            if (this.loop) {
                this.current_frame = 0;
            } else {
                this.current_frame = this.frame_textures.length - 1;
            }
        }

        this.material.map = this.frame_textures[this.current_frame];
    }
}

export type StaticSpritesheet3DParameters = Sprite3DParameters & {
    initial_frame?: number;
    frame_count: number;
    rows: number;
    columns: number;
};

export class StaticSpritesheet3D extends THREE.Mesh<THREE.PlaneGeometry, Sprite3DMaterial> {
    frame_textures: THREE.Texture[];

    constructor(
        textures: Texture,
        {
            scale_factor = 1,
            position = vec3(0, 0, 0),
            rotation = euler(0, 0, 0),
            opacity = 1,
            render_order = 0,
            depth_test = true,
            visible = true,
            initial_frame = 0,
            material_kind = Sprite3DMaterialKind.Basic,
            frame_count,
            rows,
            columns,
            color = 0xffffff,
        }: StaticSpritesheet3DParameters,
    ) {
        const [spritesheet_w, spritesheet_h] = [sprite_atlas_json[textures].w, sprite_atlas_json[textures].h];

        const [frame_w, frame_h] = [spritesheet_w / columns, spritesheet_h / rows];

        const frame_textures = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < columns; c++) {
                if (frame_textures.length >= frame_count) {
                    break;
                }

                const frame = extract_frame(
                    get_texture_atlas(),
                    SPRITE_ATLAS_DIM,
                    SPRITE_ATLAS_DIM,
                    sprite_atlas_json[textures].x + frame_w * c,
                    sprite_atlas_json[textures].y + frame_h * r,
                    frame_w,
                    frame_h,
                );

                frame_textures.push(frame);
            }
        }

        switch (material_kind) {
            case Sprite3DMaterialKind.Standard:
                super(
                    new THREE.PlaneGeometry(),
                    new THREE.MeshStandardMaterial({
                        map: frame_textures[initial_frame],
                        color,
                    }),
                );
                break;
            case Sprite3DMaterialKind.Basic:
            default:
                super(
                    new THREE.PlaneGeometry(),
                    new THREE.MeshBasicMaterial({
                        map: frame_textures[initial_frame],
                        color,
                    }),
                );
                break;
        }

        this.frame_textures = frame_textures;

        this.material.transparent = true;
        this.material.opacity = opacity;
        this.material.depthTest = depth_test;

        this.renderOrder = render_order;
        this.position.copy(position);
        this.rotation.copy(rotation);
        this.visible = visible;

        set_plane_object_scale_proportionally(this, scale_factor);
    }

    set_frame(frame_index: number): void {
        this.material.map = this.frame_textures[frame_index];
    }
}

type Sprite2DParameters = {
    position?: Vec3;
    proportional_scale?: number;
    scale?: Vec3;
    depth_test?: boolean;
    render_order?: number;
};

export class Sprite2D extends THREE.Sprite {
    animation_controller: AnimationController;

    constructor(
        map: THREE.Texture,
        {
            position = vec3(0, 0, 0),
            scale = vec3(1, 1, 1),
            render_order = 0,
            depth_test = true,
            proportional_scale = undefined,
        }: Sprite2DParameters,
    ) {
        super(new THREE.SpriteMaterial({ map, depthTest: depth_test }));

        this.renderOrder = render_order;

        if (proportional_scale !== undefined) {
            this.set_scale_proportionally(proportional_scale);
        } else {
            this.scale.copy(scale);
        }

        this.position.copy(position);

        this.animation_controller = new AnimationController();
    }

    set_scale_proportionally(scale: number): void {
        set_plane_object_scale_proportionally(this, scale);
    }

    add_scale_animation(target: Vec3, speed: number, props?: AnimationProps): void {
        this.animation_controller.add_scale_animation(target, speed, props);
    }

    add_position_y_animation(target: number, speed: number, props?: AnimationProps): void {
        this.animation_controller.add_position_y_animation(target, speed, props);
    }

    process_animation_queue(time_ctx: TimeContext): void {
        this.animation_controller.process_animation_queue(this, time_ctx);
    }

    position_y_towards(target: number, speed: number): boolean {
        return animate_object_position_y(this, target, speed);
    }
}

type Fullscreen3DParameters = {
    position_z?: number;
    opacity?: number;
    render_order?: number;
    depth_test?: boolean;
    visible?: boolean;
    color?: THREE.ColorRepresentation;
    side?: THREE.Side;
};

export class Fullscreen3D extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    position_z: number;

    constructor(
        texture: THREE.Texture,
        {
            position_z = -1,
            opacity = 1,
            render_order = 0,
            depth_test = true,
            visible = true,
            side = THREE.FrontSide,
            color = 0xffffff,
        }: Fullscreen3DParameters,
    ) {
        super(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        this.material.map = texture;
        this.position_z = position_z;
        this.material.opacity = opacity;
        this.renderOrder = render_order;
        this.material.depthTest = depth_test;
        this.visible = visible;
        this.material.side = side;
        this.material.color = new THREE.Color(color);
    }

    update(camera: THREE.PerspectiveCamera): void {
        const height = 2 * Math.tan(((camera.fov / 2) * Math.PI) / 180) * Math.abs(this.position_z);
        const width = height * camera.aspect;
        this.scale.set(width, height, 1);

        const offset = new THREE.Vector3(0, 0, this.position_z);
        offset.applyQuaternion(camera.quaternion);
        this.position.copy(camera.position).add(offset);
        this.quaternion.copy(camera.quaternion);
    }
}

type FullscreenMediaVideo3DParameters = Fullscreen3DParameters;

export class FullscreenMediaVideo3D extends Fullscreen3D {
    video: Video;
    should_refresh: boolean;
    canvas: OffscreenCanvas;
    canvas_texture: THREE.CanvasTexture;
    canvas_ctx: OffscreenCanvasRenderingContext2D;
    constructor(video: Video, params: FullscreenMediaVideo3DParameters) {
        const canvas = new OffscreenCanvas(320, 240);
        const canvas_texture = new THREE.CanvasTexture(canvas);
        super(canvas_texture, params);
        this.video = video;
        this.should_refresh = false;
        this.canvas = canvas;
        this.canvas_texture = canvas_texture;
        this.canvas_texture.minFilter = THREE.LinearFilter;
        this.canvas_texture.magFilter = THREE.LinearFilter;
        this.canvas_ctx = this.canvas.getContext("2d");

        const enable_rerender_cb = () => (this.should_refresh = true);
        const disable_rerender_cb = () => (this.should_refresh = false);
        for (const event of ["loadedmetadata", "canplay", "play"]) {
            this.video.addEventListener(event, enable_rerender_cb);
        }
        for (const event of ["pause", "ended"]) {
            this.video.addEventListener(event, disable_rerender_cb);
        }
    }
    update(camera: THREE.PerspectiveCamera): void {
        if (!this.should_refresh) {
            return;
        }
        super.update(camera);
        this.canvas_ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        this.canvas_texture.needsUpdate = true;
    }
}

type FullscreenMediaSubtitles3DParameters = {
    position_z?: number;
    opacity?: number;
    visible?: boolean;
    color?: THREE.ColorRepresentation;
    side?: THREE.Side;
};

export class FullscreenMediaSubtitles3D extends Fullscreen3D {
    video: Video;
    media_audio: MediaAudio;
    active_cues: Set<Cue>;
    cues_by_start: Cue[];
    cues_by_end: Cue[];
    should_refresh: boolean;
    si: number;
    ei: number;
    last_time: number;
    canvas: OffscreenCanvas;
    canvas_texture: THREE.CanvasTexture;
    canvas_ctx: OffscreenCanvasRenderingContext2D;
    font_px: number;
    line_height_px: number;
    background_padding_x_px: number;
    max_width_px: number;
    split: uWrap.Split;
    

    constructor(video: Video, media_audio: MediaAudio, params: FullscreenMediaSubtitles3DParameters) {
        const canvas = new OffscreenCanvas(640, 480);
        const canvas_texture = new THREE.CanvasTexture(canvas);
        super(canvas_texture, {
            depth_test: false,
            render_order: Number.MAX_SAFE_INTEGER,
            ...params,
        });
        this.video = video;
        this.media_audio = media_audio;
        this.should_refresh = false;
        this.active_cues = new Set();
        this.cues_by_start = [];
        this.cues_by_end = [];
        this.si = 0;
        this.ei = 0;
        this.last_time = 0;
        this.canvas = canvas;
        this.canvas_texture = canvas_texture;
        this.canvas_texture.minFilter = THREE.LinearFilter;
        this.canvas_texture.magFilter = THREE.LinearFilter;
        this.canvas_ctx = this.canvas.getContext("2d");

        this.font_px = 22;
        this.line_height_px = 1.2 * this.font_px;
        this.background_padding_x_px = (this.line_height_px - this.font_px) / 2;
        this.max_width_px = this.canvas.width - 50;
        this.canvas_ctx.font = `${this.font_px}px system-ui`;
        this.canvas_ctx.textAlign = "center";
        (this.canvas_ctx as any).letterSpacing = "0px";
        this.split = uWrap.varPreLine(this.canvas_ctx as unknown as CanvasRenderingContext2D).split;

        this.material.transparent = true;

        const enable_rerender_cb = () => (this.should_refresh = true);
        const disable_rerender_cb = () => (this.should_refresh = false);
        for (const event of ["loadedmetadata", "canplay", "play"]) {
            this.video.addEventListener(event, enable_rerender_cb);
        }
        for (const event of ["pause", "ended"]) {
            this.video.addEventListener(event, disable_rerender_cb);
        }
    }

    get_media(): Video | MediaAudio {
        return this.video.src === "" ? this.media_audio : this.video;
    }

    set_cues(new_cues: Cue[]): void {
        this.cues_by_start = [...new_cues].sort((a, b) => a.start - b.start);
        this.cues_by_end = [...new_cues].sort((a, b) => a.end - b.end);
        this.active_cues.clear();
        this.should_refresh = true;
        this.si = 0;
        this.ei = 0;
        this.last_time = 0;
    }

    update(camera: THREE.PerspectiveCamera): void {
        // cue handling first
        let active_cues_updated = false;
        const current_time = this.get_media().currentTime * 1000;
        if (current_time >= this.last_time) {
            while (this.si < this.cues_by_start.length && this.cues_by_start[this.si].start <= current_time) {
                this.active_cues.add(this.cues_by_start[this.si++]);
                active_cues_updated = true;
            }
            while (this.ei < this.cues_by_end.length && this.cues_by_end[this.ei].end < current_time) {
                this.active_cues.delete(this.cues_by_end[this.ei++]);
                active_cues_updated = true;
            }
        } else {
            this.active_cues.clear();
            this.cues_by_start.forEach((cue) => {
                if (cue.start <= current_time && cue.end >= current_time) this.active_cues.add(cue);
            });
            // Reset sweep pointers to match current state
            this.si = this.cues_by_start.findIndex((s) => s.start > current_time);
            if (this.si === -1) this.si = this.cues_by_start.length;
            this.ei = this.cues_by_end.findIndex((e) => e.end >= current_time);
            if (this.ei === -1) this.ei = this.cues_by_end.length;
            active_cues_updated = true;
        }
        this.last_time = current_time;
        this.should_refresh = this.should_refresh || active_cues_updated;
        // then rendering
        if (!this.should_refresh) {
            return;
        }
        super.update(camera);
        this.canvas_ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (const cue of this.active_cues) {
            const lines = this.split(cue.text, this.max_width_px)
                .reverse()
                .map((text, index) => ({
                    text,
                    x: this.canvas.width / 2,
                    y: this.canvas.height - (index + 1) * this.line_height_px,
                    width: this.canvas_ctx.measureText(text).width,
                }));
            this.canvas_ctx.fillStyle = "black";
            for (const line of lines) {
                this.canvas_ctx.fillRect(
                    line.x - line.width / 2 - this.background_padding_x_px,
                    line.y - this.font_px,
                    line.width + this.background_padding_x_px * 2,
                    this.line_height_px,
                );
            }
            this.canvas_ctx.fillStyle = "white";
            for (const line of lines) {
                this.canvas_ctx.fillText(line.text, line.x, line.y);
            }
        }
        this.canvas_texture.needsUpdate = true;
        this.should_refresh = false;
    }
}

type GroupParameters = {
    rotation?: Euler;
    position?: Vec3;
    scale?: Vec3;
    children?: THREE.Object3D[];
    visible?: boolean;
};

export class Group extends THREE.Group {
    animation_controller: AnimationController;
    opacity: number;
    scale_before_hiding?: Vec3;

    constructor({
        rotation = euler(0, 0, 0),
        position = vec3(0, 0, 0),
        scale = vec3(1, 1, 1),
        visible = true,
        children = [],
    }: GroupParameters) {
        super();

        this.visible = visible;
        this.position.copy(position);
        this.rotation.copy(rotation);
        this.scale.copy(scale);

        if (children.length > 0) {
            this.add(...children);
        }

        this.animation_controller = new AnimationController();
        this.opacity = 1;
    }

    process_animation_queue(time_ctx: TimeContext): void {
        this.animation_controller.process_animation_queue(this, time_ctx);
    }

    add_opacity_animation(target: number, speed: number): void {
        this.animation_controller.add_opacity_animation(target, speed);
    }

    add_position_animation(target: Vec3, speed: number, props?: AnimationProps): void {
        this.animation_controller.add_position_animation(target, speed, props);
    }

    add_rotation_animation(target: Euler, speed: number, props?: AnimationProps): void {
        this.animation_controller.add_rotation_animation(target, speed, props);
    }

    add_rotation_x_animation(target: number, speed: number, props?: AnimationProps): void {
        this.animation_controller.add_rotation_x_animation(target, speed, props);
    }

    add_rotation_y_animation(target: number, speed: number, props?: AnimationProps): void {
        this.animation_controller.add_rotation_y_animation(target, speed, props);
    }

    position_towards(target: Vec3, speed: number): boolean {
        return animate_object_position(this, target, speed);
    }

    rotation_towards(target: Euler, speed: number): boolean {
        return animate_object_rotation(this, target, speed);
    }

    rotation_x_towards(target: number, speed: number): boolean {
        return animate_object_x_rotation(this, target, speed);
    }

    rotation_y_towards(target: number, speed: number): boolean {
        return animate_object_y_rotation(this, target, speed);
    }

    add_animations(animations: Animations[]) {
        this.animation_controller.add_animations(animations);
    }

    clear_animations(): void {
        this.animation_controller.reset();
    }

    scale_hide(): void {
        if (!this.scale_before_hiding) {
            this.scale_before_hiding = this.scale.clone();
        }

        this.scale.set(0, 0, 0);
    }

    scale_show(): void {
        if (this.scale_before_hiding) {
            this.scale.copy(this.scale_before_hiding);
            this.scale_before_hiding = undefined;
        }
    }

    is_hidden_by_scale(): boolean {
        return !!this.scale_before_hiding;
    }
}

export type GLBModelParameters = {
    scale?: Vec3;
    position?: Vec3;
    rotation?: Euler;
};

export class GLBModel extends Group {
    constructor(
        kind: ModelKind,
        material: THREE.Material,
        { position = vec3(0, 0, 0), scale = vec3(1, 1, 1), rotation = euler(0, 0, 0) }: GLBModelParameters,
    ) {
        if (!all_gltfs_loaded()) {
            throw new Error("not all models have been loaded");
        }

        super({ position, scale, rotation });

        this.add(get_model(kind).scene.clone());

        this.set_material(material);
    }

    set_material(material: THREE.Material): void {
        this.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.material = material;
            }
        });
    }

    set_uniform(key: string, value: any): void {
        this.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.material.uniforms[key] = { value };
            }
        });
    }

    offset_texture(offset_x: number, offset_y: number): void {
        this.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.material.map.offset.x += offset_x;
                child.material.map.offset.y += offset_y;
            }
        });
    }

    set_texture(texture: Texture): void {
        this.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.material.map = get_texture(texture);
            }
        });
    }

    set_existing_texture(texture: THREE.Texture): void {
        this.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.material.map = texture;
            }
        });
    }
}

type LightParameters = {
    color?: THREE.ColorRepresentation;
    intensity?: number;
    position?: Vec3;
    distance?: number;
};

export function create_point_light({
    position = vec3(0, 0, 0),
    intensity = 1,
    color = 0xffffff,
    distance = 0,
}: LightParameters): THREE.PointLight {
    const l = new THREE.PointLight(color, intensity, distance);
    l.position.copy(position);

    return l;
}

export function create_directional_light({
    position = vec3(0, 0, 0),
    intensity = 1,
    color = 0xffffff,
}: LightParameters): THREE.DirectionalLight {
    const l = new THREE.DirectionalLight(color, intensity);
    l.position.copy(position);

    return l;
}

type LineParameters = {
    points: Vec3[];
    render_order?: number;
    color?: THREE.ColorRepresentation;
    opacity?: number;
};

export function create_line({ points, render_order = 0, color = 0xffffff, opacity = 1 }: LineParameters) {
    const line_mat = new THREE.LineBasicMaterial({
        transparent: true,
        color,
        opacity,
    });

    const geom = new THREE.BufferGeometry();

    geom.setFromPoints(points.map((p) => vec3(...p)));

    const line = new THREE.Line(geom, line_mat);
    line.renderOrder = render_order;

    return line;
}

export type MeshParameters = {
    position?: Vec3;
    rotation?: Euler;
    scale?: Vec3;
    render_order?: number;
    visible?: boolean;
};

export class Mesh<
    G extends THREE.BufferGeometry = THREE.BufferGeometry,
    M extends THREE.Material = THREE.Material,
> extends THREE.Mesh<G, M> {
    animation_controller: AnimationController;

    constructor(
        geometry: G,
        material: M,
        {
            position = vec3(0, 0, 0),
            rotation = euler(0, 0, 0),
            scale = vec3(1, 1, 1),
            render_order = 0,
            visible = true,
        }: MeshParameters,
    ) {
        super(geometry, material);

        this.scale.copy(scale);
        this.position.copy(position);
        this.rotation.copy(rotation);
        this.renderOrder = render_order;
        this.visible = visible;

        this.animation_controller = new AnimationController();
    }

    process_animation_queue(time_ctx: TimeContext): void {
        this.animation_controller.process_animation_queue(this, time_ctx);
    }

    add_position_animation(target: Vec3, speed: number, props?: AnimationProps): void {
        this.animation_controller.add_position_animation(target, speed, props);
    }

    add_rotation_animation(target: Euler, speed: number, props?: AnimationProps): void {
        this.animation_controller.add_rotation_animation(target, speed, props);
    }

    add_animations(animations: Animations[]) {
        this.animation_controller.add_animations(animations);
    }

    add_scale_animation(target: Vec3, speed: number): void {
        this.animation_controller.add_scale_animation(target, speed);
    }

    scale_towards(target: Vec3, speed: number): boolean {
        return animate_object_scale(this, target, speed);
    }

    position_towards(target: Vec3, speed: number): boolean {
        return animate_object_position(this, target, speed);
    }

    rotation_towards(target: Euler, speed: number): boolean {
        return animate_object_rotation(this, target, speed);
    }

    rotation_x_towards(target: number, speed: number): boolean {
        return animate_object_x_rotation(this, target, speed);
    }

    rotation_y_towards(target: number, speed: number): boolean {
        return animate_object_y_rotation(this, target, speed);
    }

    uniform_number_towards(
        this: Mesh<G, THREE.ShaderMaterial>,
        key: string,
        target: number,
        speed: number,
    ): boolean {
        return animate_object_uniform_number(this, key, target, speed);
    }

    set_uniform(this: Mesh<G, THREE.ShaderMaterial>, key: string, value: any): void {
        this.material.uniforms[key] = { value };
    }

    get_uniform(this: Mesh<G, THREE.ShaderMaterial>, key: string): any {
        return this.material.uniforms[key].value;
    }

    clear_animations(): void {
        this.animation_controller.reset();
    }

    flip_texture(this: Mesh<G, THREE.MeshBasicMaterial>, flip_x: boolean, flip_y: boolean): void {
        const uv_attr = this.geometry.attributes.uv;

        let min_u = Infinity,
            max_u = -Infinity;
        let min_v = Infinity,
            max_v = -Infinity;

        for (let i = 0; i < uv_attr.count; i++) {
            const u = uv_attr.getX(i);
            const v = uv_attr.getY(i);

            min_u = Math.min(min_u, u);
            max_u = Math.max(max_u, u);
            min_v = Math.min(min_v, v);
            max_v = Math.max(max_v, v);
        }

        for (let i = 0; i < uv_attr.count; i++) {
            let u = uv_attr.getX(i);
            let v = uv_attr.getY(i);

            let local_u = (u - min_u) / (max_u - min_u);
            let local_v = (v - min_v) / (max_v - min_v);

            if (flip_x) local_u = 1 - local_u;
            if (flip_y) local_v = 1 - local_v;

            u = local_u * (max_u - min_u) + min_u;
            v = local_v * (max_v - min_v) + min_v;

            uv_attr.setXY(i, u, v);
        }

        uv_attr.needsUpdate = true;
    }
}

function set_plane_object_scale_proportionally<
    T extends THREE.PlaneGeometry,
    M extends THREE.MeshBasicMaterial | THREE.MeshStandardMaterial,
>(mesh: THREE.Mesh<T, M> | THREE.Sprite, scale_factor: number): void {
    const texture = mesh.material.map;
    if (!texture) {
        return;
    }

    const w = texture.repeat.x * SPRITE_ATLAS_DIM;
    const h = texture.repeat.y * SPRITE_ATLAS_DIM;

    scale_factor /= 1000;

    mesh.scale.set(w * scale_factor, h * scale_factor, 1);
}

export function animate_object_position(mesh: THREE.Object3D, target: Vec3, speed: number): boolean {
    const direction_vec = vec3().copy(target).sub(mesh.position);

    const distance = direction_vec.length();

    direction_vec.normalize();

    if (distance <= speed) {
        mesh.position.copy(target);
    } else {
        mesh.position.addScaledVector(direction_vec, speed);
    }

    return mesh.position.equals(target);
}

export function animate_object_position_y(mesh: THREE.Object3D, target_y: number, speed: number): boolean {
    const direction = target_y - mesh.position.y;
    const distance = Math.abs(direction);

    if (distance <= speed) {
        mesh.position.y = target_y;
    } else {
        mesh.position.y += Math.sign(direction) * speed;
    }

    return mesh.position.y === target_y;
}

function animate_object_position_x(mesh: THREE.Object3D, target_x: number, speed: number): boolean {
    const direction = target_x - mesh.position.x;
    const distance = Math.abs(direction);

    if (distance <= speed) {
        mesh.position.x = target_x;
    } else {
        mesh.position.x += Math.sign(direction) * speed;
    }

    return mesh.position.x === target_x;
}

function animate_object_scale(mesh: THREE.Object3D, target: Vec3, speed: number): boolean {
    const direction_vec = vec3().copy(target).sub(mesh.scale);
    const distance = direction_vec.length();
    direction_vec.normalize();
    if (distance <= speed) {
        mesh.scale.copy(target);
    } else {
        mesh.scale.addScaledVector(direction_vec, speed);
    }
    return mesh.scale.equals(target);
}

function animate_object_rotation(mesh: THREE.Object3D, target: THREE.Euler, speed: number): boolean {
    const current = mesh.rotation;
    let delta_x = target.x - current.x;
    let delta_y = target.y - current.y;
    let delta_z = target.z - current.z;
    current.x += Math.sign(delta_x) * Math.min(Math.abs(delta_x), speed);
    current.y += Math.sign(delta_y) * Math.min(Math.abs(delta_y), speed);
    current.z += Math.sign(delta_z) * Math.min(Math.abs(delta_z), speed);
    const threshold = 0.001;

    return Math.abs(delta_x) < threshold && Math.abs(delta_y) < threshold && Math.abs(delta_z) < threshold;
}

export function animate_object_x_rotation(mesh: THREE.Object3D, target: number, speed: number): boolean {
    const diff_x = target - mesh.rotation.x;

    const distance = Math.abs(diff_x);

    if (distance <= speed) {
        mesh.rotation.x = target;
    } else {
        const t = speed / distance;
        mesh.rotation.x += diff_x * t;
    }

    return mesh.rotation.x === target;
}

function animate_object_y_rotation(mesh: THREE.Object3D, target: number, speed: number): boolean {
    const diff_y = target - mesh.rotation.y;

    const distance = Math.abs(diff_y);

    if (distance <= speed) {
        mesh.rotation.y = target;
    } else {
        const t = speed / distance;
        mesh.rotation.y += diff_y * t;
    }

    return mesh.rotation.y === target;
}

function animate_object_z_rotation(mesh: THREE.Object3D, target: number, speed: number): boolean {
    const diff_z = target - mesh.rotation.z;

    const distance = Math.abs(diff_z);

    if (distance <= speed) {
        mesh.rotation.z = target;
    } else {
        const t = speed / distance;
        mesh.rotation.z += diff_z * t;
    }

    return mesh.rotation.z === target;
}

function animate_object_opacity(mesh: Sprite3D | Mesh, target: number, speed: number): boolean {
    mesh.material.opacity = animate_number_towards(mesh.material.opacity, target, speed);
    return mesh.material.opacity === target;
}

function animate_group_opacity(group: Group, target: number, speed: number): boolean {
    group.opacity = animate_number_towards(group.opacity, target, speed);

    group.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((material) => {
                        material.transparent = true;
                        material.opacity = group.opacity;
                    });
                } else {
                    child.material.transparent = true;
                    child.material.opacity = group.opacity;
                }
            }
        }
    });

    return group.opacity === target;
}

function set_object_uniform<T, M extends THREE.BufferGeometry<THREE.NormalBufferAttributes>>(
    mesh: THREE.Mesh<M, THREE.ShaderMaterial>,
    key: string,
    value: T,
): void {
    mesh.material.uniforms[key] = { value };
}

function animate_object_uniform_number<G extends THREE.BufferGeometry>(
    mesh: THREE.Mesh<G, THREE.ShaderMaterial>,
    key: string,
    target: number,
    speed: number,
): boolean {
    const new_value = animate_number_towards(mesh.material.uniforms[key].value, target, speed);

    set_object_uniform(mesh, key, new_value);

    return new_value === target;
}

export function animate_number_towards(from: number, target: number, speed: number): number {
    if (from < target) {
        return Math.min(from + speed, target);
    } else if (from > target) {
        return Math.max(from - speed, target);
    } else {
        return target;
    }
}

export function animate_light_intensity(light: THREE.Light, target: number, speed: number): boolean {
    const target_intensity = animate_number_towards(light.intensity, target, speed);
    light.intensity = target_intensity;

    return light.intensity === target_intensity;
}

export function is_plane_in_sight(
    plane_object: THREE.Object3D,
    camera: THREE.Camera,
    threshold: number = 0.01,
): boolean {
    const plane_normal = new THREE.Vector3(0, 0, 1);
    plane_normal.transformDirection(plane_object.matrixWorld).normalize();

    const plane_position = new THREE.Vector3();
    plane_object.getWorldPosition(plane_position);

    const camera_to_plane = new THREE.Vector3().subVectors(plane_position, camera.position).normalize();

    const dot_product = Math.abs(plane_normal.dot(camera_to_plane));

    return dot_product >= threshold;
}
