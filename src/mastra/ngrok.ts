import ngrok from '@ngrok/ngrok';
import { appConfig } from './config/app.config';

export async function startNgrokTunnel(port: number) {
    const domain = appConfig.NGROK_DOMAIN;
    const listener = await ngrok.forward({
        addr: port,
        domain,
        authtoken: appConfig.NGROK_AUTHTOKEN,
    });
    console.log(`ngrok tunnel established at: ${listener.url()} -> localhost:${port}`);
}
