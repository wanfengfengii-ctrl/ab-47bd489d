/**
 * 网络模型类型定义
 *
 * 节点 node：展柜 / 汇流节点
 *   - netInjection > 0：氮气源（净注入）
 *   - netInjection < 0：排放口（净排出，取绝对值）
 *   - netInjection = 0：中转节点
 *
 * 风道 duct：有向边 u -> v
 *   - lower/upper：整数流量上下限，0 <= lower <= upper
 */

export interface FlowNode {
  id: string;
  label: string;
  /** 净注入量（整数）。源为正，排放口为负 */
  netInjection: number;
}

export interface Duct {
  id: string;
  from: string;
  to: string;
  /** 整数流量下限（含），必须 >= 0 */
  lower: number;
  /** 整数流量上限（含），必须 >= lower */
  upper: number;
}

export interface Network {
  nodes: FlowNode[];
  ducts: Duct[];
}

/** 单条风道的认证结果 */
export interface CertifiedFlow {
  ductId: string;
  from: string;
  to: string;
  /** 认证通过的整数流量 f, lower <= f <= upper */
  flow: number;
  lower: number;
  upper: number;
}

/** 不可行见证：最小未满足量对应的割集（节点集合） */
export interface ViolationWitness {
  /** 导致缺口的节点集合（源侧 S：经残余网络可达的节点） */
  nodeSet: string[];
  /** 越过该集合边界的风道（方向：集合内 -> 集合外） */
  outgoingDucts: string[];
  /** 进入该集合边界的风道（方向：集合外 -> 集合内） */
  incomingDucts: string[];
  /** 集合内的净注入需求之和（截断到整数） */
  required: number;
  /** 离开集合的风道上限之和 */
  outgoingUpperSum: number;
  /** 进入集合的风道下限之和（被强制送入该区域的风量） */
  incomingLowerSum: number;
  /** 集合出边容量之和（减去进边下限，截断到整数） */
  capacity: number;
  /** 最小未满足流量 = max(0, required - capacity) */
  shortfall: number;
}

export type CertStatus = 'feasible' | 'infeasible';

export interface CertificationResult {
  status: CertStatus;
  /** 可行时：逐风道整数流量 */
  flows: CertifiedFlow[];
  /** 不可行时：最小未满足量见证（可能有多个，列出全部极小见证） */
  witnesses: ViolationWitness[];
  /** 全网净注入之和（必须为 0） */
  totalNetInjection: number;
  /** 全网净注入是否平衡 */
  netInjectionBalanced: boolean;
  /** 草稿数据本身的校验错误（非空时同样立即判定不可行） */
  validationErrors: string[];
}
