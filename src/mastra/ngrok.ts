import ngrok from '@ngrok/ngrok';

export async function startNgrokTunnel(port: number) {
    const domain = process.env.NGROK_DOMAIN;
    const listener = await ngrok.forward({
        addr: port,
        domain,
        authtoken_from_env: true,
    });
    console.log(`ngrok tunnel established at: ${listener.url()} -> localhost:${port}`);
}
