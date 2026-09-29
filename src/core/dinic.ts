/**
 * Dinic 最大流（整数容量）。
 * 邻接表残量网络：addEdge 添加正向边与容量为 0 的反向边，
 * 调用方通过返回的边下标读取残量、推算实际流量。
 */
export interface DinicEdge {
  to: number;
  rev: number;
  cap: number;
}

export class Dinic {
  readonly n: number;
  readonly g: DinicEdge[][];
  private readonly level: Int32Array;
  private readonly ptr: Int32Array;

  constructor(n: number) {
    this.n = n;
    this.g = Array.from({ length: n }, () => []);
    this.level = new Int32Array(n).fill(-1);
    this.ptr = new Int32Array(n);
  }

  /** 添加有向边 from->to（容量 cap），返回正向边在 g[from] 中的下标。 */
  addEdge(from: number, to: number, cap: number): number {
    const i = this.g[from].length;
    const j = this.g[to].length;
    this.g[from].push({ to, rev: j, cap });
    this.g[to].push({ to: from, rev: i, cap: 0 });
    return i;
  }

  private bfs(s: number, t: number): boolean {
    this.level.fill(-1);
    this.level[s] = 0;
    const queue = [s];
    let head = 0;
    while (head < queue.length) {
      const v = queue[head++];
      for (const e of this.g[v]) {
        if (e.cap > 0 && this.level[e.to] < 0) {
          this.level[e.to] = this.level[v] + 1;
          queue.push(e.to);
        }
      }
    }
    return this.level[t] >= 0;
  }

  private dfs(v: number, t: number, pushed: number): number {
    if (v === t || pushed === 0) return pushed;
    for (let i = this.ptr[v]; i < this.g[v].length; i++) {
      this.ptr[v] = i;
      const e = this.g[v][i];
      if (e.cap <= 0 || this.level[e.to] !== this.level[v] + 1) continue;
      const tr = this.dfs(e.to, t, Math.min(pushed, e.cap));
      if (tr > 0) {
        e.cap -= tr;
        this.g[e.to][e.rev].cap += tr;
        return tr;
      }
    }
    return 0;
  }

  maxFlow(s: number, t: number): number {
    let flow = 0;
    const INF = Number.MAX_SAFE_INTEGER;
    while (this.bfs(s, t)) {
      this.ptr.fill(0);
      while (true) {
        const pushed = this.dfs(s, t, INF);
        if (pushed === 0) break;
        flow += pushed;
      }
    }
    return flow;
  }

  /** 最大流结束后，从 s 沿残量（cap>0）可达的顶点集合（最小割的源侧 R）。 */
  reachable(s: number): boolean[] {
    const seen = new Array<boolean>(this.n).fill(false);
    seen[s] = true;
    const queue = [s];
    let head = 0;
    while (head < queue.length) {
      const v = queue[head++];
      for (const e of this.g[v]) {
        if (e.cap > 0 && !seen[e.to]) {
          seen[e.to] = true;
          queue.push(e.to);
        }
      }
    }
    return seen;
  }
}
