import { describe, expect, it } from '@jest/globals';
import { matchesAllowlist, routeInboundMessage } from './inbound-router.js';
import type {
  AgentBotConfig,
  AgentInboundMessage,
  InboundPersistInput,
  InboundRouterDeps,
  OutboundPersistInput,
} from './agent.types.js';

const RECEIVED_AT = new Date('2026-07-30T18:00:00Z');

function buildMessage(overrides: Partial<AgentInboundMessage> = {}): AgentInboundMessage {
  return {
    sessionPhone: '51949376824',
    remoteJid: '51902049935@s.whatsapp.net',
    fromMe: false,
    text: 'hola quiero un cuarto de pollo',
    pushName: 'José',
    channelMessageId: 'MSG-1',
    receivedAt: RECEIVED_AT,
    ...overrides,
  };
}

interface FakeDeps {
  deps: InboundRouterDeps;
  savedInbound: InboundPersistInput[];
  savedOutbound: OutboundPersistInput[];
  sentTexts: Array<{ toJid: string; text: string }>;
  typingFor: string[];
}

function buildDeps(overrides: {
  companyId?: string | null;
  botConfig?: AgentBotConfig | null;
  rateLimited?: boolean;
  duplicated?: boolean;
} = {}): FakeDeps {
  const savedInbound: InboundPersistInput[] = [];
  const savedOutbound: OutboundPersistInput[] = [];
  const sentTexts: Array<{ toJid: string; text: string }> = [];
  const typingFor: string[] = [];

  const botConfig =
    overrides.botConfig === undefined
      ? {
          enabled: true,
          vertical: 'restaurant' as const,
          greeting: 'Hola',
          testNumbers: ['51902049935'],
        }
      : overrides.botConfig;

  const deps: InboundRouterDeps = {
    resolveCompanyIdBySender: async () =>
      overrides.companyId === undefined ? 'company-1' : overrides.companyId,
    getBotConfig: async () => botConfig,
    isRateLimited: () => overrides.rateLimited === true,
    saveInbound: async (entry) => {
      savedInbound.push(entry);
      return { duplicated: overrides.duplicated === true, conversationId: 'conv-1' };
    },
    saveOutbound: async (entry) => {
      savedOutbound.push(entry);
    },
    sendText: async (toJid, text) => {
      sentTexts.push({ toJid, text });
    },
    simulateTyping: async (toJid) => {
      typingFor.push(toJid);
    },
  };

  return { deps, savedInbound, savedOutbound, sentTexts, typingFor };
}

describe('routeInboundMessage — gates (F1)', () => {
  it('ignora mensajes propios (fromMe)', async () => {
    const fake = buildDeps();
    const outcome = await routeInboundMessage(buildMessage({ fromMe: true }), fake.deps);
    expect(outcome).toBe('from-me');
    expect(fake.savedInbound).toHaveLength(0);
    expect(fake.sentTexts).toHaveLength(0);
  });

  it('ignora grupos, broadcast y newsletters', async () => {
    const fake = buildDeps();
    for (const jid of ['123@g.us', 'status@broadcast', '99@newsletter']) {
      const outcome = await routeInboundMessage(buildMessage({ remoteJid: jid }), fake.deps);
      expect(outcome).toBe('group');
    }
    expect(fake.savedInbound).toHaveLength(0);
  });

  it('ignora mensajes sin texto', async () => {
    const fake = buildDeps();
    const outcome = await routeInboundMessage(buildMessage({ text: '   ' }), fake.deps);
    expect(outcome).toBe('non-text');
    expect(fake.savedInbound).toHaveLength(0);
  });

  it('ignora sesiones sin company resuelta', async () => {
    const fake = buildDeps({ companyId: null });
    const outcome = await routeInboundMessage(buildMessage(), fake.deps);
    expect(outcome).toBe('no-company');
  });

  it('ignora companies sin bot-config o con bot deshabilitado', async () => {
    const sinConfig = buildDeps({ botConfig: null });
    expect(await routeInboundMessage(buildMessage(), sinConfig.deps)).toBe('bot-disabled');

    const deshabilitado = buildDeps({
      botConfig: { enabled: false, vertical: 'restaurant' },
    });
    expect(await routeInboundMessage(buildMessage(), deshabilitado.deps)).toBe('bot-disabled');
    expect(deshabilitado.savedInbound).toHaveLength(0);
  });

  it('con allowlist activa, ignora números fuera de ella sin persistir nada', async () => {
    const fake = buildDeps();
    const outcome = await routeInboundMessage(
      buildMessage({ remoteJid: '51999999999@s.whatsapp.net' }),
      fake.deps
    );
    expect(outcome).toBe('not-allowlisted');
    expect(fake.savedInbound).toHaveLength(0);
    expect(fake.sentTexts).toHaveLength(0);
  });

  it('con allowlist vacía responde a cualquier número', async () => {
    const fake = buildDeps({
      botConfig: { enabled: true, vertical: 'restaurant', testNumbers: [] },
    });
    const outcome = await routeInboundMessage(
      buildMessage({ remoteJid: '51999999999@s.whatsapp.net' }),
      fake.deps
    );
    expect(outcome).toBe('replied');
  });

  it('corta por rate limit ANTES de persistir', async () => {
    const fake = buildDeps({ rateLimited: true });
    const outcome = await routeInboundMessage(buildMessage(), fake.deps);
    expect(outcome).toBe('rate-limited');
    expect(fake.savedInbound).toHaveLength(0);
  });

  it('un channelMessageId duplicado no genera respuesta doble', async () => {
    const fake = buildDeps({ duplicated: true });
    const outcome = await routeInboundMessage(buildMessage(), fake.deps);
    expect(outcome).toBe('duplicate');
    expect(fake.sentTexts).toHaveLength(0);
    expect(fake.savedOutbound).toHaveLength(0);
  });
});

describe('routeInboundMessage — camino feliz (F1 echo)', () => {
  it('persiste entrada con teléfono normalizado, simula tipeo, responde y persiste salida', async () => {
    const fake = buildDeps();
    const outcome = await routeInboundMessage(buildMessage(), fake.deps);

    expect(outcome).toBe('replied');
    expect(fake.savedInbound).toHaveLength(1);
    expect(fake.savedInbound[0].companyId).toBe('company-1');
    expect(fake.savedInbound[0].customerPhone).toBe('51902049935');
    expect(fake.savedInbound[0].customerName).toBe('José');

    expect(fake.typingFor).toEqual(['51902049935@s.whatsapp.net']);
    expect(fake.sentTexts).toHaveLength(1);
    expect(fake.sentTexts[0].toJid).toBe('51902049935@s.whatsapp.net');
    expect(fake.sentTexts[0].text).toContain('Hola');
    expect(fake.sentTexts[0].text).toContain('cuarto de pollo');

    expect(fake.savedOutbound).toHaveLength(1);
    expect(fake.savedOutbound[0].conversationId).toBe('conv-1');
    expect(fake.savedOutbound[0].text).toBe(fake.sentTexts[0].text);
  });

  it('normaliza jids con sufijo de device (jid:device@s.whatsapp.net)', async () => {
    const fake = buildDeps();
    const outcome = await routeInboundMessage(
      buildMessage({ remoteJid: '51902049935:12@s.whatsapp.net' }),
      fake.deps
    );
    expect(outcome).toBe('replied');
    expect(fake.savedInbound[0].customerPhone).toBe('51902049935');
  });
});

describe('matchesAllowlist', () => {
  it('empareja con y sin código de país', () => {
    expect(matchesAllowlist('51902049935', ['902049935'])).toBe(true);
    expect(matchesAllowlist('902049935', ['51902049935'])).toBe(true);
    expect(matchesAllowlist('51902049935', ['51902049935'])).toBe(true);
  });

  it('rechaza números distintos y listas sin match', () => {
    expect(matchesAllowlist('51999999999', ['51902049935'])).toBe(false);
    expect(matchesAllowlist('51902049935', ['51949376824'])).toBe(false);
  });

  it('lista vacía o ausente permite a todos', () => {
    expect(matchesAllowlist('51902049935', [])).toBe(true);
    expect(matchesAllowlist('51902049935', undefined)).toBe(true);
  });
});
