import { useMemo, type KeyboardEvent } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { useAllTags } from "@/hooks/use-all-tags";
import { Menu } from "@base-ui/react/menu";
import {
  Copy,
  ArrowSquareOut,
  CaretRight,
  Minus,
  FunnelSimple,
  CircleDashed,
  ChartBar,
  ListChecks,
  Tag,
  DotsThree,
  CheckCircle,
  Stack,
} from "@phosphor-icons/react";
import type { TicketSummary } from "@/lib/types";
import { kindOptions, statusOptions, priorityOptions, typeOptions } from "@/lib/ticket-options";
import { useTicketStore } from "@/stores/ticket-store";
import { useProjectStore } from "@/stores/project-store";
import { useFilterStore } from "@/stores/filter-store";
import { useNavigate } from "@/hooks/use-navigate";
import { useOpenTicket } from "@/hooks/use-open-ticket";
import { toggleTagForTickets } from "@/lib/tag-mutations";

// ── Single-key shortcut handler ──────────────────────────────
// Items with data-shortcut="x" fire on bare 'x' keypress (no Enter needed).
// Always stops propagation so Enter etc. don't reach the element behind the menu.
const FORWARD_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "Tab",
  "Escape",
]);
function menuPopupKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  // Block any keystroke from reaching the element under the menu.
  e.stopPropagation();
  if (FORWARD_KEYS.has(e.key)) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  const target = e.currentTarget.querySelector<HTMLElement>(`[data-shortcut="${CSS.escape(k)}"]`);
  if (target) {
    e.preventDefault();
    target.click();
  }
}

// ── Shared styles ─────────────────────────────────────────────

export const menuItemCls =
  "flex cursor-default items-center gap-2.5 py-1.5 pr-3 pl-3 text-[13px] leading-4 text-zinc-300 outline-none select-none " +
  "data-[highlighted]:bg-zinc-800 data-[highlighted]:text-zinc-100";

export const submenuTriggerCls = `${menuItemCls} justify-between`;

export const menuSeparatorCls = "mx-2 my-1 h-px bg-zinc-800";

export const menuPopupCls =
  "min-w-[180px] rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl shadow-zinc-950/80 outline-none " +
  "origin-[var(--transform-origin)] transition-opacity data-[ending-style]:opacity-0";

export const kbdCls = "ml-auto pl-4 font-mono text-[11px] text-zinc-600";

// ── Hook: all menu mutations, self-contained ──────────────────
// No callbacks needed — the menu owns its own store connections.

function useMenuActions() {
  const pid = useProjectStore((s) => s.activeProjectId);
  const { updateField } = useTicketStore();

  return useMemo(
    () => ({
      setStatus(ids: string[], status: TicketSummary["status"]) {
        if (!pid) return;
        for (const id of ids) updateField(pid, id, { status });
      },
      setPriority(ids: string[], priority: number) {
        if (!pid) return;
        for (const id of ids) updateField(pid, id, { priority });
      },
      setType(ids: string[], type: string) {
        if (!pid) return;
        for (const id of ids) updateField(pid, id, { type });
      },
      toggleTag(ids: string[], tag: string) {
        if (!pid) return;
        const allTickets = useTicketStore.getState().tickets; // snapshot, no subscription
        const updates = toggleTagForTickets(allTickets, ids, tag);
        for (const [id, tags] of updates) updateField(pid, id, { tags });
      },
      copyIds(ids: string[]) {
        navigator.clipboard.writeText(ids.join(", "));
      },
    }),
    [pid, updateField],
  );
}

// ── Menu items (shared between ContextMenu and dot Menu) ──────

function MenuContent({
  tickets,
  NS,
  hideOpen,
}: {
  tickets: TicketSummary[];
  NS: typeof ContextMenu | typeof Menu;
  hideOpen?: boolean;
}) {
  const ids = tickets.map((t) => t.id);
  const count = tickets.length;
  const single = count === 1 ? tickets[0] : null;
  const currentStatus = single?.status;
  const currentPriority = single?.priority;
  const currentType = single?.type;
  const targetKinds = tickets.map((t) => t.kind || "ticket");
  const currentKind = single?.kind || "ticket";
  const allSameKind = targetKinds.every((kind) => kind === targetKinds[0]);
  const canEditType = targetKinds.every((kind) => kind === "ticket");

  const actions = useMenuActions();
  const pid = useProjectStore((s) => s.activeProjectId);
  const [, navigate] = useNavigate();
  const openTicket = useOpenTicket();

  // All known tags for the Tags submenu
  const allTags = useAllTags();

  // Tag check state for target tickets
  const targetTagSets = useMemo(() => tickets.map((t) => new Set(t.tags ?? [])), [tickets]);
  const allHaveTag = (tag: string) => targetTagSets.every((s) => s.has(tag));
  const someHaveTag = (tag: string) => !allHaveTag(tag) && targetTagSets.some((s) => s.has(tag));

  function handleOpen(ticketId: string) {
    if (pid) navigate(`/${pid}/ticket/${ticketId}`);
  }

  function handleOpenInNewTab(ticketId: string) {
    openTicket(ticketId, { newTab: true });
  }

  return (
    <>
      {/* Open ticket (single only, hideable) */}
      {single && !hideOpen && (
        <>
          <NS.Item
            data-shortcut="enter"
            className={menuItemCls}
            onClick={() => handleOpen(single.id)}
          >
            <ArrowSquareOut size={14} className="text-zinc-500" />
            Open ticket
            <span className={kbdCls}>Enter</span>
          </NS.Item>
          <NS.Item
            data-shortcut="t"
            className={menuItemCls}
            onClick={() => handleOpenInNewTab(single.id)}
          >
            <ArrowSquareOut size={14} className="text-zinc-500" />
            Open in new tab
            <span className={kbdCls}>T</span>
          </NS.Item>
          <NS.Separator className={menuSeparatorCls} />
        </>
      )}

      {/* Status submenu */}
      <NS.SubmenuRoot>
        <NS.SubmenuTrigger className={submenuTriggerCls}>
          <span className="flex items-center gap-2.5">
            <CircleDashed size={14} className="text-zinc-500" />
            Status
          </span>
          <span className="flex items-center gap-1">
            <span className={kbdCls}>S</span>
            <CaretRight size={10} className="text-zinc-600" />
          </span>
        </NS.SubmenuTrigger>
        <NS.Portal>
          <NS.Positioner className="z-50 outline-none" sideOffset={-4} alignOffset={-4}>
            <NS.Popup className={menuPopupCls}>
              {statusOptions.map((opt) => (
                <NS.Item
                  key={opt.value}
                  className={menuItemCls}
                  onClick={() => actions.setStatus(ids, opt.value)}
                >
                  <span className="flex w-3.5 items-center justify-center">
                    {currentStatus === opt.value && (
                      <CheckCircle size={12} weight="bold" className="text-blue-400" />
                    )}
                  </span>
                  {opt.icon}
                  {opt.label}
                </NS.Item>
              ))}
            </NS.Popup>
          </NS.Positioner>
        </NS.Portal>
      </NS.SubmenuRoot>

      {/* Priority submenu */}
      <NS.SubmenuRoot>
        <NS.SubmenuTrigger className={submenuTriggerCls}>
          <span className="flex items-center gap-2.5">
            <ChartBar size={14} className="text-zinc-500" />
            Priority
          </span>
          <span className="flex items-center gap-1">
            <span className={kbdCls}>P</span>
            <CaretRight size={10} className="text-zinc-600" />
          </span>
        </NS.SubmenuTrigger>
        <NS.Portal>
          <NS.Positioner className="z-50 outline-none" sideOffset={-4} alignOffset={-4}>
            <NS.Popup className={menuPopupCls}>
              {priorityOptions.map((opt) => (
                <NS.Item
                  key={opt.value}
                  className={menuItemCls}
                  onClick={() => actions.setPriority(ids, opt.value)}
                >
                  <span className="flex w-3.5 items-center justify-center">
                    {currentPriority === opt.value && (
                      <CheckCircle size={12} weight="bold" className="text-blue-400" />
                    )}
                  </span>
                  {opt.icon}
                  {opt.label}
                </NS.Item>
              ))}
            </NS.Popup>
          </NS.Positioner>
        </NS.Portal>
      </NS.SubmenuRoot>

      {/* Kind submenu — structural, read-only until mai exposes safe kind mutation */}
      <NS.SubmenuRoot>
        <NS.SubmenuTrigger className={submenuTriggerCls}>
          <span className="flex items-center gap-2.5">
            <Stack size={14} className="text-zinc-500" />
            Kind
          </span>
          <span className="flex items-center gap-1">
            <span className={kbdCls}>{allSameKind ? currentKind : "mixed"}</span>
            <CaretRight size={10} className="text-zinc-600" />
          </span>
        </NS.SubmenuTrigger>
        <NS.Portal>
          <NS.Positioner className="z-50 outline-none" sideOffset={-4} alignOffset={-4}>
            <NS.Popup className={menuPopupCls}>
              {kindOptions.map((opt) => (
                <NS.Item key={opt.value} className={menuItemCls} disabled>
                  <span className="flex w-3.5 items-center justify-center">
                    {allSameKind && currentKind === opt.value && (
                      <CheckCircle size={12} weight="bold" className="text-blue-400" />
                    )}
                  </span>
                  {opt.icon}
                  {opt.label}
                </NS.Item>
              ))}
              {!allSameKind && (
                <>
                  <NS.Separator className={menuSeparatorCls} />
                  <div className="px-3 py-2 text-xs text-zinc-500">
                    Mixed structural kinds selected
                  </div>
                </>
              )}
              <NS.Separator className={menuSeparatorCls} />
              <div className="px-3 py-2 text-xs text-zinc-500">
                Kind is structural and read-only here
              </div>
            </NS.Popup>
          </NS.Positioner>
        </NS.Portal>
      </NS.SubmenuRoot>

      {/* Type submenu — ticket subtype only */}
      {canEditType ? (
        <NS.SubmenuRoot>
          <NS.SubmenuTrigger className={submenuTriggerCls}>
            <span className="flex items-center gap-2.5">
              <ListChecks size={14} className="text-zinc-500" />
              Type
            </span>
            <span className="flex items-center gap-1">
              <span className={kbdCls}>T</span>
              <CaretRight size={10} className="text-zinc-600" />
            </span>
          </NS.SubmenuTrigger>
          <NS.Portal>
            <NS.Positioner className="z-50 outline-none" sideOffset={-4} alignOffset={-4}>
              <NS.Popup className={menuPopupCls}>
                {typeOptions.map((opt) => (
                  <NS.Item
                    key={opt.value}
                    className={menuItemCls}
                    onClick={() => actions.setType(ids, opt.value)}
                  >
                    <span className="flex w-3.5 items-center justify-center">
                      {currentType === opt.value && (
                        <CheckCircle size={12} weight="bold" className="text-blue-400" />
                      )}
                    </span>
                    {opt.icon}
                    {opt.label}
                  </NS.Item>
                ))}
              </NS.Popup>
            </NS.Positioner>
          </NS.Portal>
        </NS.SubmenuRoot>
      ) : (
        <NS.Item className={menuItemCls} disabled>
          <ListChecks size={14} className="text-zinc-500" />
          Type applies to ticket kind only
        </NS.Item>
      )}

      {/* Tags submenu */}
      <NS.SubmenuRoot>
        <NS.SubmenuTrigger className={submenuTriggerCls}>
          <span className="flex items-center gap-2.5">
            <Tag size={14} className="text-zinc-500" />
            Tags
          </span>
          <span className="flex items-center gap-1">
            <span className={kbdCls}>L</span>
            <CaretRight size={10} className="text-zinc-600" />
          </span>
        </NS.SubmenuTrigger>
        <NS.Portal>
          <NS.Positioner className="z-50 outline-none" sideOffset={-4} alignOffset={-4}>
            <NS.Popup className={`${menuPopupCls} max-h-[320px] overflow-y-auto`}>
              {allTags.length === 0 ? (
                <div className="px-3 py-2 text-xs text-zinc-500">No tags available</div>
              ) : (
                [...allTags]
                  .sort((a, b) => {
                    const aActive = allHaveTag(a) || someHaveTag(a);
                    const bActive = allHaveTag(b) || someHaveTag(b);
                    if (aActive && !bActive) return -1;
                    if (!aActive && bActive) return 1;
                    return 0;
                  })
                  .map((tag, i, arr) => {
                    const active = allHaveTag(tag) || someHaveTag(tag);
                    const nextActive =
                      i < arr.length - 1 && (allHaveTag(arr[i + 1]) || someHaveTag(arr[i + 1]));
                    return (
                      <div key={tag}>
                        <NS.Item
                          className={menuItemCls}
                          onClick={() => actions.toggleTag(ids, tag)}
                        >
                          <span className="flex w-3.5 items-center justify-center">
                            {allHaveTag(tag) && (
                              <CheckCircle size={12} weight="bold" className="text-blue-400" />
                            )}
                            {someHaveTag(tag) && (
                              <Minus size={12} weight="bold" className="text-zinc-500" />
                            )}
                          </span>
                          <span className="text-zinc-300">{tag}</span>
                        </NS.Item>
                        {active && !nextActive && <div className="mx-2 my-1 h-px bg-zinc-800" />}
                      </div>
                    );
                  })
              )}
            </NS.Popup>
          </NS.Positioner>
        </NS.Portal>
      </NS.SubmenuRoot>

      {/* Filter by children (single ticket only) */}
      {single && (
        <>
          <NS.Separator className={menuSeparatorCls} />
          <NS.Item
            className={menuItemCls}
            onClick={() => {
              useFilterStore.getState().addFilter("parent", "any_of", [single.id]);
            }}
          >
            <FunnelSimple size={14} className="text-zinc-500" />
            Filter by children
          </NS.Item>
        </>
      )}

      <NS.Separator className={menuSeparatorCls} />

      {/* Copy ID */}
      <NS.Item data-shortcut="c" className={menuItemCls} onClick={() => actions.copyIds(ids)}>
        <Copy size={14} className="text-zinc-500" />
        {count > 1 ? `Copy ${count} IDs` : "Copy ID"}
        <span className={kbdCls}>C</span>
      </NS.Item>
    </>
  );
}

// ── Context menu (right-click wrapper) ────────────────────────
// Zero callback props. Wrap any content — it gets a right-click menu.

interface TicketContextMenuProps {
  children: React.ReactNode;
  targetTickets: TicketSummary[];
  triggerClassName?: string;
  hideOpen?: boolean;
}

export function TicketContextMenu({
  children,
  targetTickets,
  triggerClassName,
  hideOpen,
}: TicketContextMenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={<div className={triggerClassName ?? "flex min-h-0 flex-1 flex-col"} />}
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-50 outline-none">
          <ContextMenu.Popup className={menuPopupCls} onKeyDownCapture={menuPopupKeyDown}>
            <MenuContent tickets={targetTickets} NS={ContextMenu} hideOpen={hideOpen} />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

// ── Dot menu button (··· on each row, left-click) ─────────────

export function DotMenu({ ticket }: { ticket: TicketSummary }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex size-5 items-center justify-center rounded text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-300 group-hover/row:opacity-100 data-[popup-open]:opacity-100"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <DotsThree size={14} weight="bold" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50 outline-none" sideOffset={4}>
          <Menu.Popup className={menuPopupCls} onKeyDownCapture={menuPopupKeyDown}>
            <MenuContent tickets={[ticket]} NS={Menu} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
