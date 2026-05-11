import { json } from "../http/json";
import { getProject } from "../projects/routes";
import { createView, deleteView, readViews, seedDefaultViews, updateView } from "./store";

export async function handleViewRoutes(
  req: Request,
  path: string,
  method: string,
): Promise<Response | null> {
  // GET/POST /api/projects/:id/views
  const viewsListMatch = path.match(/^\/api\/projects\/([^/]+)\/views$/);
  if (method === "GET" && viewsListMatch) {
    const projectId = viewsListMatch[1];
    if (!getProject(projectId)) return json({ error: "project not found" }, 404);
    seedDefaultViews(projectId);
    return json(readViews(projectId));
  }

  if (method === "POST" && viewsListMatch) {
    const projectId = viewsListMatch[1];
    if (!getProject(projectId)) return json({ error: "project not found" }, 404);
    const body = await req.json();
    const view = createView(projectId, body);
    return json(view, 201);
  }

  // PUT/DELETE /api/projects/:id/views/:viewId
  const viewDetailMatch = path.match(/^\/api\/projects\/([^/]+)\/views\/([^/]+)$/);
  if (method === "PUT" && viewDetailMatch) {
    const [, projectId, viewId] = viewDetailMatch;
    if (!getProject(projectId)) return json({ error: "project not found" }, 404);
    const body = await req.json();
    const updated = updateView(projectId, viewId, body);
    return updated ? json(updated) : json({ error: "view not found" }, 404);
  }

  if (method === "DELETE" && viewDetailMatch) {
    const [, projectId, viewId] = viewDetailMatch;
    if (!getProject(projectId)) return json({ error: "project not found" }, 404);
    return deleteView(projectId, viewId)
      ? json({ ok: true })
      : json({ error: "view not found" }, 404);
  }

  return null;
}
