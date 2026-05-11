import dagre from "@dagrejs/dagre";
import type { TicketSummary } from "@/lib/types";
import { buildEpicLookup } from "@/lib/group-engine";

// ── Layout types ──────────────────────────────────────────────

export interface LayoutNode {
  ticket: TicketSummary;
  x: number;
  y: number;
  width: number;
  height: number;
  /** True only when this is an epic that became a compound container, i.e.
   *  its width/height are the dagre-computed bbox enclosing its children.
   *  False for epics that were demoted to flat layout because they have
   *  edges to/from non-children (dagre's compound mode crashes on those). */
  isEpicContainer: boolean;
  /** Count of visible non-epic descendants (transitive). 0 for non-epics. */
  childCount: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  type: "dep" | "link";
  points: { x: number; y: number }[];
}

export interface GraphLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export const NODE_WIDTH = 340;
export const NODE_HEIGHT = 56;
export const EPIC_HEADER_HEIGHT = 32;
export const PADDING = 60;

// ── Pure layout computation ───────────────────────────────────

interface Plan {
  parentEpicOf: Map<string, string>;
  isContainer: Map<string, boolean>;
  childrenByEpic: Map<string, number>;
}

/** First pass: decide which epics get to be containers.
 *  Dagre's compound layout crashes on any edge whose endpoint is a compound
 *  parent and the other endpoint is not its child. So an epic can only be a
 *  container if every visible edge it participates in is a child→parent edge
 *  (which we then drop, because the containment already encodes it). Any
 *  cross-epic dep/link, or outside→epic edge, demotes the epic to flat. */
function plan(tickets: TicketSummary[]): Plan {
  const idSet = new Set(tickets.map((t) => t.id));
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const lookup = buildEpicLookup(tickets);

  const parentEpicOf = new Map<string, string>();
  for (const t of tickets) {
    if (t.type === "epic") continue;
    const parent = lookup.nearestEpicOf(t.id);
    if (parent && idSet.has(parent.id)) parentEpicOf.set(t.id, parent.id);
  }

  const childrenByEpic = new Map<string, number>();
  for (const [, epicId] of parentEpicOf) {
    childrenByEpic.set(epicId, (childrenByEpic.get(epicId) ?? 0) + 1);
  }

  // Any epic touched by a non-child edge cannot be a container.
  const demoted = new Set<string>();
  for (const t of tickets) {
    const srcIsEpic = t.type === "epic";
    for (const target of [...(t.deps ?? []), ...(t.links ?? [])]) {
      if (!idSet.has(target) || target === t.id) continue;
      const dstIsEpic = byId.get(target)?.type === "epic";
      if (srcIsEpic && parentEpicOf.get(target) !== t.id) demoted.add(t.id);
      if (dstIsEpic && parentEpicOf.get(t.id) !== target) demoted.add(target);
    }
  }

  const isContainer = new Map<string, boolean>();
  for (const t of tickets) {
    if (t.type !== "epic") continue;
    const hasChildren = (childrenByEpic.get(t.id) ?? 0) > 0;
    isContainer.set(t.id, hasChildren && !demoted.has(t.id));
  }

  return { parentEpicOf, isContainer, childrenByEpic };
}

/** Build a dagre graph for the given plan. `useCompound` controls whether
 *  setParent is called — useful so we can retry without containment if the
 *  compound layout still throws despite the demotion pass. */
function buildGraph(
  tickets: TicketSummary[],
  p: Plan,
  useCompound: boolean,
): { g: dagre.graphlib.Graph; edges: { from: string; to: string; type: "dep" | "link" }[] } {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({
    rankdir: "LR",
    nodesep: 24,
    ranksep: 80,
    marginx: PADDING,
    marginy: PADDING,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const idSet = new Set(tickets.map((t) => t.id));

  for (const t of tickets) {
    const containerHere = useCompound && (p.isContainer.get(t.id) ?? false);
    g.setNode(t.id, {
      width: NODE_WIDTH,
      height: containerHere ? EPIC_HEADER_HEIGHT : NODE_HEIGHT,
    });
  }

  if (useCompound) {
    for (const [childId, epicId] of p.parentEpicOf) {
      if (p.isContainer.get(epicId)) g.setParent(childId, epicId);
    }
  }

  const edges: { from: string; to: string; type: "dep" | "link" }[] = [];
  const seenLink = new Set<string>();
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const t of tickets) {
    for (const dep of t.deps ?? []) {
      if (!idSet.has(dep) || dep === t.id) continue;
      // Suppress child→parent-epic edges only when the parent IS a container;
      // demoted epics keep their edges so the relationship stays visible.
      if (useCompound && p.parentEpicOf.get(t.id) === dep && p.isContainer.get(dep)) continue;
      g.setEdge(t.id, dep);
      edges.push({ from: t.id, to: dep, type: "dep" });
    }
    for (const link of t.links ?? []) {
      if (!idSet.has(link) || link === t.id) continue;
      if (useCompound) {
        const linkIsParent = p.parentEpicOf.get(t.id) === link && p.isContainer.get(link);
        const tIsParent = p.parentEpicOf.get(link) === t.id && p.isContainer.get(t.id);
        if (linkIsParent || tIsParent) continue;
      }
      const k = edgeKey(t.id, link);
      if (seenLink.has(k)) continue;
      seenLink.add(k);
      g.setEdge(t.id, link);
      edges.push({ from: t.id, to: link, type: "link" });
    }
  }

  return { g, edges };
}

export function computeLayout(tickets: TicketSummary[]): GraphLayout {
  const p = plan(tickets);

  // Try compound. If anything still throws (shouldn't, given the demotion
  // pass, but dagre's compound mode has historical surprises), fall back to
  // flat layout so the graph never goes blank.
  let usedCompound = true;
  let g: dagre.graphlib.Graph;
  let edges: { from: string; to: string; type: "dep" | "link" }[];
  try {
    const built = buildGraph(tickets, p, true);
    dagre.layout(built.g);
    g = built.g;
    edges = built.edges;
  } catch (err) {
    console.error("graph-layout: compound dagre layout threw, falling back to flat", err);
    usedCompound = false;
    const built = buildGraph(tickets, p, false);
    try {
      dagre.layout(built.g);
    } catch (err2) {
      console.error("graph-layout: flat dagre layout also threw — returning empty layout", err2);
      return { nodes: [], edges: [], width: 0, height: 0 };
    }
    g = built.g;
    edges = built.edges;
  }

  const graphLabel = g.graph();
  const nodes: LayoutNode[] = tickets.map((t) => {
    const n = g.node(t.id);
    const childCount = t.type === "epic" ? (p.childrenByEpic.get(t.id) ?? 0) : 0;
    return {
      ticket: t,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      isEpicContainer: usedCompound && t.type === "epic" && (p.isContainer.get(t.id) ?? false),
      childCount,
    };
  });

  const layoutEdges: LayoutEdge[] = edges.map((e) => {
    const dagreEdge = g.edge(e.from, e.to);
    return {
      from: e.from,
      to: e.to,
      type: e.type,
      points: dagreEdge?.points ?? [],
    };
  });

  // dagre returns -Infinity for empty graphs — clamp to a sane default so
  // the consumer's fit-to-viewport math doesn't produce NaN.
  const width = Number.isFinite(graphLabel?.width) ? graphLabel.width + PADDING * 2 : PADDING * 2;
  const height = Number.isFinite(graphLabel?.height)
    ? graphLabel.height + PADDING * 2
    : PADDING * 2;

  return { nodes, edges: layoutEdges, width, height };
}
