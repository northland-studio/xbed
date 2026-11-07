/** 格式化工具：时间 / 数字 / 比率 / 文件体积 */

type DateLike = string | number | Date | null | undefined;

const pad = (n: number) => String(n).padStart(2, '0');

function toDate(value: DateLike): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const d =
    value instanceof Date
      ? value
      : typeof value === 'number'
        ? new Date(value * (value < 1e12 ? 1000 : 1))
        : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(value: DateLike): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDateTime(value: DateLike): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtTime(value: DateLike): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtMonthDay(value: DateLike): { day: string; month: string } {
  const d = toDate(value);
  if (!d) return { day: '--', month: '--' };
  return { day: pad(d.getDate()), month: `${pad(d.getMonth() + 1)}月` };
}

export function fmtRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return '时间待定';
  return `${fmtDate(start)} ~ ${fmtDate(end)}`;
}

/** 相对时间：3 分钟前 / 2 小时前 / 3 天前 */
export function fromNow(value: DateLike): string {
  const d = toDate(value);
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const suffix = future ? '后' : '前';
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) return '刚刚';
  if (abs < hour) return `${Math.floor(abs / min)} 分钟${suffix}`;
  if (abs < day) return `${Math.floor(abs / hour)} 小时${suffix}`;
  if (abs < 30 * day) return `${Math.floor(abs / day)} 天${suffix}`;
  return fmtDate(d);
}

/** 倒计时文案：剩余 12 分 30 秒 / 已截止 */
export function countdown(deadline?: string | null): string {
  const d = toDate(deadline);
  if (!d) return '—';
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return '已截止';
  const total = Math.floor(diff / 1000);
  const day = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (day > 0) return `剩余 ${day} 天 ${h} 小时`;
  if (h > 0) return `剩余 ${h} 小时 ${m} 分`;
  return `剩余 ${m} 分 ${s} 秒`;
}

export function isPast(value?: string | null): boolean {
  const d = toDate(value);
  return !!d && d.getTime() < Date.now();
}

export function fmtNum(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return value.toLocaleString('zh-CN');
}

export function fmtDelta(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return value > 0 ? `+${value}` : String(value);
}

/**
 * 胜率：后端可能返回 0~1 的小数或 0~100 的百分数，统一按 0~1 优先处理
 */
export function fmtRate(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}

export function rateValue(value?: number | null): number {
  if (value === undefined || value === null || Number.isNaN(value)) return 0;
  return value <= 1 ? value * 100 : value;
}

export function fmtBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

export function fmtDuration(ms?: number | null): string {
  if (!ms || ms < 0) return '—';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin} 分钟`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return `${h} 小时${m ? ` ${m} 分` : ''}`;
  return `${Math.floor(h / 24)} 天`;
}

/** 比赛时长：从开始到结束 */
export function matchDuration(start?: string | null, end?: string | null): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return '—';
  return fmtDuration(e.getTime() - s.getTime());
}

export function initial(name?: string | null): string {
  if (!name) return '?';
  return name.trim().slice(0, 1).toUpperCase();
}

export function toDateInput(value?: string | null): string {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toDateTimeInput(value?: string | null): string {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** date/datetime input → ISO 字符串 */
export function fromInput(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
