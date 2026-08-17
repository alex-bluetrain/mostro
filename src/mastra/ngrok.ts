import ngrok from '@ngrok/ngrok';
import { appConfig } from '@config/app.config';
import { appLogger } from './lib/app-logger';

export async function startNgrokTunnel(port: number) {
    const domain = appConfig.NGROK_DOMAIN;
    const listener = await ngrok.forward({
        addr: port,
        domain,
        authtoken: appConfig.NGROK_AUTHTOKEN,
    });
    appLogger.info(`ngrok tunnel established at: ${listener.url()} -> localhost:${port}`);
}
