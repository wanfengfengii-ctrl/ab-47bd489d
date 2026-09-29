/**
 * 带整数下界的有向网络流可行性认证。
 *
 * 模型：
 *   - 节点 i 的净注入量 b[i]（>0 向管网供气，<0 抽气/排放，=0 中转）。
 *   - 风道 u->v 整数流量 f 必须满足 lower <= f <= upper。
 *   - 节点收支守恒：流出 - 流入 = b[i]。
 *
 * 认证（经典下界可行流变换，全部容量为整数，最大流给出整数解）：
 *   令 f = lower + x（0 <= x <= upper-lower），
 *   强制下限后节点 i 的剩余需求 d[i] = b[i] + 流入下限 - 流出下限。
 *   d[i] > 0：还差 d[i] 流出 → 超源 S 向 i 送 d[i]；
 *   d[i] < 0：还需 -d[i] 流入 → i 向超汇 T 排 -d[i]。
 *   可行当且仅当 全网净注入 Σb=0 且 超源弧全部饱和（maxFlow = Σ d⁺）。
 *
 * 不可行证据（最大流–最小割）：
 *   - supply 模式：残量网中 S 可达片区 R“有气送不出去”，
 *     缺口 = Σ_R b + Σ_(外->R) lower − Σ_(R->外) upper。
 *   - 当全网抽排总量大于供气（Σb<0）时，供气侧割可能报 0 缺口却仍不可行；
 *     此时对镜像网络（b 取负、风道反向）求割，得到 extraction 模式片区
 *     “抽排口吃不进来”。报告两种模式中缺口较大者。
 */
import { Dinic } from './dinic';

export interface FlowNode {
  id: string;
  /** 净注入量：正=供气，负=抽排，0=中转 */
  balance: number;
  label?: string;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  lower: number;
  upper: number;
}

export interface EdgeFlow extends FlowEdge {
  /** 认证通过时该风道的整数流量 */
  flow: number;
}

export interface NodeShortfall {
  nodeId: string;
  /** 强制下限后该节点仍需送出（供气侧）或仍需抽入（排放侧）的需求量 */
  demand: number;
  /** 其中实际满足不了的量，合计 = 总缺口 */
  unmet: number;
  /** supply=供气送不出去；extraction=抽排口吃不进来 */
  kind: 'supply' | 'extraction';
}

export interface FeasibleResult {
  feasible: true;
  flows: EdgeFlow[];
  /** 全网净注入合计（认证要求为 0） */
  totalBalance: number;
}

export interface InfeasibleResult {
  feasible: false;
  /** 导致缺口的节点集合（最小割片区） */
  deficientNodes: string[];
  /** 最小未满足流量（缺口） */
  shortfall: number;
  totalBalance: number;
  /** 净注入合计是否本身不为 0（不平衡则任何流量都不可能守恒） */
  balanceMismatch: boolean;
  /** 片区内各节点的未满足需求明细（合计 unmet = shortfall） */
  nodeShortfalls: NodeShortfall[];
  /**
   * 片区缺口恒等式（跨边均指与片区相连、方向跨越片区边界的风道）：
   * - supply 模式：Σ_R 净注入 + Σ跨入下限 − Σ跨出上限 = 缺口
   * - extraction 模式：−Σ_X 净注入 + Σ跨出下限 − Σ跨入上限 = 缺口
   */
  details: {
    sumBalance: number;
    lowerCross: number;
    upperCross: number;
  };
  /**
   * supply：片区有气送不出去；
   * extraction：排放片区吃不进来（仅当全网抽排总量大于供气）。
   */
  cutMode: 'supply' | 'extraction';
}

export type Certification = FeasibleResult | InfeasibleResult;

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
}

function toInt(v: number): number {
  return Math.trunc(v);
}

/** 草稿级校验：引用完整性与上下限合法性。 */
export function validateNetwork(nodes: FlowNode[], edges: FlowEdge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  for (const n of nodes) {
    if (!n.id.trim()) issues.push({ level: 'error', message: '存在空的节点编号。' });
    if (ids.has(n.id)) issues.push({ level: 'error', message: `节点编号 ${n.id} 重复。` });
    ids.add(n.id);
  }
  const edgeIds = new Set<string>();
  for (const e of edges) {
    if (!e.id.trim()) issues.push({ level: 'error', message: '存在空的风道编号。' });
    if (edgeIds.has(e.id)) issues.push({ level: 'error', message: `风道编号 ${e.id} 重复。` });
    edgeIds.add(e.id);
    if (!ids.has(e.from)) issues.push({ level: 'error', message: `风道 ${e.id} 的起点 ${e.from} 不存在。` });
    if (!ids.has(e.to)) issues.push({ level: 'error', message: `风道 ${e.id} 的终点 ${e.to} 不存在。` });
    if (e.from === e.to) issues.push({ level: 'warning', message: `风道 ${e.id} 是自环（不影响守恒，请确认是否有意）。` });
    if (!Number.isFinite(e.lower) || !Number.isFinite(e.upper)) {
      issues.push({ level: 'error', message: `风道 ${e.id} 的上下限必须是有限整数。` });
    } else {
      if (toInt(e.lower) !== e.lower || toInt(e.upper) !== e.upper) {
        issues.push({ level: 'warning', message: `风道 ${e.id} 的上下限含小数，认证时将截断为整数。` });
      }
      if (e.lower < 0) issues.push({ level: 'error', message: `风道 ${e.id} 的下限为负数（流量不可为负）。` });
      if (e.upper < e.lower) issues.push({ level: 'error', message: `风道 ${e.id} 的上限小于下限。` });
    }
  }
  return issues;
}

interface NormNode {
  id: string;
  balance: number;
}
interface NormEdge {
  id: string;
  from: number;
  to: number;
  lower: number;
  upper: number;
}

interface SolvedNetwork {
  /** 超源总需求 Σ d⁺ */
  totalDemand: number;
  /** 实际最大流 */
  flow: number;
  dinic: Dinic;
  n: number;
  /** 业务风道在残量网中的正向边位置，用于可行时反推整数流量 */
  edgeRefs: { edge: NormEdge; index: number }[];
  /** 每个节点的超源弧下标（无则 -1），残量即该供气节点未满足量 */
  sEdgeIndex: number[];
  /** 每个节点的超汇弧下标（无则 -1），残量即该抽排节点未满足量 */
  tEdgeIndex: number[];
  demand: number[];
}

/** 构造超源/超汇网络并求最大流。mirror=true 时净注入取负、风道反向。 */
function solve(nodes: NormNode[], edgesIn: NormEdge[], mirror: boolean): SolvedNetwork {
  const n = nodes.length;
  const S = n;
  const T = n + 1;
  const dinic = new Dinic(n + 2);

  const edges = mirror
    ? edgesIn.map((e) => ({ ...e, from: e.to, to: e.from }))
    : edgesIn;

  const demand: number[] = new Array<number>(n).fill(0);
  nodes.forEach((node, i) => {
    demand[i] = mirror ? -node.balance : node.balance;
  });
  for (const e of edges) {
    demand[e.from] -= e.lower;
    demand[e.to] += e.lower;
  }

  const edgeRefs: { edge: NormEdge; index: number }[] = [];
  for (const e of edges) {
    const index = dinic.addEdge(e.from, e.to, e.upper - e.lower);
    edgeRefs.push({ edge: e, index });
  }

  const sEdgeIndex = new Array<number>(n).fill(-1);
  const tEdgeIndex = new Array<number>(n).fill(-1);
  let totalDemand = 0;
  for (let i = 0; i < n; i++) {
    if (demand[i] > 0) {
      sEdgeIndex[i] = dinic.addEdge(S, i, demand[i]);
      totalDemand += demand[i];
    } else if (demand[i] < 0) {
      tEdgeIndex[i] = dinic.addEdge(i, T, -demand[i]);
    }
  }

  const flow = totalDemand === 0 ? 0 : dinic.maxFlow(S, T);
  return { totalDemand, flow, dinic, n, edgeRefs, sEdgeIndex, tEdgeIndex, demand };
}

export function certify(nodesInput: FlowNode[], edgesInput: FlowEdge[]): Certification {
  // 以输入快照计算，保证结果只对应当前草稿。
  const inNodes: NormNode[] = nodesInput.map((node) => ({
    id: node.id,
    balance: toInt(node.balance),
  }));
  const idIndexRaw = new Map(inNodes.map((node, i) => [node.id, i]));
  for (const e of edgesInput) {
    if (!idIndexRaw.has(e.from) || !idIndexRaw.has(e.to)) {
      throw new Error(`风道 ${e.id} 引用了不存在的节点，无法认证。`);
    }
  }
  const inEdges: NormEdge[] = edgesInput.map((e) => ({
    id: e.id,
    from: idIndexRaw.get(e.from)!,
    to: idIndexRaw.get(e.to)!,
    lower: Math.max(0, toInt(e.lower)),
    upper: toInt(e.upper),
  }));

  for (const e of inEdges) {
    if (e.upper < e.lower) throw new Error(`风道 ${e.id} 的上限小于下限，无法认证。`);
  }

  const totalBalance = inNodes.reduce((s, node) => s + node.balance, 0);
  const balanceMismatch = totalBalance !== 0;

  const primary = solve(inNodes, inEdges, false);

  // 可行必须同时满足：全网净注入平衡 且 超源弧全部饱和。
  if (totalBalance === 0 && primary.flow === primary.totalDemand) {
    // primary 未镜像，edgeRefs 与 inEdges 同序，直接还原为业务风道编号。
    const flows: EdgeFlow[] = primary.edgeRefs.map(({ edge, index }, k) => {
      const src = edgesInput[k];
      const residual = primary.dinic.g[edge.from][index].cap;
      const x = edge.upper - edge.lower - residual;
      return {
        id: edge.id,
        from: src.from,
        to: src.to,
        lower: edge.lower,
        upper: edge.upper,
        flow: edge.lower + x,
      };
    });
    return { feasible: true, flows, totalBalance };
  }

  // 恒等式：供气侧缺口 − 抽排侧缺口 = Σb。
  //   Σb ≥ 0 时供气侧割体现缺口（Σb>0 时必为正）；
  //   Σb < 0 时供气可能全部送出、但抽排侧吃不进来，需在镜像网络求割。
  const mode: 'supply' | 'extraction' = totalBalance >= 0 ? 'supply' : 'extraction';
  const solved = mode === 'supply' ? primary : solve(inNodes, inEdges, true);
  const shortfall = solved.totalDemand - solved.flow;
  const S = solved.n;

  // 残量网中 S 可达集 = 最小割源侧片区（在所选网络方向上）。
  const reachable = solved.dinic.reachable(S);
  const inCut = new Set<number>();
  for (let i = 0; i < solved.n; i++) if (reachable[i]) inCut.add(i);

  // 注意：extraction 模式下 solved 中的风道已反向，跨边统计需还原到原始方向。
  let sumBalance = 0;
  let lowerCross = 0;
  let upperCross = 0;
  for (let i = 0; i < solved.n; i++) {
    if (inCut.has(i)) sumBalance += inNodes[i].balance;
  }
  for (const ref of solved.edgeRefs) {
    const e = ref.edge;
    if (mode === 'supply') {
      const uInside = inCut.has(e.from);
      const vInside = inCut.has(e.to);
      if (uInside === vInside) continue;
      // 网络即原方向：跨入按下限计入供给，跨出按上限计最大送出。
      if (vInside) lowerCross += e.lower;
      else upperCross += e.upper;
    } else {
      // 网络中风道已反向：e.from=原终点, e.to=原起点。
      const origFrom = e.to;
      const origTo = e.from;
      const fromInside = inCut.has(origFrom);
      const toInside = inCut.has(origTo);
      if (fromInside === toInside) continue;
      // 恒等式：−Σ_X b + 跨出下限 − 跨入上限 = 缺口。
      if (fromInside) lowerCross += e.lower; // 原方向跨出片区
      else upperCross += e.upper; // 原方向跨入片区
    }
  }

  const nodeShortfalls: NodeShortfall[] = [];
  for (let i = 0; i < solved.n; i++) {
    if (!inCut.has(i) || solved.demand[i] <= 0) continue;
    const unmet = solved.sEdgeIndex[i] >= 0 ? solved.dinic.g[S][solved.sEdgeIndex[i]].cap : 0;
    if (unmet > 0) {
      nodeShortfalls.push({
        nodeId: inNodes[i].id,
        demand: solved.demand[i],
        unmet,
        kind: mode,
      });
    }
  }

  return {
    feasible: false,
    deficientNodes: inNodes.filter((_, i) => inCut.has(i)).map((node) => node.id),
    shortfall,
    totalBalance,
    balanceMismatch,
    nodeShortfalls,
    details: { sumBalance, lowerCross, upperCross },
    cutMode: mode,
  };
}
