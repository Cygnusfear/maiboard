import { useNavigate } from "@/hooks/use-navigate";
import { useProjectStore } from "@/stores/project-store";

interface TicketLinkProps {
  id: string;
  className?: string;
}

/**
 * Inline clickable ticket ID that navigates to the ticket detail view.
 */
export function TicketLink({ id, className = "" }: TicketLinkProps) {
  const [, navigate] = useNavigate();
  const { activeProjectId } = useProjectStore();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeProjectId) {
      navigate(`/${activeProjectId}/ticket/${id}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline font-mono text-blue-400 underline decoration-blue-400/30 underline-offset-2 transition-colors hover:text-blue-300 hover:decoration-blue-300/50 ${className}`}
    >
      {id}
    </button>
  );
}
