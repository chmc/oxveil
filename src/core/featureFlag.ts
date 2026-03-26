export function shouldActivate(
  getConfig: (key: string) => unknown,
): boolean {
  return getConfig("experimental") === true;
}
