import type { Network } from './types';

/** 可行示例：氮气源经有向风道覆盖三个展柜后到达排放口，含一条正下限风道 */
export const feasibleSample: Network = {
  nodes: [
    { id: 'SRC', label: '氮气源', netInjection: 10 },
    { id: 'A', label: '展柜A', netInjection: 0 },
    { id: 'B', label: '展柜B', netInjection: 0 },
    { id: 'C', label: '展柜C', netInjection: 0 },
    { id: 'OUT', label: '排放口', netInjection: -10 },
  ],
  ducts: [
    { id: 'D1', from: 'SRC', to: 'A', lower: 0, upper: 10 },
    { id: 'D2', from: 'A', to: 'B', lower: 1, upper: 8 },
    { id: 'D3', from: 'A', to: 'C', lower: 0, upper: 6 },
    { id: 'D4', from: 'B', to: 'C', lower: 0, upper: 8 },
    { id: 'D5', from: 'B', to: 'OUT', lower: 0, upper: 4 },
    { id: 'D6', from: 'C', to: 'OUT', lower: 0, upper: 20 },
  ],
};

/** 无解示例：展柜B 区域送风总上界不足，存在无法带走的氮气缺口 */
export const infeasibleSample: Network = {
  nodes: [
    { id: 'SRC', label: '氮气源', netInjection: 10 },
    { id: 'A', label: '展柜A', netInjection: 0 },
    { id: 'B', label: '展柜B', netInjection: 0 },
    { id: 'OUT', label: '排放口', netInjection: -10 },
  ],
  ducts: [
    { id: 'D1', from: 'SRC', to: 'A', lower: 0, upper: 10 },
    { id: 'D2', from: 'A', to: 'B', lower: 0, upper: 4 },
    { id: 'D3', from: 'B', to: 'OUT', lower: 0, upper: 3 },
    { id: 'D4', from: 'A', to: 'OUT', lower: 0, upper: 2 },
  ],
};
