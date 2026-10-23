import * as SQLite from 'expo-sqlite';
import { changeProfile, getCurrentProfile } from '../src/db/database';

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    closeSync: jest.fn(),
    execSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(() => [{ name: 'paymentDate' }]),
    runSync: jest.fn(),
  })),
}));

describe('Gerenciamento de Perfis', () => {
  it('inicia com o perfil yuri e troca para mae', () => {
    expect(getCurrentProfile()).toBe('yuri');
    changeProfile('mae');
    expect(getCurrentProfile()).toBe('mae');
    expect(SQLite.openDatabaseSync).toHaveBeenCalledWith('scanner_mae.db');
  });
});
