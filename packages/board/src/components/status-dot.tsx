import { STATUS_LABELS, STATUS_DOT_COLORS, STATUS_RING_COLORS } from "@/lib/types";

export function StatusDot({
  status,
  showLabel = false,
  interactive = false,
}: {
  status: string;
  showLabel?: boolean;
  interactive?: boolean;
}) {
  const dot = STATUS_DOT_COLORS[status] || "bg-zinc-600";
  const ring = STATUS_RING_COLORS[status] || "ring-zinc-600/30";

  return (
    <span className={`inline-flex items-center gap-1.5 ${interactive ? "group/status" : ""}`}>
      <span
        className={`inline-block size-2 rounded-full ${dot} ring-2 ring-transparent transition-all ${
          interactive
            ? `group-hover/status:ring-2 group-hover/status:${ring} group-hover/status:scale-125`
            : ""
        }`}
      />
      {showLabel && (
        <span className="text-[11px] text-zinc-500">{STATUS_LABELS[status] || status}</span>
      )}
    </span>
  );
}
