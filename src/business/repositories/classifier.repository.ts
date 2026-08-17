import { Classifier } from '../models/classifier.model';
import { ClassifierSnapshot, type ClassifierDomain } from '../models/classifier-snapshot.model';
import type { ClassificationRules } from '@lib/mail-classifier/classification-rules.type';

export class ClassifierRepository {
  // Lee el puntero (classifiers) y devuelve las reglas del snapshot activo. Se llama en
  // cada corrida del poll: sin cache, la fuente de verdad es siempre Mongo.
  //
  // Devuelve null si el dominio todavía no tiene reglas configuradas: es un estado
  // esperado (nadie las cargó aún) y el poll lo resuelve salteando la corrida. En cambio,
  // un puntero que apunta a un snapshot inexistente sí lanza: eso es corrupción de datos,
  // no falta de configuración, y esconderlo haría que los mails se procesen mal en silencio.
  async findActiveRules(domain: ClassifierDomain): Promise<ClassificationRules | null> {
    const pointer = await Classifier.findOne({ domain }).lean();
    if (!pointer) return null;

    const snapshot = await ClassifierSnapshot.findOne({ domain, version: pointer.version }).lean();
    if (!snapshot) {
      throw new Error(`[classifier] el puntero de "${domain}" apunta a la versión ${pointer.version} pero no existe ese snapshot`);
    }

    return snapshot.classification_rules;
  }

  // Chequea existencia del puntero sin traer el snapshot: lo usa el bootstrap del boot
  // para decidir si hay que seedear el dominio o dejarlo intacto.
  async hasActivePointer(domain: ClassifierDomain): Promise<boolean> {
    return (await Classifier.exists({ domain })) !== null;
  }

  // Inserta un snapshot nuevo (versión = max + 1) y mueve el puntero. Los snapshots son
  // inmutables: publicar cambios siempre crea una versión nueva.
  async publishSnapshot(input: {
    domain: ClassifierDomain;
    author: string;
    changelog: string;
    rules: ClassificationRules;
  }): Promise<number> {
    const { domain, author, changelog, rules } = input;
    const latest = await ClassifierSnapshot.findOne({ domain }).sort({ version: -1 }).lean();
    const version = (latest?.version ?? 0) + 1;

    await ClassifierSnapshot.create({ domain, version, author, changelog, classification_rules: rules });
    await Classifier.updateOne({ domain }, { $set: { version } }, { upsert: true });

    return version;
  }
}

export const classifierRepository = new ClassifierRepository();
