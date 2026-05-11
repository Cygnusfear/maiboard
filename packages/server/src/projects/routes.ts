import { addProject, hasTickets, readConfig, removeProject, reorderProjects } from "./config";
import { json } from "../http/json";

export function getProject(id: string) {
  return readConfig().projects.find((p) => p.id === id);
}

export async function handleProjectRoutes(
  req: Request,
  path: string,
  method: string,
): Promise<Response | null> {
  // GET /api/projects — lightweight, no ticket parsing
  if (method === "GET" && path === "/api/projects") {
    const { projects } = readConfig();
    return json(projects.map((p) => ({ id: p.id, name: p.name })));
  }

  // POST /api/projects — add a project { path: "/abs/path" }
  if (method === "POST" && path === "/api/projects") {
    const body = (await req.json()) as { path?: string };
    if (!body.path) return json({ error: "path required" }, 400);
    if (!hasTickets(body.path)) return json({ error: "not a git repository" }, 400);
    const entry = addProject(body.path);
    return json(entry, 201);
  }

  // PUT /api/projects/reorder — reorder projects { ids: ["id1", "id2", ...] }
  if (method === "PUT" && path === "/api/projects/reorder") {
    const body = (await req.json()) as { ids?: string[] };
    if (!body.ids || !Array.isArray(body.ids)) return json({ error: "ids array required" }, 400);
    const ok = reorderProjects(body.ids);
    return ok ? json({ ok: true }) : json({ error: "invalid ids" }, 400);
  }

  // DELETE /api/projects/:id — remove a project
  const deleteProjectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (method === "DELETE" && deleteProjectMatch) {
    const removed = removeProject(deleteProjectMatch[1]);
    return removed ? json({ ok: true }) : json({ error: "not found" }, 404);
  }

  return null;
}
