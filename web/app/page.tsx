'use client'

import { AgentInterface, openuiChatLibrary } from '@openuidev/react-ui'
import { agUIAdapter, fetchLLM } from '@openuidev/react-headless'

const llm = fetchLLM({
    url: '/api/chat',
    streamAdapter: agUIAdapter(),
})

export default function Home() {
    return (
        <AgentInterface
            llm={llm}
            componentLibrary={openuiChatLibrary}
            agentName="Mostro"
            starters={[
                { displayText: '¿Cómo va el pedido de pañales de este mes?', prompt: '¿Cómo va el pedido de pañales de este mes?' },
                { displayText: '¿En qué paso está el reembolso?', prompt: '¿En qué paso está el reembolso de este mes?' },
                { displayText: '¿Llegaron las medicaciones?', prompt: '¿Llegaron las medicaciones de este mes?' },
            ]}
        />
    )
}
