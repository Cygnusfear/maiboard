import { handleProjectRoutes } from "./projects/routes";
import { handleTicketRoutes } from "./tickets/routes";
import { handleViewRoutes } from "./views/routes";

export async function handleApi(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  return (
    (await handleProjectRoutes(req, path, method)) ??
    (await handleTicketRoutes(req, url, path, method)) ??
    (await handleViewRoutes(req, path, method))
  );
}
