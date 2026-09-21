/**
 * gates.ts — Primitive gate functions
 *
 * These mirror the 74LS-series logic ICs used in the original EVM hardware:
 *   And.hdl  → and()
 *   Or.hdl   → or()
 *   Not.hdl  → not()
 *   Nand.hdl → nand()
 *   Xor.hdl  → xor()
 *
 * All FSM logic is built exclusively from these primitives so the derivation
 * from Boolean algebra remains visible in the code — exactly as it is in the
 * HDL gate-level construction.
 *
 * This file has no database imports and no Express imports.
 */

/** The bit type: exactly 0 or 1, matching the HDL's single-bit wires. */
export type Bit = 0 | 1;

/** NOT gate: output is 1 iff input is 0. Mirrors Not.hdl */
export const not = (a: Bit): Bit => (a === 0 ? 1 : 0);

/** AND gate: output is 1 iff both inputs are 1. Mirrors And.hdl */
export const and = (a: Bit, b: Bit): Bit => (a === 1 && b === 1 ? 1 : 0);

/**
 * OR gate (variadic): output is 1 iff at least one input is 1.
 * Variadic form models a multi-input OR tree of 2-input gates.
 * Mirrors Or.hdl
 */
export const or = (...args: Bit[]): Bit => (args.some(b => b === 1) ? 1 : 0);

/** NAND gate: output is 0 iff both inputs are 1. Mirrors Nand.hdl */
export const nand = (a: Bit, b: Bit): Bit => not(and(a, b));

/** XOR gate: output is 1 iff inputs differ. Mirrors Xor.hdl */
export const xor = (a: Bit, b: Bit): Bit => and(or(a, b), nand(a, b));
