import { useCallback } from "react";
import { useLocation } from "wouter";

type TransitionType = "crossfade" | "slide-up" | "slide-down";

/**
 * Navigate with CSS View Transitions.
 * Falls back to instant navigation if the API isn't available.
 */
function transitionNavigate(
  navigate: (path: string) => void,
  path: string,
  transition: TransitionType = "crossfade",
) {
  if (!document.startViewTransition) {
    navigate(path);
    return;
  }

  // Set transition type as data attribute so CSS can key off it
  document.documentElement.dataset.transition = transition;
  const vt = document.startViewTransition(() => {
    navigate(path);
  });
  vt.finished.then(() => {
    delete document.documentElement.dataset.transition;
  });
}

/**
 * Drop-in replacement for wouter's useLocation navigate.
 * Returns [location, navigate] — navigate wraps in view transitions.
 */
export function useNavigate() {
  const [location, rawNavigate] = useLocation();

  const navigate = useCallback(
    (path: string, transition?: TransitionType) => {
      // Auto-detect transition type from path changes
      const isEnteringDetail = path.includes("/ticket/") && !location.includes("/ticket/");
      const isLeavingDetail = !path.includes("/ticket/") && location.includes("/ticket/");

      const type =
        transition ??
        (isEnteringDetail ? "slide-up" : isLeavingDetail ? "slide-down" : "crossfade");

      transitionNavigate(rawNavigate, path, type);
    },
    [location, rawNavigate],
  );

  return [location, navigate] as const;
}
