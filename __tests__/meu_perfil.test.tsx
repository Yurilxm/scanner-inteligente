import React from 'react';
import { render, fireEvent, cleanup, screen } from '@testing-library/react-native';
import MeuPerfilScreen from '../src/app/meu-perfil';
import * as PerfilUtils from '../src/utils/perfil';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../src/utils/perfil', () => ({
  getPerfil: jest.fn(),
  appSetting: jest.fn(),
  setAppSettingValue: jest.fn(),
  updatePerfil: jest.fn(),
  savePerfilPhoto: jest.fn(),
  removePerfilPhoto: jest.fn(),
  setAppPin: jest.fn(),
}));

describe('Meu Perfil - Segurança', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  afterEach(() => { cleanup(); });

  it('mostra opções de ativar PIN quando apenas biometria está ativa', async () => {
    (PerfilUtils.getPerfil as jest.Mock).mockReturnValue({ name: 'Yuri', hasPin: false });
    (PerfilUtils.appSetting as jest.Mock).mockReturnValue('true'); // Biometria ativa

    await render(<MeuPerfilScreen />);
    
    expect(screen.getByText('Biometria Configurada')).toBeTruthy();
    expect(screen.getByText('Definir PIN')).toBeTruthy();
    expect(screen.getByText('Remover Biometria')).toBeTruthy();
  });

  it('mostra opções de ativar Biometria quando apenas PIN está ativo', async () => {
    (PerfilUtils.getPerfil as jest.Mock).mockReturnValue({ name: 'Yuri', hasPin: true });
    (PerfilUtils.appSetting as jest.Mock).mockReturnValue('false'); // Biometria inativa

    await render(<MeuPerfilScreen />);
    
    expect(screen.getByText('PIN Configurado')).toBeTruthy();
    expect(screen.getByText('Trocar PIN')).toBeTruthy();
    expect(screen.getByText('Ativar Biometria')).toBeTruthy();
  });

  it('mostra "Sem PIN" e "Biometria Desativada" quando nada está ativo', async () => {
    (PerfilUtils.getPerfil as jest.Mock).mockReturnValue({ name: 'Yuri', hasPin: false });
    (PerfilUtils.appSetting as jest.Mock).mockReturnValue('false');

    await render(<MeuPerfilScreen />);
    
    expect(screen.getByText('Sem PIN')).toBeTruthy();
    expect(screen.getByText('Sem Biometria')).toBeTruthy();
    expect(screen.getByText('Definir PIN')).toBeTruthy();
  });
});
