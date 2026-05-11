import { useCallback } from "react";
import { useNavigate } from "@/hooks/use-navigate";
import { useProjectStore } from "@/stores/project-store";

interface MaiboardBridge {
  vscode?: { postMessage: (msg: unknown) => void };
}

declare global {
  interface Window {
    __MAIBOARD__?: MaiboardBridge;
  }
}

/**
 * Open a ticket detail. By default navigates in-place; with `{ newTab: true }`,
 * opens a new VS Code webview panel beside the current one (or `window.open`
 * for the standalone web app).
 *
 * The bridge path is gated on `window.__MAIBOARD__.vscode` so the standalone
 * Maiboard never accidentally posts to nothing.
 */
export function useOpenTicket() {
  const [, navigate] = useNavigate();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  return useCallback(
    (ticketId: string, options?: { newTab?: boolean; projectId?: string }) => {
      const pid = options?.projectId ?? activeProjectId;
      if (!pid) return;
      if (options?.newTab) {
        const bridge = window.__MAIBOARD__;
        if (bridge?.vscode) {
          bridge.vscode.postMessage({
            type: "maiboard.openTicketInNewTab",
            projectId: pid,
            ticketId,
          });
          return;
        }
        window.open(`/${pid}/ticket/${ticketId}`, "_blank", "noopener");
        return;
      }
      navigate(`/${pid}/ticket/${ticketId}`);
    },
    [activeProjectId, navigate],
  );
}
