import type { ProgressState } from "../types";

export interface DagNode {
  id: string;
  phaseNumber: number | string;
  title: string;
  status: "pending" | "completed" | "in_progress" | "failed";
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  started?: string;
  completed?: string;
}

export interface DagEdge {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DagLayout {
  nodes: DagNode[];
  edges: DagEdge[];
  width: number;
  height: number;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;
const H_GAP = 40;
const V_GAP = 60;
const MAX_PHASES = 20;

export function layoutDag(progress: ProgressState): DagLayout {
  const phases = progress.phases.slice(0, MAX_PHASES);
  if (phases.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  // Build id lookup and adjacency
  const idByPhase = new Map<string, number>();
  for (let i = 0; i < phases.length; i++) {
    idByPhase.set(String(phases[i].number), i);
  }

  // Check if any phase has dependency data
  const hasDeps = phases.some(
    (p) => p.dependencies && p.dependencies.length > 0
  );

  // Build dependency edges: depIdx -> idx (dep must complete before idx)
  const inDegree = new Array(phases.length).fill(0);
  const adjForward: number[][] = phases.map(() => []);
  const adjReverse: number[][] = phases.map(() => []);

  if (hasDeps) {
    for (let i = 0; i < phases.length; i++) {
      const deps = phases[i].dependencies;
      if (!deps) continue;
      for (const dep of deps) {
        const depIdx = idByPhase.get(String(dep.phaseNumber));
        if (depIdx !== undefined && depIdx !== i) {
          adjForward[depIdx].push(i);
          adjReverse[i].push(depIdx);
          inDegree[i]++;
        }
      }
    }
  }

  // Assign layers via topological sort (Kahn's algorithm) or linear fallback
  const layers = new Array(phases.length).fill(0);

  if (hasDeps) {
    const queue: number[] = [];
    const tempInDeg = [...inDegree];
    for (let i = 0; i < phases.length; i++) {
      if (tempInDeg[i] === 0) queue.push(i);
    }

    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const next of adjForward[node]) {
        layers[next] = Math.max(layers[next], layers[node] + 1);
        tempInDeg[next]--;
        if (tempInDeg[next] === 0) queue.push(next);
      }
    }
  } else {
    // Linear fallback: each phase on its own layer
    for (let i = 0; i < phases.length; i++) {
      layers[i] = i;
    }
  }

  // Group nodes by layer
  const maxLayer = Math.max(...layers);
  const layerGroups: number[][] = Array.from(
    { length: maxLayer + 1 },
    () => []
  );
  for (let i = 0; i < phases.length; i++) {
    layerGroups[layers[i]].push(i);
  }

  // Position nodes: center each layer horizontally
  const maxNodesInLayer = Math.max(...layerGroups.map((g) => g.length));
  const totalWidth = maxNodesInLayer * NODE_WIDTH + (maxNodesInLayer - 1) * H_GAP;
  const totalHeight =
    (maxLayer + 1) * NODE_HEIGHT + maxLayer * V_GAP;

  const nodes: DagNode[] = [];
  for (let layer = 0; layer <= maxLayer; layer++) {
    const group = layerGroups[layer];
    const layerWidth = group.length * NODE_WIDTH + (group.length - 1) * H_GAP;
    const offsetX = (totalWidth - layerWidth) / 2;
    const y = layer * (NODE_HEIGHT + V_GAP);

    for (let j = 0; j < group.length; j++) {
      const idx = group[j];
      const phase = phases[idx];
      const x = offsetX + j * (NODE_WIDTH + H_GAP);
      nodes.push({
        id: `phase-${phase.number}`,
        phaseNumber: phase.number,
        title: phase.title,
        status: phase.status,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        layer,
        started: phase.started,
        completed: phase.completed,
      });
    }
  }

  // Build edges
  const nodeById = new Map<string, DagNode>();
  for (const node of nodes) nodeById.set(node.id, node);

  const edges: DagEdge[] = [];
  if (hasDeps) {
    for (let i = 0; i < phases.length; i++) {
      for (const depIdx of adjReverse[i]) {
        const fromNode = nodeById.get(`phase-${phases[depIdx].number}`)!;
        const toNode = nodeById.get(`phase-${phases[i].number}`)!;
        edges.push({
          from: fromNode.id,
          to: toNode.id,
          x1: fromNode.x + NODE_WIDTH / 2,
          y1: fromNode.y + NODE_HEIGHT,
          x2: toNode.x + NODE_WIDTH / 2,
          y2: toNode.y,
        });
      }
    }
  } else {
    // Linear chain edges
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        from: nodes[i].id,
        to: nodes[i + 1].id,
        x1: nodes[i].x + NODE_WIDTH / 2,
        y1: nodes[i].y + NODE_HEIGHT,
        x2: nodes[i + 1].x + NODE_WIDTH / 2,
        y2: nodes[i + 1].y,
      });
    }
  }

  return { nodes, edges, width: totalWidth, height: totalHeight };
}
