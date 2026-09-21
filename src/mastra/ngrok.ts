import ngrok from '@ngrok/ngrok';
import { appConfig } from '@config/app.config';
import { appLogger } from './lib/app-logger';

export async function startNgrokTunnel() {
    const domain = appConfig.NGROK_DOMAIN;
    const addr = appConfig.NGROK_FORWARD_ADDR;
    if (!addr) {
        appLogger.warn('[ngrok] NGROK_FORWARD_ADDR no seteada, túnel no iniciado');
        return;
    }
    const listener = await ngrok.forward({
        addr,
        domain,
        authtoken: appConfig.NGROK_AUTHTOKEN,
    });
    appLogger.info(`ngrok tunnel established at: ${listener.url()} -> ${addr}`);
}
