import type { Context } from 'hono';
import type { AdminAction, Role } from '@prisma/client';
import { prisma } from './db';

interface LogParams {
  actor: string;
  actorRole: Role;
  action: AdminAction;
  target?: string | null;
  payload?: Record<string, unknown> | null;
}

const ACTION_EMOJI: Record<AdminAction, string> = {
  SET_ROLE: '👑',
  SET_MODERATOR_PERMISSIONS: '🔑',
  BAN_USER: '🔨',
  UNBAN_USER: '🕊️',
  EDIT_STATS: '✏️',
  EDIT_TITLE: '🏷️',
  DELETE_MATCH: '🗑️',
  EDIT_MATCH: '📝',
  REFRESH_IMAGES: '🖼️',
  RESET_DATABASE: '💣',
  DELETE_CHALLENGE: '🗑️',
  DELETE_PENDING_MATCH: '🗑️',
  DELETE_REJECTED_MATCH: '🗑️',
  DELETE_OPS: '🗑️',
  DELETE_TOURNAMENT: '🗑️',
  IMPERSONATE_TESTER: '🧪',
  SYNC_ELO_FROM_PROD: '♻️',
  GRANT_CONSUMABLE: '🧪',
  FORCE_CONSUMABLE: '⚡',
  GRANT_BADGE: '🎖️',
  REMOVE_BADGE: '🚫',
  RESET_OPS_COOLDOWN: '⏱️',
  SET_SF_ADMIN: '🎮',
  OPEN_SF_SESSION: '▶️',
  CLOSE_SF_SESSION: '⏹️',
  CANCEL_SF_SESSION: '🗑️',
};

function extractIp(c: Context): string | null {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    null
  );
}

/**
 * Insère une entrée dans admin_audit_log et notifie Discord en fire-and-forget.
 * Toute erreur est avalée — l'audit ne doit jamais empêcher l'action métier.
 * La notification Discord ne contient aucune donnée personnelle (RGPD Art. 44-46 + CGU 42 Art. 4.1(g)).
 */
export async function logAdminAction(c: Context, params: LogParams): Promise<void> {
  const ip = extractIp(c);
  const userAgent = c.req.header('user-agent') ?? null;

  try {
    await prisma.adminAuditLog.create({
      data: {
        actorLogin: params.actor,
        actorRole: params.actorRole,
        action: params.action,
        targetLogin: params.target ?? null,
        payload: params.payload === undefined ? undefined : (params.payload as object),
        ipAddress: ip,
        userAgent,
      },
    });
  } catch (err) {
    console.error('[audit] failed to persist log entry', err);
  }

  void notifyDiscord(params.action).catch((err) => {
    console.error('[audit] discord webhook failed', err);
  });
}

/**
 * Notifie Discord d'une erreur client (page TV live notamment) en fire-and-forget.
 * Réutilise le webhook d'audit. Ignoré en staging (canal réel) et si pas de webhook.
 * Le texte est tronqué et ne doit contenir AUCUNE donnée personnelle (l'appelant
 * passe un message déjà assaini). Toute erreur d'envoi est avalée.
 */
export async function notifyClientError(text: string): Promise<void> {
  if (process.env.APP_ENV === 'staging') return;
  const url = process.env.DISCORD_AUDIT_WEBHOOK_URL;
  if (!url) return;
  const content = `🐞 **client-error** — ${text}`.slice(0, 1800);
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
}

/**
 * Notifie Discord qu'une contestation (litige) vient d'être ouverte, en
 * fire-and-forget. Réutilise le webhook d'audit. Ignoré en staging (canal réel)
 * et si pas de webhook. RGPD : AUCUNE donnée personnelle (pas de login) — juste
 * la discipline, le type de contestation et un lien vers la file d'arbitrage.
 * `kind` distingue une contestation classique (`pending`, match jamais compté)
 * d'une contestation a posteriori (`auto_validated`, match déjà compté).
 */
export async function notifyDiscordDispute(params: {
  game: string;
  kind: 'pending' | 'auto_validated';
  reason?: string;
}): Promise<void> {
  if (process.env.APP_ENV === 'staging') return;
  const url = process.env.DISCORD_AUDIT_WEBHOOK_URL;
  if (!url) return;
  const where = params.kind === 'auto_validated' ? ' (match auto-validé)' : '';
  const reason = params.reason ? ` — motif : ${params.reason}` : '';
  const content =
    `⚖️ **Nouvelle contestation** — ${params.game}${where}${reason}. ` +
    `Litige à arbitrer dans /GOD.`;
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: content.slice(0, 1800), allowed_mentions: { parse: [] } }),
  });
}

async function notifyDiscord(action: AdminAction): Promise<void> {
  // En staging, on ne notifie pas Discord : les admins testent des actions
  // fictives et les notifications pollueraient le canal de sécurité réel.
  // Ce filtre est basé sur APP_ENV (variable serveur, non falsifiable par un client).
  if (process.env.APP_ENV === 'staging') return;
  const url = process.env.DISCORD_AUDIT_WEBHOOK_URL;
  if (!url) return;

  const emoji = ACTION_EMOJI[action] ?? '🔔';
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: `${emoji} **${action}**`,
      allowed_mentions: { parse: [] },
    }),
  });
}
