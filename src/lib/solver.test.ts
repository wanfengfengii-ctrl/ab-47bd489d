import { describe, expect, it } from 'vitest';
import { certify, validateNetwork } from './solver';
import { feasibleSample, infeasibleSample } from './sample';
import type { Network } from './types';

function conservationOk(net: Network, result: ReturnType<typeof certify>): boolean {
  if (result.status !== 'feasible') return false;
  const bal = new Map<string, number>();
  net.nodes.forEach((n) => bal.set(n.id, 0));
  for (const f of result.flows) {
    bal.set(f.from, (bal.get(f.from) ?? 0) + f.flow);
    bal.set(f.to, (bal.get(f.to) ?? 0) - f.flow);
    if (f.flow < f.lower || f.flow > f.upper) return false;
    if (!Number.isInteger(f.flow)) return false;
  }
  return net.nodes.every((n) => bal.get(n.id) === n.netInjection);
}

describe('certify 可行场景', () => {
  it('示例网络通过三项认证且流量守恒', () => {
    const r = certify(feasibleSample);
    expect(r.status).toBe('feasible');
    expect(r.netInjectionBalanced).toBe(true);
    expect(r.flows).toHaveLength(feasibleSample.ducts.length);
    expect(conservationOk(feasibleSample, r)).toBe(true);
  });

  it('正下限风道获得的流量不低于下限（参与整体裁决）', () => {
    const net: Network = {
      nodes: [
        { id: 's', label: 's', netInjection: 5 },
        { id: 't', label: 't', netInjection: -5 },
      ],
      ducts: [{ id: 'e', from: 's', to: 't', lower: 2, upper: 5 }],
    };
    const r = certify(net);
    expect(r.status).toBe('feasible');
    expect(r.flows[0].flow).toBeGreaterThanOrEqual(2);
    expect(conservationOk(net, r)).toBe(true);
  });

  it('所有节点零注入、仅零下限风道时可取零流', () => {
    const net: Network = {
      nodes: [
        { id: 'a', label: 'a', netInjection: 0 },
        { id: 'b', label: 'b', netInjection: 0 },
      ],
      ducts: [{ id: 'e', from: 'a', to: 'b', lower: 0, upper: 9 }],
    };
    const r = certify(net);
    expect(r.status).toBe('feasible');
    expect(r.flows[0].flow).toBe(0);
  });
});

describe('certify 不可行场景与缺口见证', () => {
  it('出风容量不足时给出最小未满足流量', () => {
    const net: Network = {
      nodes: [
        { id: 's', label: 's', netInjection: 10 },
        { id: 't', label: 't', netInjection: -10 },
      ],
      ducts: [{ id: 'e', from: 's', to: 't', lower: 0, upper: 5 }],
    };
    const r = certify(net);
    expect(r.status).toBe('infeasible');
    expect(r.witnesses.length).toBeGreaterThan(0);
    const w = r.witnesses[0];
    expect(w.shortfall).toBe(5);
    expect(w.nodeSet).toContain('s');
    expect(w.outgoingDucts).toContain('e');
  });

  it('正下限无法被无源汇平衡的网络吸收时，缺口等于被强制的下限', () => {
    const net: Network = {
      nodes: [
        { id: 'a', label: 'a', netInjection: 0 },
        { id: 'b', label: 'b', netInjection: 0 },
      ],
      ducts: [{ id: 'e', from: 'a', to: 'b', lower: 3, upper: 5 }],
    };
    const r = certify(net);
    expect(r.status).toBe('infeasible');
    expect(r.witnesses.some((w) => w.shortfall === 3)).toBe(true);
  });

  it('内置无解示例被识别，缺口为正且定位到问题区域', () => {
    const r = certify(infeasibleSample);
    expect(r.status).toBe('infeasible');
    expect(r.witnesses[0].shortfall).toBeGreaterThan(0);
  });

  it('全网净注入不平衡时直接判不可行', () => {
    const net: Network = {
      nodes: [
        { id: 's', label: 's', netInjection: 8 },
        { id: 't', label: 't', netInjection: -5 },
      ],
      ducts: [{ id: 'e', from: 's', to: 't', lower: 0, upper: 100 }],
    };
    const r = certify(net);
    expect(r.status).toBe('infeasible');
    expect(r.netInjectionBalanced).toBe(false);
    expect(r.totalNetInjection).toBe(3);
  });

  it('容量整数值下给出的必为整数流量（大规模并联风道）', () => {
    const net: Network = {
      nodes: [
        { id: 's', label: 's', netInjection: 1000 },
        { id: 'm', label: 'm', netInjection: 0 },
        { id: 't', label: 't', netInjection: -1000 },
      ],
      ducts: [
        { id: 'e1', from: 's', to: 'm', lower: 0, upper: 600 },
        { id: 'e2', from: 's', to: 't', lower: 0, upper: 400 },
        { id: 'e3', from: 'm', to: 't', lower: 0, upper: 600 },
      ],
    };
    const r = certify(net);
    expect(r.status).toBe('feasible');
    expect(r.flows.every((f) => Number.isInteger(f.flow))).toBe(true);
    expect(conservationOk(net, r)).toBe(true);
  });
});

describe('随机网络对拍：certify 与全部子集割条件一致', () => {
  function bruteForceShortfall(net: Network): number {
    const n = net.nodes.length;
    let maxShortfall = Number.NEGATIVE_INFINITY;
    for (let mask = 0; mask < 1 << n; mask++) {
      const inSet = (i: number) => ((mask >> i) & 1) === 1;
      let sumB = 0;
      let sumOutU = 0;
      let sumInL = 0;
      net.nodes.forEach((node, i) => {
        if (inSet(i)) sumB += node.netInjection;
      });
      for (const e of net.ducts) {
        const u = net.nodes.findIndex((x) => x.id === e.from);
        const v = net.nodes.findIndex((x) => x.id === e.to);
        if (inSet(u) && !inSet(v)) sumOutU += e.upper;
        if (!inSet(u) && inSet(v)) sumInL += e.lower;
      }
      maxShortfall = Math.max(maxShortfall, sumB + sumInL - sumOutU);
    }
    return maxShortfall;
  }

  function randomNet(seed: { v: number }): Network {
    const rand = () => {
      // 确定性 LCG，保证测试可复现
      seed.v = (seed.v * 1103515245 + 12345) % 2147483648;
      return seed.v / 2147483648;
    };
    const n = 2 + Math.floor(rand() * 4); // 2..5 个节点
    const nodes = Array.from({ length: n }, (_, i) => ({
      id: `v${i}`,
      label: `v${i}`,
      netInjection: Math.floor(rand() * 11) - 5,
    }));
    // 强制总和为 0（大部分样本平衡）
    if (rand() < 0.7) {
      const total = nodes.reduce((s, x) => s + x.netInjection, 0);
      nodes[0].netInjection -= total;
    }
    const ducts = [];
    const m = Math.floor(rand() * (n * (n - 1))) + 1;
    const key = new Set<string>();
    for (let k = 0; k < m; k++) {
      let u = 0;
      let v = 0;
      let guard = 0;
      do {
        u = Math.floor(rand() * n);
        v = Math.floor(rand() * n);
        guard++;
      } while ((u === v || key.has(`${u}-${v}`)) && guard < 20);
      if (u === v || key.has(`${u}-${v}`)) continue;
      key.add(`${u}-${v}`);
      const lower = Math.floor(rand() * 4);
      ducts.push({
        id: `e${k}`,
        from: `v${u}`,
        to: `v${v}`,
        lower,
        upper: lower + Math.floor(rand() * 9),
      });
    }
    return { nodes, ducts };
  }

  it('300 个随机网络的结论与缺口值与暴力枚举一致', () => {
    const seed = { v: 42 };
    for (let t = 0; t < 300; t++) {
      const net = randomNet(seed);
      const r = certify(net);
      const sumB = net.nodes.reduce((s, x) => s + x.netInjection, 0);
      const expectedMax = bruteForceShortfall(net);
      // Hoffman 可行判据：Σb = 0 且任意子集割值 ≤ 0
      const feasible = sumB === 0 && expectedMax <= 0;
      if (feasible) {
        expect(r.status).toBe('feasible');
        expect(conservationOk(net, r)).toBe(true);
      } else {
        expect(r.status).toBe('infeasible');
        // 存在正割时，见证列表必须包含等于暴力枚举最大割值的最小未满足流量
        if (expectedMax > 0) {
          expect(r.witnesses.some((w) => w.shortfall === expectedMax)).toBe(true);
        }
        // Σb ≠ 0 时，必须含整张网的不平衡见证，缺口为 |Σb|
        if (sumB !== 0) {
          expect(
            r.witnesses.some(
              (w) => w.shortfall === Math.abs(sumB) && w.nodeSet.length === net.nodes.length,
            ),
          ).toBe(true);
        }
      }
    }
  });
});

describe('validateNetwork 草稿校验', () => {
  it('下限大于上限报错', () => {
    const net: Network = {
      nodes: [
        { id: 'a', label: 'a', netInjection: 0 },
        { id: 'b', label: 'b', netInjection: 0 },
      ],
      ducts: [{ id: 'e', from: 'a', to: 'b', lower: 9, upper: 3 }],
    };
    expect(validateNetwork(net).join(';')).toContain('下限');
    expect(certify(net).status).toBe('infeasible');
  });

  it('悬空风道与非整数报错', () => {
    const net: Network = {
      nodes: [{ id: 'a', label: 'a', netInjection: 1.5 }],
      ducts: [{ id: 'e', from: 'a', to: 'x', lower: 0, upper: 3 }],
    };
    const errors = validateNetwork(net).join(';');
    expect(errors).toContain('整数');
    expect(errors).toContain('不存在');
  });
});
