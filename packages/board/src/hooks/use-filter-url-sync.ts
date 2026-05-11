/**
 * Bidirectional sync: filter/sort/group state ↔ URL search params.
 *
 * Encoding (compact, human-readable):
 *   sf=priority  sd=asc  g=status
 *   f=status.any_of.open,in_progress~tag.any_of.bug
 *
 * - On filter/sort/group change → replaceState (no new history entry)
 * - On mount with params → restore into filter store
 * - On popstate (back/forward) → restore from URL
 */

import { useEffect, useRef } from "react";
import { useFilterStore } from "@/stores/filter-store";
import type { FilterClause, FilterField, FilterOperator } from "@/lib/filter-engine";
import type { GroupField } from "@/lib/group-engine";
import type { SortField, SortDir } from "@/lib/types";

// ── Serialize ─────────────────────────────────────────────────

function serializeFilters(filters: FilterClause[]): string {
  return filters
    .map((f) => {
      const val = Array.isArray(f.value)
        ? (f.value as string[]).map((v) => encodeURIComponent(String(v))).join(",")
        : encodeURIComponent(String(f.value));
      return `${f.field}.${f.operator}.${val}`;
    })
    .join("~");
}

function serializeToParams(state: {
  filters: FilterClause[];
  sortField: SortField;
  sortDir: SortDir;
  groupBy: GroupField | null;
}): URLSearchParams {
  const p = new URLSearchParams();
  if (state.filters.length > 0) p.set("f", serializeFilters(state.filters));
  if (state.sortField !== "priority") p.set("sf", state.sortField);
  if (state.sortDir !== "asc") p.set("sd", state.sortDir);
  if (state.groupBy) p.set("g", state.groupBy);
  return p;
}

// ── Deserialize ───────────────────────────────────────────────

let _parseId = 0;

function deserializeFilters(raw: string): FilterClause[] {
  if (!raw) return [];
  return raw
    .split("~")
    .map((chunk) => {
      const dotIdx1 = chunk.indexOf(".");
      const dotIdx2 = chunk.indexOf(".", dotIdx1 + 1);
      if (dotIdx1 === -1 || dotIdx2 === -1) return null;

      const field = chunk.slice(0, dotIdx1) as FilterField;
      const operator = chunk.slice(dotIdx1 + 1, dotIdx2) as FilterOperator;
      const rawVal = chunk.slice(dotIdx2 + 1);

      // Determine value type based on operator
      let value: FilterClause["value"];
      if (operator === "any_of" || operator === "none_of") {
        value = rawVal
          .split(",")
          .map((v) => decodeURIComponent(v))
          .filter(Boolean);
      } else if (operator === "between") {
        const parts = rawVal.split(",").map((v) => decodeURIComponent(v));
        value = [parts[0] ?? "", parts[1] ?? ""] as [string, string];
      } else if (
        operator === "last_n_days" ||
        operator === "older_than" ||
        operator === "newer_than"
      ) {
        value = Number(rawVal) || 30;
      } else if (operator === "is_empty" || operator === "is_not_empty") {
        value = "";
      } else {
        value = decodeURIComponent(rawVal);
      }

      return { id: `url-${++_parseId}`, field, operator, value } as FilterClause;
    })
    .filter((c): c is FilterClause => c !== null);
}

function deserializeFromParams(params: URLSearchParams): {
  filters: FilterClause[];
  sortField: SortField;
  sortDir: SortDir;
  groupBy: GroupField | null;
} | null {
  // Only restore if there are filter-related params
  if (!params.has("f") && !params.has("sf") && !params.has("sd") && !params.has("g")) {
    return null;
  }

  return {
    filters: deserializeFilters(params.get("f") ?? ""),
    sortField: (params.get("sf") as SortField) ?? "priority",
    sortDir: (params.get("sd") as SortDir) ?? "asc",
    groupBy: (params.get("g") as GroupField) ?? null,
  };
}

// ── Hook ──────────────────────────────────────────────────────

export function useFilterUrlSync() {
  const suppressWrite = useRef(false);

  // On mount: if URL has filter params, restore them
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = deserializeFromParams(params);
    if (state) {
      suppressWrite.current = true;
      useFilterStore.setState(state);
      // Allow writes again after this render cycle
      requestAnimationFrame(() => {
        suppressWrite.current = false;
      });
    }
  }, []);

  // On popstate (back/forward): restore from URL
  useEffect(() => {
    function onPopstate() {
      const params = new URLSearchParams(window.location.search);
      const state = deserializeFromParams(params);
      if (state) {
        suppressWrite.current = true;
        useFilterStore.setState(state);
        requestAnimationFrame(() => {
          suppressWrite.current = false;
        });
      }
    }
    window.addEventListener("popstate", onPopstate);
    return () => window.removeEventListener("popstate", onPopstate);
  }, []);

  // On filter/sort/group change: update URL (replaceState)
  useEffect(() => {
    const unsub = useFilterStore.subscribe((state) => {
      if (suppressWrite.current) return;

      const params = serializeToParams(state);
      const search = params.toString();
      const url = window.location.pathname + (search ? `?${search}` : "");

      // Only update if actually different
      if (url !== window.location.pathname + window.location.search) {
        window.history.replaceState(window.history.state, "", url);
      }
    });
    return unsub;
  }, []);
}

/** Check if the current URL has filter params */
export function hasUrlFilterParams(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has("f") || params.has("sf") || params.has("sd") || params.has("g");
}
