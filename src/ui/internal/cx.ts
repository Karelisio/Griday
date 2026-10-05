/** Assemble des noms de classes CSS en ignorant les valeurs vides. */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
