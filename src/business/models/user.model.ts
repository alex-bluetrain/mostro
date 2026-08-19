import { Schema, model } from 'mongoose';

// Las preferencias viven embebidas en el user y no en una collection aparte:
// son atributos de la persona, no entidades con vida propia. Un solo documento
// por identidad evita joins y desincronización (ver scripts/migrate-subscribers.ts).
export interface IUserPreferences {
  notifications: boolean;
}

export interface IUser {
  email: string;
  name: string;
  role: 'admin' | 'member';
  telegramId?: string;
  addedAt: number;
  preferences: IUserPreferences;
}

const userPreferencesSchema = new Schema<IUserPreferences>(
  {
    notifications: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true },
  name: { type: String, default: '' },
  role: { type: String, enum: ['admin', 'member'], required: true },
  telegramId: { type: String, unique: true, sparse: true },
  addedAt: { type: Number, required: true },
  preferences: { type: userPreferencesSchema, default: () => ({}) },
});

export const User = model<IUser>('User', userSchema);
