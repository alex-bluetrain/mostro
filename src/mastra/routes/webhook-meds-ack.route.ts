import { registerApiRoute } from "@mastra/core/server";
import { acknowledgeMedsOrder } from "../lib/meds-run";

export const webhookMedsAckRoute = registerApiRoute(
    "/webhooks/meds/ack",
    {
        method: "POST",
        requiresAuth: false,
        handler: async (c) => {
            const mastra = c.get("mastra");
            const body = await c.req.json();

            if (!body?.yearMonth) {
                return c.json({ ok: false, error: "yearMonth (YYYY-MM) is required" }, 400);
            }

            const result = await acknowledgeMedsOrder(mastra, body.yearMonth);
            console.log("/webhooks/meds/ack", JSON.stringify(result));
            return c.json({ ok: true }, 200);
        }
    })
