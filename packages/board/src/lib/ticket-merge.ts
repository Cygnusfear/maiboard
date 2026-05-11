/**
 * 3-way merge for ticket bodies using diff-match-patch.
 *
 * Given:
 *   base   — the version both sides started from
 *   local  — user's edits on top of base
 *   remote — agent's edits on top of base
 *
 * Produces:
 *   merged text if patches apply cleanly, or null on conflict.
 *
 * Strategy: compute the user's patch (base→local), apply it on top
 * of remote. If all hunks apply → clean merge. If any fail → conflict.
 */

import DiffMatchPatch from "diff-match-patch";

const dmp = new DiffMatchPatch();

// Increase match threshold for fuzzy patch application
dmp.Match_Threshold = 0.6;
dmp.Patch_DeleteThreshold = 0.6;

export type MergeResult =
  | {
      ok: true;
      merged: string;
    }
  | {
      ok: false;
      local: string;
      remote: string;
    };

/**
 * 3-way merge: apply user's changes on top of the new remote version.
 */
export function mergeTicketBody(base: string, local: string, remote: string): MergeResult {
  // Trivial cases
  if (base === local) return { ok: true, merged: remote }; // user didn't edit
  if (base === remote) return { ok: true, merged: local }; // remote didn't change
  if (local === remote) return { ok: true, merged: local }; // both made same change

  // Compute user's patch: what did the user change from base?
  const userPatches = dmp.patch_make(base, local);

  // Apply user's patches on top of the remote version
  const [merged, results] = dmp.patch_apply(userPatches, remote);

  // Check if all patches applied successfully
  const allApplied = results.every((ok) => ok);

  if (allApplied) {
    return { ok: true, merged };
  }

  // Some patches failed — conflict
  return { ok: false, local, remote };
}
