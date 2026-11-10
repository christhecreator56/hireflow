import nodemailer from 'nodemailer';
import { waitUntil } from '@vercel/functions';
import Handlebars from 'handlebars';
import { env } from './env.js';
import { prisma } from './prisma.js';

// Mailpit (local) needs no login; hosted sandboxes such as Mailtrap use SMTP_USER / SMTP_PASS.
const transport = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: false,
  ...(env.smtp.user && { auth: { user: env.smtp.user, pass: env.smtp.pass } }),
});

export type MailVars = Record<string, string | number | undefined>;

export const render = (tpl: string, vars: MailVars) => Handlebars.compile(tpl)(vars); // escapes HTML by default

/**
 * Render an org template, log it, and send without blocking the request.
 * shortcut: fire-and-forget with status in EmailLog, no retry queue; move to a job queue (BullMQ) at scale.
 */
export async function sendTemplate(opts: {
  orgId: string;
  key: string;
  to: string;
  vars: MailVars;
  applicationId?: string;
}) {
  const t = await prisma.emailTemplate.findUnique({ where: { orgId_key: { orgId: opts.orgId, key: opts.key } } });
  if (!t) return null;
  const subject = render(t.subject, opts.vars);
  const html = render(t.bodyHtml, opts.vars);
  const log = await prisma.emailLog.create({
    data: { orgId: opts.orgId, toEmail: opts.to, templateKey: opts.key, subject, status: 'QUEUED', applicationId: opts.applicationId },
  });
  const delivery = transport
    .sendMail({ from: env.smtp.from, to: opts.to, subject, html })
    .then(() => prisma.emailLog.update({ where: { id: log.id }, data: { status: 'SENT' } }))
    .catch((e: Error) =>
      prisma.emailLog.update({ where: { id: log.id }, data: { status: 'FAILED', error: e.message } }),
    )
    .catch(() => {});
  // On Vercel the function is frozen once the response is sent; waitUntil keeps it alive until delivery
  // finishes (no-op elsewhere, where the background promise simply runs).
  waitUntil(delivery);
  return log;
}
