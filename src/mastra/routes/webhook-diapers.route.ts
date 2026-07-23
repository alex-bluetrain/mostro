import { registerApiRoute } from "@mastra/core/server";
import { confirmDiapersDate } from "../lib/diapers-run";

export const webhookDiapersRoute = registerApiRoute(
    "/webhooks/diapers",
    {
        method: "POST",
        requiresAuth: false,
        handler: async (c) => {
            const mastra = c.get("mastra");
            const body = await c.req.json();

            if (!body?.yearMonth) {
                return c.json({ ok: false, error: "yearMonth (YYYY-MM) is required" }, 400);
            }

            if (typeof body?.quantity !== "number") {
                return c.json({ ok: false, error: "quantity (number) is required" }, 400);
            }

            if (typeof body?.deliveryDate !== "string") {
                return c.json({ ok: false, error: "deliveryDate (string) is required" }, 400);
            }

            if (typeof body?.deliveryAddress !== "string") {
                return c.json({ ok: false, error: "deliveryAddress (string) is required" }, 400);
            }

            const result = await confirmDiapersDate(mastra, body);
            console.log("/webhooks/diapers", JSON.stringify(result));
            return c.json({ ok: true }, 200);
        }
    })
