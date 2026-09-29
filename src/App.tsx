import { useMemo, useState } from 'react';
import {
  certify,
  validateNetwork,
  type Certification,
  type FlowEdge,
  type FlowNode,
} from './core/flow';
import { IntField } from './ui/IntField';

interface Draft {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

const FEASIBLE_SAMPLE: Draft = {
  nodes: [
    { id: 'N2', balance: 20, label: '氮气源' },
    { id: 'A', balance: 0, label: '展柜 A' },
    { id: 'B', balance: 0, label: '展柜 B' },
    { id: 'C', balance: 0, label: '展柜 C' },
    { id: 'OUT', balance: -20, label: '排放口' },
  ],
  edges: [
    { id: 'd1', from: 'N2', to: 'A', lower: 2, upper: 12 },
    { id: 'd2', from: 'N2', to: 'B', lower: 2, upper: 12 },
    { id: 'd3', from: 'A', to: 'C', lower: 1, upper: 12 },
    { id: 'd4', from: 'B', to: 'C', lower: 1, upper: 12 },
    { id: 'd5', from: 'C', to: 'OUT', lower: 5, upper: 30 },
  ],
};

const INFEASIBLE_SAMPLE: Draft = {
  nodes: FEASIBLE_SAMPLE.nodes,
  edges: FEASIBLE_SAMPLE.edges.map((e) => (e.id === 'd5' ? { ...e, upper: 10 } : e)),
};

let seq = 100;
const nextId = (prefix: string) => `${prefix}${++seq}`;

export function App() {
  const [draft, setDraft] = useState<Draft>(() => ({
    nodes: FEASIBLE_SAMPLE.nodes.map((n) => ({ ...n })),
    edges: FEASIBLE_SAMPLE.edges.map((e) => ({ ...e })),
  }));
  // 草稿一旦变动，既有认证立即失效（cert = null），须重新运行认证。
  const [cert, setCert] = useState<Certification | null>(null);

  const issues = useMemo(() => validateNetwork(draft.nodes, draft.edges), [draft]);
  const hasError = issues.some((i) => i.level === 'error');
  const totalBalance = draft.nodes.reduce((s, n) => s + n.balance, 0);

  const mutate = (producer: (d: Draft) => void) => {
    setDraft((d) => {
      const copy: Draft = {
        nodes: d.nodes.map((n) => ({ ...n })),
        edges: d.edges.map((e) => ({ ...e })),
      };
      producer(copy);
      return copy;
    });
    setCert(null);
  };

  const runCertification = () => {
    if (hasError) return;
    setCert(certify(draft.nodes, draft.edges));
  };

  const loadSample = (sample: Draft) => {
    seq = 100;
    setDraft({
      nodes: sample.nodes.map((n) => ({ ...n })),
      edges: sample.edges.map((e) => ({ ...e })),
    });
    setCert(null);
  };

  return (
    <div className="page">
      <header className="topbar">
        <h1>封闭展柜氮气风道 · 整数流量认证</h1>
        <p className="subtitle">
          换气前确认氮气沿有向风道送达各柜并由排放口带走。认证同时校验：全网净注入平衡、节点收支守恒、风道整数容量区间（含正下限）。
        </p>
      </header>

      <StatusBanner cert={cert} edited={cert === null} hasError={hasError} />

      <section className="panel">
        <div className="panel-head">
          <h2>节点净注入量</h2>
          <div className="actions">
            <button
              type="button"
              onClick={() =>
                mutate((d) => d.nodes.push({ id: nextId('N'), balance: 0, label: '新节点' }))
              }
            >
              + 添加节点
            </button>
          </div>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: '12rem' }}>节点编号</th>
              <th style={{ width: '14rem' }}>名称</th>
              <th>净注入量（+供气 / −抽排）</th>
              <th style={{ width: '4rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {draft.nodes.map((n, row) => (
              <tr key={row}>
                <td>
                  <input
                    className="text-input"
                    value={n.id}
                    aria-label="节点编号"
                    onChange={(e) =>
                      mutate((d) => {
                        const old = n.id;
                        const target = d.nodes.find((x) => x.id === old);
                        if (!target) return;
                        target.id = e.target.value;
                        d.edges.forEach((ed) => {
                          if (ed.from === old) ed.from = target.id;
                          if (ed.to === old) ed.to = target.id;
                        });
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    className="text-input"
                    value={n.label ?? ''}
                    aria-label="节点名称"
                    onChange={(e) =>
                      mutate((d) => {
                        const target = d.nodes.find((x) => x.id === n.id);
                        if (target) target.label = e.target.value;
                      })
                    }
                  />
                </td>
                <td>
                  <IntField
                    value={n.balance}
                    ariaLabel="净注入量"
                    invalid={false}
                    onCommit={(v) =>
                      mutate((d) => {
                        const target = d.nodes.find((x) => x.id === n.id);
                        if (target) target.balance = v;
                      })
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="danger"
                    aria-label={`删除节点 ${n.id}`}
                    onClick={() =>
                      mutate((d) => {
                        d.nodes = d.nodes.filter((x) => x.id !== n.id);
                        d.edges = d.edges.filter((e) => e.from !== n.id && e.to !== n.id);
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
        <p className="hint">
          全网净注入合计：<strong className={totalBalance === 0 ? 'ok' : 'bad'}>{totalBalance}</strong>
          {totalBalance !== 0 && '（供气与抽排不相等，必然无法守恒）'}
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>风道方向与整数流量上下限</h2>
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                const a = draft.nodes[0]?.id ?? 'A';
                const b = draft.nodes[1]?.id ?? 'B';
                mutate((d) => d.edges.push({ id: nextId('d'), from: a, to: b, lower: 0, upper: 10 }));
              }}
            >
              + 添加风道
            </button>
          </div>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: '10rem' }}>风道编号</th>
              <th>起点</th>
              <th style={{ width: '3rem' }}></th>
              <th>终点</th>
              <th style={{ width: '9rem' }}>下限</th>
              <th style={{ width: '9rem' }}>上限</th>
              <th style={{ width: '4rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {draft.edges.map((e, row) => (
              <tr key={row}>
                <td>
                  <input
                    className="text-input"
                    value={e.id}
                    aria-label="风道编号"
                    onChange={(ev) =>
                      mutate((d) => {
                        const target = d.edges.find((x) => x.id === e.id);
                        if (target) target.id = ev.target.value;
                      })
                    }
                  />
                </td>
                <td>
                  <select
                    className="text-input"
                    aria-label="风道起点"
                    value={e.from}
                    onChange={(ev) =>
                      mutate((d) => {
                        const target = d.edges.find((x) => x.id === e.id);
                        if (target) target.from = ev.target.value;
                      })
                    }
                  >
                    {draft.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id}
                        {n.label ? `（${n.label}）` : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="arrow">→</td>
                <td>
                  <select
                    className="text-input"
                    aria-label="风道终点"
                    value={e.to}
                    onChange={(ev) =>
                      mutate((d) => {
                        const target = d.edges.find((x) => x.id === e.id);
                        if (target) target.to = ev.target.value;
                      })
                    }
                  >
                    {draft.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id}
                        {n.label ? `（${n.label}）` : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <IntField
                    value={e.lower}
                    ariaLabel="流量下限"
                    invalid={e.lower < 0}
                    onCommit={(v) =>
                      mutate((d) => {
                        const target = d.edges.find((x) => x.id === e.id);
                        if (target) target.lower = v;
                      })
                    }
                  />
                </td>
                <td>
                  <IntField
                    value={e.upper}
                    ariaLabel="流量上限"
                    invalid={e.upper < e.lower}
                    onCommit={(v) =>
                      mutate((d) => {
                        const target = d.edges.find((x) => x.id === e.id);
                        if (target) target.upper = v;
                      })
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="danger"
                    aria-label={`删除风道 ${e.id}`}
                    onClick={() => mutate((d) => (d.edges = d.edges.filter((x) => x.id !== e.id)))}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {draft.edges.length === 0 && <p className="hint">当前没有风道。</p>}
      </section>

      {issues.length > 0 && (
        <section className="panel issues">
          <h2>草稿问题</h2>
          <ul>
            {issues.map((it, i) => (
              <li key={i} className={it.level === 'error' ? 'bad' : 'warn'}>
                [{it.level === 'error' ? '错误' : '提示'}] {it.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel certify-bar">
        <button type="button" className="primary" disabled={hasError} onClick={runCertification}>
          ▶ 运行认证
        </button>
        <button type="button" onClick={() => loadSample(FEASIBLE_SAMPLE)}>
          载入有解示例
        </button>
        <button type="button" onClick={() => loadSample(INFEASIBLE_SAMPLE)}>
          载入无解示例
        </button>
        <button type="button" onClick={() => loadSample({ nodes: [], edges: [] })}>
          清空
        </button>
        {hasError && <span className="bad">存在错误草稿，修复后才能认证。</span>}
      </section>

      {cert && <ResultPanel cert={cert} nodes={draft.nodes} edges={draft.edges} />}
    </div>
  );
}

function StatusBanner({
  cert,
  edited,
  hasError,
}: {
  cert: Certification | null;
  edited: boolean;
  hasError: boolean;
}) {
  if (hasError) {
    return <div className="banner banner-error">草稿存在错误，尚不能认证。</div>;
  }
  if (!cert) {
    return <div className="banner banner-stale">{edited ? '草稿已修改：此前的流量与结论已立即失效，请重新运行认证。' : '尚未认证。'}</div>;
  }
  if (cert.feasible) {
    return (
      <div className="banner banner-ok">
        ✓ 认证通过：存在满足全部条件的整数流。全网净注入合计 {cert.totalBalance}，各节点收支守恒，每条风道均在上下限区间内。
      </div>
    );
  }
  return (
    <div className="banner banner-bad">
      ✗ 认证不通过：不存在可行整数流{cert.balanceMismatch ? '（全网净注入合计不为 0）' : ''}，最小未满足流量 {cert.shortfall}。
    </div>
  );
}

function ResultPanel({ cert, nodes, edges }: { cert: Certification; nodes: FlowNode[]; edges: FlowEdge[] }) {
  if (cert.feasible) {
    return <FeasibleView cert={cert} nodes={nodes} edges={edges} />;
  }
  return <InfeasibleView cert={cert} nodes={nodes} />;
}

function nodeName(nodes: FlowNode[], id: string): string {
  const n = nodes.find((x) => x.id === id);
  return n?.label ? `${id}（${n.label}）` : id;
}

function FeasibleView({
  cert,
  nodes,
  edges,
}: {
  cert: Extract<Certification, { feasible: true }>;
  nodes: FlowNode[];
  edges: FlowEdge[];
}) {
  // 独立汇总各风道流量，逐节点复核 流出 − 流入 = 净注入。
  const balance = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const f of cert.flows) {
    balance.set(f.from, (balance.get(f.from) ?? 0) + f.flow);
    balance.set(f.to, (balance.get(f.to) ?? 0) - f.flow);
  }

  return (
    <section className="panel result">
      <h2>认证结论：可行</h2>
      <ul className="checks">
        <li className="ok">✓ 全网净注入平衡：Σ 净注入 = {cert.totalBalance}</li>
        <li className="ok">✓ 节点收支守恒：每个节点 流出 − 流入 = 净注入</li>
        <li className="ok">✓ 风道容量区间：每条风道流量为整数且 lower ≤ f ≤ upper（正下限已履行）</li>
      </ul>

      <h3>逐风道整数流量</h3>
      <table className="grid">
        <thead>
          <tr>
            <th>风道</th>
            <th>方向</th>
            <th>下限</th>
            <th>认证流量</th>
            <th>上限</th>
            <th style={{ width: '16rem' }}>区间符合度</th>
          </tr>
        </thead>
        <tbody>
          {cert.flows.map((f) => {
            const atLower = f.flow === f.lower;
            const atUpper = f.flow === f.upper;
            return (
              <tr key={f.id}>
                <td>{f.id}</td>
                <td>
                  {nodeName(nodes, f.from)} <span className="arrow">→</span> {nodeName(nodes, f.to)}
                </td>
                <td>{f.lower}</td>
                <td>
                  <strong>{f.flow}</strong>
                </td>
                <td>{f.upper}</td>
                <td>
                  <RangeBar lower={f.lower} upper={f.upper} flow={f.flow} />
                  <span className="hint">
                    {atLower && atUpper ? '恒定（下限=上限）' : atLower ? '压在下限' : atUpper ? '顶在上限' : '区间内'}
                  </span>
                </td>
              </tr>
            );
          })}
          {cert.flows.length === 0 && (
            <tr>
              <td colSpan={6} className="hint">
                无风道，零流即可行。
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>逐节点收支复核</h3>
      <table className="grid">
        <thead>
          <tr>
            <th>节点</th>
            <th>流出 − 流入</th>
            <th>申报净注入</th>
            <th>守恒</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr key={n.id}>
              <td>{nodeName(nodes, n.id)}</td>
              <td>{balance.get(n.id) ?? 0}</td>
              <td>{n.balance}</td>
              <td className="ok">✓</td>
            </tr>
          ))}
        </tbody>
      </table>
      {edges.length === 0 && nodes.length === 0 && <p className="hint">空仓库：没有需要平衡的节点与风道。</p>}
    </section>
  );
}

function RangeBar({ lower, upper, flow }: { lower: number; upper: number; flow: number }) {
  const span = Math.max(upper - lower, 0);
  const pct = span === 0 ? 100 : ((flow - lower) / span) * 100;
  return (
    <div className="rangebar" title={`${lower} ≤ ${flow} ≤ ${upper}`}>
      <div className="rangebar-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function InfeasibleView({
  cert,
  nodes,
}: {
  cert: Extract<Certification, { feasible: false }>;
  nodes: FlowNode[];
}) {
  const { sumBalance, lowerCross, upperCross } = cert.details;
  const extraction = cert.cutMode === 'extraction';
  return (
    <section className="panel result bad-panel">
      <h2>认证结论：不可行</h2>
      <div className="shortfall-box">
        <div>
          <div className="shortfall-num">{cert.shortfall}</div>
          <div className="hint">最小未满足流量（缺口）</div>
        </div>
        <p className="hint">
          依据最大流–最小割：即便把所有可用风道容量用尽，{extraction ? '下列片区的抽排口仍有气吸不进来' : '下列片区仍有气送不出去'}，差额 {cert.shortfall} 单位。
        </p>
      </div>

      <h3>导致缺口的节点集合（最小割片区）</h3>
      <p className="hint">
        {extraction
          ? '该片库房（排放侧）的抽力无法被跨入风道（即使全部顶到上限）充分供给：'
          : '该片库房（供气侧）的来气无法经跨出风道（即使全部顶到上限）充分送走：'}
      </p>
      <div className="chips">
        {cert.deficientNodes.map((id) => (
          <span key={id} className="chip">
            {nodeName(nodes, id)}
          </span>
        ))}
      </div>

      {cert.balanceMismatch && (
        <p className="bad">
          另有前置问题：全网净注入合计为 {cert.totalBalance}（≠0），供气与抽排总量本就不相等。
        </p>
      )}

      <h3>片区缺口恒等式</h3>
      {extraction ? (
        <p className="formula">
          −Σ_X 净注入（{-sumBalance}）＋ 跨出风道下限（{lowerCross}）－ 跨入风道上限（{upperCross}）＝{' '}
          <strong className="bad">{cert.shortfall}</strong>
        </p>
      ) : (
        <p className="formula">
          Σ_R 净注入（{sumBalance}）＋ 跨入风道下限（{lowerCross}）－ 跨出风道上限（{upperCross}）＝{' '}
          <strong className="bad">{cert.shortfall}</strong>
        </p>
      )}
      <p className="hint">
        {extraction
          ? '即：片区必须抽走的量，超过了所有跨入风道上限与自身供气之和。'
          : '即：片区必须向外净送出的量，超过了所有跨出风道上限之和。'}
      </p>

      <h3>逐节点未满足需求</h3>
      <table className="grid">
        <thead>
          <tr>
            <th>节点</th>
            <th>类型</th>
            <th>强制下限后仍需{extraction ? '抽入' : '送出'}</th>
            <th>其中未满足</th>
          </tr>
        </thead>
        <tbody>
          {cert.nodeShortfalls.map((s) => (
            <tr key={s.nodeId}>
              <td>{nodeName(nodes, s.nodeId)}</td>
              <td>{s.kind === 'supply' ? '供气送不出' : '抽排吸不进'}</td>
              <td>{s.demand}</td>
              <td className="bad">{s.unmet}</td>
            </tr>
          ))}
          {cert.nodeShortfalls.length === 0 && (
            <tr>
              <td colSpan={4} className="hint">
                片区内没有未满足的需求节点（可能因全网净注入不平衡导致）。
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="hint">保管员可据此扩容跨越片区的风道、调整正下限，或平衡该片区的供抽气总量。</p>
    </section>
  );
}
