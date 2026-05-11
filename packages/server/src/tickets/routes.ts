import { json } from "../http/json";
import { getProject } from "../projects/routes";
import { getTicketDetail, listTickets } from "./parser";
import { updateTicket, type TicketUpdate } from "./writer";

export async function handleTicketRoutes(
  req: Request,
  url: URL,
  path: string,
  method: string,
): Promise<Response | null> {
  // GET /api/projects/:id/tickets
  const ticketListMatch = path.match(/^\/api\/projects\/([^/]+)\/tickets$/);
  if (method === "GET" && ticketListMatch) {
    const project = getProject(ticketListMatch[1]);
    if (!project) return json({ error: "project not found" }, 404);

    let tickets = await listTickets(project.path, project.id);

    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");
    const tag = url.searchParams.get("tag");

    if (status) tickets = tickets.filter((t) => t.status === status);
    if (priority) tickets = tickets.filter((t) => t.priority === Number(priority));
    if (tag) tickets = tickets.filter((t) => Array.isArray(t.tags) && t.tags.includes(tag));

    const sort = url.searchParams.get("sort") || "priority";
    const dir = url.searchParams.get("dir") === "desc" ? -1 : 1;
    tickets.sort((a, b) => {
      if (sort === "priority") return (a.priority - b.priority) * dir;
      if (sort === "created") return a.created.localeCompare(b.created) * dir;
      if (sort === "modified") return a.modified.localeCompare(b.modified) * dir;
      if (sort === "title") return a.title.localeCompare(b.title) * dir;
      if (sort === "status") return a.status.localeCompare(b.status) * dir;
      return 0;
    });

    return json(tickets);
  }

  // GET/PATCH /api/projects/:id/tickets/:tid
  const ticketDetailMatch = path.match(/^\/api\/projects\/([^/]+)\/tickets\/([^/]+)$/);
  if (method === "GET" && ticketDetailMatch) {
    const project = getProject(ticketDetailMatch[1]);
    if (!project) return json({ error: "project not found" }, 404);

    const ticket = await getTicketDetail(project.path, project.id, ticketDetailMatch[2]);
    if (!ticket) return json({ error: "ticket not found" }, 404);

    return json(ticket);
  }

  if (method === "PATCH" && ticketDetailMatch) {
    const project = getProject(ticketDetailMatch[1]);
    if (!project) return json({ error: "project not found" }, 404);

    const update: TicketUpdate = await req.json();
    const success = await updateTicket(project.path, ticketDetailMatch[2], update);

    if (!success) return json({ error: "update failed" }, 500);
    return json({ ok: true });
  }

  return null;
}
