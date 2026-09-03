const ORDER_KEY = "keyflow.runtime.commandOrder";

export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writePreference(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
export function readOrder(): string[] {
  try {
    const value: unknown = JSON.parse(readPreference(ORDER_KEY) ?? "[]");
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === "string"))]
      : [];
  } catch {
    return [];
  }
}
export function orderedCommands<T extends { id: string }>(items: T[], order = readOrder()): T[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...items].sort(
    (a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity),
  );
}
export function moveCommand(
  ids: string[],
  moving: string,
  target: string,
  after: boolean,
): string[] {
  if (moving === target || !ids.includes(moving) || !ids.includes(target)) return ids;
  const next = ids.filter((id) => id !== moving);
  next.splice(next.indexOf(target) + Number(after), 0, moving);
  return next;
}
export function saveOrder(ids: string[]): boolean {
  return writePreference(ORDER_KEY, JSON.stringify(ids));
}
