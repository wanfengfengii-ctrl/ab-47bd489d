import { describe, it, expect } from 'vitest';
import { Dinic } from '../src/core/dinic';

describe('Dinic 最大流', () => {
  it('经典 s-t 网络求最大流（整数）', () => {
    // 0(s) -> 1 cap 3, 0 -> 2 cap 2, 1 -> 3(t) cap 2, 2 -> 3 cap 3, 1 -> 2 cap 5
    // 0->1 走 3（1->3 送 2，1->2 转 1），0->2 走 2，2->3 合计送 3，最大流 5。
    const d = new Dinic(4);
    d.addEdge(0, 1, 3);
    d.addEdge(0, 2, 2);
    d.addEdge(1, 3, 2);
    d.addEdge(2, 3, 3);
    d.addEdge(1, 2, 5);
    expect(d.maxFlow(0, 3)).toBe(5);
  });

  it('无边时最大流为 0，可达集仅含源点', () => {
    const d = new Dinic(3);
    expect(d.maxFlow(0, 2)).toBe(0);
    expect(d.reachable(0)).toEqual([true, false, false]);
  });

  it('瓶颈容量决定最大流', () => {
    const d = new Dinic(3);
    d.addEdge(0, 1, 100);
    const idx = d.addEdge(1, 2, 7);
    expect(d.maxFlow(0, 2)).toBe(7);
    // 正向边残量为 0，反向边残量为 7
    expect(d.g[1][idx].cap).toBe(0);
  });
});
