import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@/hooks/use-navigate";
import { CopyableId } from "./copyable-id";
import { useProjectStore } from "@/stores/project-store";
import { useTicketStore } from "@/stores/ticket-store";
import {
  deleteReviewComment,
  getGitDiff,
  getGitLog,
  getGitRefs,
  getReviewHandoff,
  patchReviewComment,
  postReviewComment,
  postReviewVerdict,
  type GitCommit,
  type GitRefs,
  type ReviewHandoffPayload,
} from "@/lib/api";
import type { TicketEvent } from "@/lib/types";
import {
  ArrowLeft,
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  ChatText,
  PencilSimple,
  Plus,
  TrashSimple,
} from "@phosphor-icons/react";
import {
  parsePatchFiles,
  type DiffLineAnnotation,
  type FileDiffMetadata,
  type Hunk,
  type ChangeContent,
  type ContextContent,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";

// ── Comment shape ──────────────────────────────────────────────

interface ReviewComment {
  file: string;
  line: number;
  endLine: number;
  body: string;
  timestamp: string;
  id?: string;
}

const REVIEW_NOTE_RE = /^\[review ([^:\]]+):(\d+)(?:-(\d+))?\]\s*([\s\S]*)$/;

type PierreFontStyle = CSSProperties & Record<`--${string}`, string>;

const pierreEditorFontStyle: PierreFontStyle = {
  "--diffs-font-family":
    "var(--maiboard-editor-font-family, var(--vscode-editor-font-family, 'Geist Mono', ui-monospace, monospace))",
  "--diffs-font-size": "var(--maiboard-editor-font-size, var(--vscode-editor-font-size, 13px))",
  "--diffs-line-height": "var(--maiboard-editor-line-height, 20px)",
  "--diffs-font-features": "var(--maiboard-editor-font-features, normal)",
};

function parseReviewComments(events: TicketEvent[]): ReviewComment[] {
  return events
    .filter((ev) => !ev.kind || ev.kind === "comment")
    .map((ev) => {
      const match = (ev.body ?? "").match(REVIEW_NOTE_RE);
      if (!match) return null;
      const file = match[1]!;
      const line = Number(match[2]);
      const endLine = match[3] ? Number(match[3]) : line;
      const text = match[4]?.trim() ?? "";
      const out: ReviewComment = { file, line, endLine, body: text, timestamp: ev.timestamp ?? "" };
      if (ev.id) out.id = ev.id;
      return out;
    })
    .filter((entry): entry is ReviewComment => entry !== null);
}

// ── File helpers ──────────────────────────────────────────────

function openInVscode(projectId: string, path: string): void {
  const w = window as Window & {
    __MAIBOARD__?: { vscode?: { postMessage: (m: unknown) => void } };
  };
  w.__MAIBOARD__?.vscode?.postMessage({
    type: "maiboard.openFile",
    projectId,
    path,
  });
}

function fileSlug(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "_");
}

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function fileCounts(file: FileDiffMetadata): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of file.hunks) {
    added += hunk.additionCount;
    removed += hunk.deletionCount;
  }
  return { added, removed };
}

function fileStatusBadge(file: FileDiffMetadata): string {
  switch (file.type) {
    case "new":
      return "added";
    case "deleted":
      return "deleted";
    case "rename-pure":
    case "rename-changed":
      return "renamed";
    default:
      return "modified";
  }
}

function fileStatusClass(status: string): string {
  switch (status) {
    case "added":
      return "rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-emerald-300";
    case "deleted":
      return "rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-rose-300";
    case "renamed":
      return "rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-violet-300";
    default:
      return "rounded bg-zinc-700/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-300";
  }
}

// ── Annotation metadata carried per-line ──────────────────────

interface AnnotationMeta {
  comments: ReviewComment[];
  composer: boolean;
}

// ── Composer ──────────────────────────────────────────────────

interface ComposerState {
  file: string;
  start: number;
  end: number;
  side: "additions" | "deletions";
}

interface ReviewViewProps {
  projectId: string;
  ticketId: string;
}

const WORKING_TREE_REF = "__working_tree__";

// VerdictBar — owns its own message state so typing doesn't re-render
// the entire ReviewView (the diff, comment thread, file list).
function VerdictBar({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (kind: "approve" | "request", message: string) => void | Promise<void>;
}) {
  const [message, setMessage] = useState("");
  return (
    <div className="ml-auto flex items-center gap-2">
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Verdict message (optional)"
        className="w-64 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
      />
      <button
        disabled={busy}
        onClick={() => {
          void onSubmit("request", message);
          setMessage("");
        }}
        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
      >
        Request changes
      </button>
      <button
        disabled={busy}
        onClick={() => {
          void onSubmit("approve", message);
          setMessage("");
        }}
        className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
      >
        Approve
      </button>
    </div>
  );
}

export function ReviewView({ projectId, ticketId }: ReviewViewProps) {
  const [, navigate] = useNavigate();
  const { activeTicket, fetchTicketDetail } = useTicketStore();
  const { setActiveProject } = useProjectStore();

  const [refs, setRefs] = useState<GitRefs | null>(null);
  const [head, setHead] = useState<string>("");
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [fromHash, setFromHash] = useState<string>("");
  const [toHash, setToHash] = useState<string>("");
  const [fileFilter, setFileFilter] = useState("");
  const [patch, setPatch] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState<ReviewHandoffPayload | null>(null);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(() => new Set());

  const diffScrollRef = useRef<HTMLDivElement>(null);
  const handoffToken = useMemo(
    () => new URLSearchParams(window.location.search).get("handoff"),
    [],
  );

  // Keep project + ticket synced from the route
  useEffect(() => {
    setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  useEffect(() => {
    if (!activeTicket || activeTicket.id !== ticketId) {
      void fetchTicketDetail(projectId, ticketId);
    }
  }, [projectId, ticketId, activeTicket, fetchTicketDetail]);

  // Review handoff payload from maiboard URI links.
  useEffect(() => {
    if (!handoffToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const payload = await getReviewHandoff(handoffToken);
        if (cancelled) return;
        setHandoff(payload);
        if (payload.branch || payload.head) setHead(payload.branch || payload.head || "HEAD");
        if (payload.commits.length > 0) {
          setFromHash(payload.commits[0]!);
          setToHash(payload.commits[payload.commits.length - 1]!);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handoffToken]);

  // Refs
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await getGitRefs(projectId);
        if (cancelled) return;
        setRefs(r);
        setHead(r.currentBranch || r.defaultBranch || "HEAD");
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Recent commits on head
  useEffect(() => {
    if (!head) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await getGitLog(projectId, "", head);
        if (cancelled) return;
        setCommits(result.commits);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, head]);

  // Default From=To=newest
  useEffect(() => {
    if (commits.length === 0) {
      setFromHash("");
      setToHash("");
      return;
    }
    setFromHash((prev) => (prev && commits.some((c) => c.hash === prev) ? prev : commits[0]!.hash));
    setToHash((prev) =>
      prev && (prev === WORKING_TREE_REF || commits.some((c) => c.hash === prev))
        ? prev
        : commits[0]!.hash,
    );
  }, [commits]);

  const loadDiff = useCallback(async () => {
    if (!fromHash || !toHash) return;
    setLoading(true);
    setError(null);
    try {
      const result = handoff?.commits.length
        ? await getGitDiff(projectId, {
            commits: handoff.commits,
            commitOrder: handoff.commitOrder ?? "oldest-to-newest",
          })
        : await getGitDiff(projectId, {
            // From is inclusive — base is the parent of the From commit so its
            // changes are part of the diff. (Bug fix: previously a manual From/To
            // selection silently used `fromHash` as base, which excluded files
            // touched only by the From commit.)
            base: `${fromHash}^`,
            ...(toHash === WORKING_TREE_REF ? { workingTree: true } : { head: toHash }),
            detectRenames: false,
          });
      setPatch(result.patch);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId, fromHash, toHash, handoff]);

  useEffect(() => {
    if (fromHash && toHash) void loadDiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromHash, toHash]);

  // Parse the patch with pierre once it changes
  const files = useMemo<FileDiffMetadata[]>(() => {
    if (!patch) return [];
    try {
      const patches = parsePatchFiles(patch);
      return patches.flatMap((p) => p.files);
    } catch (e) {
      console.error("parsePatchFiles failed", e);
      return [];
    }
  }, [patch]);

  useEffect(() => {
    const names = new Set(files.map((file) => file.name));
    setCollapsedFiles((prev) => {
      const next = new Set(Array.from(prev).filter((name) => names.has(name)));
      return next.size === prev.size ? prev : next;
    });
  }, [files]);

  const filteredFiles = useMemo(() => {
    const query = fileFilter.trim().toLowerCase();
    if (!query) return files;
    return files.filter((file) => file.name.toLowerCase().includes(query));
  }, [files, fileFilter]);

  useEffect(() => {
    if (!composer) return;
    if (filteredFiles.some((file) => file.name === composer.file)) return;
    setComposer(null);
  }, [composer, filteredFiles]);

  // Review comments parsed from the ticket's comment events. mai stores notes
  // (including review comments) as events with kind='comment', NOT in the body.
  const reviewComments = useMemo(() => {
    const events = activeTicket?.events ?? [];
    if (events.length === 0) return new Map<string, ReviewComment[]>();
    const list = parseReviewComments(events);
    const map = new Map<string, ReviewComment[]>();
    for (const c of list) {
      const key = `${c.file}:${c.line}`;
      const existing = map.get(key) ?? [];
      existing.push(c);
      map.set(key, existing);
    }
    return map;
  }, [activeTicket?.events]);

  const ticketTitle = activeTicket?.id === ticketId ? activeTicket.title : ticketId;
  const ticketKind = activeTicket?.id === ticketId ? activeTicket.type : "";

  // Latest review verdict from notes — review comments are prefixed "[review …]" so we
  // skip them. Notes are returned oldest-first by parseNotes; iterate from the end.
  // Latest verdict from comment events (mai stores notes as events, not in body).
  // Skip review-mode inline comments (prefixed '[review …]').
  const latestVerdict = useMemo<{
    kind: "approve" | "request";
    timestamp: string;
    message: string;
  } | null>(() => {
    const events = activeTicket?.events ?? [];
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]!;
      if (ev.kind && ev.kind !== "comment") continue;
      const c = (ev.body ?? "").trim();
      if (!c || c.startsWith("[review ")) continue;
      const approveMatch = c.match(/^Approved(?::\s*(.*))?$/s);
      if (approveMatch) {
        return {
          kind: "approve",
          timestamp: ev.timestamp ?? "",
          message: (approveMatch[1] ?? "").trim(),
        };
      }
      const requestMatch = c.match(/^Changes requested(?::\s*(.*))?$/s);
      if (requestMatch) {
        return {
          kind: "request",
          timestamp: ev.timestamp ?? "",
          message: (requestMatch[1] ?? "").trim(),
        };
      }
    }
    return null;
  }, [activeTicket?.events]);

  const goBack = useCallback(() => {
    navigate(`/${projectId}/ticket/${ticketId}`);
  }, [navigate, projectId, ticketId]);

  const pickLastN = (n: number) => {
    if (commits.length === 0) return;
    const safeN = Math.min(n, commits.length);
    setFromHash(commits[safeN - 1]!.hash);
    setToHash(commits[0]!.hash);
  };

  const cancelComposer = useCallback(() => {
    setComposer(null);
  }, []);

  const submitComment = useCallback(
    async (draft: string) => {
      if (!composer || !draft.trim()) return;
      const start = Math.min(composer.start, composer.end);
      const end = Math.max(composer.start, composer.end);
      const range = end > start ? `${start}-${end}` : `${start}`;
      const wrapped = `[review ${composer.file}:${range}] ${draft.trim()}`;
      setBusy(true);
      try {
        await postReviewComment(projectId, ticketId, {
          file: composer.file,
          line: start,
          endLine: end,
          body: wrapped,
        });
        cancelComposer();
        await fetchTicketDetail(projectId, ticketId);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [composer, projectId, ticketId, fetchTicketDetail, cancelComposer],
  );

  const submitVerdict = useCallback(
    async (kind: "approve" | "request", message: string) => {
      setBusy(true);
      try {
        await postReviewVerdict(projectId, ticketId, {
          kind,
          message: message.trim() || undefined,
        });
        await fetchTicketDetail(projectId, ticketId);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [projectId, ticketId, fetchTicketDetail],
  );

  const editComment = useCallback(
    async (comment: ReviewComment, newBody: string) => {
      const range =
        comment.endLine > comment.line ? `${comment.line}-${comment.endLine}` : `${comment.line}`;
      const wrapped = `[review ${comment.file}:${range}] ${newBody.trim()}`;
      setBusy(true);
      try {
        await patchReviewComment(projectId, ticketId, {
          timestamp: comment.timestamp,
          body: wrapped,
        });
        await fetchTicketDetail(projectId, ticketId);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [projectId, ticketId, fetchTicketDetail],
  );

  const removeComment = useCallback(
    async (comment: ReviewComment) => {
      if (!confirm(`Delete comment on ${comment.file}:${comment.line}?`)) return;
      setBusy(true);
      try {
        await deleteReviewComment(projectId, ticketId, { timestamp: comment.timestamp });
        await fetchTicketDetail(projectId, ticketId);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [projectId, ticketId, fetchTicketDetail],
  );

  // External-change refresh
  useEffect(() => {
    const handler = () => {
      void fetchTicketDetail(projectId, ticketId);
    };
    window.addEventListener("maiboard:changed", handler);
    return () => window.removeEventListener("maiboard:changed", handler);
  }, [fetchTicketDetail, projectId, ticketId]);

  const totals = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const file of filteredFiles) {
      const c = fileCounts(file);
      added += c.added;
      removed += c.removed;
    }
    return { files: filteredFiles.length, added, removed };
  }, [filteredFiles]);

  const rangeLabel = handoff?.commits.length
    ? `handoff ${handoff.commits.length} commit${handoff.commits.length === 1 ? "" : "s"} ${handoff.commits[0]!.slice(0, 7)}..${handoff.commits[handoff.commits.length - 1]!.slice(0, 7)}`
    : fromHash && toHash
      ? fromHash === toHash
        ? `single commit ${fromHash.slice(0, 7)}`
        : toHash === WORKING_TREE_REF
          ? `${fromHash.slice(0, 7)}..uncommitted`
          : `${fromHash.slice(0, 7)}..${toHash.slice(0, 7)}`
      : "no range";

  const scrollToFile = useCallback((name: string) => {
    const el = document.getElementById(`review-file-${fileSlug(name)}`);
    const scroll = diffScrollRef.current;
    if (el && scroll) {
      scroll.scrollTo({ top: el.offsetTop - scroll.offsetTop - 4, behavior: "smooth" });
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800 px-6 py-3">
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <CopyableId id={ticketId} className="text-xs" />
        <span className="truncate text-sm text-zinc-200">{ticketTitle}</span>
        {ticketKind && (
          <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
            {ticketKind}
          </span>
        )}
        {latestVerdict && (
          <span
            className={
              latestVerdict.kind === "approve"
                ? "rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300"
                : "rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300"
            }
            title={`${latestVerdict.kind === "approve" ? "Approved" : "Changes requested"} at ${latestVerdict.timestamp}${latestVerdict.message ? " — " + latestVerdict.message : ""}`}
          >
            {latestVerdict.kind === "approve" ? "✓ approved" : "↻ changes requested"}
          </span>
        )}
        <VerdictBar busy={busy} onSubmit={submitVerdict} />
      </div>

      {/* Range row */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 bg-zinc-925 px-6 py-2">
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          Branch
          <select
            value={head}
            onChange={(e) => setHead(e.target.value)}
            disabled={!refs || refs.branches.length === 0}
            className="max-w-xs rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-200 focus:border-zinc-600 focus:outline-none disabled:opacity-50"
          >
            {refs && !refs.branches.includes(head) && head && <option value={head}>{head}</option>}
            {(refs?.branches ?? []).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          From
          <select
            value={fromHash}
            onChange={(e) => {
              const next = e.target.value;
              setFromHash(next);
              // Reset TO to the latest commit so changing FROM widens the committed range
              // back to HEAD/newest by default. The user can still choose Uncommitted files.
              setToHash(commits[0]?.hash ?? next);
            }}
            disabled={commits.length === 0}
            className="max-w-xs rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-200 focus:border-zinc-600 focus:outline-none disabled:opacity-50"
            title="Older endpoint of the diff range (inclusive)"
          >
            {commits.length === 0 && <option value="">(no commits)</option>}
            {commits.map((c) => (
              <option key={c.hash} value={c.hash}>
                {c.short} — {c.subject}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          To
          <select
            value={toHash}
            onChange={(e) => {
              setToHash(e.target.value);
            }}
            disabled={commits.length === 0}
            className="max-w-xs rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-200 focus:border-zinc-600 focus:outline-none disabled:opacity-50"
            title="Newer endpoint of the diff range (inclusive) — must be at or newer than From"
          >
            {commits.length === 0 && <option value="">(no commits)</option>}
            {commits.length > 0 && <option value={WORKING_TREE_REF}>Uncommitted files</option>}
            {commits
              .filter((_, idx) => {
                const fromIdx = commits.findIndex((c) => c.hash === fromHash);
                if (fromIdx === -1) return true;
                // Recent-first list: smaller index = newer. TO must be newer or equal to FROM.
                return idx <= fromIdx;
              })
              .map((c) => (
                <option key={c.hash} value={c.hash}>
                  {c.short} — {c.subject}
                </option>
              ))}
          </select>
        </label>

        <span className="text-xs text-zinc-500">Last:</span>
        {[1, 3, 5, 10].map((n) => (
          <button
            key={n}
            onClick={() => pickLastN(n)}
            disabled={commits.length === 0}
            className="rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
          >
            {n}
          </button>
        ))}

        <button
          onClick={() => void loadDiff()}
          disabled={loading || !fromHash || !toHash}
          className="rounded-md bg-blue-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Reload diff"}
        </button>

        <span className="ml-auto font-mono text-[10px] text-zinc-500">{rangeLabel}</span>
        <span className="text-xs text-zinc-500">
          {totals.files} files · <span className="text-emerald-400">+{totals.added}</span>{" "}
          <span className="text-rose-400">-{totals.removed}</span>
        </span>
      </div>

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-6 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {commits.length === 0 && !error && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-xs text-amber-300">
          No commits found on <span className="font-mono">{head || "HEAD"}</span>. Type a different
          branch name and the picker will refresh.
        </div>
      )}

      {/* Body: file list + diff + minimap */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <FileListSidebar
          projectId={projectId}
          files={filteredFiles}
          totalFiles={files.length}
          fileFilter={fileFilter}
          onFileFilterChange={setFileFilter}
          comments={reviewComments}
          onSelect={scrollToFile}
        />

        <div className="flex min-h-0 min-w-0 flex-1">
          <div ref={diffScrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
            {filteredFiles.length === 0 && !loading && (
              <div className="flex h-32 items-center justify-center text-sm text-zinc-600">
                {patch && files.length > 0 && fileFilter.trim()
                  ? `No files match “${fileFilter.trim()}”.`
                  : patch
                    ? `No file changes in ${rangeLabel}.`
                    : "Loading diff…"}
              </div>
            )}
            {filteredFiles.map((file, idx) => {
              const collapsed = collapsedFiles.has(file.name);
              return (
                <ReviewFile
                  key={`${file.name}-${idx}`}
                  file={file}
                  comments={reviewComments}
                  composer={composer}
                  collapsed={collapsed}
                  onToggleCollapsed={() => {
                    if (!collapsed)
                      setComposer((current) => (current?.file === file.name ? null : current));
                    setCollapsedFiles((prev) => {
                      const next = new Set(prev);
                      if (next.has(file.name)) next.delete(file.name);
                      else next.add(file.name);
                      return next;
                    });
                  }}
                  onComposerStart={(start, end, side) => {
                    setComposer({ file: file.name, start, end, side });
                  }}
                  cancelComposer={cancelComposer}
                  submitComment={submitComment}
                  onEditComment={editComment}
                  onDeleteComment={removeComment}
                  busy={busy}
                />
              );
            })}
          </div>

          <Minimap files={filteredFiles} comments={reviewComments} scrollRef={diffScrollRef} />
        </div>
      </div>
    </div>
  );
}

// ── Per-file diff with the pierre/diffs FileDiff component ────

function ReviewFile({
  file,
  comments,
  composer,
  onComposerStart,
  cancelComposer,
  submitComment,
  onEditComment,
  onDeleteComment,
  busy,
  collapsed,
  onToggleCollapsed,
}: {
  file: FileDiffMetadata;
  comments: Map<string, ReviewComment[]>;
  composer: ComposerState | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onComposerStart: (start: number, end: number, side: "additions" | "deletions") => void;
  cancelComposer: () => void;
  submitComment: (draft: string) => void | Promise<void>;
  onEditComment: (comment: ReviewComment, body: string) => void | Promise<void>;
  onDeleteComment: (comment: ReviewComment) => void | Promise<void>;
  busy: boolean;
}) {
  const counts = fileCounts(file);
  const status = fileStatusBadge(file);

  // Build line annotations for both threaded comments and the live composer.
  const lineAnnotations = useMemo<DiffLineAnnotation<AnnotationMeta>[]>(() => {
    const out: DiffLineAnnotation<AnnotationMeta>[] = [];
    for (const [key, list] of comments) {
      if (!key.startsWith(file.name + ":")) continue;
      const lineStr = key.slice(file.name.length + 1);
      const lineNumber = Number(lineStr);
      if (!Number.isFinite(lineNumber)) continue;
      out.push({
        side: "additions",
        lineNumber,
        metadata: { comments: list, composer: false },
      });
    }
    if (composer && composer.file === file.name) {
      const end = Math.max(composer.start, composer.end);
      out.push({
        side: composer.side,
        lineNumber: end,
        metadata: { comments: [], composer: true },
      });
    }
    return out;
  }, [file.name, comments, composer]);

  const selectedLines = useMemo(() => {
    if (!composer || composer.file !== file.name) return null;
    return {
      start: Math.min(composer.start, composer.end),
      end: Math.max(composer.start, composer.end),
      side: composer.side,
      endSide: composer.side,
    };
  }, [composer, file.name]);

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<AnnotationMeta>) => {
      if (annotation.metadata.composer) {
        return (
          <Composer
            file={file.name}
            range={selectedLines!}
            onCancel={cancelComposer}
            onSubmit={submitComment}
            busy={busy}
          />
        );
      }
      return (
        <CommentThread
          comments={annotation.metadata.comments}
          onEdit={onEditComment}
          onDelete={onDeleteComment}
          busy={busy}
        />
      );
    },
    [file.name, selectedLines, cancelComposer, submitComment, onEditComment, onDeleteComment, busy],
  );

  return (
    <div id={`review-file-${fileSlug(file.name)}`} className="border-b border-zinc-800">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-4 py-1.5 text-xs">
        <button
          type="button"
          className="-ml-1 flex size-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-label={collapsed ? `Expand ${file.name}` : `Collapse ${file.name}`}
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
        >
          {collapsed ? <CaretRight size={13} /> : <CaretDown size={13} />}
        </button>
        <span className={fileStatusClass(status)}>{status}</span>
        <span className="font-mono text-zinc-200">{file.name}</span>
        {file.prevName && file.prevName !== file.name && (
          <span className="font-mono text-[10px] text-zinc-500">(was {file.prevName})</span>
        )}
        <span className="ml-auto font-mono text-[10px]">
          <span className="text-emerald-400">+{counts.added}</span>{" "}
          <span className="text-rose-400">-{counts.removed}</span>
        </span>
      </div>

      {!collapsed && (
        <FileDiff<AnnotationMeta>
          style={pierreEditorFontStyle}
          fileDiff={file}
          lineAnnotations={lineAnnotations}
          selectedLines={selectedLines}
          renderAnnotation={renderAnnotation}
          options={{
            theme: "pierre-dark",
            diffStyle: "unified",
            diffIndicators: "classic",
            hunkSeparators: "line-info-basic",
            enableGutterUtility: true,
            enableLineSelection: true,
            onGutterUtilityClick(range) {
              const side = (range.side ?? "additions") as "additions" | "deletions";
              onComposerStart(range.start, range.end, side);
            },
          }}
          disableWorkerPool
        />
      )}
    </div>
  );
}

// ── Composer ─────────────────────────────────────────────────

// Composer owns its own draft state — every keystroke re-renders
// only this small component, not the entire ReviewView (which contains
// the parsed git diff and full comment thread).
function Composer({
  file,
  range,
  onCancel,
  onSubmit,
  busy,
}: {
  file: string;
  range: { start: number; end: number; side: "additions" | "deletions" };
  onCancel: () => void;
  onSubmit: (draft: string) => void | Promise<void>;
  busy: boolean;
}) {
  const [draft, setDraft] = useState("");
  const label =
    range.start === range.end ? `${file}:${range.start}` : `${file}:${range.start}-${range.end}`;
  return (
    <div className="border-l-2 border-blue-500/40 bg-blue-500/[0.06] px-4 py-2">
      <div className="mb-2 flex items-center gap-2 text-[11px] text-zinc-400">
        <span className="font-mono">{label}</span>
        <span className="text-zinc-600">
          · click <Plus size={10} className="-mt-0.5 inline" /> on another line, or drag, to extend
        </span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Leave a review comment…"
        rows={3}
        autoFocus
        className="w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[12px] text-zinc-100 outline-none focus:border-blue-400"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        >
          Cancel
        </button>
        <button
          disabled={busy || !draft.trim()}
          onClick={() => void onSubmit(draft)}
          className="rounded-md bg-blue-600/80 px-3 py-1 text-[11px] text-white hover:bg-blue-600 disabled:opacity-50"
        >
          Comment
        </button>
      </div>
    </div>
  );
}

// ── Comment thread ──────────────────────────────────────────

function CommentThread({
  comments,
  onEdit,
  onDelete,
  busy,
}: {
  comments: ReviewComment[];
  onEdit: (comment: ReviewComment, body: string) => void | Promise<void>;
  onDelete: (comment: ReviewComment) => void | Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="border-l-2 border-blue-500/40 bg-blue-500/[0.04] px-4 py-2">
      {comments.map((comment) => (
        <CommentItem
          key={comment.timestamp}
          comment={comment}
          onEdit={onEdit}
          onDelete={onDelete}
          busy={busy}
        />
      ))}
    </div>
  );
}

function CommentItem({
  comment,
  onEdit,
  onDelete,
  busy,
}: {
  comment: ReviewComment;
  onEdit: (comment: ReviewComment, body: string) => void | Promise<void>;
  onDelete: (comment: ReviewComment) => void | Promise<void>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(comment.body);

  useEffect(() => {
    if (!editing) setEditDraft(comment.body);
  }, [comment.body, editing]);

  const range =
    comment.endLine > comment.line ? `L${comment.line}-L${comment.endLine}` : `L${comment.line}`;

  const save = async () => {
    if (!editDraft.trim() || editDraft.trim() === comment.body.trim()) {
      setEditing(false);
      return;
    }
    await onEdit(comment, editDraft);
    setEditing(false);
  };

  return (
    <div className="mb-2 flex items-start gap-2 text-[12px] last:mb-0">
      <ChatText size={12} className="mt-1 shrink-0 text-blue-300" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <span>{comment.timestamp}</span>
          <span className="font-mono">{range}</span>
          <div className="ml-auto flex items-center gap-1">
            {!editing && (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
                  title="Edit comment"
                  aria-label="Edit comment"
                >
                  <PencilSimple size={11} />
                </button>
                <button
                  onClick={() => void onDelete(comment)}
                  className="rounded p-0.5 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300"
                  title="Delete comment"
                  aria-label="Delete comment"
                >
                  <TrashSimple size={11} />
                </button>
              </>
            )}
          </div>
        </div>
        {editing ? (
          <>
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              rows={3}
              autoFocus
              className="mt-1 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[12px] text-zinc-100 outline-none focus:border-blue-400"
            />
            <div className="mt-1 flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditing(false);
                  setEditDraft(comment.body);
                }}
                className="rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                disabled={busy || !editDraft.trim()}
                onClick={() => void save()}
                className="rounded-md bg-blue-600/80 px-2 py-0.5 text-[11px] text-white hover:bg-blue-600 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <div className="whitespace-pre-wrap text-zinc-200">{comment.body}</div>
        )}
      </div>
    </div>
  );
}

// ── File list sidebar ───────────────────────────────────────

function FileListSidebar({
  projectId,
  files,
  totalFiles,
  fileFilter,
  onFileFilterChange,
  comments,
  onSelect,
}: {
  projectId: string;
  files: FileDiffMetadata[];
  totalFiles: number;
  fileFilter: string;
  onFileFilterChange: (value: string) => void;
  comments: Map<string, ReviewComment[]>;
  onSelect: (name: string) => void;
}) {
  const totals = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const f of files) {
      const c = fileCounts(f);
      added += c.added;
      removed += c.removed;
    }
    return { added, removed };
  }, [files]);
  const max = Math.max(totals.added, totals.removed, 1);

  if (totalFiles === 0) {
    return <aside className="hidden w-72 shrink-0 border-r border-zinc-800 md:block" />;
  }

  return (
    <aside className="hidden w-72 shrink-0 overflow-auto border-r border-zinc-800 md:block">
      <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur">
        <input
          value={fileFilter}
          onChange={(e) => onFileFilterChange(e.target.value)}
          placeholder="Filter files…"
          aria-label="Filter review files"
          className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
        />
        <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
          <span>
            {files.length === totalFiles ? files.length : `${files.length}/${totalFiles}`} files
          </span>
          <span>
            <span className="text-emerald-400">+{totals.added}</span>{" "}
            <span className="text-rose-400">-{totals.removed}</span>
          </span>
        </div>
      </div>
      {files.length === 0 ? (
        <div className="px-3 py-8 text-center text-xs text-zinc-600">
          No files match this filter.
        </div>
      ) : (
        <ul>
          {files.map((file) => {
            const counts = fileCounts(file);
            const status = fileStatusBadge(file);
            let fileCommentCount = 0;
            for (const [key, list] of comments) {
              if (key.startsWith(file.name + ":")) fileCommentCount += list.length;
            }
            const addedW = (counts.added / max) * 100;
            const removedW = (counts.removed / max) * 100;
            return (
              <li key={file.name} className="group/file relative">
                <button
                  onClick={() => onSelect(file.name)}
                  className="flex w-full flex-col gap-1 border-b border-zinc-900 px-3 py-1.5 pr-8 text-left hover:bg-zinc-800/50"
                >
                  <div className="flex items-center gap-1.5 text-xs">
                    <span
                      className={
                        "font-mono text-[9px] uppercase " +
                        (status === "added"
                          ? "text-emerald-300"
                          : status === "deleted"
                            ? "text-rose-300"
                            : status === "renamed"
                              ? "text-violet-300"
                              : "text-zinc-400")
                      }
                    >
                      {status[0]?.toUpperCase()}
                    </span>
                    <span className="truncate font-mono text-zinc-200">{basename(file.name)}</span>
                    {fileCommentCount > 0 && (
                      <span className="ml-auto flex items-center gap-0.5 rounded bg-blue-500/15 px-1 font-mono text-[9px] text-blue-300">
                        <ChatText size={10} />
                        {fileCommentCount}
                      </span>
                    )}
                  </div>
                  <div className="truncate font-mono text-[10px] text-zinc-500">
                    {dirname(file.name) || "/"}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-1 flex-1 overflow-hidden rounded bg-zinc-800">
                      <div className="h-full bg-emerald-400/70" style={{ width: `${addedW}%` }} />
                      <div className="h-full bg-rose-400/70" style={{ width: `${removedW}%` }} />
                    </div>
                    <span className="font-mono text-[10px]">
                      <span className="text-emerald-400">+{counts.added}</span>{" "}
                      <span className="text-rose-400">-{counts.removed}</span>
                    </span>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openInVscode(projectId, file.name);
                  }}
                  className="absolute top-1.5 right-1.5 rounded p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-200 group-hover/file:opacity-100"
                  title="Open in VS Code"
                  aria-label="Open in VS Code"
                >
                  <ArrowSquareOut size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

// ── Minimap (canvas) ────────────────────────────────────────

interface FlatItem {
  kind: "file" | "hunk" | "line";
  type?: "context" | "add" | "remove";
  file?: string;
  lineNum?: number;
}

function flattenForMinimap(files: FileDiffMetadata[]): FlatItem[] {
  const out: FlatItem[] = [];
  for (const file of files) {
    out.push({ kind: "file", file: file.name });
    for (const hunk of file.hunks) {
      out.push({ kind: "hunk", file: file.name });
      let oldLine = hunk.deletionStart;
      let newLine = hunk.additionStart;
      for (const piece of hunk.hunkContent as (ContextContent | ChangeContent)[]) {
        if (piece.type === "context") {
          for (let i = 0; i < piece.lines; i++) {
            out.push({ kind: "line", type: "context", file: file.name, lineNum: newLine });
            oldLine++;
            newLine++;
          }
        } else {
          for (let i = 0; i < piece.deletions; i++) {
            out.push({ kind: "line", type: "remove", file: file.name, lineNum: oldLine });
            oldLine++;
          }
          for (let i = 0; i < piece.additions; i++) {
            out.push({ kind: "line", type: "add", file: file.name, lineNum: newLine });
            newLine++;
          }
        }
      }
    }
  }
  return out;
}

function Minimap({
  files,
  comments,
  scrollRef,
}: {
  files: FileDiffMetadata[];
  comments: Map<string, ReviewComment[]>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ active: boolean }>({ active: false });

  const flat = useMemo(() => flattenForMinimap(files), [files]);

  const commentPositions = useMemo(() => {
    if (flat.length === 0 || comments.size === 0) return [] as number[];
    const idxByKey = new Map<string, number>();
    flat.forEach((item, idx) => {
      if (item.kind === "line" && item.file) {
        idxByKey.set(`${item.file}:${item.lineNum}`, idx);
      }
    });
    const out: number[] = [];
    for (const [key] of comments) {
      const idx = idxByKey.get(key);
      if (idx !== undefined) out.push(idx);
    }
    return out;
  }, [flat, comments]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scrollEl = scrollRef.current;
    if (!canvas || !scrollEl) return;

    let raf = 0;
    const draw = () => {
      raf = 0;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (W === 0 || H === 0) return;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      const total = flat.length;
      if (total === 0) return;
      const linePx = Math.max(0.5, Math.min(3, H / total));
      for (let i = 0; i < total; i++) {
        const item = flat[i]!;
        const y = i * linePx;
        let color = "";
        if (item.kind === "file") color = "#27272a";
        else if (item.kind === "hunk") color = "#3f3f46";
        else if (item.type === "add") color = "rgba(34, 197, 94, 0.85)";
        else if (item.type === "remove") color = "rgba(239, 68, 68, 0.85)";
        else color = "rgba(82, 82, 91, 0.55)";
        ctx.fillStyle = color;
        ctx.fillRect(0, y, W, Math.max(linePx, 0.5));
      }

      ctx.fillStyle = "#3b82f6";
      for (const idx of commentPositions) {
        const y = idx * linePx + linePx / 2;
        ctx.beginPath();
        ctx.arc(W - 4, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      const sH = scrollEl.scrollHeight;
      const cH = scrollEl.clientHeight;
      const sT = scrollEl.scrollTop;
      if (sH > cH) {
        const indFrac = sT / sH;
        const indHeightFrac = cH / sH;
        const indY = indFrac * H;
        const indHeight = Math.max(20, indHeightFrac * H);
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.fillRect(0, indY, W, indHeight);
        ctx.strokeStyle = "rgba(96, 165, 250, 0.7)";
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, indY + 0.5, W - 1, indHeight - 1);
      }
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(draw);
    };
    schedule();
    scrollEl.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(scrollEl);
    ro.observe(canvas);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scrollEl.removeEventListener("scroll", schedule);
      ro.disconnect();
    };
  }, [flat, commentPositions, scrollRef]);

  const jumpTo = (clientY: number) => {
    const canvas = canvasRef.current;
    const scrollEl = scrollRef.current;
    if (!canvas || !scrollEl) return;
    const rect = canvas.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const frac = rect.height > 0 ? y / rect.height : 0;
    const target = frac * scrollEl.scrollHeight - scrollEl.clientHeight / 2;
    scrollEl.scrollTop = Math.max(0, target);
  };

  if (flat.length === 0) {
    return <div className="hidden w-20 shrink-0 border-l border-zinc-800 bg-zinc-925 lg:block" />;
  }

  return (
    <div className="hidden w-20 shrink-0 border-l border-zinc-800 bg-zinc-925 lg:block">
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-pointer select-none"
        onMouseDown={(e) => {
          dragRef.current.active = true;
          jumpTo(e.clientY);
        }}
        onMouseMove={(e) => {
          if (dragRef.current.active) jumpTo(e.clientY);
        }}
        onMouseUp={() => {
          dragRef.current.active = false;
        }}
        onMouseLeave={() => {
          dragRef.current.active = false;
        }}
        title="Click or drag to navigate"
        aria-label="Diff minimap"
      />
    </div>
  );
}
