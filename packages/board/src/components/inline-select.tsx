import { useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { CheckCircle } from "@phosphor-icons/react";

interface Option<T extends string | number> {
  value: T;
  label: string;
  icon: ReactNode;
}

interface InlineSelectProps<T extends string | number> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
}

const popupCls =
  "min-w-[180px] rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl shadow-zinc-950/80 " +
  "origin-[var(--transform-origin)] transition-opacity data-[ending-style]:opacity-0";

const optionCls =
  "flex cursor-default items-center gap-2.5 py-1.5 pr-3 pl-3 text-[13px] leading-4 text-zinc-300 outline-none select-none " +
  "hover:bg-zinc-800 hover:text-zinc-100";

export function InlineSelect<T extends string | number>({
  options,
  value,
  onChange,
  children,
}: InlineSelectProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="cursor-pointer rounded-md transition-colors hover:bg-zinc-800/60"
        render={<button type="button" />}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="z-50 outline-none" sideOffset={4}>
          <Popover.Popup className={popupCls}>
            {options.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                className={optionCls}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span className="flex w-3.5 items-center justify-center">
                  {value === opt.value && (
                    <CheckCircle size={12} weight="bold" className="text-blue-400" />
                  )}
                </span>
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
