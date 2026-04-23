/**
 * Returns a hello world greeting.
 * @param name - Optional name to greet. Defaults to "World".
 * @returns A greeting string.
 */
export function hello(name: string = "World"): string {
  return `Hello, ${name}!`;
}
