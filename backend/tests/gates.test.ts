/**
 * gates.test.ts — Truth tables for all primitive gate functions.
 * Replaces the original .tst verification scripts for the gate-level HDL chips:
 *   And.hdl, Or.hdl, Not.hdl, Nand.hdl, Xor.hdl
 */

import { describe, it, expect } from 'vitest';
import { not, and, or, nand, xor, type Bit } from '../src/fsm/gates';

describe('not gate', () => {
  it('not(0) = 1', () => expect(not(0)).toBe(1));
  it('not(1) = 0', () => expect(not(1)).toBe(0));
});

describe('and gate', () => {
  it('0 AND 0 = 0', () => expect(and(0, 0)).toBe(0));
  it('0 AND 1 = 0', () => expect(and(0, 1)).toBe(0));
  it('1 AND 0 = 0', () => expect(and(1, 0)).toBe(0));
  it('1 AND 1 = 1', () => expect(and(1, 1)).toBe(1));
});

describe('or gate (variadic)', () => {
  it('0 OR 0 = 0', () => expect(or(0, 0)).toBe(0));
  it('0 OR 1 = 1', () => expect(or(0, 1)).toBe(1));
  it('1 OR 0 = 1', () => expect(or(1, 0)).toBe(1));
  it('1 OR 1 = 1', () => expect(or(1, 1)).toBe(1));
  it('3-way: or(0,0,0) = 0', () => expect(or(0, 0, 0)).toBe(0));
  it('3-way: or(0,1,0) = 1', () => expect(or(0, 1, 0)).toBe(1));
  it('4-way: or(0,0,0,1) = 1', () => expect(or(0, 0, 0, 1)).toBe(1));
  it('4-way: or(0,0,0,0) = 0', () => expect(or(0, 0, 0, 0)).toBe(0));
});

describe('nand gate', () => {
  it('0 NAND 0 = 1', () => expect(nand(0, 0)).toBe(1));
  it('0 NAND 1 = 1', () => expect(nand(0, 1)).toBe(1));
  it('1 NAND 0 = 1', () => expect(nand(1, 0)).toBe(1));
  it('1 NAND 1 = 0', () => expect(nand(1, 1)).toBe(0));
  it('nand(a,a) = not(a) for a=0', () => expect(nand(0, 0)).toBe(not(0)));
  it('nand(a,a) = not(a) for a=1', () => expect(nand(1, 1)).toBe(not(1)));
});

describe('xor gate', () => {
  it('0 XOR 0 = 0', () => expect(xor(0, 0)).toBe(0));
  it('0 XOR 1 = 1', () => expect(xor(0, 1)).toBe(1));
  it('1 XOR 0 = 1', () => expect(xor(1, 0)).toBe(1));
  it('1 XOR 1 = 0', () => expect(xor(1, 1)).toBe(0));
});

describe('gate composition', () => {
  it('De Morgan: not(and(a,b)) = or(not(a),not(b))', () => {
    const cases: [Bit, Bit][] = [[0,0],[0,1],[1,0],[1,1]];
    for (const [a, b] of cases) {
      expect(not(and(a, b))).toBe(or(not(a), not(b)));
    }
  });
  it('nand is universal: not via nand', () => {
    expect(nand(0, 0)).toBe(1); // NOT 0
    expect(nand(1, 1)).toBe(0); // NOT 1
  });
});
