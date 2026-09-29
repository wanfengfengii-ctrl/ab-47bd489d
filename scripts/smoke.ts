/**
 * 有解/无解冒烟：直接调用核心认证器，断言一个可行案例与一个不可行案例的行为。
 * 供 verify 一次性服务在测试、构建之后执行；任一断言失败即非零退出码。
 */
import { certify, type FlowEdge, type FlowNode } from '../src/core/flow';

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const feasibleNodes: FlowNode[] = [
  { id: 'N2', balance: 20 },
  { id: 'A', balance: 0 },
  { id: 'B', balance: 0 },
  { id: 'OUT', balance: -20 },
];
const feasibleEdges: FlowEdge[] = [
  { id: 'd1', from: 'N2', to: 'A', lower: 3, upper: 12 },
  { id: 'd2', from: 'N2', to: 'B', lower: 3, upper: 12 },
  { id: 'd3', from: 'A', to: 'OUT', lower: 0, upper: 20 },
  { id: 'd4', from: 'B', to: 'OUT', lower: 0, upper: 20 },
];

console.log('冒烟 1：有解案例（含正下限）');
const ok = certify(feasibleNodes, feasibleEdges);
check('判定为可行', ok.feasible === true);
if (ok.feasible) {
  const net = new Map<string, number>(feasibleNodes.map((n) => [n.id, 0]));
  let integralAndInRange = true;
  for (const f of ok.flows) {
    if (!Number.isInteger(f.flow) || f.flow < f.lower || f.flow > f.upper) integralAndInRange = false;
    net.set(f.from, (net.get(f.from) ?? 0) + f.flow);
    net.set(f.to, (net.get(f.to) ?? 0) - f.flow);
  }
  check('全部风道为区间内整数流量', integralAndInRange);
  check(
    '每个节点收支守恒',
    feasibleNodes.every((n) => net.get(n.id) === n.balance),
  );
  check('正下限得到履行', ok.flows.find((f) => f.id === 'd1')!.flow >= 3);
}

console.log('冒烟 2：无解案例（跨出片区风道被掐到上限 6）');
const badEdges: FlowEdge[] = [
  ...feasibleEdges.slice(0, 2),
  { id: 'd3', from: 'A', to: 'OUT', lower: 0, upper: 6 },
  { id: 'd4', from: 'B', to: 'OUT', lower: 0, upper: 6 },
];
const bad = certify(feasibleNodes, badEdges);
check('判定为不可行', bad.feasible === false);
if (!bad.feasible) {
  check('缺口为正数', bad.shortfall > 0, `shortfall=${bad.shortfall}`);
  check('报告了导致缺口的节点集合', bad.deficientNodes.includes('N2'));
  const sumUnmet = bad.nodeShortfalls.reduce((s, x) => s + x.unmet, 0);
  check('逐节点未满足量合计等于总缺口', sumUnmet === bad.shortfall, `${sumUnmet} != ${bad.shortfall}`);
}

console.log('冒烟 3：净注入不平衡案例');
const imbalance = certify(
  [
    { id: 'N2', balance: 9 },
    { id: 'OUT', balance: -10 },
  ],
  [{ id: 'd', from: 'N2', to: 'OUT', lower: 0, upper: 100 }],
);
check('净注入合计非零时判不可行并标记', imbalance.feasible === false && (!imbalance.feasible && imbalance.balanceMismatch));

if (failures > 0) {
  console.error(`\n冒烟失败：${failures} 项断言未通过。`);
  process.exit(1);
}
console.log('\n全部冒烟断言通过。');
