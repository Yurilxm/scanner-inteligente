import React from 'react';
import { render, screen, act , waitFor} from '@testing-library/react-native';
import RootLayout from '../src/app/_layout';
import * as PerfilUtils from '../src/utils/perfil';
import * as LocalAuth from 'expo-local-authentication';
import { AppStateFlag } from '../src/utils/AppStateFlag';

jest.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return {
    Stack,
    useFocusEffect: jest.fn(),
    router: { push: jest.fn(), replace: jest.fn() },
  };
});

jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock('@expo-google-fonts/outfit', () => ({
  useFonts: () => [true],
  Outfit_400Regular: {},
  Outfit_500Medium: {},
  Outfit_700Bold: {},
}));
jest.mock('@expo-google-fonts/jetbrains-mono', () => ({ JetBrainsMono_400Regular: {} }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock('../src/sync/loadAccount', () => ({ loadAccount: jest.fn().mockResolvedValue({ getLocalAccountStatus: jest.fn().mockResolvedValue({ kind: 'signed-out' }) }) }));
jest.mock('../src/db/database', () => ({ initDatabase: jest.fn() }));
jest.mock('expo-local-authentication', () => ({ authenticateAsync: jest.fn() }));
jest.mock('../src/utils/perfil', () => ({
  getPerfil: jest.fn(),
  needsAppPin: jest.fn(),
  appSetting: jest.fn(),
  tryUnlockApp: jest.fn(),
  migrateToSinglePerfil: jest.fn(),
}));
jest.mock('../src/utils/profileManager', () => ({ applyProfileTheme: jest.fn() }));
jest.mock('../src/components/PinPad', () => {
  const { View } = require('react-native');
  return { PinPad: () => <View testID="pinpad" />, PinModal: () => <View testID="pinmodal" /> };
});
jest.mock('../src/components/AnimatedSplash', () => ({ AnimatedSplash: () => null }));

describe('Tela de Bloqueio Global (RootLayout)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AppStateFlag.setPickingImage(false);
  });

  it('mostra apenas Biometria se só bio estiver ativa', async () => {
    (PerfilUtils.needsAppPin as jest.Mock).mockReturnValue(true);
    (PerfilUtils.appSetting as jest.Mock).mockReturnValue('true');
    (PerfilUtils.getPerfil as jest.Mock).mockReturnValue({ name: 'Yuri', hasPin: false });
    (LocalAuth.authenticateAsync as jest.Mock).mockReturnValue(new Promise(() => {}));

    await act(async () => { await render(<RootLayout />); });

    expect(screen.getByText('App Bloqueado')).toBeTruthy();
    expect(screen.getByText('TENTAR NOVAMENTE')).toBeTruthy();
    expect(screen.queryByTestId('pinpad')).toBeNull();
  });

  it('mostra apenas PIN se bio estiver desativada', async () => {
    (PerfilUtils.needsAppPin as jest.Mock).mockReturnValue(true);
    (PerfilUtils.appSetting as jest.Mock).mockReturnValue('false');
    (PerfilUtils.getPerfil as jest.Mock).mockReturnValue({ name: 'Yuri', hasPin: true });

    await act(async () => { await render(<RootLayout />); });

    expect(screen.queryByText('App Bloqueado')).toBeNull();
    expect(screen.getByTestId('pinpad')).toBeTruthy();
  });

  it('mostra PIN no fundo e dispara Biometria se ambos estiverem ativos', async () => {
    (PerfilUtils.needsAppPin as jest.Mock).mockReturnValue(true);
    (PerfilUtils.appSetting as jest.Mock).mockReturnValue('true');
    (PerfilUtils.getPerfil as jest.Mock).mockReturnValue({ name: 'Yuri', hasPin: true });
    (LocalAuth.authenticateAsync as jest.Mock).mockReturnValue(new Promise(() => {}));

    await act(async () => { await render(<RootLayout />); });

    expect(screen.getByTestId('pinpad')).toBeTruthy();
    await waitFor(() => expect(LocalAuth.authenticateAsync).toHaveBeenCalled());
  });

  it('a flag de picking image impede o bloqueio ao voltar do background', async () => {
    // 1. App começa desbloqueado (needsAppPin = false)
    (PerfilUtils.needsAppPin as jest.Mock).mockReturnValue(false);
    (PerfilUtils.appSetting as jest.Mock).mockReturnValue('true');
    (PerfilUtils.getPerfil as jest.Mock).mockReturnValue({ name: 'Yuri', hasPin: true });

    // 2. Captura o listener do AppState
    const { AppState } = require('react-native');
    const listeners: any[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event: any, cb: any) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    });

    await act(async () => { await render(<RootLayout />); });

    // 3. Confirma que está desbloqueado
    expect(screen.queryByTestId('pinpad')).toBeNull();

    // 4. Simula que o PIN ficou ativo E a flag está marcada
    (PerfilUtils.needsAppPin as jest.Mock).mockReturnValue(true);
    AppStateFlag.setPickingImage(true);

    // 5. Dispara o background
    await act(async () => {
      listeners.forEach(cb => cb('background'));
    });

    // 6. Ainda deve estar desbloqueado (a flag impediu o bloqueio)
    expect(screen.queryByTestId('pinpad')).toBeNull();
  });
});
