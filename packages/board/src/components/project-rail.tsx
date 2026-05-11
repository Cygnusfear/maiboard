import { useCallback } from "react";
import { useProjectStore } from "@/stores/project-store";
import { GitBranch, Gear, Trash } from "@phosphor-icons/react";
import { useNavigate } from "@/hooks/use-navigate";
import { ContextMenu } from "@base-ui/react/context-menu";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectSummary } from "@/lib/types";

/** Get a 2-letter abbreviation from a project name */
function abbrev(name: string): string {
  const words = name.replace(/[-_]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2);
}

// ── Shared menu styles ────────────────────────────────────────

const itemCls =
  "flex w-full cursor-default items-center gap-2 px-3 py-1.5 text-[13px] text-zinc-400 outline-none select-none " +
  "data-[highlighted]:bg-zinc-800 data-[highlighted]:text-zinc-200";

const dangerItemCls =
  "flex w-full cursor-default items-center gap-2 px-3 py-1.5 text-[13px] text-red-400 outline-none select-none " +
  "data-[highlighted]:bg-red-500/10 data-[highlighted]:text-red-300";

const popupCls =
  "min-w-[160px] rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl shadow-zinc-950/80 outline-none " +
  "origin-[var(--transform-origin)] transition-opacity data-[ending-style]:opacity-0";

// ── Sortable project item ─────────────────────────────────────

function SortableProject({
  project,
  isActive,
  onNavigate,
  onDelete,
}: {
  project: ProjectSummary;
  isActive: boolean;
  onNavigate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative" {...attributes} {...listeners}>
      {isActive && (
        <div className="absolute -left-2 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-r-full bg-white" />
      )}

      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={
            <button
              onClick={() => onNavigate(project.id)}
              title={project.branch ? `${project.name} (${project.branch})` : project.name}
              className={`flex size-10 items-center justify-center rounded-xl text-base tracking-tight transition-all duration-150 ${
                isActive
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-800/50 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 hover:scale-105"
              }`}
            />
          }
        >
          {abbrev(project.name)}
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Positioner sideOffset={8} className="z-50">
            <ContextMenu.Popup className={popupCls}>
              <ContextMenu.Item className={itemCls} onClick={() => onNavigate(project.id)}>
                {project.kind === "worktree" ? "Open worktree" : "Open"}
              </ContextMenu.Item>
              {project.path && (
                <ContextMenu.Item className={itemCls} disabled>
                  <span className="max-w-72 truncate font-mono text-[11px]">{project.path}</span>
                </ContextMenu.Item>
              )}
              {project.branch && (
                <ContextMenu.Item className={itemCls} disabled>
                  <GitBranch size={14} />
                  {project.branch}
                </ContextMenu.Item>
              )}
              {project.kind !== "worktree" && (
                <>
                  <ContextMenu.Separator className="mx-2 my-1 h-px bg-zinc-800" />
                  <ContextMenu.Item className={dangerItemCls} onClick={() => onDelete(project.id)}>
                    <Trash size={14} />
                    Remove project
                  </ContextMenu.Item>
                </>
              )}
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {/* Hover tooltip */}
      <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        <span>{project.name}</span>
        {project.branch && <span className="ml-1 text-zinc-500">{project.branch}</span>}
      </div>
    </div>
  );
}

// ── Rail ───────────────────────────────────────────────────────

export function ProjectRail() {
  const { projects, activeProjectId, deleteProject, reorderProjects } = useProjectStore();
  const [, navigate] = useNavigate();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleNavigate = useCallback(
    (id: string) => {
      navigate(`/${id}`);
    },
    [navigate],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteProject(id);
        // Navigate to next active project after store updated
        const next = useProjectStore.getState().activeProjectId;
        if (next) {
          navigate(`/${next}`);
        } else {
          navigate("/");
        }
      } catch (e) {
        console.error("Failed to delete project:", e);
      }
    },
    [deleteProject, navigate],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = projects.findIndex((p) => p.id === active.id);
      const newIndex = projects.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = [...projects];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      reorderProjects(reordered.map((p) => p.id));
    },
    [projects, reorderProjects],
  );

  return (
    <nav
      className="z-50 flex w-14 flex-col items-center gap-2 border-r border-zinc-800 bg-zinc-950 px-3 py-3"
      style={{ viewTransitionName: "sidebar" }}
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {projects.map((project) => (
            <SortableProject
              key={project.id}
              project={project}
              isActive={project.id === activeProjectId}
              onNavigate={handleNavigate}
              onDelete={handleDelete}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className="mt-auto">
        <button
          className="flex size-10 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          title="Settings"
        >
          <Gear size={18} />
        </button>
      </div>
    </nav>
  );
}
