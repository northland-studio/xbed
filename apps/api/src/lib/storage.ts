import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { AppConfig } from '../config.js';
import { errors } from './errors.js';

export type EvidenceKind = 'latest_log' | 'replay';

export const KIND_DIR: Record<EvidenceKind, string> = {
  latest_log: 'logs',
  replay: 'replays',
};

export const KIND_EXTENSIONS: Record<EvidenceKind, string[]> = {
  latest_log: ['.log', '.txt'],
  replay: ['.mcpr'],
};

export const KIND_DEFAULT_EXT: Record<EvidenceKind, string> = {
  latest_log: '.log',
  replay: '.mcpr',
};

export const KIND_MIME: Record<EvidenceKind, string> = {
  latest_log: 'text/plain',
  replay: 'application/octet-stream',
};

export interface UploadedEvidenceFile {
  path: string;
  filename: string;
  storedPath: string;
  size: number;
  sha256: string;
  originalName: string;
  mime: string;
  kind: EvidenceKind;
}

/** 去掉路径分隔符与控制字符，磁盘上永不使用用户原始文件名 */
export function sanitizeOriginalName(name: string): string {
  const base = path.basename(String(name).replace(/\\/g, '/'));
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || 'file').slice(0, 255);
}

export function extensionOf(name: string): string {
  return path.extname(sanitizeOriginalName(name)).toLowerCase();
}

export function assertAllowedExtension(kind: EvidenceKind, originalName: string): void {
  const ext = extensionOf(originalName);
  if (!KIND_EXTENSIONS[kind].includes(ext)) {
    throw errors.invalidFileType(
      `仅允许上传 ${KIND_EXTENSIONS[kind].join(' / ')} 文件（收到: ${ext || '无扩展名'}）`,
    );
  }
}

/** 申诉附件：白名单与大小（.log/.txt/.png/.jpg/.zip/.mcpr ≤20MB） */
export const APPEAL_ATTACHMENT_EXTENSIONS = ['.log', '.txt', '.png', '.jpg', '.jpeg', '.zip', '.mcpr'];
export const APPEAL_ATTACHMENT_DIR = 'appeals';

export function assertAppealAttachmentExtension(originalName: string): void {
  const ext = extensionOf(originalName);
  if (!APPEAL_ATTACHMENT_EXTENSIONS.includes(ext)) {
    throw errors.invalidFileType(
      `申诉附件仅允许 ${APPEAL_ATTACHMENT_EXTENSIONS.join(' / ')}（收到: ${ext || '无扩展名'}）`,
    );
  }
}

/** // 上传目录（相对 FILES_DIR）与绝对路径 */
export function evidenceDir(config: AppConfig, kind: EvidenceKind): string {
  return path.join(path.resolve(config.filesDir), KIND_DIR[kind]);
}

/** 校验存储相对路径不会穿越出 FILES_DIR */
export function absoluteStoredPath(config: AppConfig, storedPath: string): string {
  const base = path.resolve(config.filesDir);
  const target = path.resolve(base, storedPath);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw errors.forbidden('非法文件路径');
  }
  return target;
}

export function removeStoredFile(config: AppConfig, storedPath: string): boolean {
  try {
    const target = absoluteStoredPath(config, storedPath);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * 自定义 multer 存储引擎：边写磁盘边算 SHA-256，超限立即中止并删除半成品。
 */
export class HashFileStorage implements multer.StorageEngine {
  constructor(
    private readonly options: {
      filesDir: string;
      /** 一级目录：logs / replays / appeals */
      subdir: string;
      /** 二级目录取自 req.params[paramName]，默认 id */
      paramName?: string;
      maxBytes: number;
      defaultExt: string;
    },
  ) {}

  _handleFile(
    req: Express.Request,
    file: Express.Multer.File,
    callback: (error?: unknown, info?: Partial<Express.Multer.File>) => void,
  ): void {
    const params = (req as unknown as { params?: Record<string, unknown> }).params ?? {};
    const rawId = params[this.options.paramName ?? 'id'];
    const subId = String(rawId ?? 'unknown').replace(/[^0-9a-zA-Z_-]/g, '');
    const relativeDir = path.posix.join(this.options.subdir, subId || 'unknown');
    const dir = path.join(path.resolve(this.options.filesDir), relativeDir);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      callback(error);
      return;
    }

    const ext = extensionOf(file.originalname) || this.options.defaultExt;
    const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    const dest = path.join(dir, filename);
    const hash = crypto.createHash('sha256');
    let size = 0;
    let settled = false;

    const out = fs.createWriteStream(dest);

    const cleanup = (error: unknown): void => {
      if (settled) return;
      settled = true;
      try {
        file.stream.unpipe(out);
      } catch {
        /* noop */
      }
      out.destroy();
      fs.unlink(dest, () => callback(error));
    };

    file.stream.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > this.options.maxBytes) {
        cleanup(errors.fileTooLarge());
        return;
      }
      hash.update(chunk);
    });
    file.stream.on('error', (error) => cleanup(error));
    out.on('error', (error) => cleanup(error));
    file.stream.pipe(out);
    out.on('finish', () => {
      if (settled) return;
      settled = true;
      callback(null, {
        path: dest,
        filename,
        size,
        originalname: sanitizeOriginalName(file.originalname),
        mimetype: file.mimetype || 'application/octet-stream',
        fieldname: file.fieldname,
        destination: dir,
        // @ts-expect-error 自定义字段（multer 允许 storage 返回额外信息）
        storedPath: path.posix.join(relativeDir, filename),
        sha256: hash.digest('hex'),
      });
    });
  }

  _removeFile(
    _req: Express.Request,
    file: Express.Multer.File,
    callback: (error: Error | null) => void,
  ): void {
    const target = (file as Express.Multer.File & { path?: string }).path;
    if (!target) {
      callback(null);
      return;
    }
    fs.unlink(target, () => callback(null));
  }
}

export interface UploadedFileInfo extends Omit<UploadedEvidenceFile, 'kind'> {}

/** 从 multer 文件对象读取 storage 返回的 SHA-256 与相对路径 */
export function toUploadedFile(file: Express.Multer.File): UploadedFileInfo {
  const enriched = file as Express.Multer.File & {
    storedPath?: string;
    sha256?: string;
  };
  if (!enriched.storedPath || !enriched.sha256) {
    throw errors.internal('上传存储引擎未返回校验信息');
  }
  return {
    path: file.path,
    filename: file.filename,
    storedPath: enriched.storedPath,
    size: file.size,
    sha256: enriched.sha256,
    originalName: file.originalname,
    mime: file.mimetype,
  };
}

/** 把 multer 文件对象还原为带 sha256/storedPath 的业务对象 */
export function toUploadedEvidenceFile(
  file: Express.Multer.File,
  kind: EvidenceKind,
): UploadedEvidenceFile {
  const info = toUploadedFile(file);
  return {
    ...info,
    mime: info.mime || KIND_MIME[kind],
    kind,
  };
}

/** 创建证据上传中间件（单文件，字段名 file） */
export function createEvidenceUploader(config: AppConfig, kind: EvidenceKind): multer.Multer {
  const maxBytes =
    kind === 'latest_log' ? config.limits.uploadMaxLogBytes : config.limits.uploadMaxReplayBytes;
  return multer({
    storage: new HashFileStorage({
      filesDir: config.filesDir,
      subdir: KIND_DIR[kind],
      maxBytes,
      defaultExt: KIND_DEFAULT_EXT[kind],
    }),
    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: 10,
    },
    fileFilter: (_req, file, callback) => {
      try {
        assertAllowedExtension(kind, file.originalname);
        callback(null, true);
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}

/** 申诉附件上传中间件（≤20MB，.log/.txt/.png/.jpg/.jpeg/.zip/.mcpr） */
export function createAppealAttachmentUploader(config: AppConfig): multer.Multer {
  const maxBytes = 20 * 1024 * 1024;
  return multer({
    storage: new HashFileStorage({
      filesDir: config.filesDir,
      subdir: APPEAL_ATTACHMENT_DIR,
      maxBytes,
      defaultExt: '.zip',
    }),
    limits: { fileSize: maxBytes, files: 1, fields: 10 },
    fileFilter: (_req, file, callback) => {
      try {
        assertAppealAttachmentExtension(file.originalname);
        callback(null, true);
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

export interface StoredEvidenceLike {
  stored_path: string;
  original_name: string | null;
  size_bytes: number;
  sha256: string;
  mime: string | null;
}

/** 鉴权后的证据文件下载（禁止暴露真实磁盘路径） */
export function pipeEvidenceFile(
  config: AppConfig,
  res: import('express').Response,
  evidence: StoredEvidenceLike,
): void {
  let target: string;
  try {
    target = absoluteStoredPath(config, evidence.stored_path);
  } catch {
    throw errors.forbidden('非法文件路径');
  }
  if (!fs.existsSync(target)) throw errors.notFound('文件不存在或已被清理');
  const downloadName = evidence.original_name || 'evidence';
  res.setHeader('Content-Type', evidence.mime || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(downloadName)}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
  );
  res.setHeader('Content-Length', String(evidence.size_bytes));
  res.setHeader('X-Content-SHA256', evidence.sha256);
  res.setHeader('Cache-Control', 'private, no-store');
  const stream = fs.createReadStream(target);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: { code: 'internal_error', message: '读取文件失败' } });
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

export interface StorageStats {
  logBytes: number;
  replayBytes: number;
  totalBytes: number;
  logCount: number;
  replayCount: number;
  fileCount: number;
  totalFiles: number;
}

export function storageStatsFromRows(rows: Array<{ kind: string; size_bytes: number }>): StorageStats {
  let logBytes = 0;
  let replayBytes = 0;
  let logCount = 0;
  let replayCount = 0;
  for (const row of rows) {
    if (row.kind === 'latest_log') {
      logBytes += row.size_bytes;
      logCount += 1;
    } else {
      replayBytes += row.size_bytes;
      replayCount += 1;
    }
  }
  return {
    logBytes,
    replayBytes,
    totalBytes: logBytes + replayBytes,
    logCount,
    replayCount,
    fileCount: rows.length,
    totalFiles: rows.length,
  };
}
