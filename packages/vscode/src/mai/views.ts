import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FilterClause, SavedView } from "@maiboard/api";

const ACTIONABLE_KINDS = ["ticket", "review", "pr"];
const LEGACY_NON_ACTIONABLE_TYPES = ["adr", "decision"];
const KINDLIKE_TYPES = new Set([
  "ticket",
  "review",
  "pr",
  "decision",
  "artifact",
  "warning",
  "doc",
]);

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
      filterPresets: [],
      activePresetIds: [],
      columns: [
        {
          id: "col-open",
          name: "Open",
          filters: [
            { id: "f-col-open-status", field: "status", operator: "any_of", value: ["open"] },
            { id: "f-col-open-kind", field: "kind", operator: "any_of", value: ACTIONABLE_KINDS },
            {
              id: "f-col-open-type",
              field: "type",
              operator: "none_of",
              value: LEGACY_NON_ACTIONABLE_TYPES,
            },
          ],
          sortField: "priority",
          sortDir: "asc",
        },
        {
          id: "col-ip",
          name: "In Progress",
          filters: [
            { id: "f-col-ip-status", field: "status", operator: "any_of", value: ["in_progress"] },
            { id: "f-col-ip-kind", field: "kind", operator: "any_of", value: ACTIONABLE_KINDS },
            {
              id: "f-col-ip-type",
              field: "type",
              operator: "none_of",
              value: LEGACY_NON_ACTIONABLE_TYPES,
            },
          ],
          sortField: "priority",
          sortDir: "asc",
        },
        {
          id: "col-closed",
          name: "Closed",
          filters: [
            { id: "f-col-closed-status", field: "status", operator: "any_of", value: ["closed"] },
            { id: "f-col-closed-kind", field: "kind", operator: "any_of", value: ACTIONABLE_KINDS },
            {
              id: "f-col-closed-type",
              field: "type",
              operator: "none_of",
              value: LEGACY_NON_ACTIONABLE_TYPES,
            },
          ],
          sortField: "created",
          sortDir: "desc",
        },
      ],
    },
  ];
}

function migrateTypeMasqueradeClause(clause: FilterClause): FilterClause {
  if (clause.field !== "type") return clause;

  const rewriteSingle = (value: string) =>
    KINDLIKE_TYPES.has(value) ? { ...clause, field: "kind" as const, value } : clause;

  if (typeof clause.value === "string") return rewriteSingle(clause.value);

  if (Array.isArray(clause.value)) {
    const values = clause.value.map(String);
    if (values.length > 0 && values.every((value) => KINDLIKE_TYPES.has(value))) {
      return { ...clause, field: "kind" as const, value: values };
    }
  }

  return clause;
}

function migrateTypeMasqueradeFilters(
  filters: FilterClause[] | undefined,
): FilterClause[] | undefined {
  return filters?.map(migrateTypeMasqueradeClause);
}

function hasLegacyTypeExclude(filters: FilterClause[]): boolean {
  return filters.some(
    (f) =>
      f.field === "type" &&
      f.operator === "none_of" &&
      Array.isArray(f.value) &&
      ["adr", "decision"].every((value) => (f.value as string[]).includes(value)),
  );
}

function withActionableBoardFilters(view: SavedView): SavedView {
  if (view.id !== "status-board" || !view.columns) return view;

  const isFactoryShape =
    view.columns.length === 3 &&
    view.columns.every((column) => {
      const filters = column.filters ?? [];
      return filters.some((f) => f.field === "status");
    });

  if (!isFactoryShape) return view;

  const nextColumns = view.columns.map((column) => {
    const filters = column.filters ?? [];
    const hasKind = filters.some((f) => f.field === "kind");
    const hasLegacyExclude = hasLegacyTypeExclude(filters);
    if (hasKind && hasLegacyExclude) return column;
    return {
      ...column,
      filters: [
        ...filters,
        ...(hasKind
          ? []
          : [
              {
                id: `${column.id}-kind`,
                field: "kind",
                operator: "any_of",
                value: ACTIONABLE_KINDS,
              } satisfies FilterClause,
            ]),
        ...(hasLegacyExclude
          ? []
          : [
              {
                id: `${column.id}-type`,
                field: "type",
                operator: "none_of",
                value: LEGACY_NON_ACTIONABLE_TYPES,
              } satisfies FilterClause,
            ]),
      ],
    };
  });

  return {
    ...view,
    filterPresets: view.filterPresets ?? [],
    activePresetIds: view.activePresetIds ?? [],
    columns: nextColumns,
  };
}

function migrateViews(views: SavedView[]): SavedView[] {
  return views.map((view) => {
    const next: SavedView = {
      ...view,
      list: view.list
        ? { ...view.list, filters: migrateTypeMasqueradeFilters(view.list.filters) ?? [] }
        : view.list,
      columns: view.columns?.map((column) => ({
        ...column,
        filters: migrateTypeMasqueradeFilters(column.filters) ?? [],
      })),
      filterPresets: (view.filterPresets ?? []).map((preset) => ({
        ...preset,
        filters: migrateTypeMasqueradeFilters(preset.filters) ?? [],
      })),
      activePresetIds: view.activePresetIds ?? [],
    };
    return withActionableBoardFilters(next);
  });
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
      const base = parsed.length ? parsed : defaultViews();
      const migrated = migrateViews(base);
      if (JSON.stringify(base) !== JSON.stringify(migrated)) this.write(projectId, migrated);
      return migrated;
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
