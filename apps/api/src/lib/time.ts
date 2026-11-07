/** 时间工具：数据库统一存 ISO8601 UTC 字符串 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(value: Date | number | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  return new Date(value).toISOString();
}

export function addMs(base: Date | string, ms: number): string {
  const time = typeof base === 'string' ? Date.parse(base) : base.getTime();
  return new Date(time + ms).toISOString();
}

export function addMinutes(base: Date | string, minutes: number): string {
  return addMs(base, minutes * 60_000);
}

export function addHours(base: Date | string, hours: number): string {
  return addMs(base, hours * 3_600_000);
}

export function addDays(base: Date | string, days: number): string {
  return addMs(base, days * 86_400_000);
}

/** 是否已过某个 ISO 时间点（now > at） */
export function isPast(value: string | null | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  return now > time;
}

export function secondsSince(value: string, now = Date.now()): number {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 0;
  return Math.floor((now - time) / 1000);
}

export function epochSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.floor(time / 1000) : null;
}

/** ISO 字符串字段的安全排序键（无值排最后） */
export function isoSortKey(value: string | null | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}
