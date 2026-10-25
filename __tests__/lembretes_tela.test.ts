jest.mock('expo-sqlite', () => {
  const m = { execSync: jest.fn(), getFirstSync: jest.fn(), getAllSync: jest.fn(), runSync: jest.fn(), closeSync: jest.fn() };
  return { openDatabaseSync: jest.fn(() => m) };
});

import { remindersForProfile } from '../src/utils/reminders';
import { daysUntil, monthShort, relativeDays, timeHHMM } from '../src/utils/format';
import type { ScheduledReminder } from '../src/utils/notifications';

const reminder = (over: Partial<ScheduledReminder>): ScheduledReminder => ({
  identifier: Math.random().toString(), when: new Date(2026, 9, 25, 9), title: '', body: 'corpo',
  docId: null, profile: null, ...over,
});
const doc = (id: string) => ({ id, issuer: 'NETFIBRA TELECOM' } as any);

describe('remindersForProfile', () => {
  const docs: Record<string, any> = { A: doc('A') };
  const getDoc = (id: string) => docs[id] ?? null;

  it('mostra só os lembretes do perfil ativo e conta os escondidos', () => {
    const { items, hiddenFromOtherProfiles } = remindersForProfile([
      reminder({ docId: 'A', profile: 'yuri' }),
      reminder({ docId: 'X', profile: 'mae' }),
    ], 'yuri', getDoc);
    expect(items.map(i => i.docId)).toEqual(['A']);
    expect(items[0].doc?.issuer).toBe('NETFIBRA TELECOM');
    expect(hiddenFromOtherProfiles).toBe(1);
  });

  it('lembrete antigo sem perfil entra só se a conta existe neste perfil', () => {
    const { items, hiddenFromOtherProfiles } = remindersForProfile([
      reminder({ docId: 'A' }),
      reminder({ docId: 'SUMIU' }),
    ], 'yuri', getDoc);
    expect(items.map(i => i.docId)).toEqual(['A']);
    expect(hiddenFromOtherProfiles).toBe(1);
  });

  it('lembrete de teste (sem conta) aparece', () => {
    const { items } = remindersForProfile([reminder({})], 'yuri', getDoc);
    expect(items).toHaveLength(1);
    expect(items[0].doc).toBeNull();
  });
});

describe('formatos da tela de lembretes', () => {
  const agora = new Date(2026, 9, 23, 22, 30);

  it('conta dias de calendário, não horas', () => {
    expect(daysUntil(new Date(2026, 9, 24, 9), agora)).toBe(1); // amanhã, mesmo faltando menos de 24h
    expect(daysUntil(new Date(2026, 9, 25, 9), agora)).toBe(2);
    expect(daysUntil(new Date(2026, 9, 23, 23), agora)).toBe(0);
  });

  it('texto relativo', () => {
    expect(relativeDays(0)).toBe('hoje');
    expect(relativeDays(1)).toBe('amanhã');
    expect(relativeDays(5)).toBe('em 5 dias');
    expect(relativeDays(-3)).toBe('há 3 dias');
  });

  it('mês abreviado e hora', () => {
    expect(monthShort(new Date(2026, 9, 25))).toBe('OUT');
    expect(timeHHMM(new Date(2026, 9, 25, 9, 5))).toBe('09:05');
  });
});
