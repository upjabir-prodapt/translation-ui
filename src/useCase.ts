/**
 * The one vertical this app serves. Everything else in `src/` reads it from
 * here, so the folder name appears in exactly one import.
 *
 * `src/usecases/translation/**` and `src/usecases/base.ts` are copied unchanged
 * from the hub; keep them that way so a fix can move between the two by copy.
 */
export { manifest as useCase } from './usecases/translation/manifest';
