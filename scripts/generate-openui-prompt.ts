// Genera el system prompt de OpenUI Lang a un módulo TS.
//
// Emitimos .ts y no .txt a propósito: `mastra build` bundlea el server y no
// copia assets sueltos, así que un readFileSync en runtime se rompería en
// producción. Como módulo, el prompt viaja dentro del bundle.
//
// Correr después de tocar la library: `pnpm generate:openui-prompt`.
import { writeFileSync } from 'node:fs'
import { openuiChatLibrary, openuiChatPromptOptions } from '@openuidev/react-ui/genui-lib'

const OUT = 'src/mastra/generated/openui-system-prompt.ts'

const prompt = openuiChatLibrary.prompt(openuiChatPromptOptions)

if (!prompt.includes('openui-lang')) {
    throw new Error('El prompt generado no menciona openui-lang: revisá la library antes de commitear.')
}

const file = `// GENERADO por scripts/generate-openui-prompt.ts — no editar a mano.
// Regenerar con: pnpm generate:openui-prompt
export const OPENUI_SYSTEM_PROMPT = ${JSON.stringify(prompt)}
`

writeFileSync(OUT, file)
console.log(`Escrito ${OUT} (${prompt.length} bytes de prompt)`)
