import { describe, it, expect } from 'vitest';
import { certify, validateNetwork, type FlowNode, type FlowEdge, type FeasibleResult } from '../src/core/flow';

function node(id: string, balance: number): FlowNode {
  return { id, balance };
}
function edge(id: string, from: string, to: string, lower: number, upper: number): FlowEdge {
  return { id, from, to, lower, upper };
}

/** 用流量结果独立复核：区间、整数性、节点守恒、全网平衡。 */
function expectConservation(nodes: FlowNode[], result: FeasibleResult) {
  const net = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const f of result.flows) {
    expect(Number.isInteger(f.flow)).toBe(true);
    expect(f.flow).toBeGreaterThanOrEqual(f.lower);
    expect(f.flow).toBeLessThanOrEqual(f.upper);
    net.set(f.from, (net.get(f.from) ?? 0) + f.flow);
    net.set(f.to, (net.get(f.to) ?? 0) - f.flow);
  }
  for (const n of nodes) {
    expect(net.get(n.id)).toBe(n.balance);
  }
}

describe('可行性认证', () => {
  it('简单有解网络：源 -> 柜 -> 排放口', () => {
    const nodes = [node('S', 10), node('A', 0), node('T', -10)];
    const edges = [edge('e1', 'S', 'A', 0, 10), edge('e2', 'A', 'T', 0, 10)];
    const r = certify(nodes, edges);
    expect(r.feasible).toBe(true);
    if (r.feasible) {
      expect(r.flows.map((f) => f.flow)).toEqual([10, 10]);
      expectConservation(nodes, r);
    }
  });

  it('正下限风道也必须满足且参与整体裁决', () => {
    // 源供气 10，S->A 下限 4，A->T [6,10]：总平衡为 0，但 A 需把至少 6 送向 T，
    // 而 S 只给 10 全部可走，故可行；检验下限确实被履行。
    const nodes = [node('S', 10), node('A', 0), node('T', -10)];
    const edges = [edge('e1', 'S', 'A', 4, 10), edge('e2', 'A', 'T', 6, 10)];
    const r = certify(nodes, edges);
    expect(r.feasible).toBe(true);
    if (r.feasible) {
      const f1 = r.flows.find((f) => f.id === 'e1')!;
      const f2 = r.flows.find((f) => f.id === 'e2')!;
      expect(f1.flow).toBeGreaterThanOrEqual(4);
      expect(f2.flow).toBeGreaterThanOrEqual(6);
      expectConservation(nodes, r);
    }
  });

  it('正下限压垮抽排能力：下限之和超过排放口净注入（负）容量', () => {
    // S 供气 5，但 S->A 下限 10，A 只能排 5（A.balance=-5）：强制下限即不可行。
    const nodes = [node('S', 5), node('A', -5)];
    const edges = [edge('e1', 'S', 'A', 10, 20)];
    const r = certify(nodes, edges);
    expect(r.feasible).toBe(false);
    if (!r.feasible) {
      expect(r.shortfall).toBeGreaterThan(0);
      // 缺口片区必须包含无法消化强制来气的 A
      expect(r.deficientNodes).toContain('A');
      // 逐节点未满足量之和等于总缺口
      const sumUnmet = r.nodeShortfalls.reduce((s, x) => s + x.unmet, 0);
      expect(sumUnmet).toBe(r.shortfall);
    }
  });

  it('容量不足：有向风道送达能力小于净注入', () => {
    // S 需送出 10，但 S->A 上限只有 3；T 需要 -10 也无法被满足。
    const nodes = [node('S', 10), node('A', 0), node('T', -10)];
    const edges = [edge('e1', 'S', 'A', 0, 3), edge('e2', 'A', 'T', 0, 10)];
    const r = certify(nodes, edges);
    expect(r.feasible).toBe(false);
    if (!r.feasible) {
      expect(r.deficientNodes).toContain('S');
      expect(r.shortfall).toBe(7);
      expect(r.cutMode).toBe('supply');
      // 缺口恒等式：Σ_R b + 跨入下限 - 跨出上限 = 缺口
      const { sumBalance, lowerCross, upperCross } = r.details;
      expect(sumBalance + lowerCross - upperCross).toBe(r.shortfall);
      expect(r.nodeShortfalls.reduce((s, x) => s + x.unmet, 0)).toBe(r.shortfall);
    }
  });

  it('抽排侧吃不进来：供气 9、抽排 10（Σb<0）走 extraction 割', () => {
    // S 只供 9，OUT 要抽 10，风道上限 100：供气可全部送出，但 OUT 还差 1 吸不进来。
    const nodes = [node('S', 9), node('OUT', -10)];
    const edges = [edge('e1', 'S', 'OUT', 0, 100)];
    const r = certify(nodes, edges);
    expect(r.feasible).toBe(false);
    if (!r.feasible) {
      expect(r.balanceMismatch).toBe(true);
      expect(r.cutMode).toBe('extraction');
      expect(r.shortfall).toBe(1);
      expect(r.deficientNodes).toContain('OUT');
      const { sumBalance, lowerCross, upperCross } = r.details;
      // −Σ_X b + 跨出下限 − 跨入上限 = 缺口（X 含 OUT：−(−10)=10，跨入上限 9 来自 S 侧）
      expect(-sumBalance + lowerCross - upperCross).toBe(r.shortfall);
      expect(r.nodeShortfalls.every((x) => x.kind === 'extraction')).toBe(true);
      expect(r.nodeShortfalls.reduce((s, x) => s + x.unmet, 0)).toBe(r.shortfall);
    }
  });

  it('孤立片区：一片库房与管网断开，自身无法平衡', () => {
    // S->T 可平衡 5；孤岛 X(+4)、Y(-4) 之间无风道：X 送不出 4。
    const nodes = [node('S', 5), node('T', -5), node('X', 4), node('Y', -4)];
    const edges = [edge('e1', 'S', 'T', 0, 10)];
    const r = certify(nodes, edges);
    expect(r.feasible).toBe(false);
    if (!r.feasible) {
      expect(r.deficientNodes).toContain('X');
      expect(r.deficientNodes).not.toContain('Y');
      expect(r.shortfall).toBe(4);
    }
  });

  it('全网净注入不平衡直接判定不可行', () => {
    const nodes = [node('S', 10), node('T', -8)];
    const edges = [edge('e1', 'S', 'T', 0, 100)];
    const r = certify(nodes, edges);
    expect(r.feasible).toBe(false);
    if (!r.feasible) {
      expect(r.balanceMismatch).toBe(true);
      expect(r.totalBalance).toBe(2);
    }
  });

  it('全部节点净注入为 0 且零风道时可行（零流）', () => {
    const nodes = [node('A', 0), node('B', 0)];
    const r = certify(nodes, []);
    expect(r.feasible).toBe(true);
    if (r.feasible) expect(r.flows).toHaveLength(0);
  });

  it('环流：全网平衡为 0 但正下限要求形成环流', () => {
    // A->B 下限 5、B->A 下限 5，所有节点平衡 0：靠 5 的环流满足。
    const nodes = [node('A', 0), node('B', 0)];
    const edges = [edge('ab', 'A', 'B', 5, 9), edge('ba', 'B', 'A', 5, 9)];
    const r = certify(nodes, edges);
    expect(r.feasible).toBe(true);
    if (r.feasible) expectConservation(nodes, r);
  });

  it('多源多汇整数分流', () => {
    const nodes = [
      node('N2-1', 8),
      node('N2-2', 6),
      node('M1', 0),
      node('M2', 0),
      node('OUT', -14),
    ];
    const edges = [
      edge('a', 'N2-1', 'M1', 0, 5),
      edge('b', 'N2-1', 'M2', 0, 9),
      edge('c', 'N2-2', 'M2', 0, 6),
      edge('d', 'M1', 'OUT', 0, 10),
      edge('e', 'M2', 'OUT', 0, 10),
    ];
    const r = certify(nodes, edges);
    expect(r.feasible).toBe(true);
    if (r.feasible) expectConservation(nodes, r);
  });
});

describe('草稿校验', () => {
  it('上限小于下限 / 负下限 / 缺失节点均报错', () => {
    const nodes = [node('A', 0), node('B', 0)];
    expect(validateNetwork(nodes, [edge('e', 'A', 'B', 3, 2)]).some((i) => i.level === 'error')).toBe(true);
    expect(validateNetwork(nodes, [edge('e', 'A', 'B', -1, 2)]).some((i) => i.level === 'error')).toBe(true);
    expect(validateNetwork(nodes, [edge('e', 'A', 'Z', 0, 2)]).some((i) => i.level === 'error')).toBe(true);
    expect(validateNetwork(nodes, [edge('e', 'A', 'B', 0, 2)])).toHaveLength(0);
  });
});
