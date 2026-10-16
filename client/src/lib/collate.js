// A new array ordered by the name shown to the reader, in the reader's language; ties go by id.
export function sortByName(rows, nameOf, language) {
  const collator = new Intl.Collator(language, { sensitivity: 'base', numeric: true });
  return [...rows].sort((a, b) => collator.compare(nameOf(a), nameOf(b)) || a.id - b.id);
}
