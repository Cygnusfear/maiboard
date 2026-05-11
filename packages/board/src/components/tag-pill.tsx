import { memo, useLayoutEffect, useRef, useState } from "react";

const TAG_COLORS = [
  { bg: "bg-blue-500/10", text: "text-blue-400" },
  { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  { bg: "bg-amber-500/10", text: "text-amber-400" },
  { bg: "bg-rose-500/10", text: "text-rose-400" },
  { bg: "bg-violet-500/10", text: "text-violet-400" },
  { bg: "bg-cyan-500/10", text: "text-cyan-400" },
  { bg: "bg-orange-500/10", text: "text-orange-400" },
  { bg: "bg-teal-500/10", text: "text-teal-400" },
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function TagPill({ tag, onClick }: { tag: string; onClick?: () => void }) {
  const color = TAG_COLORS[hashCode(tag) % TAG_COLORS.length];

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${color.bg} ${color.text} transition-colors hover:brightness-125`}
    >
      {tag}
    </button>
  );
}

/**
 * TagList — show tag pills with overflow handling.
 *
 * - With `max`: hard limit, always truncates after N tags (good for tight spaces like cards).
 * - Without `max`: auto-measures available space and shows as many tags as fit,
 *   displaying "+N" only when tags actually overflow the row.
 */
export function TagList({
  tags,
  max,
  onTagClick,
  className,
}: {
  tags: string[];
  max?: number;
  onTagClick?: (tag: string) => void;
  className?: string;
}) {
  if (max !== undefined) {
    return <HardMaxTagList tags={tags} max={max} onTagClick={onTagClick} className={className} />;
  }
  return <AutoTagList tags={tags} onTagClick={onTagClick} className={className} />;
}

// ── Hard max mode (backward compat for cards, etc.) ───────────

function HardMaxTagList({
  tags,
  max,
  onTagClick,
  className,
}: {
  tags: string[];
  max: number;
  onTagClick?: (tag: string) => void;
  className?: string;
}) {
  const visible = tags.slice(0, max);
  const overflow = tags.length - max;

  return (
    <span className={`inline-flex flex-nowrap items-center gap-1 ${className ?? ""}`}>
      {visible.map((tag) => (
        <TagPill key={tag} tag={tag} onClick={onTagClick ? () => onTagClick(tag) : undefined} />
      ))}
      {overflow > 0 && <span className="shrink-0 text-xs text-zinc-500">+{overflow}</span>}
    </span>
  );
}

// ── Auto-measure mode — fits as many tags as the row allows ───

const AutoTagList = memo(function AutoTagList({
  tags,
  onTagClick,
  className,
}: {
  tags: string[];
  onTagClick?: (tag: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);
  const [measuring, setMeasuring] = useState(true);

  // Cache a stable key for the tags array
  const tagsKey = tags.join(",");

  // When tags change, re-enter measurement mode
  useLayoutEffect(() => {
    setVisibleCount(tags.length);
    setMeasuring(true);
  }, [tagsKey]);

  // Measure which tags fit within the overflow-hidden ancestor
  useLayoutEffect(() => {
    if (!measuring) return;
    const container = containerRef.current;
    if (!container) return;

    // The clip boundary is the nearest overflow-hidden ancestor (the flex row cell)
    const clipParent = container.parentElement;
    if (!clipParent) {
      setMeasuring(false);
      return;
    }

    const boundary = clipParent.getBoundingClientRect().right;
    const pills = Array.from(container.querySelectorAll<HTMLElement>("[data-tag-pill]"));

    if (pills.length === 0) {
      setMeasuring(false);
      return;
    }

    // If everything fits, show all
    if (pills[pills.length - 1].getBoundingClientRect().right <= boundary) {
      setVisibleCount(tags.length);
      setMeasuring(false);
      return;
    }

    // Find how many fit, reserving space for the "+N" badge
    const BADGE_WIDTH = 28; // approximate width of "+N" (text-xs)
    const GAP = 4; // gap-1

    let count = 0;
    for (let i = 0; i < pills.length; i++) {
      const pillRight = pills[i].getBoundingClientRect().right;
      // If this isn't the last tag, we need room for the overflow badge after it
      const badgeSpace = i < pills.length - 1 ? GAP + BADGE_WIDTH : 0;

      if (pillRight + badgeSpace > boundary) break;
      count++;
    }

    setVisibleCount(Math.max(count, 0));
    setMeasuring(false);
  }, [measuring, tagsKey, tags.length]);

  const overflow = tags.length - visibleCount;

  return (
    <span
      ref={containerRef}
      className={`inline-flex shrink-0 flex-nowrap items-center gap-1 ${className ?? ""}`}
    >
      {measuring ? (
        // Measurement pass: render ALL tags so we can measure their positions.
        // The parent's overflow-hidden clips them visually, and useLayoutEffect
        // runs before paint so the user never sees this state.
        tags.map((tag) => (
          <span key={tag} data-tag-pill className="shrink-0">
            <TagPill tag={tag} onClick={onTagClick ? () => onTagClick(tag) : undefined} />
          </span>
        )) // Display pass: only tags that fit + overflow badge
      ) : (
        <>
          {tags.slice(0, visibleCount).map((tag) => (
            <TagPill key={tag} tag={tag} onClick={onTagClick ? () => onTagClick(tag) : undefined} />
          ))}
          {overflow > 0 && <span className="shrink-0 text-xs text-zinc-500">+{overflow}</span>}
        </>
      )}
    </span>
  );
});
