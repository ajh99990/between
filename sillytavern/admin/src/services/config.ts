import type { Book, Config, Role } from './types';
/** Preserve unedited fields, imported attribution, and the original optimistic version. */
export function replaceRole(config: Config, role: Role): Config {
  return { ...config, roles: config.roles.some(r => r.id === role.id) ? config.roles.map(r => r.id === role.id ? role : r) : [...config.roles, role] };
}
export function replaceBook(config: Config, book: Book): Config {
  return { ...config, books: config.books.some(b => b.id === book.id) ? config.books.map(b => b.id === book.id ? book : b) : [...config.books, book] };
}
export function removeBook(config: Config, id: string): Config { return { ...config, books: config.books.filter(b => b.id !== id), roles: config.roles.map(r => ({ ...r, bookIds: r.bookIds.filter(b => b !== id) })) }; }
export function newRole(): Role { return { id: crypto.randomUUID(), name: '', icon: '◇', tag: '', description: '', system: '', detail: '', greeting: '', persona: '', examples: '', world: '', keys: [], bookIds: [] }; }
export function newBook(): Book { return { id: crypto.randomUUID(), name: '', keys: [], content: '' }; }
