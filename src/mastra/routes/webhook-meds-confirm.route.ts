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

            if (!result.ok) {
                if (result.reason === "not_found") {
                    return c.json({ ok: false, error: "run not found" }, 404);
                }
                if (result.reason === "not_suspended") {
                    return c.json({ ok: false, error: "run not suspended", status: result.status }, 409);
                }
                return c.json(
                    { ok: false, error: "unexpected step", suspendedStep: result.suspendedStep, expected: result.expected },
                    409,
                );
            }

            return c.json({ ok: true }, 200);
        }
    })
