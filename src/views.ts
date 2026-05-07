import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SavedView } from "./types.ts";

function defaultViews(): SavedView[] {
  return [
    {
      id: "default",
      name: "Open & In Progress",
      mode: "list",
      list: {
        id: "list-default",
        name: "Open & In Progress",
        filters: [
          {
            id: "default-status",
            field: "status",
            operator: "any_of",
            value: ["open", "in_progress"],
          },
        ],
        sortField: "created",
        sortDir: "desc",
      },
    },
    {
      id: "status-board",
      name: "Status Board",
      mode: "board",
      columns: [
        {
          id: "col-open",
          name: "Open",
          filters: [{ id: "f-col-open", field: "status", operator: "any_of", value: ["open"] }],
          sortField: "priority",
          sortDir: "asc",
        },
        {
          id: "col-ip",
          name: "In Progress",
          filters: [
            { id: "f-col-ip", field: "status", operator: "any_of", value: ["in_progress"] },
          ],
          sortField: "priority",
          sortDir: "asc",
        },
        {
          id: "col-closed",
          name: "Closed",
          filters: [{ id: "f-col-closed", field: "status", operator: "any_of", value: ["closed"] }],
          sortField: "created",
          sortDir: "desc",
        },
      ],
    },
  ];
}

export class ViewStore {
  private readonly baseDir: string;

  constructor(context: vscode.ExtensionContext) {
    this.baseDir = context.globalStorageUri.fsPath;
  }

  private file(projectId: string): string {
    return join(this.baseDir, "views", projectId, "views.json");
  }

  read(projectId: string): SavedView[] {
    const file = this.file(projectId);
    if (!existsSync(file)) {
      const seeded = defaultViews();
      this.write(projectId, seeded);
      return seeded;
    }
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as SavedView[];
      return parsed.length ? parsed : defaultViews();
    } catch {
      return defaultViews();
    }
  }

  write(projectId: string, views: SavedView[]): void {
    const file = this.file(projectId);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(views, null, 2) + "\n");
  }

  create(projectId: string, view: Omit<SavedView, "id">): SavedView {
    const views = this.read(projectId);
    const saved = { ...view, id: randomUUID().slice(0, 8) } as SavedView;
    this.write(projectId, [...views, saved]);
    return saved;
  }

  update(projectId: string, viewId: string, patch: Partial<SavedView>): SavedView | null {
    const views = this.read(projectId);
    const index = views.findIndex((view) => view.id === viewId);
    const current = views[index];
    if (!current) return null;
    const updated = { ...current, ...patch, id: viewId } as SavedView;
    views[index] = updated;
    this.write(projectId, views);
    return updated;
  }

  delete(projectId: string, viewId: string): boolean {
    const views = this.read(projectId);
    const next = views.filter((view) => view.id !== viewId);
    if (next.length === views.length) return false;
    this.write(projectId, next);
    return true;
  }
}
