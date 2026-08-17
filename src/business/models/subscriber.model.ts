import { Schema, model } from 'mongoose';

export interface ISubscriber {
  email: string;
}

const subscriberSchema = new Schema<ISubscriber>({
  email: { type: String, required: true, lowercase: true, unique: true },
});

// Una suscripción por persona: los avisos son sobre la paciente, no sobre un
// dominio suelto. El thread de entrega se resuelve al momento del envío (ver
// resolve-telegram-thread), así que acá no se guarda nada del canal.
export const Subscriber = model<ISubscriber>('Subscriber', subscriberSchema);
