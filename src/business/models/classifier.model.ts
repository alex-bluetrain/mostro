import { Schema, model } from 'mongoose';
import type { ClassifierDomain } from './classifier-snapshot.model';

// Puntero mutable: qué versión de classifier-snapshots está activa por dominio.
// Rollback = apuntar a una versión anterior.
export interface IClassifier {
  domain: ClassifierDomain;
  version: number;
}

const classifierSchema = new Schema<IClassifier>({
  domain: { type: String, enum: ['diapers', 'meds', 'refunds'], required: true, unique: true },
  version: { type: Number, required: true },
});

export const Classifier = model<IClassifier>('Classifier', classifierSchema, 'classifiers');
