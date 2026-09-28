import { useMemo, useState } from 'react';
import { certify } from './lib/solver';
import { feasibleSample, infeasibleSample } from './lib/sample';
import type { CertificationResult, Duct, FlowNode, Network } from './lib/types';

/** 已封存认证：仅针对按下“执行认证”那一刻的草稿快照有效 */
interface CertifiedRecord {
  network: Network;
  result: CertificationResult;
  at: string;
}

let nodeSeq = 0;
let ductSeq = 0;

function cloneNetwork(net: Network): Network {
  return {
    nodes: net.nodes.map((n) => ({ ...n })),
    ducts: net.ducts.map((d) => ({ ...d })),
  };
}

function emptyNetwork(): Network {
  return {
    nodes: [
      { id: 'SRC', label: '氮气源', netInjection: 0 },
      { id: 'OUT', label: '排放口', netInjection: 0 },
    ],
    ducts: [],
  };
}

function newNodeId(nodes: FlowNode[]): string {
  let id: string;
  do {
    nodeSeq += 1;
    id = `N${nodeSeq}`;
  } while (nodes.some((n) => n.id === id));
  return id;
}

function newDuctId(ducts: Duct[]): string {
  let id: string;
  do {
    ductSeq += 1;
    id = `D${ductSeq}`;
  } while (ducts.some((d) => d.id === id));
  return id;
}

/** 数字输入框：允许临时为空/非整数（由认证校验指出），不静默改写 */
function IntField({
  value,
  onCommit,
  min,
  ariaLabel,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  ariaLabel: string;
}) {
  const text = Number.isFinite(value) ? String(value) : '';
  return (
    <input
      aria-label={ariaLabel}
      type="number"
      step={1}
      min={min}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        onCommit(raw === '' ? NaN : Number(raw));
      }}
    />
  );
}

export default function App() {
  const [draft, setDraft] = useState<Network>(() => cloneNetwork(feasibleSample));
  const [record, setRecord] = useState<CertifiedRecord | null>(null);

  /** 任何草稿修改都立即让已有认证的流量与结论失效 */
  const mutateDraft = (fn: (d: Network) => void) => {
    setDraft((prev) => {
      const next = cloneNetwork(prev);
      fn(next);
      return next;
    });
    setRecord(null);
  };

  const runCertification = () => {
    const snapshot = cloneNetwork(draft);
    const result = certify(snapshot);
    setRecord({ network: snapshot, result, at: new Date().toLocaleTimeString() });
  };

  const loadSample = (sample: Network) => {
    setDraft(cloneNetwork(sample));
    setRecord(null);
  };

  const addNode = () =>
    mutateDraft((d) => {
      const id = newNodeId(d.nodes);
      d.nodes.push({ id, label: `节点 ${id}`, netInjection: 0 });
    });

  const addDuct = () =>
    mutateDraft((d) => {
      const first = d.nodes[0]?.id ?? '';
      const second = d.nodes[1]?.id ?? first;
      d.ducts.push({ id: newDuctId(d.ducts), from: first, to: second, lower: 0, upper: 10 });
    });

  const certifiedNetwork = record?.network ?? null;
  const result = record?.result ?? null;

  return (
    <div className="page">
      <header>
        <h1>封闭展柜氮气风道 · 整数流量认证</h1>
        <p className="subtitle">
          换气前确认氮气沿<strong>有向风道</strong>送达每个展柜，并从排放口带走，
          不留失去保护气氛的角落。认证同时裁决：
          <em>全网净注入平衡</em>、<em>节点收支守恒</em>、
          <em>风道容量区间（含正下限风道）</em>。
        </p>
      </header>

      <section className="panel" aria-label="认证状态">
        <StatusBanner record={record} onRun={runCertification} />
      </section>

      <section className="panel" aria-label="节点编辑">
        <div className="panel-head">
          <h2>节点（净注入量）</h2>
          <button type="button" onClick={addNode}>
            ＋ 添加节点
          </button>
        </div>
        <p className="hint">
          净注入量为正＝氮气源，为负＝排放口，为 0＝中转展柜；必须为整数。
        </p>
        <table className="edit-table">
          <thead>
            <tr>
              <th>编号</th>
              <th>名称</th>
              <th>净注入量</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.nodes.map((node, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    aria-label="节点编号"
                    value={node.id}
                    onChange={(e) =>
                      mutateDraft((d) => {
                        d.nodes[idx].id = e.target.value;
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label="节点名称"
                    value={node.label}
                    onChange={(e) =>
                      mutateDraft((d) => {
                        d.nodes[idx].label = e.target.value;
                      })
                    }
                  />
                </td>
                <td>
                  <IntField
                    ariaLabel="节点净注入量"
                    value={node.netInjection}
                    onCommit={(v) =>
                      mutateDraft((d) => {
                        d.nodes[idx].netInjection = v;
                      })
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      mutateDraft((d) => {
                        const removed = d.nodes[idx].id;
                        d.nodes.splice(idx, 1);
                        d.ducts = d.ducts.filter((e) => e.from !== removed && e.to !== removed);
                      })
                    }
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel" aria-label="风道编辑">
        <div className="panel-head">
          <h2>有向风道（方向与整数流量上下限）</h2>
          <button type="button" onClick={addDuct} disabled={draft.nodes.length < 2}>
            ＋ 添加风道
          </button>
        </div>
        <p className="hint">
          方向“起点 → 终点”即氮气流动方向；下限允许为正（该风道必须持续换气）。
          要求 0 ≤ 下限 ≤ 上限，均为整数。
        </p>
        <table className="edit-table">
          <thead>
            <tr>
              <th>编号</th>
              <th>起点</th>
              <th />
              <th>终点</th>
              <th>下限</th>
              <th>上限</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.ducts.map((duct, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    aria-label="风道编号"
                    value={duct.id}
                    onChange={(e) =>
                      mutateDraft((d) => {
                        d.ducts[idx].id = e.target.value;
                      })
                    }
                  />
                </td>
                <td>
                  <select
                    aria-label="风道起点"
                    value={duct.from}
                    onChange={(e) =>
                      mutateDraft((d) => {
                        d.ducts[idx].from = e.target.value;
                      })
                    }
                  >
                    {draft.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="arrow">→</td>
                <td>
                  <select
                    aria-label="风道终点"
                    value={duct.to}
                    onChange={(e) =>
                      mutateDraft((d) => {
                        d.ducts[idx].to = e.target.value;
                      })
                    }
                  >
                    {draft.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <IntField
                    ariaLabel="风道流量下限"
                    min={0}
                    value={duct.lower}
                    onCommit={(v) =>
                      mutateDraft((d) => {
                        d.ducts[idx].lower = v;
                      })
                    }
                  />
                </td>
                <td>
                  <IntField
                    ariaLabel="风道流量上限"
                    min={0}
                    value={duct.upper}
                    onCommit={(v) =>
                      mutateDraft((d) => {
                        d.ducts[idx].upper = v;
                      })
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      mutateDraft((d) => {
                        d.ducts.splice(idx, 1);
                      })
                    }
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {draft.ducts.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-row">
                  尚无风道，点击“添加风道”。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel actions" aria-label="操作">
        <button type="button" className="primary" onClick={runCertification}>
          ▶ 执行认证
        </button>
        <button type="button" onClick={() => loadSample(feasibleSample)}>
          载入可行示例
        </button>
        <button type="button" onClick={() => loadSample(infeasibleSample)}>
          载入无解示例
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(emptyNetwork());
            setRecord(null);
          }}
        >
          清空
        </button>
      </section>

      {record && result && certifiedNetwork && (
        <ResultPanel record={record} network={certifiedNetwork} result={result} />
      )}
    </div>
  );
}

function StatusBanner({
  record,
  onRun,
}: {
  record: CertifiedRecord | null;
  onRun: () => void;
}) {
  if (!record) {
    return (
      <div className="banner stale">
        <span className="badge">未认证 / 已失效</span>
        <span>草稿修改后，此前认证的流量与结论立即失效。请核对数据后执行认证。</span>
        <button type="button" className="primary" onClick={onRun}>
          ▶ 执行认证
        </button>
      </div>
    );
  }
  if (record.result.status === 'feasible') {
    return (
      <div className="banner feasible">
        <span className="badge">认证通过 · {record.at}</span>
        <span>
          全网净注入平衡、各节点收支守恒、全部风道（含正下限）容量区间均满足，
          可按下列逐风道整数流量换气。
        </span>
      </div>
    );
  }
  return (
    <div className="banner infeasible">
      <span className="badge">认证不通过 · {record.at}</span>
      <span>不存在满足全部约束的整数换气方案，缺口见证见下方。</span>
    </div>
  );
}

function ResultPanel({
  record,
  network,
  result,
}: {
  record: CertifiedRecord;
  network: Network;
  result: CertificationResult;
}) {
  return (
    <section className="panel result" aria-label="认证结论">
      <h2>认证结论（快照时间 {record.at}）</h2>

      <ul className="checklist">
        <li className={result.netInjectionBalanced ? 'ok' : 'bad'}>
          全网净注入平衡：Σ 净注入 = {result.totalNetInjection}
          （{result.netInjectionBalanced ? '= 0，通过' : '≠ 0，不通过'}）
        </li>
        <li className={result.validationErrors.length === 0 ? 'ok' : 'bad'}>
          草稿数据校验：{result.validationErrors.length === 0 ? '通过' : `${result.validationErrors.length} 项错误`}
        </li>
        <li className={result.status === 'feasible' ? 'ok' : 'bad'}>
          节点收支守恒与风道容量区间（含正下限）：
          {result.status === 'feasible' ? '联立可行' : '联立不可行'}
        </li>
      </ul>

      {result.validationErrors.length > 0 && (
        <div className="error-box">
          <h3>数据错误</h3>
          <ul>
            {result.validationErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {result.status === 'feasible' ? (
        <FeasibleView network={network} result={result} />
      ) : (
        <InfeasibleView result={result} />
      )}
    </section>
  );
}

function FeasibleView({
  network,
  result,
}: {
  network: Network;
  result: CertificationResult;
}) {
  const flowOf = useMemo(() => {
    const m = new Map<string, number>();
    result.flows.forEach((f) => m.set(f.ductId, f.flow));
    return m;
  }, [result]);

  const nodeRows = network.nodes.map((node) => {
    let inflow = 0;
    let outflow = 0;
    for (const d of network.ducts) {
      if (d.from === node.id) outflow += flowOf.get(d.id) ?? 0;
      if (d.to === node.id) inflow += flowOf.get(d.id) ?? 0;
    }
    const net = outflow - inflow;
    return { node, inflow, outflow, net, ok: net === node.netInjection };
  });

  return (
    <>
      <h3>逐风道整数流量</h3>
      <table className="result-table">
        <thead>
          <tr>
            <th>风道</th>
            <th>方向</th>
            <th>下限</th>
            <th>认证流量</th>
            <th>上限</th>
          </tr>
        </thead>
        <tbody>
          {result.flows.map((f) => (
            <tr key={f.ductId}>
              <td>{f.ductId}</td>
              <td className="dir">
                {f.from} <span className="arrow">→</span> {f.to}
              </td>
              <td>{f.lower}</td>
              <td className="flow-value">{f.flow}</td>
              <td>{f.upper}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>节点收支复核（流出 − 流入 应等于净注入量）</h3>
      <table className="result-table">
        <thead>
          <tr>
            <th>节点</th>
            <th>流入</th>
            <th>流出</th>
            <th>实际净值</th>
            <th>申报净注入</th>
            <th>守恒</th>
          </tr>
        </thead>
        <tbody>
          {nodeRows.map(({ node, inflow, outflow, net, ok }) => (
            <tr key={node.id}>
              <td>
                {node.id}（{node.label}）
              </td>
              <td>{inflow}</td>
              <td>{outflow}</td>
              <td>{net}</td>
              <td>{node.netInjection}</td>
              <td className={ok ? 'ok-text' : 'bad-text'}>{ok ? '✓' : '✗'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function InfeasibleView({
  result,
}: {
  result: CertificationResult;
}) {
  if (result.witnesses.length === 0) {
    return <p className="hint">请先修正上方数据错误后重新认证。</p>;
  }
  return (
    <>
      <h3>导致缺口的节点集合与最小未满足流量</h3>
      <p className="hint">
        下列区域（库房节点集合）必须送走的最小风量超过了出风风道的总上界，
        氮气无法被完整带走；<strong>最小未满足流量</strong>
        ＝区域净注入 ＋ 进入风道下限之和 − 离开风道上限之和。
      </p>
      {result.witnesses.map((w, i) => (
        <div key={i} className="witness">
          <div className="witness-title">
            缺口 #{i + 1} · 最小未满足流量 <strong>{w.shortfall}</strong> 单位
          </div>
          <table className="result-table compact">
            <tbody>
              <tr>
                <th>无法平衡的节点集合</th>
                <td>
                  {w.nodeSet.map((id) => (
                    <span key={id} className="chip bad-chip">
                      {id}
                    </span>
                  ))}
                </td>
              </tr>
              <tr>
                <th>离开该区域的风道（上界合计 {w.outgoingUpperSum}）</th>
                <td>
                  {w.outgoingDucts.length === 0 ? (
                    <span className="muted">无</span>
                  ) : (
                    w.outgoingDucts.map((id) => (
                      <span key={id} className="chip">
                        {id}
                      </span>
                    ))
                  )}
                </td>
              </tr>
              <tr>
                <th>进入该区域的风道（强制下限合计 {w.incomingLowerSum}）</th>
                <td>
                  {w.incomingDucts.length === 0 ? (
                    <span className="muted">无</span>
                  ) : (
                    w.incomingDucts.map((id) => (
                      <span key={id} className="chip">
                        {id}
                      </span>
                    ))
                  )}
                </td>
              </tr>
              <tr>
                <th>区域净注入合计</th>
                <td>{w.required}</td>
              </tr>
              <tr>
                <th>可外送上界（出边上界 − 进边下限）</th>
                <td>{w.capacity}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
      <p className="hint">
        排查建议：加宽集合边界上的出风风道、降低进风风道的正下限，或调整该区域内节点的
        净注入量；每次修改后须重新认证。
      </p>
    </>
  );
}
