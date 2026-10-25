import { planMetaSync } from '../src/sync/model';

const local = { name: 'Família', color: '#fff', icon: 'home' };

describe('planMetaSync (nome da gaveta)', () => {
  it('o dono envia o nome atual do perfil e o próprio nome', () => {
    const plan = planMetaSync({ role: 'owner', local, remote: { name: 'Kayo', color: '#fff', icon: 'home' }, ownerName: 'Kayo Macedo', otherLocalNames: [] });
    expect(plan).toEqual({ push: { name: 'Família', color: '#fff', icon: 'home', ownerName: 'Kayo Macedo' }, local: null });
  });

  it('o dono não reenvia o que já está igual', () => {
    const plan = planMetaSync({ role: 'owner', local, remote: { ...local, ownerName: 'Kayo' }, ownerName: 'Kayo', otherLocalNames: [] });
    expect(plan.push).toBeNull();
  });

  it('quem foi convidado passa a ver o nome que o dono deu', () => {
    const plan = planMetaSync({
      role: 'payer', local: { name: 'Kayo', color: '#000', icon: 'initial' },
      remote: { name: 'Família', color: '#fff', icon: 'home', ownerName: 'Kayo' }, ownerName: 'Maria', otherLocalNames: ['Maria'],
    });
    expect(plan).toEqual({ push: null, local: { name: 'Família', color: '#fff', icon: 'home' } });
  });

  it('nome repetido neste celular ganha quem compartilhou', () => {
    const plan = planMetaSync({
      role: 'viewer', local: { name: 'Kayo', color: '#000', icon: 'initial' },
      remote: { name: 'Família', ownerName: 'Kayo' }, ownerName: 'Maria', otherLocalNames: ['família'],
    });
    expect(plan.local?.name).toBe('Família (Kayo)');
  });

  it('sem nome na nuvem, não mexe no perfil local', () => {
    expect(planMetaSync({ role: 'editor', local, remote: null, ownerName: '', otherLocalNames: [] })).toEqual({ push: null, local: null });
  });
});
