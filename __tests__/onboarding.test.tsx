import React from 'react';
import { render, fireEvent, act, screen, cleanup, waitFor } from '@testing-library/react-native';
import OnboardingScreen from '../src/app/onboarding';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Auth from '../src/sync/auth';
import * as Profiles from '../src/db/profiles';
import * as Perfil from '../src/utils/perfil';
import * as Database from '../src/db/database';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../src/sync/auth', () => ({ signInWithGoogle: jest.fn().mockResolvedValue({ user: { id: '123' } }) }));
jest.mock('../src/db/profiles', () => ({ createProfile: jest.fn().mockReturnValue('gaveta-123'), PROFILE_COLORS: ['#000'], PROFILE_ICONS: ['initial'] }));
jest.mock('../src/utils/perfil', () => ({ updatePerfil: jest.fn(), setAppPin: jest.fn(), setAppSettingValue: jest.fn(), savePerfilPhoto: jest.fn() }));
jest.mock('../src/db/database', () => ({ changeProfile: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

jest.mock('../src/components/CustomModal', () => {
  const { Text } = require('react-native');
  return {
    CustomModal: ({ visible, title, message }: any) => visible ? (
      <>
        <Text>{title}</Text>
        <Text>{message}</Text>
      </>
    ) : null
  };
});

describe('Onboarding', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  afterEach(() => { cleanup(); });

  it('deve validar nome vazio usando CustomModal', async () => {
    await render(<OnboardingScreen />);
    await act(async () => { fireEvent.press(screen.getByText('ENTRAR COM GOOGLE')); });
    await act(async () => { fireEvent.press(await screen.findByText(/PR.*XIMO/)); });
    
    await waitFor(() => { expect(screen.getByText('Ops')).toBeTruthy(); });
  });

  it('deve configurar Biometria e ativar a primeira gaveta', async () => {
    await render(<OnboardingScreen />);
    await act(async () => { fireEvent.press(screen.getByText('ENTRAR COM GOOGLE')); });
    await act(async () => { fireEvent.changeText(await screen.findByPlaceholderText('Seu nome'), 'Yuri'); });
    await act(async () => { fireEvent.press(await screen.findByText(/PR.*XIMO/)); });
    await act(async () => { fireEvent.press(await screen.findByText('USAR BIOMETRIA')); });
    
    expect(Perfil.setAppSettingValue).toHaveBeenCalledWith('use_biometrics', 'true');
    expect(Profiles.createProfile).toHaveBeenCalled();
    expect(Database.changeProfile).toHaveBeenCalledWith('gaveta-123');
  });
});
