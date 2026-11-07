import { useEffect, type ReactNode } from 'react';
import { friendlyError } from '../lib/api';
import type { BadgeKind } from '../lib/labels';
import type { LeaderboardEntry } from '../types';
import { fmtRate, initial } from '../lib/format';
import { Link } from 'react-router-dom';

/* ============================ 按钮 ============================ */
export function Btn({
  children,
  variant = 'default',
  size,
  block,
  loading,
  className = '',
  ...rest
}: {
  children: ReactNode;
  variant?: 'default' | 'primary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'lg';
  block?: boolean;
  loading?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [
    'btn',
    variant !== 'default' ? `btn-${variant}` : '',
    size ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} {...rest} disabled={rest.disabled || loading}>
      {loading ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : null}
      {children}
    </button>
  );
}

/* ============================ 卡片 ============================ */
export function Card({
  children,
  className = '',
  hoverable,
  flat,
  style,
}: {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
  flat?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`card${hoverable ? ' hoverable' : ''}${flat ? ' flat' : ''} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

export function CardHead({ title, extra }: { title: ReactNode; extra?: ReactNode }) {
  return (
    <div className="card-head">
      <div className="card-title">
        <span className="bar" />
        {title}
      </div>
      {extra ? <div className="row row-wrap">{extra}</div> : null}
    </div>
  );
}

export function SectionHead({
  title,
  desc,
  extra,
}: {
  title: ReactNode;
  desc?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2 className="section-title">{title}</h2>
        {desc ? <div className="section-desc">{desc}</div> : null}
      </div>
      {extra}
    </div>
  );
}

export function PageHead({
  title,
  desc,
  actions,
}: {
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {desc ? <div className="page-sub">{desc}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

/* ============================ 徽章 ============================ */
export function Badge({ children, kind = 'gray' }: { children: ReactNode; kind?: BadgeKind }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`stat-card${accent ? ' accent' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

/* ============================ 头像 / 段位 ============================ */
export function Avatar({
  src,
  name,
  size,
}: {
  src?: string | null;
  name?: string | null;
  size?: 'sm' | 'lg' | 'xl';
}) {
  const cls = `avatar${size ? ` ${size}` : ''}`;
  if (src) {
    return (
      <span className={cls} style={{ padding: 0, overflow: 'hidden' }}>
        <img
          src={src}
          alt={name ?? '头像'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      </span>
    );
  }
  return <span className={cls}>{initial(name)}</span>;
}

export function UserCell({
  name,
  sub,
  avatar,
  to,
  size,
}: {
  name?: string | null;
  sub?: ReactNode;
  avatar?: string | null;
  to?: string;
  size?: 'sm';
}) {
  const content = (
    <span className="avatar-wrap">
      <Avatar src={avatar} name={name} size={size} />
      <span className="avatar-name">
        <span className="n">{name || '未知用户'}</span>
        {sub ? <span className="s">{sub}</span> : null}
      </span>
    </span>
  );
  return to ? (
    <Link to={to} style={{ display: 'inline-flex', minWidth: 0 }}>
      {content}
    </Link>
  ) : (
    content
  );
}

export function TierChip({ tier }: { tier?: { name: string; color?: string } | null }) {
  if (!tier?.name) return <span className="dim">未定级</span>;
  const color = tier.color || '#8b5cf6';
  return (
    <span className="tier-chip" style={{ color }}>
      <span className="tier-dot" />
      {tier.name}
    </span>
  );
}

/* ============================ 状态展示 ============================ */
export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="state-box">
      <div className="spinner" />
      <div className="state-desc">{text}</div>
    </div>
  );
}

export function Empty({ text = '暂无数据', icon = '◇', extra }: { text?: ReactNode; icon?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="state-box">
      <div className="state-icon">{icon}</div>
      <div className="state-title">{text}</div>
      {extra ? <div className="state-desc">{extra}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state-box">
      <div className="state-icon">⚠</div>
      <div className="state-title">加载失败</div>
      <div className="state-desc">{friendlyError(error)}</div>
      {onRetry ? (
        <Btn size="sm" onClick={onRetry}>
          重试
        </Btn>
      ) : null}
    </div>
  );
}

export function Alert({
  children,
  kind = 'info',
}: {
  children: ReactNode;
  kind?: 'info' | 'warn' | 'danger' | 'ok';
}) {
  return (
    <div className={`alert alert-${kind}`}>
      <span className="alert-icon">{kind === 'ok' ? '✓' : kind === 'danger' ? '!' : kind === 'warn' ? '⚑' : 'i'}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  let text = '';
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return <pre className="json-block">{text || '（空）'}</pre>;
}

/* ============================ 表单 ============================ */
export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="label">
        {label}
        {required ? <span className="req">*</span> : null}
      </label>
      {children}
      {hint ? <div className="dim" style={{ fontSize: 11.5 }}>{hint}</div> : null}
    </div>
  );
}

export function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/* ============================ 模态框 ============================ */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="close-x" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ============================ 标签页 ============================ */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode; count?: number }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          className={`tab${value === it.value ? ' active' : ''}`}
          onClick={() => onChange(it.value)}
        >
          {it.label}
          {typeof it.count === 'number' ? <span className="dim" style={{ marginLeft: 6 }}>{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ============================ 分页 ============================ */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 20)));
  const current = Math.min(Math.max(1, page), totalPages);
  const pages: number[] = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i += 1) pages.push(i);

  return (
    <div className="pagination">
      <div className="dim" style={{ fontSize: 12.5 }}>
        共 <span className="counter">{total}</span> 条 · 第 <span className="counter">{current}</span> /{' '}
        <span className="counter">{totalPages}</span> 页
      </div>
      <div className="pager">
        <button onClick={() => onChange(1)} disabled={current <= 1} aria-label="首页">
          «
        </button>
        <button onClick={() => onChange(current - 1)} disabled={current <= 1} aria-label="上一页">
          ‹
        </button>
        {start > 1 ? <span className="dim">…</span> : null}
        {pages.map((p) => (
          <button key={p} className={p === current ? 'active' : ''} onClick={() => onChange(p)}>
            {p}
          </button>
        ))}
        {end < totalPages ? <span className="dim">…</span> : null}
        <button onClick={() => onChange(current + 1)} disabled={current >= totalPages} aria-label="下一页">
          ›
        </button>
        <button onClick={() => onChange(totalPages)} disabled={current >= totalPages} aria-label="末页">
          »
        </button>
      </div>
    </div>
  );
}

/* ============================ 数据表格（响应式） ============================ */
export interface Column<T> {
  key: string;
  title: ReactNode;
  render?: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** 移动端卡片是否展示，默认 true */
  mobile?: boolean;
  /** 移动端字段名 */
  mobileLabel?: string;
  width?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  items,
  rowKey,
  loading,
  error,
  onRetry,
  emptyText = '暂无数据',
  mobileTitle,
  mobileSub,
  footer,
  compact,
}: {
  columns: Column<T>[];
  items: T[];
  rowKey: (row: T, index: number) => string | number;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyText?: ReactNode;
  mobileTitle?: (row: T) => ReactNode;
  mobileSub?: (row: T) => ReactNode;
  footer?: ReactNode;
  compact?: boolean;
}) {
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!items.length) return <Empty text={emptyText} />;

  const mobileCols = columns.filter((c) => c.mobile !== false);

  return (
    <>
      <div className="table-wrap responsive-table">
        <table className={`table${compact ? ' table-compact' : ''}`}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.align ? c.align : undefined} style={c.width ? { width: c.width } : undefined}>
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={rowKey(row, i)}>
                {columns.map((c) => (
                  <td key={c.key} className={`${c.align ?? ''} ${c.className ?? ''}`.trim() || undefined}>
                    {c.render ? c.render(row, i) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="m-card-list">
        {items.map((row, i) => (
          <div className="m-card" key={`m-${rowKey(row, i)}`}>
            <div className="m-card-top">
              <div className="m-card-title">{mobileTitle ? mobileTitle(row) : String(i + 1)}</div>
              {mobileSub ? <div className="dim" style={{ fontSize: 11.5 }}>{mobileSub(row)}</div> : null}
            </div>
            <div className="m-card-rows">
              {mobileCols.map((c) => {
                const value = c.render ? c.render(row, i) : String((row as Record<string, unknown>)[c.key] ?? '—');
                return (
                  <div className="m-card-row" key={c.key}>
                    <span className="k">{c.mobileLabel ?? c.title}</span>
                    <span className="v">{value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {footer}
    </>
  );
}

/* ============================ 排行榜领奖台 ============================ */
export function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const top = entries.slice(0, 3);
  if (!top.length) return null;
  const order = [1, 0, 2]; // 中间第一
  return (
    <div className="podium">
      {order.map((idx) => {
        const e = top[idx];
        if (!e) return <div key={idx} />;
        const place = idx + 1;
        return (
          <Link key={e.userId} to={`/players/${e.userId}`} className={`podium-card place-${place}`}>
            <div className="podium-rank">NO.{place}</div>
            <Avatar src={e.avatar} name={e.nickname} size="lg" />
            <div className="podium-name">{e.nickname || e.username || `玩家 ${e.userId}`}</div>
            <div className="podium-points">{e.points ?? 0}</div>
            <div className="podium-meta">
              <span>胜率 {fmtRate(e.winRate)}</span>
              <span>击杀 {e.kills ?? 0}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function RankMedal({ rank }: { rank?: number | null }) {
  if (!rank) return <span className="rank-no">—</span>;
  const cls = rank === 1 ? 'g1' : rank === 2 ? 'g2' : rank === 3 ? 'g3' : '';
  return <span className={`rank-medal ${cls}`}>{rank}</span>;
}

/* ============================ 其它 ============================ */
export function ProgressRow({
  label,
  value,
  percent,
}: {
  label: ReactNode;
  value: ReactNode;
  percent: number;
}) {
  return (
    <div className="progress-row">
      <div className="row-between">
        <span className="dim" style={{ fontSize: 12 }}>
          {label}
        </span>
        <span className="counter" style={{ fontSize: 12.5 }}>
          {value}
        </span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  );
}

export function KV({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{label}</span>
      <span className="v">{children}</span>
    </div>
  );
}
