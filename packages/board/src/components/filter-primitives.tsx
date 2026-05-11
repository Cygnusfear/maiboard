/**
 * Shared filter editing primitives — used by filter-bar (list view)
 * and column-editor (board view). ONE implementation, no copies.
 */
import { useState } from "react";
import { Checkbox } from "@base-ui/react/checkbox";
import {
  type FilterField,
  type FilterClause,
  FIELD_LABELS,
  FIELD_OPERATORS,
  OPERATOR_LABELS,
  DATE_PRESETS,
  uniqueFieldValues,
} from "@/lib/filter-engine";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/types";
import { useTicketStore } from "@/stores/ticket-store";
import { Check, X } from "@phosphor-icons/react";

// ── Helpers ───────────────────────────────────────────────────

/** Map ticket ID → title for parent filter display */
function getTicketTitle(ticketId: string): string {
  const tickets = useTicketStore.getState().tickets;
  const t = tickets.find((t) => t.id === ticketId);
  return t ? `${t.id} ${t.title}` : ticketId;
}

export function labelForOption(field: FilterField, val: string): string {
  if (field === "status") return STATUS_LABELS[val] ?? val;
  if (field === "priority") return PRIORITY_LABELS[Number(val)] ?? `P${val}`;
  if (field === "kind") return val.toUpperCase();
  if (field === "parent") return getTicketTitle(val);
  return val;
}

// ── Shared update type ────────────────────────────────────────

type FilterUpdate = Partial<Pick<FilterClause, "operator" | "value">>;

// ── Date fields need the day-picker for these operators ───────

const DAY_PICKER_OPS = new Set(["last_n_days", "older_than", "newer_than"]);

function isDateField(field: FilterField): boolean {
  return field === "created" || field === "modified";
}

// ── FilterEditor — operator selector + value editor ───────────

export function FilterEditor({
  clause,
  onUpdate,
}: {
  clause: FilterClause;
  onUpdate: (patch: FilterUpdate) => void;
}) {
  const tickets = useTicketStore((s) => s.tickets);
  const operators = FIELD_OPERATORS[clause.field];
  const options = uniqueFieldValues(tickets, clause.field);

  return (
    <div>
      {/* Operator selector */}
      <div className="mb-2 flex flex-wrap gap-1">
        {operators.map((op) => (
          <button
            key={op}
            onClick={() => onUpdate({ operator: op })}
            className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
              clause.operator === op
                ? "bg-blue-500/20 text-blue-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {OPERATOR_LABELS[op]}
          </button>
        ))}
      </div>

      {/* Value editor — depends on field type + operator */}
      {clause.operator === "is_empty" || clause.operator === "is_not_empty" ? null : isDateField(
          clause.field,
        ) ? (
        <DateValueEditor clause={clause} onUpdate={onUpdate} />
      ) : clause.field === "title" || clause.field === "target" ? (
        <TextValueEditor clause={clause} onUpdate={onUpdate} />
      ) : (
        <MultiSelectEditor clause={clause} options={options} onUpdate={onUpdate} />
      )}
    </div>
  );
}

// ── FilterRow — header with field name + remove + editor ──────

export function FilterRow({
  clause,
  onUpdate,
  onRemove,
}: {
  clause: FilterClause;
  onUpdate: (patch: FilterUpdate) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-400">{FIELD_LABELS[clause.field]}</span>
        <button onClick={onRemove} className="text-zinc-600 hover:text-zinc-300">
          <X size={10} />
        </button>
      </div>
      <FilterEditor clause={clause} onUpdate={onUpdate} />
    </div>
  );
}

// ── Multi-select (status, priority, type, tag, assignee) ──────

export function MultiSelectEditor({
  clause,
  options,
  onUpdate,
}: {
  clause: FilterClause;
  options: string[];
  onUpdate: (patch: FilterUpdate) => void;
}) {
  const selected = Array.isArray(clause.value) ? (clause.value as string[]).map(String) : [];
  const [search, setSearch] = useState("");

  const filtered = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (val: string) => {
    const next = selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val];
    onUpdate({ value: next });
  };

  return (
    <div>
      {options.length > 6 && (
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-blue-500"
        />
      )}
      <div className="max-h-[200px] overflow-auto">
        {filtered.map((opt) => {
          const checked = selected.includes(opt);
          return (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              <Checkbox.Root
                checked={checked}
                onCheckedChange={() => toggle(opt)}
                className="flex size-4 items-center justify-center rounded-sm border border-zinc-600 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 data-[checked]:border-blue-500 data-[checked]:bg-blue-500"
              >
                <Checkbox.Indicator className="flex text-white data-[unchecked]:hidden">
                  <Check size={10} weight="bold" />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <span>{labelForOption(clause.field, opt)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Date value editor ─────────────────────────────────────────

export function DateValueEditor({
  clause,
  onUpdate,
}: {
  clause: FilterClause;
  onUpdate: (patch: FilterUpdate) => void;
}) {
  if (DAY_PICKER_OPS.has(clause.operator)) {
    return (
      <div className="flex flex-col gap-1">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => onUpdate({ value: p.days })}
            className={`rounded px-2 py-1 text-left text-xs transition-colors ${
              clause.value === p.days
                ? "bg-blue-500/20 text-blue-400"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    );
  }

  if (clause.operator === "between") {
    const [start, end] = Array.isArray(clause.value)
      ? (clause.value as [string, string])
      : ["", ""];
    return (
      <div className="flex flex-col gap-2">
        <label className="text-[11px] text-zinc-500">From</label>
        <input
          type="date"
          value={start}
          onChange={(e) => onUpdate({ value: [e.target.value, end] })}
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
        />
        <label className="text-[11px] text-zinc-500">To</label>
        <input
          type="date"
          value={end}
          onChange={(e) => onUpdate({ value: [start, e.target.value] })}
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
        />
      </div>
    );
  }

  // before / after — single date
  return (
    <input
      type="date"
      value={typeof clause.value === "string" ? clause.value : ""}
      onChange={(e) => onUpdate({ value: e.target.value })}
      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
    />
  );
}

// ── Text value editor ─────────────────────────────────────────

export function TextValueEditor({
  clause,
  onUpdate,
}: {
  clause: FilterClause;
  onUpdate: (patch: FilterUpdate) => void;
}) {
  return (
    <input
      autoFocus
      value={typeof clause.value === "string" ? clause.value : ""}
      onChange={(e) => onUpdate({ value: e.target.value })}
      placeholder="Search text..."
      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-blue-500"
    />
  );
}

// ── Format value for display (filter chips) ───────────────────

export function formatFilterValue(clause: FilterClause): string {
  const { field, operator, value } = clause;

  if (operator === "is_empty") return "—";
  if (operator === "is_not_empty") return "✓";

  if (DAY_PICKER_OPS.has(operator) && typeof value === "number") {
    const preset = DATE_PRESETS.find((p) => p.days === value);
    return preset ? preset.label.toLowerCase() : `${value}d`;
  }

  if (operator === "between" && Array.isArray(value)) {
    const [s, e] = value as [string, string];
    return s && e ? `${s} – ${e}` : "...";
  }

  if (Array.isArray(value)) {
    const labels = (value as string[]).map((v) => labelForOption(field, v));
    if (labels.length === 0) return "...";
    if (labels.length <= 2) return labels.join(", ");
    return `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
  }

  if (typeof value === "string") {
    if (!value) return "...";
    return labelForOption(field, value);
  }

  return String(value);
}
