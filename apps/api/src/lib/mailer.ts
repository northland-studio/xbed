import nodemailer from 'nodemailer';
import type { AppConfig } from '../config.js';
import type { DB } from '../db/index.js';
import { getSmtpSettings } from './settings.js';
import { nowIso } from './time.js';

export interface MailInput {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  template?: string;
  userId?: number | null;
}

export interface MailResult {
  sent: boolean;
  error?: string;
}

/** 发送邮件：记录 email_logs；SMTP 未配置时仅记录日志并不抛错 */
export async function sendMail(db: DB, config: AppConfig, input: MailInput): Promise<MailResult> {
  const smtp = getSmtpSettings(db, config);
  const logInfo = db
    .prepare(
      `INSERT INTO email_logs (user_id, to_email, subject, template, state)
       VALUES (?, ?, ?, ?, 'queued')`,
    )
    .run(input.userId ?? null, input.to, input.subject, input.template ?? null);
  const logId = Number(logInfo.lastInsertRowid);

  if (!smtp) {
    const message = 'smtp_not_configured';
    db.prepare("UPDATE email_logs SET state = 'failed', error = ? WHERE id = ?").run(message, logId);
    console.warn(`[mail] SMTP 未配置，跳过发送：to=${input.to} subject=${input.subject}`);
    return { sent: false, error: message };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? '' } : undefined,
      connectionTimeout: 10_000,
    });
    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    db.prepare("UPDATE email_logs SET state = 'sent', sent_at = ? WHERE id = ?").run(nowIso(), logId);
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.prepare("UPDATE email_logs SET state = 'failed', error = ? WHERE id = ?").run(message, logId);
    console.error(`[mail] 发送失败 to=${input.to}: ${message}`);
    return { sent: false, error: message };
  }
}

export function verificationCodeEmail(code: string, purpose = '绑定邮箱'): { subject: string; text: string; html: string } {
  const subject = `【XBed】邮箱验证码：${code}`;
  const text = [
    `你好，你正在 XBed 赛事平台${purpose}。`,
    `验证码：${code}`,
    '验证码 10 分钟内有效，请勿泄露给他人。',
    '如非本人操作，请忽略本邮件。',
  ].join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#0b0b12;padding:32px;color:#e6e6f0">
  <div style="max-width:520px;margin:0 auto;background:#14141f;border:1px solid #2a2a3d;border-radius:12px;padding:28px">
    <h2 style="color:#a78bfa;margin:0 0 16px">XBed 赛事平台</h2>
    <p style="color:#c9c9d9;line-height:1.7">你正在${purpose}，验证码：</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#22d3ee;margin:18px 0">${code}</p>
    <p style="color:#8f8fa3;font-size:13px;line-height:1.7">验证码 10 分钟内有效，请勿泄露给他人。如非本人操作，请忽略本邮件。</p>
  </div>
</div>`;
  return { subject, text, html };
}
