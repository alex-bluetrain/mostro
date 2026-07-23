# Diseño: talle (M/G/XG) y traslado de `quantity` a la confirmación

Fecha: 2026-07-23

## Contexto

El flujo de pañales pide hoy al usuario **tipo de pañal** (`diaperType`, string libre) y
**cantidad** (`quantity`) al momento de iniciar la solicitud. Ambos datos se guardan en el
estado del workflow y `quantity` se reenvía a la farmacia por `DIAPERS_MESSAGING_URL`.

Dos problemas:

1. La cantidad no la define quien pide, la define la farmacia cuando confirma la entrega.
   Pedirla al inicio produce un dato inventado.
2. "Tipo de pañal" en realidad es el **talle**, con un conjunto acotado de valores.

## Objetivo

- El talle reemplaza al tipo de pañal, con valores fijos `M` (Mediano), `G` (Grande),
  `XG` (Extra Grande).
- `quantity` deja de pedirse en la solicitud y pasa a recibirse en la confirmación de la
  farmacia (webhook / resume del step `wait-diapers-confirmation`).

## Decisiones

- **Nombre del campo en código:** `size` (inglés, consistente con `quantity`,
  `deliveryDate`, `deliveryAddress`). El label "talle" es solo de cara al usuario/agente,
  vía descripciones.
- **Valores del talle:** enum `'M' | 'G' | 'XG'`. Se guarda el código corto; el significado
  (Mediano/Grande/Extra Grande) vive en las descripciones del tool y del agente.
- **`quantity` en la confirmación:** **requerida**. El webhook rechaza con 400 si falta,
  igual que hoy con `yearMonth`.
- **Body saliente a la farmacia:** pasa a `{ size }` (se elimina `quantity`, que ya no
  existe en ese momento).

## Cambio 1 — `diaperType` → `size` (enum M/G/XG)

| Archivo | Cambio |
| --- | --- |
| `schemas/request-diapers-input.schema.ts` | `diaperType: z.string()` → `size: z.enum(['M','G','XG'])` |
| `schemas/diapers-state.schema.ts` | `diaperType?: string` → `size: z.enum(['M','G','XG']).optional()` |
| `steps/request-diapers.step.ts` | `state.size` en vez de `diaperType`; body saliente `{ size: inputData.size }` |
| `steps/notify-diapers-confirmation.step.ts` | `state.diaperType` → `state.size` en `summary` y `payload` |
| `tools/diapers-request-tool.ts` | input `size: z.enum(['M','G','XG']).describe('Talle: M (Mediano), G (Grande), XG (Extra Grande)')` |
| `lib/diapers-run.ts` | `startDiapers` recibe `size` en lugar de `diaperType` |
| `agents/diapers-agent.ts` | Instrucción: pedir el **talle** (M/G/XG), ya no "tipo y cantidad" |

## Cambio 2 — `quantity` se mueve de la solicitud a la confirmación

**Se saca de la solicitud:**

- `schemas/request-diapers-input.schema.ts`: eliminar `quantity`.
- `tools/diapers-request-tool.ts`: eliminar `quantity` del input.
- `lib/diapers-run.ts`: eliminar `quantity` de la firma de `startDiapers` y de la llamada a
  `run.start`.
- `steps/request-diapers.step.ts`: dejar de escribir `state.quantity` y de mandar `quantity`
  en el body a la farmacia.

**Se agrega a la confirmación:**

- `schemas/wait-diapers-confirmation-resume.schema.ts`: agregar `quantity: z.number()`.
- `steps/wait-diapers-confirmation.step.ts`: escribir `quantity: resumeData.quantity` en el
  state junto a `deliveryDate` / `deliveryAddress`.
- `lib/diapers-run.ts`: `confirmDiapersDate` suma `quantity` al `resumeData`.
- `routes/webhook-diapers.route.ts`: validar que `quantity` esté presente (400 si falta).

**Se mantiene:** en `diapers-state.schema.ts`, `quantity?` permanece opcional (ahora se
puebla en la confirmación, no en la solicitud). El step `notify` ya lee `state.quantity`, así
que no requiere cambios por este eje.

## Flujo resultante

```
Solicitud (agente):  size (M/G/XG)  ──► farmacia { size }
                            │
Confirmación (webhook farmacia):  deliveryDate + deliveryAddress + quantity
                            │
Notificación a suscriptores:  size + quantity + fecha + dirección
```

## Fuera de alcance

- Identity / subscribers.
- Naming del resto de los campos del dominio.
- `diapers-flow.md` y docs de planes anteriores.
