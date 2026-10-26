jest.mock('expo-sqlite', () => require('../test-utils/nodeSqlite'));
import * as SQLite from 'expo-sqlite';
import { createProfile, getProfile, listProfiles, getActiveProfileId, setActiveProfileId } from '../src/db/profiles';
import { changeProfile, countProfileDocuments, getCurrentProfile, saveDocument } from '../src/db/database';

describe('Registro de perfis (SQL real)', () => {
  let casaId: string;

  it('começa vazio', () => {
    expect(listProfiles()).toEqual([]);
  });

  it('cria perfil com nome normalizado e id seguro', () => {
    casaId = createProfile({ name: '  Casa  ', color: '#3fb950', icon: 'home-heart' });
    expect(casaId).toMatch(/^p[a-z0-9]+$/);
    expect(getProfile(casaId)?.name).toBe('Casa');
  });

  it('lembra o perfil ativo', () => {
    setActiveProfileId(casaId);
    expect(getActiveProfileId()).toBe(casaId);
  });

  it('conta contas do perfil', () => {
    changeProfile(casaId);
    saveDocument('file:///y1.jpg', '', { documentType: 'BOLETO', issuer: 'ENEL', referenceMonth: null, cnpj: null, cpf: null, totalAmountCents: 100, dueDate: null, boletoLine: null });
    expect(countProfileDocuments(casaId)).toEqual({ total: 1, pending: 1 });
  });
});