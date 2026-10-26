import * as SQLite from 'expo-sqlite';
import { changeProfile, getCurrentProfile } from '../src/db/database';
import { createProfile } from '../src/db/profiles';

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn().mockReturnValue({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn().mockReturnValue([]),
    getFirstSync: jest.fn(),
    closeSync: jest.fn(),
  }),
}));

describe('Gerenciamento de Perfis', () => {
  it('inicia vazio e troca de perfil corretamente', () => {
    const id1 = createProfile({ name: 'Casa', color: '#000', icon: 'home' });
    const id2 = createProfile({ name: 'Trabalho', color: '#FFF', icon: 'briefcase' });
    
    changeProfile(id1);
    expect(getCurrentProfile()).toBe(id1);
    
    changeProfile(id2);
    expect(getCurrentProfile()).toBe(id2);
    expect(SQLite.openDatabaseSync).toHaveBeenCalledWith('scanner_' + id2 + '.db');
  });
});