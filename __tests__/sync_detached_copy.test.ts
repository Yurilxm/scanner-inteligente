// Gavetas sobre SQLite de verdade; o resto do motor (rede, chaveiro, fotos) não é usado aqui
jest.mock('expo-sqlite', () => require('../test-utils/nodeSqlite'));
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x', getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(require('crypto').randomBytes(n)) }));
jest.mock('../src/sync/auth', () => ({ currentSession: jest.fn() }));
jest.mock('../src/sync/photos', () => ({ photos: {} }));
jest.mock('../src/sync/remote', () => ({ remote: {} }));

import { initDatabase, setProfileSettings } from '../src/db/database';
import { createProfile, linkProfileVault } from '../src/db/profiles';
import { findDetachedCopy } from '../src/sync/engine';
import { GAVETA_OWNER_SETTING } from '../src/sync/roles';

beforeAll(() => initDatabase());

describe('findDetachedCopy (religar gaveta compartilhada desligada)', () => {
  it('acha a cópia sem nuvem com o mesmo nome e o mesmo dono', () => {
    const copia = createProfile({ name: 'Família', color: '#fff', icon: 'initial' });
    setProfileSettings(copia, { [GAVETA_OWNER_SETTING]: 'Kayo' });
    expect(findDetachedCopy({ name: 'Família', ownerName: 'Kayo' })?.id).toBe(copia);
  });

  it('aceita o nome com quem compartilhou, usado quando havia nome repetido', () => {
    const copia = createProfile({ name: 'Casa (Kayo)', color: '#fff', icon: 'initial' });
    setProfileSettings(copia, { [GAVETA_OWNER_SETTING]: 'Kayo' });
    expect(findDetachedCopy({ name: 'Casa', ownerName: 'Kayo' })?.id).toBe(copia);
  });

  it('nunca religa uma gaveta pessoal de mesmo nome (sem "quem compartilhou")', () => {
    createProfile({ name: 'Trabalho', color: '#fff', icon: 'initial' });
    expect(findDetachedCopy({ name: 'Trabalho', ownerName: 'Kayo' })).toBeNull();
  });

  it('não religa cópia de outro dono, nem gaveta que já está na nuvem', () => {
    const outra = createProfile({ name: 'Carro', color: '#fff', icon: 'initial' });
    setProfileSettings(outra, { [GAVETA_OWNER_SETTING]: 'Maria' });
    expect(findDetachedCopy({ name: 'Carro', ownerName: 'Kayo' })).toBeNull();

    const ligada = createProfile({ name: 'Viagem', color: '#fff', icon: 'initial' });
    setProfileSettings(ligada, { [GAVETA_OWNER_SETTING]: 'Kayo' });
    linkProfileVault(ligada, 'cofre-x', 'editor');
    expect(findDetachedCopy({ name: 'Viagem', ownerName: 'Kayo' })).toBeNull();
  });

  it('sem nome ou sem dono na nuvem, não arrisca', () => {
    expect(findDetachedCopy({ name: 'Família' })).toBeNull();
    expect(findDetachedCopy({ ownerName: 'Kayo' })).toBeNull();
  });
});

describe('syncAllProfiles', () => {
  it('quem pede durante uma rodada em andamento recebe a mesma rodada', async () => {
    const { syncAllProfiles } = require('../src/sync/engine');
    const first = syncAllProfiles();
    const second = syncAllProfiles();
    expect(second).toBe(first);
    await first;
    expect(syncAllProfiles()).not.toBe(first); // terminada, a próxima é nova
  });
});
