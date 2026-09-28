/**
 * 有解 / 无解冒烟脚本：
 *   1. 可行示例必须给出逐风道整数流量，并独立复核守恒与容量区间；
 *   2. 无解示例必须判不可行，并给出正的最小未满足流量与节点集合；
 *   3. 正下限风道必须参与整体裁决。
 * 全部通过退出码 0，任一失败退出码 1。
 */
import { certify } from '../src/lib/solver';
import { feasibleSample, infeasibleSample } from '../src/lib/sample';
import type { Network } from '../src/lib/types';

let failures = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    failures += 1;
  }
}

function independentlyVerify(net: Network): boolean {
  const result = certify(net);
  if (result.status !== 'feasible') return false;
  const bal = new Map<string, number>(net.nodes.map((n) => [n.id, 0]));
  for (const f of result.flows) {
    if (!Number.isInteger(f.flow) || f.flow < f.lower || f.flow > f.upper) return false;
    bal.set(f.from, (bal.get(f.from) ?? 0) + f.flow);
    bal.set(f.to, (bal.get(f.to) ?? 0) - f.flow);
  }
  return net.nodes.every((n) => bal.get(n.id) === n.netInjection);
}

console.log('冒烟 1/3：可行示例');
{
  const r = certify(feasibleSample);
  check('认证结论为 feasible', r.status === 'feasible');
  check('返回逐风道流量（条数等于风道数）', r.flows.length === feasibleSample.ducts.length);
  check('流量全部为整数', r.flows.every((f) => Number.isInteger(f.flow)));
  check('独立复核节点守恒与容量区间通过', independentlyVerify(feasibleSample));
}

console.log('冒烟 2/3：无解示例（容量缺口）');
{
  const r = certify(infeasibleSample);
  check('认证结论为 infeasible', r.status === 'infeasible');
  check('给出至少一个缺口见证', r.witnesses.length > 0);
  const w = r.witnesses[0];
  check('最小未满足流量为正', w.shortfall > 0, `shortfall=${w?.shortfall}`);
  check('缺口定位到具体节点集合', (w?.nodeSet.length ?? 0) > 0);
  check('缺口定位到边界风道', (w?.outgoingDucts.length ?? 0) > 0);
}

console.log('冒烟 3/3：正下限风道参与裁决');
{
  // 无源汇但强制正下限：无法守恒，必须判不可行，缺口恰为下限值
  const forcedLower: Network = {
    nodes: [
      { id: 'a', label: 'a', netInjection: 0 },
      { id: 'b', label: 'b', netInjection: 0 },
    ],
    ducts: [{ id: 'e', from: 'a', to: 'b', lower: 4, upper: 9 }],
  };
  const r1 = certify(forcedLower);
  check('强制正下限且无平衡能力时不可行', r1.status === 'infeasible');
  check('缺口等于被强制的下限 4', r1.witnesses.some((w) => w.shortfall === 4));

  // 提供足额注入后，同一条正下限风道方案变可行
  const satisfied: Network = {
    nodes: [
      { id: 'a', label: 'a', netInjection: 4 },
      { id: 'b', label: 'b', netInjection: -4 },
    ],
    ducts: [{ id: 'e', from: 'a', to: 'b', lower: 4, upper: 9 }],
  };
  const r2 = certify(satisfied);
  check('注入与正下限匹配时可行', r2.status === 'feasible');
  check('正下限风道流量 ≥ 4', r2.flows[0]?.flow >= 4);
}

if (failures > 0) {
  console.error(`\n冒烟失败：${failures} 项`);
  process.exit(1);
}
console.log('\n全部冒烟通过');
