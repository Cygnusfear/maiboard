import { useEffect } from "react";
import { Command } from "cmdk";
import { Dialog } from "@base-ui/react/dialog";
import { useUIStore } from "@/stores/ui-store";
import { useTicketStore } from "@/stores/ticket-store";
import { useProjectStore } from "@/stores/project-store";
import { useNavigate } from "@/hooks/use-navigate";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { StatusDot } from "./status-dot";
import { PriorityIcon } from "./priority-icon";
import { LinkifiedText } from "./linkified-text";

export function CommandPalette() {
  const { showCommandPalette, setShowCommandPalette } = useUIStore();
  const tickets = useTicketStore((s) => s.tickets);
  const { activeProjectId } = useProjectStore();
  const [, navigate] = useNavigate();

  const handleSelect = (ticketId: string) => {
    if (activeProjectId) {
      navigate(`/${activeProjectId}/ticket/${ticketId}`);
      setShowCommandPalette(false);
    }
  };

  return (
    <Dialog.Root open={showCommandPalette} onOpenChange={setShowCommandPalette}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-sm transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-zinc-950/80 transition-all data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
          <Command label="Search tickets" className="flex flex-col" loop>
            <div className="flex items-center gap-3 border-b border-zinc-800 px-4">
              <MagnifyingGlass size={16} className="shrink-0 text-zinc-500" />
              <Command.Input
                autoFocus
                placeholder="Search tickets..."
                className="flex-1 bg-transparent py-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
              />
              <kbd className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                esc
              </kbd>
            </div>

            <Command.List className="max-h-80 overflow-auto py-1">
              <Command.Empty className="px-4 py-6 text-center text-sm text-zinc-500">
                No results
              </Command.Empty>

              {tickets.slice(0, 100).map((ticket) => (
                <Command.Item
                  key={ticket.id}
                  value={`${ticket.id} ${ticket.title} ${(ticket.tags ?? []).filter((t) => typeof t === "string").join(" ")}`}
                  onSelect={() => handleSelect(ticket.id)}
                  className="flex cursor-default items-center gap-3 px-4 py-2 text-left data-[selected=true]:bg-zinc-800"
                >
                  <span className="shrink-0 font-mono text-xs text-zinc-500">{ticket.id}</span>
                  <span className="flex-1 truncate text-sm text-zinc-300">
                    <LinkifiedText>{ticket.title}</LinkifiedText>
                  </span>
                  <PriorityIcon priority={ticket.priority} />
                  <StatusDot status={ticket.status} />
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
