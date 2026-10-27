import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import HomeScreen from '../src/app/index';
import * as PerfilUtils from '../src/utils/perfil';
import * as LocalAuth from 'expo-local-authentication';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn(), router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('../src/sync/loadAccount', () => ({ loadAccount: jest.fn().mockResolvedValue({ getLocalAccountStatus: jest.fn().mockResolvedValue({ kind: 'signed-out' }) }) }));

jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(),
}));

jest.mock('../src/utils/perfil', () => ({
  getPerfil: jest.fn(),
  needsAppPin: jest.fn(),
  appSetting: jest.fn(),
  tryUnlockApp: jest.fn(),
}));

jest.mock('../src/components/PinPad', () => {
  const { View } = require('react-native');
  return {
    PinPad: () => <View testID="pinpad" />,
    PinModal: () => <View testID="pinmodal" />
  };
});

describe('Tela de Bloqueio (Lock Screen)', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('mostra apenas Biometria (com botão tentar novamente) se só bio estiver ativa', async () => {
    (PerfilUtils.needsAppPin as jest.Mock).mockReturnValue(true);
    (PerfilUtils.appSetting as jest.Mock).mockReturnValue('true');
    (PerfilUtils.getPerfil as jest.Mock).mockReturnValue({ name: 'Yuri', hasPin: false });
    // Faz a biometria ficar "pendente" para o teste conseguir ver o estado bloqueado
    (LocalAuth.authenticateAsync as jest.Mock).mockReturnValue(new Promise(() => {}));

    await act(async () => { await render(<HomeScreen />); });

    expect(screen.getByText('App Bloqueado')).toBeTruthy();
    expect(screen.getByText('TENTAR NOVAMENTE')).toBeTruthy();
    expect(screen.queryByTestId('pinpad')).toBeNull();
  });

  it('mostra apenas PIN se bio estiver desativada', async () => {
    (PerfilUtils.needsAppPin as jest.Mock).mockReturnValue(true);
    (PerfilUtils.appSetting as jest.Mock).mockReturnValue('false');
    (PerfilUtils.getPerfil as jest.Mock).mockReturnValue({ name: 'Yuri', hasPin: true });

    await act(async () => { await render(<HomeScreen />); });

    expect(screen.queryByText('App Bloqueado')).toBeNull();
    expect(screen.getByTestId('pinpad')).toBeTruthy();
  });

  it('mostra PIN no fundo e dispara Biometria se ambos estiverem ativos', async () => {
    (PerfilUtils.needsAppPin as jest.Mock).mockReturnValue(true);
    (PerfilUtils.appSetting as jest.Mock).mockReturnValue('true');
    (PerfilUtils.getPerfil as jest.Mock).mockReturnValue({ name: 'Yuri', hasPin: true });
    (LocalAuth.authenticateAsync as jest.Mock).mockReturnValue(new Promise(() => {}));

    await act(async () => { await render(<HomeScreen />); });

    expect(screen.getByTestId('pinpad')).toBeTruthy();
    expect(LocalAuth.authenticateAsync).toHaveBeenCalled();
  });
});
