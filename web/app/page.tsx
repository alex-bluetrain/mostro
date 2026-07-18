'use client'

import { AgentInterface, ThemeProvider } from '@openuidev/react-ui'
import { agUIAdapter, fetchLLM } from '@openuidev/react-headless'
import { library } from '@/library'

const llm = fetchLLM({
    url: '/api/chat',
    streamAdapter: agUIAdapter(),
})

export default function Home() {
    return (
        <ThemeProvider mode="dark">
            <AgentInterface
                llm={llm}
                componentLibrary={library}
                agentName="Mostro"
                starters={[
                    { displayText: '¿Cómo va el pedido de pañales de este mes?', prompt: '¿Cómo va el pedido de pañales de este mes?' },
                    { displayText: '¿En qué paso está el reembolso?', prompt: '¿En qué paso está el reembolso de este mes?' },
                    { displayText: '¿Llegaron las medicaciones?', prompt: '¿Llegaron las medicaciones de este mes?' },
                ]}
            />
        </ThemeProvider>
    )
}
