import { z } from 'zod/v4'
import { createLibrary, defineComponent, useRenderNode } from '@openuidev/react-lang'

const statusCardProps = z.object({
    domain: z.enum(['diapers', 'meds', 'refunds']).describe('Qué pedido compartido representa esta tarjeta.'),
    title: z.string().describe('Título corto, ej. "Pedido de pañales — julio 2026".'),
    statusLabel: z.string().describe('Estado actual en lenguaje natural, ej. "Confirmado, esperando entrega".'),
    fields: z
        .array(
            z.object({
                label: z.string(),
                value: z.string(),
            }),
        )
        .optional()
        .describe('Pares label/value con los datos relevantes del pedido (tipo, cantidad, fecha, monto, referencia, etc).'),
})

export const StatusCard = defineComponent({
    name: 'StatusCard',
    description:
        'Tarjeta de estado para un pedido compartido (pañales, medicación o reembolsos). Usar en vez de una frase de texto cuando el usuario pregunta por el estado de un pedido.',
    props: statusCardProps,
    component: ({ props }) => {
        const { title, statusLabel, fields } = props
        return (
            <div className="mostro-status-card">
                <div className="mostro-status-card__title">{title}</div>
                <div className="mostro-status-card__status">{statusLabel}</div>
                {fields && fields.length > 0 && (
                    <dl className="mostro-status-card__fields">
                        {fields.map((field) => (
                            <div key={field.label} className="mostro-status-card__field">
                                <dt>{field.label}</dt>
                                <dd>{field.value}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </div>
        )
    },
})

const timelineProps = z.object({
    domain: z.enum(['diapers', 'meds', 'refunds']),
    steps: z
        .array(
            z.object({
                label: z.string().describe('Nombre del paso en español, ej. "Confirmado por la farmacia".'),
                timestamp: z
                    .string()
                    .optional()
                    .describe(
                        'Fecha/hora del paso en texto legible, ej. "25 jun 2026, 18:30", si el tool de get-status la devolvió (requestedAt, notifiedAt, deliveryDate, etc). Omitir si no hay dato.',
                    ),
                done: z.boolean().describe('true si el paso ya se completó.'),
                current: z.boolean().describe('true si este es el paso en el que está el pedido ahora mismo.'),
            }),
        )
        .describe(
            'Los pasos del workflow del dominio, en orden. El modelo debe calcular done/current a partir del status devuelto por el tool de get-status correspondiente.',
        ),
})

export const Timeline = defineComponent({
    name: 'Timeline',
    description:
        'Línea de tiempo de los pasos suspend/resume de un pedido compartido (pañales, medicación o reembolsos). Usar junto a StatusCard cuando el usuario pregunta en qué paso está el pedido.',
    props: timelineProps,
    component: ({ props }) => {
        const { steps } = props
        return (
            <ol className="mostro-timeline">
                {steps.map((step, index) => (
                    <li
                        key={`${step.label}-${index}`}
                        className={[
                            'mostro-timeline__step',
                            step.done ? 'mostro-timeline__step--done' : '',
                            step.current ? 'mostro-timeline__step--current' : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        <span className="mostro-timeline__time">{step.timestamp}</span>
                        <span className="mostro-timeline__marker" aria-hidden="true" />
                        <span className="mostro-timeline__label">{step.label}</span>
                    </li>
                ))}
            </ol>
        )
    },
})

const textProps = z.object({
    text: z.string().describe('Texto de respuesta en lenguaje natural (saludos, aclaraciones, cualquier cosa que no sea el estado de un pedido).'),
})

export const Text = defineComponent({
    name: 'Text',
    description:
        'Respuesta de texto simple para conversación general (saludos, preguntas fuera de los pedidos compartidos, aclaraciones). Usar como root cuando StatusCard/Timeline no aplican.',
    props: textProps,
    component: ({ props }) => <p className="mostro-text">{props.text}</p>,
})

const groupProps = z.object({
    children: z
        .array(z.union([statusCardProps, timelineProps, textProps]))
        .describe('Uno o más StatusCard/Timeline/Text para mostrar juntos en una sola respuesta.'),
})

export const Group = defineComponent({
    name: 'Group',
    description:
        'Contenedor vertical simple para combinar una StatusCard y un Timeline (o varias) en una sola respuesta. Usar como root cuando se quiere mostrar el estado y la línea de tiempo juntos.',
    props: groupProps,
    component: ({ props }) => {
        const renderNode = useRenderNode()
        return (
            <div className="mostro-group">
                {props.children.map((child, index) => (
                    <div key={index} className="mostro-group__item">
                        {renderNode(child)}
                    </div>
                ))}
            </div>
        )
    },
})

export const library = createLibrary({
    components: [StatusCard, Timeline, Group, Text],
})

export const promptOptions = {
    additionalRules: [
        'This library has NO component literally named "Root". The generic "root = Root(...)" text shown in the syntax rules above is only a PLACEHOLDER for "root = <some component call>" — always replace Root with one of the actual registered components (Text, StatusCard, Timeline, or Group).',
        'For plain conversation (greetings, clarifications, anything that is not about a shared order status), use Text as root — never leave root undefined and never invent a component name.',
    ],
    examples: [
        'Example — greeting (no order status involved):\n\nroot = Text("¡Hola! ¿En qué puedo ayudarte?")',
        'Example — order status:\n\nroot = StatusCard("diapers", "Pedido de pañales — julio 2026", "Confirmado, esperando entrega", [f1, f2])\nf1 = {label: "Tipo", value: "Talle 3"}\nf2 = {label: "Fecha de entrega", value: "20/07/2026"}',
    ],
}
