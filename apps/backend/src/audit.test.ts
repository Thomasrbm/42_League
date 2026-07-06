import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Context } from 'hono';

// On mocke la couche DB : on capture l'entrée d'audit créée sans Prisma réel.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('./db', () => ({
  prisma: { adminAuditLog: { create } },
}));

import { logAdminAction } from './audit.js';

/** Faux Context Hono : seuls les en-têtes lus par l'audit comptent. */
function ctx(headers: Record<string, string> = {}): Context {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    req: { header: (name: string) => lower[name.toLowerCase()] },
  } as unknown as Context;
}

/** Laisse tourner le fire-and-forget (notifyDiscord) une boucle de microtâches. */
const flush = () => new Promise((r) => setTimeout(r, 0));

let savedWebhook: string | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({});
  savedWebhook = process.env.DISCORD_AUDIT_WEBHOOK_URL;
  delete process.env.DISCORD_AUDIT_WEBHOOK_URL; // pas de webhook par défaut
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  if (savedWebhook === undefined) delete process.env.DISCORD_AUDIT_WEBHOOK_URL;
  else process.env.DISCORD_AUDIT_WEBHOOK_URL = savedWebhook;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const base = {
  actor: 'throbert',
  actorRole: 'SUPERADMIN' as const,
  action: 'BAN_USER' as const,
};

describe('logAdminAction — persistance', () => {
  it('insère une entrée avec acteur, rôle, action et cible', async () => {
    await logAdminAction(ctx(), { ...base, target: 'victim' });
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0].data).toMatchObject({
      actorLogin: 'throbert',
      actorRole: 'SUPERADMIN',
      action: 'BAN_USER',
      targetLogin: 'victim',
    });
  });

  it('normalise target et payload absents en null/undefined', async () => {
    await logAdminAction(ctx(), base);
    const data = create.mock.calls[0]![0].data;
    expect(data.targetLogin).toBeNull();
    expect(data.payload).toBeUndefined(); // undefined => Prisma ignore le champ
  });

  it('transmet un payload objet tel quel et préserve null explicite', async () => {
    await logAdminAction(ctx(), { ...base, payload: { reason: 'triche' } });
    expect(create.mock.calls[0]![0].data.payload).toEqual({ reason: 'triche' });

    create.mockClear();
    await logAdminAction(ctx(), { ...base, payload: null });
    expect(create.mock.calls[0]![0].data.payload).toBeNull();
  });
});

describe('logAdminAction — extraction d’IP (précédence)', () => {
  it('préfère cf-connecting-ip', async () => {
    await logAdminAction(
      ctx({
        'cf-connecting-ip': '1.1.1.1',
        'x-forwarded-for': '2.2.2.2',
        'x-real-ip': '3.3.3.3',
      }),
      base,
    );
    expect(create.mock.calls[0]![0].data.ipAddress).toBe('1.1.1.1');
  });

  it('prend la DERNIÈRE IP de x-forwarded-for, trimée (anti-spoof INJ-1)', async () => {
    // Le dernier hop est l'IP ajoutée par le proxy de confiance ; la tête est
    // forgeable par le client et ne doit pas polluer l'audit.
    await logAdminAction(
      ctx({ 'x-forwarded-for': ' 9.9.9.9 , 8.8.8.8 ', 'x-real-ip': '3.3.3.3' }),
      base,
    );
    expect(create.mock.calls[0]![0].data.ipAddress).toBe('8.8.8.8');
  });

  it('retombe sur x-real-ip', async () => {
    await logAdminAction(ctx({ 'x-real-ip': '3.3.3.3' }), base);
    expect(create.mock.calls[0]![0].data.ipAddress).toBe('3.3.3.3');
  });

  it('met null en l’absence de toute en-tête d’IP', async () => {
    await logAdminAction(ctx(), base);
    expect(create.mock.calls[0]![0].data.ipAddress).toBeNull();
  });

  it('enregistre le user-agent (ou null)', async () => {
    await logAdminAction(ctx({ 'user-agent': 'curl/8' }), base);
    expect(create.mock.calls[0]![0].data.userAgent).toBe('curl/8');
    create.mockClear();
    await logAdminAction(ctx(), base);
    expect(create.mock.calls[0]![0].data.userAgent).toBeNull();
  });
});

describe('logAdminAction — robustesse', () => {
  it('n’échoue jamais si la persistance DB lève (audit best-effort)', async () => {
    create.mockRejectedValue(new Error('db down'));
    await expect(logAdminAction(ctx(), base)).resolves.toBeUndefined();
  });
});

describe('notifyDiscord — silencieux sur staging', () => {
  it("n'appelle pas le webhook quand APP_ENV=staging (actions de test, pas de bruit Discord)", async () => {
    process.env.DISCORD_AUDIT_WEBHOOK_URL = 'https://discord.test/webhook';
    const saved = process.env.APP_ENV;
    process.env.APP_ENV = 'staging';
    try {
      await logAdminAction(ctx(), base);
      await flush();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (saved === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = saved;
    }
  });
});

describe('notifyDiscord — RGPD : aucune donnée personnelle', () => {
  it('n’appelle pas le webhook si l’URL n’est pas configurée', async () => {
    await logAdminAction(ctx({ 'cf-connecting-ip': '1.1.1.1' }), {
      ...base,
      target: 'victim',
    });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('n’envoie que l’action — ni acteur, ni cible, ni IP', async () => {
    process.env.DISCORD_AUDIT_WEBHOOK_URL = 'https://discord.test/webhook';
    await logAdminAction(ctx({ 'cf-connecting-ip': '1.2.3.4' }), {
      ...base,
      target: 'victim',
      payload: { reason: 'triche' },
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://discord.test/webhook');
    const body = opts.body as string;
    // Le corps mentionne l'action mais aucune PII.
    expect(body).toContain('BAN_USER');
    for (const pii of ['throbert', 'victim', '1.2.3.4', 'triche']) {
      expect(body).not.toContain(pii);
    }
    // Pas de mentions déclenchables.
    expect(JSON.parse(body).allowed_mentions).toEqual({ parse: [] });
  });

  it('avale une erreur du webhook Discord sans casser l’action', async () => {
    process.env.DISCORD_AUDIT_WEBHOOK_URL = 'https://discord.test/webhook';
    fetchMock.mockRejectedValue(new Error('discord down'));
    await expect(logAdminAction(ctx(), base)).resolves.toBeUndefined();
    await flush();
  });
});
