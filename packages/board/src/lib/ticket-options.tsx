import {
  Circle,
  CircleHalf,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  Warning,
  Bug,
  Lightning,
  ListChecks,
  Stack,
  Wrench,
  GitPullRequest,
  FileText,
  Note,
  Scales,
} from "@phosphor-icons/react";

// ── Status ────────────────────────────────────────────────────

export const statusOptions = [
  {
    value: "open",
    label: "Open",
    icon: <Circle size={14} weight="bold" className="text-emerald-400" />,
  },
  {
    value: "in_progress",
    label: "In Progress",
    icon: <CircleHalf size={14} weight="bold" className="text-amber-400" />,
  },
  {
    value: "closed",
    label: "Closed",
    icon: <CheckCircle size={14} weight="bold" className="text-zinc-400" />,
  },
] as const;

// ── Priority ──────────────────────────────────────────────────

export const priorityOptions = [
  { value: 0, label: "Urgent", icon: <Warning size={14} weight="fill" className="text-red-400" /> },
  {
    value: 1,
    label: "High",
    icon: <ArrowUp size={14} weight="bold" className="text-orange-400" />,
  },
  { value: 2, label: "Medium", icon: <Minus size={14} className="text-zinc-400" /> },
  { value: 3, label: "Low", icon: <ArrowDown size={14} weight="bold" className="text-blue-400" /> },
] as const;

// ── Type ──────────────────────────────────────────────────────

export const typeOptions = [
  { value: "task", label: "Task", icon: <ListChecks size={14} className="text-zinc-400" /> },
  { value: "bug", label: "Bug", icon: <Bug size={14} className="text-red-400" /> },
  { value: "feature", label: "Feature", icon: <Lightning size={14} className="text-amber-400" /> },
  { value: "epic", label: "Epic", icon: <Stack size={14} className="text-violet-400" /> },
  { value: "chore", label: "Chore", icon: <Wrench size={14} className="text-zinc-500" /> },
] as const;

// ── Kind ──────────────────────────────────────────────────────

export const kindOptions = [
  { value: "ticket", label: "Ticket", icon: <ListChecks size={14} className="text-zinc-400" /> },
  { value: "review", label: "Review", icon: <CheckCircle size={14} className="text-blue-400" /> },
  { value: "pr", label: "PR", icon: <GitPullRequest size={14} className="text-violet-400" /> },
  { value: "decision", label: "Decision", icon: <Scales size={14} className="text-amber-400" /> },
  { value: "warning", label: "Warning", icon: <Warning size={14} className="text-red-400" /> },
  { value: "doc", label: "Doc", icon: <FileText size={14} className="text-zinc-400" /> },
  { value: "note", label: "Note", icon: <Note size={14} className="text-zinc-500" /> },
] as const;
