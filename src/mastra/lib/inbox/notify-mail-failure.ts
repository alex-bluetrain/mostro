import { subscriberRepository } from '../../../business/repositories'
import { resolveTelegramThread } from '../resolve-telegram-thread'

export type MailFailure = {
    domain: 'diapers' | 'meds' | 'refunds'
    from: string
    subject: string
    reason: string
}

export type NotifyFailure = (mastra: unknown, failure: MailFailure) => Promise<number>

type SupervisorLike = {
    sendNotificationSignal: (signal: unknown, target: unknown) => Promise<unknown>
}
type MastraLike = { getAgent: (id: string) => SupervisorLike | undefined }

const DOMAIN_LABEL = {
    diapers: 'pañales',
    meds: 'medicamentos',
    refunds: 'reembolsos',
} as const

// getAgent lanza MastraError si la clave no está registrada, no devuelve undefined
// (node_modules/@mastra/core/dist/mastra/index.d.ts:667). Un aviso que no se puede
// entregar no debe romper el ciclo de polling: el mail ya quedó etiquetado.
function supervisorOf(mastra: unknown): SupervisorLike | undefined {
    try {
        return (mastra as MastraLike | undefined)?.getAgent('mostroSupervisor')
    } catch {
        return undefined
    }
}

export const notifyMailFailure: NotifyFailure = async (mastra, failure) => {
    const supervisor = supervisorOf(mastra)
    if (!supervisor) {
        console.warn('[notify-mail-failure] no supervisor available, skipping')
        return 0
    }

    const emails = await subscriberRepository.list(failure.domain)
    let sent = 0

    for (const email of emails) {
        const target = await resolveTelegramThread(mastra as never, email)
        if (!target) {
            console.warn(`[notify-mail-failure] no telegram thread for ${email}, skipping`)
            continue
        }

        // Sin el encuadre de aviso del sistema el supervisor interpreta la notificación
        // como una tarea e intenta actuar sobre ella en vez de reenviarla.
        await supervisor.sendNotificationSignal(
            {
                source: failure.domain,
                kind: 'mail-processing-failed',
                priority: 'high',
                summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: no pude procesar un mail de ${DOMAIN_LABEL[failure.domain]} enviado por ${failure.from} con asunto "${failure.subject}". Motivo: ${failure.reason}. Queda en espera; un admin puede pedirme que lo reintente.`,
                payload: {
                    from: failure.from,
                    subject: failure.subject,
                    reason: failure.reason,
                },
            },
            target,
        )
        sent++
    }

    return sent
}
