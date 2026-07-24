import { registerApiRoute } from "@mastra/core/server";
import { confirmMedsDelivery } from "../lib/meds-run";

export const webhookMedsConfirmRoute = registerApiRoute(
    "/webhooks/meds/confirm",
    {
        method: "POST",
        requiresAuth: false,
        handler: async (c) => {
            const mastra = c.get("mastra");
            const body = await c.req.json();

            if (!body?.yearMonth || !body?.deliveryDate || !body?.deliveryAddress) {
                return c.json({ ok: false, error: "yearMonth, deliveryDate and deliveryAddress are required" }, 400);
            }

            const result = await confirmMedsDelivery(mastra, body);
            console.log("/webhooks/meds/confirm", JSON.stringify(result));
            return c.json({ ok: true }, 200);
        }
    })
