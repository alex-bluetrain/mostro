// Script one-time: obtiene el refresh token de la cuenta de Gmail de Mostro.
// Uso: pnpm run gmail:auth
import http from 'node:http'
import { auth } from '@googleapis/gmail'

const PORT = 53682
// 127.0.0.1 y no localhost: en Windows localhost resuelve primero a ::1, y el server escucha
// solo en IPv4, así que el navegador se comería un connection refused al volver del consent.
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'

const clientId = process.env.GMAIL_MAILER_CLIENT_ID
const clientSecret = process.env.GMAIL_MAILER_CLIENT_SECRET

if (!clientId || !clientSecret) {
    console.error('Faltan GMAIL_MAILER_CLIENT_ID y/o GMAIL_MAILER_CLIENT_SECRET en el .env')
    process.exit(1)
}

const oauth2 = new auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

// prompt: 'consent' fuerza que Google devuelva un refresh token aunque la cuenta
// ya haya autorizado la app antes.
const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [SCOPE],
})

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)

    if (url.pathname !== '/oauth2callback') {
        res.writeHead(404)
        res.end()
        return
    }

    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (!code) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Faltó el parámetro code.')

        if (error) {
            console.error(`\nGoogle rechazó la solicitud: ${error}`)
        } else {
            console.error('\nNo se recibió código de autorización.')
        }
        server.close()
        return
    }

    try {
        const { tokens } = await oauth2.getToken(code)
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Listo. Volvé a la terminal.')

        if (tokens.refresh_token) {
            console.log('\nPegá esto en tu .env:\n')
            console.log(`GMAIL_MAILER_REFRESH_TOKEN=${tokens.refresh_token}`)
        } else {
            console.error('\nGoogle no devolvió refresh token. Revocá el acceso de la app en')
            console.error('https://myaccount.google.com/permissions y volvé a correr el script.')
        }
    } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Falló el intercambio del code.')
        console.error(error)
    } finally {
        server.close()
    }
})

// Solo loopback: el código de autorización no debe poder llegar por la LAN.
server.listen(PORT, '127.0.0.1', () => {
    console.log('Abrí esta URL con la cuenta de Gmail de Mostro:\n')
    console.log(authUrl)
    console.log('\nEsperando el callback...')
})
