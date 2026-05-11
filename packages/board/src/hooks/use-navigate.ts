import { useCallback } from "react";
import { useLocation } from "wouter";

/**
 * Drop-in replacement for wouter's useLocation navigate.
 *
 * Deliberately performs instant navigation. CSS View Transitions animate the
 * whole scroll container in VS Code webviews, which makes route changes feel
 * like vertical window scrolling instead of a direct page switch.
 */
export function useNavigate() {
  const [location, rawNavigate] = useLocation();

  const navigate = useCallback(
    (path: string) => {
      rawNavigate(path);
    },
    [rawNavigate],
  );

  return [location, navigate] as const;
}
