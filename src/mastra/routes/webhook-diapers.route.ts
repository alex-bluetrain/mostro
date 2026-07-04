import { registerApiRoute } from "@mastra/core/server";
import { confirmDiapersDate } from "../lib/diapers-run";

export const webhookDiapersRoute = registerApiRoute(
    "/webhooks/diapers",
    {
        method: "POST",
        handler: async (c) => {
            const mastra = c.get("mastra");
            const body = await c.req.json();
            const result = await confirmDiapersDate(mastra, body);
            console.log("/webhooks/diapers", JSON.stringify(result));
            return c.json({ ok: true }, 200);
        }
    })
