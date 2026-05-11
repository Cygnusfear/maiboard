import { Warning, ArrowUp, Minus, ArrowDown } from "@phosphor-icons/react";

const PRIORITY_CONFIG: Record<number, { icon: typeof Warning; color: string; label: string }> = {
  0: { icon: Warning, color: "text-red-500", label: "Urgent" },
  1: { icon: ArrowUp, color: "text-orange-500", label: "High" },
  2: { icon: Minus, color: "text-blue-500", label: "Medium" },
  3: { icon: ArrowDown, color: "text-zinc-500", label: "Low" },
};

export function PriorityIcon({
  priority,
  showLabel = false,
}: {
  priority: number;
  showLabel?: boolean;
}) {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG[2];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 ${config.color}`}>
      <Icon size={14} weight="bold" />
      {showLabel && <span className="text-xs">{config.label}</span>}
    </span>
  );
}
