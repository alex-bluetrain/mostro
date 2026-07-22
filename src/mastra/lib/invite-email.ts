import { Composio } from '@composio/core'
import { appConfig } from '../config/app.config'

export type InviteEmailParams = {
    to: string
    link: string
}

export function buildInviteEmail(params: InviteEmailParams): { subject: string; body: string } {
    return {
        subject: 'Invitación a Mostro',
        body: [
            '¡Hola!',
            '',
            'Te invitaron a Mostro, el asistente que ayuda con los pedidos de pañales, medicamentos y reintegros.',
            '',
            `Para arrancar, abrí este link y tocá "Iniciar" en Telegram: ${params.link}`,
            '',
            'La invitación vence en 7 días. Después de ese primer paso en Telegram vas a poder entrar también a la web con tu cuenta de Google.',
        ].join('\n'),
    }
}

let composioClient: Composio | undefined

function getComposio(): Composio | undefined {
    if (!appConfig.COMPOSIO_API_KEY) return undefined
    composioClient ??= new Composio({ apiKey: appConfig.COMPOSIO_API_KEY })
    return composioClient
}

// Devuelve ok:false en vez de lanzar: el invite ya quedó creado y el caller
// decide cómo degradar (link manual).
export async function sendInviteEmail(params: InviteEmailParams): Promise<{ ok: boolean; error?: string }> {
    const composio = getComposio()
    if (!composio) return { ok: false, error: 'COMPOSIO_API_KEY not configured' }
    const { subject, body } = buildInviteEmail(params)
    try {
        const result = await composio.tools.execute('GMAIL_SEND_EMAIL', {
            userId: appConfig.COMPOSIO_USER_ID,
            arguments: { recipient_email: params.to, subject, body },
        })
        if (!result.successful) return { ok: false, error: result.error ?? 'GMAIL_SEND_EMAIL failed' }
        return { ok: true }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
}
