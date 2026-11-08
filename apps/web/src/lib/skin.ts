/** 从 XBed 后端代理获取玩家皮肤（64x64 PNG），失败返回 null */
export async function loadPlayerSkin(gameId?: string | null): Promise<HTMLImageElement | null> {
  if (!gameId) return null;
  try {
    const res = await fetch(`/api/skin/${encodeURIComponent(gameId)}`, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.includes('image')) return null;
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image load failed'));
        img.src = url;
      });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
