export function testType(obj: Record<string, unknown>) {
  if (typeof obj['name'] !== 'string' || obj['name'].trim() === '') {
    return false;
  }
  return true;
}
