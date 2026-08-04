import { Schema, model } from 'mongoose';
import type { ClassificationRules } from '@lib/mail-classifier/classification-rules.type';

export type ClassifierDomain = 'diapers' | 'meds' | 'refunds';

// Snapshot inmutable y versionado de las reglas de clasificación de un dominio.
// Nunca se edita ni se borra: publicar cambios = insertar una versión nueva y
// mover el puntero (ver classifier.model.ts).
export interface IClassifierSnapshot {
  domain: ClassifierDomain;
  version: number;
  author: string;
  changelog: string;
  classification_rules: ClassificationRules;
}

const classifierSnapshotSchema = new Schema<IClassifierSnapshot>({
  domain: { type: String, enum: ['diapers', 'meds', 'refunds'], required: true },
  version: { type: Number, required: true },
  author: { type: String, required: true },
  changelog: { type: String, required: true },
  classification_rules: { type: Schema.Types.Mixed, required: true },
});

classifierSnapshotSchema.index({ domain: 1, version: 1 }, { unique: true });

export const ClassifierSnapshot = model<IClassifierSnapshot>(
  'ClassifierSnapshot',
  classifierSnapshotSchema,
  'classifier-snapshots',
);
