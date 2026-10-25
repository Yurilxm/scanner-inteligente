import { accountBadgeState } from '../src/sync/badge';

describe('accountBadgeState', () => {
  it('enquanto carrega não mostra nada', () => {
    expect(accountBadgeState(null)).toBe('loading');
  });

  it('sem login mostra o botão de entrar', () => {
    expect(accountBadgeState({ kind: 'signed-out' })).toBe('signed-out');
  });

  it('logado com a frase no celular mostra o verificado', () => {
    expect(accountBadgeState({ kind: 'signed-in', email: 'a@b.com', hasPhrase: true })).toBe('synced');
  });

  it('logado sem a frase neste celular mostra o alerta', () => {
    expect(accountBadgeState({ kind: 'signed-in', email: 'a@b.com', hasPhrase: false })).toBe('pending');
  });
});
