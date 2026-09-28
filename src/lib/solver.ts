/**
 * 整数流量认证求解器
 *
 * 模型：有向图 G=(V,E)，节点 i 净注入 b(i)，风道 e: u->v 整数流量 f(e)。
 * 认证条件（同时满足）：
 *   1. 全网净注入平衡：Σ b(i) = 0
 *   2. 节点收支守恒：对每个节点 i，Σ_out f − Σ_in f = b(i)
 *   3. 风道容量区间：l(e) ≤ f(e) ≤ u(e)，整数（含正下限风道）
 *
 * 方法（带下界的可行循环）：
 *   令 f = l + x（0 ≤ x ≤ u−l），节点需求
 *     d(i) = b(i) + Σ_{e 进入 i} l(e) − Σ_{e 离开 i} l(e)
 *   加入超源 SS / 超汇 TT：
 *     d(i) > 0 → SS->i 容量 d(i)（必须送走的下限风量）
 *     d(i) < 0 -> i->TT 容量 −d(i)
 *   残量网风道容量 u−l。SS 发出的总需求 D 全部能推到 TT，
 *   当且仅当满足全部约束的整数流存在（容量均为整数，最大流即整数流）。
 *
 * 不可行见证（最大流最小割）：
 *   残量网中从 SS 可达的原节点集合 X 满足
 *     Σ_{i∈X} b(i) + Σ_{进入 X} l(e) > Σ_{离开 X} u(e)
 *   即该区域必须送走的最小风量超出出风总上界，
 *   缺口 shortfall = Σ_X b + Σ_in l − Σ_out u = D − maxflow，
 *   为最小未满足流量。
 */

import type {
  CertificationResult,
  CertifiedFlow,
  Duct,
  Network,
  ViolationWitness,
} from './types';

interface DinicEdge {
  to: number;
  rev: number;
  cap: number;
}

class Dinic {
  readonly n: number;
  readonly adj: DinicEdge[][] = [];

  constructor(n: number) {
    this.n = n;
    for (let i = 0; i < n; i++) this.adj.push([]);
  }

  addEdge(from: number, to: number, cap: number): DinicEdge {
    const forward: DinicEdge = { to, rev: this.adj[to].length, cap };
    const backward: DinicEdge = { to: from, rev: this.adj[from].length, cap: 0 };
    this.adj[from].push(forward);
    this.adj[to].push(backward);
    return forward;
  }

  private bfs(s: number): number[] {
    const level = new Array<number>(this.n).fill(-1);
    level[s] = 0;
    const queue = [s];
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++];
      for (const e of this.adj[u]) {
        if (e.cap > 0 && level[e.to] === -1) {
          level[e.to] = level[u] + 1;
          queue.push(e.to);
        }
      }
    }
    return level;
  }

  maxFlow(s: number, t: number): number {
    let flow = 0;
    for (;;) {
      const level = this.bfs(s);
      if (level[t] === -1) return flow;
      const ptr = new Array<number>(this.n).fill(0);
      const dfs = (u: number, pushed: number): number => {
        if (u === t || pushed === 0) return pushed;
        while (ptr[u] < this.adj[u].length) {
          const e = this.adj[u][ptr[u]];
          if (e.cap > 0 && level[e.to] === level[u] + 1) {
            const tr = dfs(e.to, Math.min(pushed, e.cap));
            if (tr > 0) {
              e.cap -= tr;
              this.adj[e.to][e.rev].cap += tr;
              return tr;
            }
          }
          ptr[u]++;
        }
        return 0;
      };
      for (;;) {
        const pushed = dfs(s, Infinity);
        if (pushed === 0) break;
        flow += pushed;
      }
    }
  }

  /** 最大流结束后，残余网络中从 s 沿 cap>0 可达的节点 */
  reachableFrom(s: number): boolean[] {
    const seen = new Array<boolean>(this.n).fill(false);
    seen[s] = true;
    const queue = [s];
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++];
      for (const e of this.adj[u]) {
        if (e.cap > 0 && !seen[e.to]) {
          seen[e.to] = true;
          queue.push(e.to);
        }
      }
    }
    return seen;
  }
}

/** 草稿数据校验；返回错误信息列表（空列表表示通过） */
export function validateNetwork(net: Network): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const node of net.nodes) {
    if (!node.id.trim()) errors.push('存在没有编号的节点');
    if (ids.has(node.id)) errors.push(`节点编号重复：${node.id}`);
    ids.add(node.id);
    if (!Number.isFinite(node.netInjection) || !Number.isInteger(node.netInjection)) {
      errors.push(`节点 ${node.id || '?'} 的净注入量必须是整数`);
    }
  }
  const ductIds = new Set<string>();
  for (const duct of net.ducts) {
    if (!duct.id.trim()) errors.push('存在没有编号的风道');
    if (ductIds.has(duct.id)) errors.push(`风道编号重复：${duct.id}`);
    ductIds.add(duct.id);
    if (!ids.has(duct.from)) errors.push(`风道 ${duct.id} 的起点 ${duct.from} 不存在`);
    if (!ids.has(duct.to)) errors.push(`风道 ${duct.id || '?'} 的终点 ${duct.to} 不存在`);
    for (const [name, v] of [
      ['下限', duct.lower],
      ['上限', duct.upper],
    ] as const) {
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
        errors.push(`风道 ${duct.id || '?'} 的${name}必须是非负整数`);
      }
    }
    if (
      Number.isInteger(duct.lower) &&
      Number.isInteger(duct.upper) &&
      duct.lower > duct.upper
    ) {
      errors.push(`风道 ${duct.id || '?'} 的下限 ${duct.lower} 大于上限 ${duct.upper}`);
    }
  }
  return errors;
}

interface PlacedDuct {
  duct: Duct;
  u: number;
  v: number;
  /** 残量边（容量 u−l）引用，其流量 = 初始容量 − 残余容量 */
  residualEdge: DinicEdge;
  residualCap: number;
}

function buildWitness(
  memberFlags: boolean[],
  net: Network,
  indexOf: Map<string, number>,
): ViolationWitness {
  const nodeSet = net.nodes.filter((n) => memberFlags[indexOf.get(n.id)!]).map((n) => n.id);
  const outgoingDucts: string[] = [];
  const incomingDucts: string[] = [];
  let netInjectionSum = 0;
  let outgoingUpper = 0;
  let incomingLower = 0;
  for (const node of net.nodes) {
    if (memberFlags[indexOf.get(node.id)!]) netInjectionSum += node.netInjection;
  }
  for (const e of net.ducts) {
    const uIn = memberFlags[indexOf.get(e.from)!];
    const vIn = memberFlags[indexOf.get(e.to)!];
    if (uIn && !vIn) {
      outgoingDucts.push(e.id);
      outgoingUpper += e.upper;
    } else if (!uIn && vIn) {
      incomingDucts.push(e.id);
      incomingLower += e.lower;
    }
  }
  return {
    nodeSet,
    outgoingDucts,
    incomingDucts,
    required: netInjectionSum,
    outgoingUpperSum: outgoingUpper,
    incomingLowerSum: incomingLower,
    capacity: outgoingUpper - incomingLower,
    shortfall: netInjectionSum + incomingLower - outgoingUpper,
  };
}

/** 执行认证。校验失败或约束不可行均返回 status='infeasible'。 */
export function certify(net: Network): CertificationResult {
  const validationErrors = validateNetwork(net);
  const totalNetInjection = net.nodes.reduce((s, n) => s + n.netInjection, 0);
  const balanced = totalNetInjection === 0;

  const base = {
    totalNetInjection,
    netInjectionBalanced: balanced,
  };

  if (validationErrors.length > 0) {
    return {
      ...base,
      status: 'infeasible',
      flows: [],
      witnesses: [],
      validationErrors,
    };
  }

  const n = net.nodes.length;
  const indexOf = new Map<string, number>();
  net.nodes.forEach((node, i) => indexOf.set(node.id, i));

  // SS = n, TT = n + 1
  const dinic = new Dinic(n + 2);
  const SS = n;
  const TT = n + 1;
  // d(i) = b(i) + Σ_进入 l − Σ_离开 l；d>0 由 SS 强制供给，d<0 强制排往 TT
  const demand = net.nodes.map((node) => node.netInjection);
  const placed: PlacedDuct[] = [];

  for (const duct of net.ducts) {
    const u = indexOf.get(duct.from)!;
    const v = indexOf.get(duct.to)!;
    demand[u] -= duct.lower;
    demand[v] += duct.lower;
    const residualCap = duct.upper - duct.lower;
    const residualEdge = dinic.addEdge(u, v, residualCap);
    placed.push({ duct, u, v, residualEdge, residualCap });
  }

  let totalDemand = 0;
  for (let i = 0; i < n; i++) {
    if (demand[i] > 0) {
      dinic.addEdge(SS, i, demand[i]);
      totalDemand += demand[i];
    } else if (demand[i] < 0) {
      dinic.addEdge(i, TT, -demand[i]);
    }
  }

  const pushed = dinic.maxFlow(SS, TT);
  const flowFeasible = pushed === totalDemand;

  if (balanced && flowFeasible) {
    const flows: CertifiedFlow[] = placed.map((p) => ({
      ductId: p.duct.id,
      from: p.duct.from,
      to: p.duct.to,
      flow: p.duct.lower + (p.residualCap - p.residualEdge.cap),
      lower: p.duct.lower,
      upper: p.duct.upper,
    }));

    // 独立复核节点收支守恒，防止任何计算疏漏
    const balance = new Array<number>(n).fill(0);
    for (const f of flows) {
      balance[indexOf.get(f.from)!] += f.flow;
      balance[indexOf.get(f.to)!] -= f.flow;
    }
    for (const node of net.nodes) {
      const i = indexOf.get(node.id)!;
      if (balance[i] !== node.netInjection) {
        throw new Error(
          `内部错误：节点 ${node.id} 守恒复核失败（${balance[i]} ≠ ${node.netInjection}）`,
        );
      }
    }
    for (const f of flows) {
      if (f.flow < f.lower || f.flow > f.upper) {
        throw new Error('内部错误：存在流量超出风道容量区间');
      }
    }

    return { ...base, status: 'feasible', flows, witnesses: [], validationErrors: [] };
  }

  // 不可行：优先给出全网不平衡见证；再给最小割源侧集合（SS 可达的原节点）
  const witnesses: ViolationWitness[] = [];

  if (!balanced) {
    // 整张网本身就是无法闭合的集合：总注入与总排出相差 |Σb|
    witnesses.push({
      nodeSet: net.nodes.map((node) => node.id),
      outgoingDucts: [],
      incomingDucts: [],
      required: totalNetInjection,
      outgoingUpperSum: 0,
      incomingLowerSum: 0,
      capacity: 0,
      shortfall: Math.abs(totalNetInjection),
    });
  }

  const reachable = dinic.reachableFrom(SS);
  const memberFlags = reachable.slice(0, n);
  if (memberFlags.some(Boolean)) {
    const cut = buildWitness(memberFlags, net, indexOf);
    if (cut.shortfall > 0) witnesses.push(cut);

    // 补充诊断：自身收支就无法平衡的单点（连该节点都保不住的位置）
    for (const node of net.nodes) {
      const flags = new Array<boolean>(n).fill(false);
      flags[indexOf.get(node.id)!] = true;
      const single = buildWitness(flags, net, indexOf);
      if (single.shortfall > 0) witnesses.push(single);
    }
  }

  // 按节点集合去重，按最小未满足流量从大到小排列（最严重区域在前）
  const seenSets = new Set<string>();
  const deduped: ViolationWitness[] = [];
  for (const w of witnesses) {
    const key = [...w.nodeSet].sort().join('|');
    if (seenSets.has(key)) continue;
    seenSets.add(key);
    deduped.push(w);
  }
  deduped.sort((a, b) => b.shortfall - a.shortfall);

  return {
    ...base,
    status: 'infeasible',
    flows: [],
    witnesses: deduped,
    validationErrors: balanced ? [] : ['全网净注入量之和不为 0，无法形成闭环平衡'],
  };
}
