import { vi, describe, it, expect, test } from "vitest";
import {
    from_readable_gamepad_mappings,
    to_readable_gamepad_mappings,
    from_readable_key_mappings,
    to_readable_key_mappings,
} from "../src/init";
import { Key } from "../src/engine";

vi.mock("../src/engine", () => {
    enum Key {
        Left,
        Right,
        Up,
        Down,
        L1,
        L2,
        R1,
        R2,
        Circle,
        Triangle,
        Cross,
        Square,
        Select,
        Start,
    }
    return {
        LANG_KEY: "lainTSX-lang",
        SIZE_MODIFIER_KEY: "lainTSX-game-size",
        KEYBINDINGS_KEY: "lainTSX-keys",
        GAMEPAD_KEYBINDINGS_KEY: "lainTSX-gamepad-keys",
        Key,
    };
});

const DEFAULT_GAMEPAD_MAPPINGS = [14, 15, 12, 13, 4, 6, 5, 7, 1, 3, 0, 2, 8, 9];
const DEFAULT_READABLE_GAMEPAD_MAPPINGS = {
    Left: "Left",
    Right: "Right",
    Up: "Up",
    Down: "Down",
    L: "L1",
    ZL: "L2",
    R: "R1",
    ZR: "R2",
    A: "Circle",
    X: "Triangle",
    B: "Cross",
    Y: "Square",
    Minus: "Select",
    Plus: "Start",
};

const DEFAULT_KEY_MAPPINGS = {
    arrowdown: Key.Down,
    arrowleft: Key.Left,
    arrowup: Key.Up,
    arrowright: Key.Right,
    x: Key.Circle,
    z: Key.Cross,
    d: Key.Triangle,
    s: Key.Square,
    q: Key.R2,
    e: Key.L2,
    w: Key.L1,
    r: Key.R1,
    v: Key.Start,
    c: Key.Select,
};
const DEFAULT_READABLE_KEY_MAPPINGS = {
    arrowdown: "Down",
    arrowleft: "Left",
    arrowup: "Up",
    arrowright: "Right",
    x: "Circle",
    z: "Cross",
    d: "Triangle",
    s: "Square",
    q: "R2",
    e: "L2",
    w: "L1",
    r: "R1",
    v: "Start",
    c: "Select",
};

describe("init", () => {
    test("gamepad mapping binding to readable", () => {
        const readable = to_readable_gamepad_mappings(DEFAULT_GAMEPAD_MAPPINGS);
        expect(readable).toEqual(DEFAULT_READABLE_GAMEPAD_MAPPINGS);
    });
    test("gamepad mapping binding from readable", () => {
        const reverse = from_readable_gamepad_mappings(DEFAULT_READABLE_GAMEPAD_MAPPINGS);
        expect(reverse).toEqual(DEFAULT_GAMEPAD_MAPPINGS);
    });
    test("key mapping binding to readable", () => {
        const readable = to_readable_key_mappings(DEFAULT_KEY_MAPPINGS);
        expect(readable).toEqual(DEFAULT_READABLE_KEY_MAPPINGS);
    });
    test("key mapping binding from readable", () => {
        const reverse = from_readable_key_mappings(DEFAULT_READABLE_KEY_MAPPINGS);
        expect(reverse).toEqual(DEFAULT_KEY_MAPPINGS);
    });
});
