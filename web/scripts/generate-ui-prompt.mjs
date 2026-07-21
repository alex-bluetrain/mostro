// Genera src/generated/system-prompt.txt a partir de la openuiChatLibrary
// built-in de OpenUI (Card/Steps/Tag/TextCallout/ListBlock/etc.) — ya no de
// una library propia. Reemplaza al antiguo `openui generate src/library.tsx`.
//
// `@openuidev/react-ui/genui-lib` es un subpath sin CSS ni `'use client'` a
// nivel de módulo (verificado en node_modules), así que corre en Node plano
// sin necesitar el bundle de Next/React DOM del cliente.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { openuiChatLibrary, openuiChatPromptOptions } from '@openuidev/react-ui/genui-lib'

// Reglas de dominio Mostro: cómo representar los tres pedidos compartidos
// (pañales, medicación, reembolsos) con los componentes built-in de chat.
// Los tools get-diapers-status / get-meds-status / get-refunds-status
// devuelven el estado scopeado por mes (ver src/mastra/tools/*-get-status-tool.ts).
const mostroAdditionalRules = [
    'Domain: Mostro trackea tres pedidos compartidos de la familia — diapers (pañales), meds (medicación) y refunds (reembolsos), cada uno scopeado por mes. El estado viene de los tools get-diapers-status / get-meds-status / get-refunds-status.',
    'Para el estado actual de un pedido, usar TextCallout (o Tag) con variant "success"/"info"/"warning" según corresponda, no solo texto plano.',
    'Para el workflow de pasos suspend/resume de un pedido, usar Steps con un StepsItem por paso: title = nombre del paso, details = su estado en palabras ("Completado", "En curso ahora", "Pendiente"). Steps no tiene un campo booleano de estado — codificar el estado en `details`.',
    'Responder siempre en español.',
]

const mostroExamples = [
    'Example — saludo (sin pedido involucrado):\n\nroot = Card([greeting])\ngreeting = TextContent("¡Hola! ¿En qué puedo ayudarte?", "default")',
    'Example — estado de un pedido:\n\nroot = Card([status, steps])\nstatus = TextCallout("success", "Pedido de pañales — julio 2026", "Confirmado, esperando entrega")\nsteps = Steps([s1, s2, s3])\ns1 = StepsItem("Solicitado", "Completado")\ns2 = StepsItem("Confirmado por la farmacia", "Completado")\ns3 = StepsItem("En camino", "En curso ahora")',
]

const prompt = openuiChatLibrary.prompt({
    ...openuiChatPromptOptions,
    additionalRules: [...(openuiChatPromptOptions.additionalRules ?? []), ...mostroAdditionalRules],
    examples: [...(openuiChatPromptOptions.examples ?? []), ...mostroExamples],
})

const outPath = join(process.cwd(), 'src/generated/system-prompt.txt')
await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, prompt, 'utf-8')

console.log(`[generate-ui-prompt] wrote ${prompt.length} chars to ${outPath}`)
