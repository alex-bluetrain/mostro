import type { ReactNode } from 'react'
import '@openuidev/react-ui/components.css'
import '@openuidev/react-ui/styles/index.css'

export const metadata = {
    title: 'Mostro',
    description: 'Pedidos compartidos de la familia — pañales, medicación y reembolsos',
}

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="es">
            <body>{children}</body>
        </html>
    )
}
