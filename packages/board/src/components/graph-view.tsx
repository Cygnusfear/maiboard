import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { useFilteredTickets } from "@/hooks/use-filtered-tickets";
import { useProjectStore } from "@/stores/project-store";
import { useNavigate } from "@/hooks/use-navigate";
import { StatusDot } from "./status-dot";
import { PriorityIcon } from "./priority-icon";
import { Stack } from "@phosphor-icons/react";
import { STATUS_LABELS, STATUS_HEX_COLORS, type TicketSummary } from "@/lib/types";
import { buildEpicLookup } from "@/lib/group-engine";
import { computeLayout, type LayoutNode, EPIC_HEADER_HEIGHT } from "@/lib/graph-layout";

// ── Epic palette — matches the violet pill in ticket-detail ───

const EPIC_BORDER = "#a78bfa"; // violet-400
const EPIC_BORDER_DIM = "rgba(167, 139, 250, 0.55)";
const EPIC_FILL = "#1a1325"; // very dark violet
const EPIC_HEADER_BG = "rgba(139, 92, 246, 0.18)"; // violet-500/18
const EPIC_TEXT = "#ddd6fe"; // violet-200
const EPIC_TEXT_DIM = "#c4b5fd"; // violet-300

// ── Edge path ─────────────────────────────────────────────────

function edgePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  const [start, ...rest] = points;
  let d = `M ${start.x} ${start.y}`;
  for (const p of rest) d += ` L ${p.x} ${p.y}`;
  return d;
}

// ── Tooltip ───────────────────────────────────────────────────

interface TooltipProps {
  ticket: TicketSummary;
  parentEpic: TicketSummary | null;
  childCount: number;
  x: number;
  y: number;
}

function Tooltip({ ticket, parentEpic, childCount, x, y }: TooltipProps) {
  return (
    <div
      className="pointer-events-none absolute z-50 w-[320px] rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl shadow-zinc-950/80"
      style={{ left: x + 12, top: y - 8 }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-mono text-[10px] text-zinc-500">{ticket.id}</span>
        <StatusDot status={ticket.status} showLabel />
        <PriorityIcon priority={ticket.priority} showLabel />
        {ticket.type === "epic" && (
          <span
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
            style={{ background: EPIC_HEADER_BG, color: EPIC_TEXT_DIM }}
          >
            <Stack size={10} weight="duotone" />
            Epic
            {childCount > 0 && <span>· {childCount}</span>}
          </span>
        )}
      </div>
      <div className="mb-1.5 text-sm leading-snug text-zinc-200">{ticket.title}</div>
      {parentEpic && (
        <div className="mb-1.5 flex items-center gap-1 text-[10px] text-violet-300">
          <Stack size={10} weight="duotone" />
          <span>
            Parent epic: {parentEpic.id} {parentEpic.title}
          </span>
        </div>
      )}
      {ticket.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ticket.tags.map((tag) => (
            <span key={tag} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {tag}
            </span>
          ))}
        </div>
      )}
      {(ticket.deps?.length > 0 || ticket.links?.length > 0) && (
        <div className="mt-1.5 text-[10px] text-zinc-500">
          {ticket.deps?.length > 0 && <div>Deps: {ticket.deps.join(", ")}</div>}
          {ticket.links?.length > 0 && <div>Links: {ticket.links.join(", ")}</div>}
        </div>
      )}
    </div>
  );
}

// ── Graph View ────────────────────────────────────────────────

export function GraphView() {
  const tickets = useFilteredTickets();
  const { activeProjectId } = useProjectStore();
  const [, navigate] = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{
    ticket: TicketSummary;
    parentEpic: TicketSummary | null;
    childCount: number;
    mx: number;
    my: number;
  } | null>(null);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  const layout = useMemo(() => computeLayout(tickets), [tickets]);

  // Epic lookup is also used at render time for tooltip enrichment so each
  // non-epic node knows its parent epic without re-walking the graph.
  const epicLookup = useMemo(() => buildEpicLookup(tickets), [tickets]);

  // Pre-split the node list once so the SVG render is just two map() calls.
  const { containerNodes, leafNodes } = useMemo(() => {
    const containers: LayoutNode[] = [];
    const leaves: LayoutNode[] = [];
    for (const node of layout.nodes) {
      if (node.isEpicContainer) containers.push(node);
      else leaves.push(node);
    }
    return { containerNodes: containers, leafNodes: leaves };
  }, [layout]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || layout.nodes.length === 0) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const sx = vw / layout.width;
    const sy = vh / layout.height;
    const s = Math.min(sx, sy, 1.2) * 0.9;
    setTransform({
      x: (vw - layout.width * s) / 2,
      y: (vh - layout.height * s) / 2,
      scale: s,
    });
  }, [layout]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setTransform((t) => {
      const newScale = Math.min(Math.max(t.scale + delta * t.scale, 0.15), 3);
      const rect = containerRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ratio = newScale / t.scale;
      return {
        x: mx - ratio * (mx - t.x),
        y: my - ratio * (my - t.y),
        scale: newScale,
      };
    });
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("[data-graph-node]")) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [transform],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    setTransform((t) => ({
      ...t,
      x: e.clientX - panStart.current.x,
      y: e.clientY - panStart.current.y,
    }));
  }, []);

  const handlePointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const handleNodeClick = useCallback(
    (ticketId: string) => {
      if (activeProjectId) navigate(`/${activeProjectId}/ticket/${ticketId}`);
    },
    [activeProjectId, navigate],
  );

  const onHover = useCallback(
    (node: LayoutNode, mx: number, my: number) => {
      setHovered({
        ticket: node.ticket,
        parentEpic: epicLookup.nearestEpicOf(node.ticket.id),
        childCount: node.childCount,
        mx,
        my,
      });
    },
    [epicLookup],
  );

  if (tickets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-zinc-500">No tickets match current filters</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 select-none overflow-hidden bg-zinc-950"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: isPanning.current ? "grabbing" : "grab" }}
    >
      <svg width="100%" height="100%" className="absolute inset-0">
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {/* Layer 1 — epic containers. Drawn first so child nodes render on top. */}
          {containerNodes.map((node) => {
            const { ticket, x, y, width, height, childCount } = node;
            const nx = x - width / 2;
            const ny = y - height / 2;
            return (
              <g
                key={`container-${ticket.id}`}
                data-graph-node
                onClick={() => handleNodeClick(ticket.id)}
                onPointerEnter={(e) => onHover(node, e.clientX, e.clientY)}
                onPointerLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={nx}
                  y={ny}
                  width={width}
                  height={height}
                  rx={12}
                  ry={12}
                  fill={EPIC_FILL}
                  stroke={EPIC_BORDER_DIM}
                  strokeWidth={2}
                />
                {/* Header strip overlaying the top of the container */}
                <rect
                  x={nx}
                  y={ny}
                  width={width}
                  height={EPIC_HEADER_HEIGHT}
                  rx={12}
                  ry={12}
                  fill={EPIC_HEADER_BG}
                />
                <foreignObject x={nx} y={ny} width={width} height={EPIC_HEADER_HEIGHT}>
                  <div
                    style={{
                      height: EPIC_HEADER_HEIGHT,
                      padding: "0 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      boxSizing: "border-box",
                    }}
                  >
                    <Stack
                      size={14}
                      weight="duotone"
                      color={EPIC_TEXT_DIM}
                      style={{ flexShrink: 0 }}
                    />
                    <span
                      style={{
                        fontFamily: "'Geist Mono', monospace",
                        fontSize: 11,
                        color: EPIC_TEXT_DIM,
                        flexShrink: 0,
                      }}
                    >
                      {ticket.id}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Geist', sans-serif",
                        fontSize: 12,
                        color: EPIC_TEXT,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {ticket.title}
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        color: EPIC_TEXT_DIM,
                        background: "rgba(167, 139, 250, 0.15)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontFamily: "'Geist Mono', monospace",
                      }}
                    >
                      {childCount}
                    </span>
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {/* Layer 2 — edges. */}
          {layout.edges.map((edge, i) => (
            <g key={`${edge.from}-${edge.to}-${i}`}>
              <path
                d={edgePath(edge.points)}
                fill="none"
                stroke={edge.type === "dep" ? "#3f3f46" : "#27272a"}
                strokeWidth={1.5}
                strokeDasharray={edge.type === "link" ? "6 4" : undefined}
              />
              {edge.points.length >= 2 &&
                (() => {
                  const last = edge.points[edge.points.length - 1]!;
                  const prev = edge.points[edge.points.length - 2]!;
                  const angle = Math.atan2(last.y - prev.y, last.x - prev.x) * (180 / Math.PI);
                  return (
                    <polygon
                      points="0,-4 10,0 0,4"
                      fill={edge.type === "dep" ? "#52525b" : "#3f3f46"}
                      transform={`translate(${last.x},${last.y}) rotate(${angle})`}
                    />
                  );
                })()}
            </g>
          ))}

          {/* Layer 3 — leaf nodes (children inside containers + standalone tickets + childless epics). */}
          {leafNodes.map((node) => {
            const { ticket, x, y, width, height } = node;
            const isEpic = ticket.type === "epic";
            const isBoardReview = ticket.tags?.includes("board-review");
            const borderColor = isEpic
              ? EPIC_BORDER
              : (STATUS_HEX_COLORS[ticket.status] ?? "#71717a");
            const nodeFill = isEpic ? EPIC_FILL : isBoardReview ? "#241f0a" : "#18181b";
            const nx = x - width / 2;
            const ny = y - height / 2;
            return (
              <g
                key={ticket.id}
                data-graph-node
                onClick={() => handleNodeClick(ticket.id)}
                onPointerEnter={(e) => onHover(node, e.clientX, e.clientY)}
                onPointerLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={nx}
                  y={ny}
                  width={width}
                  height={height}
                  rx={6}
                  ry={6}
                  fill={nodeFill}
                  stroke={borderColor}
                  strokeWidth={isEpic ? 2 : 1.5}
                />
                <foreignObject x={nx} y={ny} width={width} height={height}>
                  <div
                    style={{
                      width,
                      height,
                      padding: "6px 10px",
                      overflow: "hidden",
                      display: "flex",
                      gap: 6,
                      alignItems: "flex-start",
                      boxSizing: "border-box",
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        paddingTop: 1,
                      }}
                    >
                      {isEpic && <Stack size={13} weight="duotone" color={EPIC_TEXT_DIM} />}
                      <StatusDot status={ticket.status} />
                      <PriorityIcon priority={ticket.priority} />
                    </span>
                    <span
                      style={{
                        fontFamily: "'Geist Mono', monospace",
                        fontSize: 11,
                        color: isEpic ? EPIC_TEXT_DIM : "#a1a1aa",
                        flexShrink: 0,
                        lineHeight: "18px",
                      }}
                    >
                      {ticket.id}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Geist', sans-serif",
                        fontSize: 12,
                        color: isEpic ? EPIC_TEXT : "#d4d4d8",
                        lineHeight: "18px",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {ticket.title}
                    </span>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </g>
      </svg>

      {hovered && (
        <Tooltip
          ticket={hovered.ticket}
          parentEpic={hovered.parentEpic}
          childCount={hovered.childCount}
          x={hovered.mx}
          y={hovered.my}
        />
      )}

      {/* Legend */}
      <div className="absolute right-4 bottom-4 flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-2.5 text-[10px] text-zinc-500 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {Object.entries(STATUS_LABELS).map(([status, label]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: STATUS_HEX_COLORS[status] }}
              />
              {label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5"
            title="An epic ticket — either a container (if it has children) or a standalone violet-bordered node."
          >
            <Stack size={11} weight="duotone" style={{ color: EPIC_TEXT_DIM }} />
            <span>Epic</span>
            <span
              className="rounded px-1 font-mono text-[9px]"
              style={{ background: "rgba(167, 139, 250, 0.15)", color: EPIC_TEXT_DIM }}
            >
              n
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="20" height="2">
              <line x1="0" y1="1" x2="20" y2="1" stroke="#3f3f46" strokeWidth="1.5" />
            </svg>
            depends on
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="20" height="2">
              <line
                x1="0"
                y1="1"
                x2="20"
                y2="1"
                stroke="#27272a"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            </svg>
            linked
          </span>
        </div>
      </div>
    </div>
  );
}
