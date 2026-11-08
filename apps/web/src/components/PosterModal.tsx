import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn, Modal } from './ui';
import { loadPlayerSkin } from '../lib/skin';

export interface PosterData {
  nickname: string;
  gameId?: string | null;
  username?: string | null;
  seasonName?: string | null;
  tierName?: string | null;
  tierColor?: string | null;
  points?: number | null;
  rank?: number | null;
  matches?: number;
  wins?: number;
  winRate?: number | null;
  kills?: number;
  deaths?: number;
  bedsBroken?: number;
  bestStreak?: number;
  maxKills?: number;
}

const W = 1080;
const H = 1920;

/** 在 canvas 上以正面视角绘制 64x64 Minecraft 皮肤 */
function drawSkinFront(ctx: CanvasRenderingContext2D, skin: HTMLImageElement | null, cx: number, top: number, unit: number) {
  const part = (
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) => {
    if (!skin) return;
    ctx.drawImage(skin, sx, sy, sw, sh, dx, dy, dw, dh);
  };

  // 默认 Steve 配色（无皮肤时）
  const fallback = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  const headW = 8 * unit;
  const headH = 8 * unit;
  const bodyW = 8 * unit;
  const bodyH = 12 * unit;
  const armW = 4 * unit;
  const armH = 12 * unit;
  const legW = 4 * unit;
  const legH = 12 * unit;

  const headX = cx - headW / 2;
  const bodyX = cx - bodyW / 2;
  const bodyY = top + headH;
  const legY = bodyY + bodyH;
  const armY = bodyY;

  if (skin) {
    // 腿
    part(4, 20, 4, 12, bodyX, legY, legW, legH);
    part(20, 52, 4, 12, bodyX + legW, legY, legW, legH);
    // 身体
    part(20, 20, 8, 12, bodyX, bodyY, bodyW, bodyH);
    // 手臂（左右镜像）
    ctx.save();
    ctx.translate(bodyX, armY);
    ctx.scale(-1, 1);
    part(44, 20, 4, 12, -armW, 0, armW, armH);
    ctx.restore();
    part(36, 52, 4, 12, bodyX + bodyW, armY, armW, armH);
    // 头 + 帽子层
    part(8, 8, 8, 8, headX, top, headW, headH);
    part(40, 8, 8, 8, headX, top, headW, headH);
  } else {
    // Steve 默认
    fallback(bodyX, legY, legW, legH, '#3b3b8f');
    fallback(bodyX + legW, legY, legW, legH, '#3b3b8f');
    fallback(bodyX, bodyY, bodyW, bodyH, '#00afaf');
    fallback(bodyX - armW, armY, armW, armH, '#00afaf');
    fallback(bodyX + bodyW, armY, armW, armH, '#00afaf');
    fallback(headX, top, headW, headH, '#c89f7f');
    fallback(headX, top, headW, headH * 0.22, '#3f2a17');
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmt(n?: number | null, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
}

export function PosterModal({ open, onClose, data }: { open: boolean; onClose: () => void; data: PosterData }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSkin, setHasSkin] = useState(false);

  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setLoading(true);
    const skin = await loadPlayerSkin(data.gameId || data.username || null);
    setHasSkin(Boolean(skin));

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setLoading(false);
      return;
    }
    ctx.clearRect(0, 0, W, H);

    // 背景
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b0918');
    bg.addColorStop(0.45, '#120e24');
    bg.addColorStop(1, '#07060c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 品牌光斑
    const glow1 = ctx.createRadialGradient(W * 0.2, H * 0.18, 0, W * 0.2, H * 0.18, 620);
    glow1.addColorStop(0, 'rgba(139,92,246,0.42)');
    glow1.addColorStop(1, 'rgba(139,92,246,0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, W, H);
    const glow2 = ctx.createRadialGradient(W * 0.85, H * 0.72, 0, W * 0.85, H * 0.72, 560);
    glow2.addColorStop(0, 'rgba(34,211,238,0.28)');
    glow2.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);

    // 斜向速度线
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    for (let i = -6; i < 20; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 96, 0);
      ctx.lineTo(i * 96 - 340, H);
      ctx.stroke();
    }
    ctx.restore();

    // 顶部品牌条
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, W, 190);
    ctx.strokeStyle = 'rgba(139,92,246,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 190);
    ctx.lineTo(W, 190);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 54px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
    ctx.fillText('XBed', 64, 88);
    ctx.fillStyle = '#a78bfa';
    ctx.font = '600 30px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
    ctx.fillText('玄剑起床战争挑战赛', 64, 134);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 24px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
    const seasonText = data.seasonName || 'S1 赛季';
    ctx.fillText(seasonText, 64, 172);

    // 头像/皮肤展示区
    const skinCenterX = W / 2;
    const skinTop = 250;
    const unit = 22; // 32 units 总高 = 704px
    ctx.save();
    ctx.shadowColor = 'rgba(139,92,246,0.65)';
    ctx.shadowBlur = 60;
    drawSkinFront(ctx, skin, skinCenterX, skinTop, unit);
    ctx.restore();
    if (!skin) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '500 22px "Microsoft YaHei", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('未上传皮肤 · 默认形象', skinCenterX, skinTop + 32 * unit + 46);
      ctx.textAlign = 'left';
    }

    const nameY = skinTop + 32 * unit + 120;

    // 昵称
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 64px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
    ctx.fillText(data.nickname || '未命名玩家', W / 2, nameY);

    // 游戏 ID
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 30px "Consolas", "Microsoft YaHei", monospace';
    ctx.fillText(data.gameId || data.username || '—', W / 2, nameY + 48);

    // 段位 / 积分
    const tierColor = data.tierColor || '#a78bfa';
    ctx.font = '700 34px "Microsoft YaHei", system-ui, sans-serif';
    ctx.fillStyle = tierColor;
    const tierText = data.tierName || '暂无段位';
    const pointsText = data.points !== null && data.points !== undefined ? `${Math.round(data.points)} 分` : '';
    const tierWidth = ctx.measureText(tierText).width;
    const pointsWidth = pointsText ? ctx.measureText(pointsText).width + 40 : 0;
    const chipW = tierWidth + pointsWidth + 96;
    const chipX = W / 2 - chipW / 2;
    const chipY = nameY + 88;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(ctx, chipX, chipY, chipW, 76, 38);
    ctx.fill();
    ctx.strokeStyle = tierColor;
    ctx.lineWidth = 2;
    roundRect(ctx, chipX, chipY, chipW, 76, 38);
    ctx.stroke();
    ctx.fillStyle = tierColor;
    ctx.fillText(tierText, chipX + 40 + tierWidth / 2, chipY + 50);
    if (pointsText) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(pointsText, chipX + 40 + tierWidth + 20 + pointsWidth / 2 - 20, chipY + 50);
    }
    ctx.textAlign = 'left';

    // 数据网格 3x2
    const stats: Array<[string, string]> = [
      ['场次', fmt(data.matches)],
      ['胜率', data.winRate !== undefined && data.winRate !== null ? `${(data.winRate * 100).toFixed(1)}%` : '—'],
      ['胜场', fmt(data.wins)],
      ['击杀', fmt(data.kills)],
      ['破坏床', fmt(data.bedsBroken)],
      ['最高连胜', fmt(data.bestStreak)],
    ];
    const gridTop = chipY + 150;
    const cellW = 300;
    const cellH = 170;
    const gridLeft = W / 2 - cellW - 12;
    stats.forEach(([label, value], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = gridLeft + col * (cellW + 12);
      const y = gridTop + row * (cellH + 16);
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      roundRect(ctx, x, y, cellW, cellH, 24);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, cellW, cellH, 24);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '500 26px "Microsoft YaHei", system-ui, sans-serif';
      ctx.fillText(label, x + cellW / 2, y + 58);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 58px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
      ctx.fillText(value, x + cellW / 2, y + 126);
      ctx.textAlign = 'left';
    });

    // 底部
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(64, H - 150);
    ctx.lineTo(W - 64, H - 150);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '700 30px "Consolas", system-ui, sans-serif';
    ctx.fillText('xbed.xuanjian.top', 64, H - 92);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '500 24px "Microsoft YaHei", system-ui, sans-serif';
    ctx.fillText('玄剑公会 · XBed 赛事平台 · 个人档案', 64, H - 56);

    setLoading(false);
  }, [data]);

  useEffect(() => {
    if (!open) return;
    // 等 canvas 挂载后再绘制
    const timer = window.setTimeout(() => void render(), 30);
    return () => window.clearTimeout(timer);
  }, [open, render]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `XBed-${data.nickname || data.gameId || 'player'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="个人档案海报"
      wide
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            关闭
          </Btn>
          <Btn variant="primary" onClick={download} disabled={loading}>
            {loading ? '生成中…' : '下载 PNG'}
          </Btn>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{
            width: '100%',
            maxWidth: 380,
            maxHeight: '62vh',
            objectFit: 'contain',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        />
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.9, minWidth: 220, maxWidth: 300 }}>
          <p>海报尺寸 1080×1920，可直接保存到手机发群或朋友圈。</p>
          <p>皮肤来自玄剑官网个人资料；未上传皮肤时使用默认形象。</p>
          <p>{hasSkin ? '✓ 已加载个人皮肤' : '· 使用默认皮肤'}</p>
          <p>数据来源：赛季统计（{data.seasonName || '当前赛季'}）</p>
        </div>
      </div>
    </Modal>
  );
}
