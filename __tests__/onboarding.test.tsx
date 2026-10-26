import React from 'react';
import { render, fireEvent, act, screen, cleanup } from '@testing-library/react-native';
import OnboardingScreen from '../src/app/onboarding';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Auth from '../src/sync/auth';
import * as Profiles from '../src/db/profiles';
import * as Perfil from '../src/utils/perfil';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../src/sync/auth', () => ({ signInWithGoogle: jest.fn().mockResolvedValue({ user: { id: '123' } }) }));
jest.mock('../src/db/profiles', () => ({ createProfile: jest.fn().mockReturnValue('gaveta-123'), PROFILE_COLORS: ['#000', '#FFF'] }));
jest.mock('../src/utils/perfil', () => ({ updatePerfil: jest.fn(), setAppPin: jest.fn(), setAppSettingValue: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

describe('Onboarding', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  afterEach(() => { cleanup(); });

  it('deve fazer login, configurar perfil e escolher biometria', async () => {
    await render(<OnboardingScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('ENTRAR COM GOOGLE'));
    });

    const input = await screen.findByPlaceholderText('Seu nome');
    
    await act(async () => {
      fireEvent.changeText(input, 'Yuri');
    });

    await act(async () => {
      fireEvent.press(screen.getByText(/PR.XIMO/));
    });

    const btnBiometria = await screen.findByText('USAR BIOMETRIA');
    
    await act(async () => {
      fireEvent.press(btnBiometria);
    });

    expect(Perfil.setAppSettingValue).toHaveBeenCalledWith('use_biometrics', 'true');
    expect(Profiles.createProfile).toHaveBeenCalledWith({ name: 'Minhas contas', color: '#000', icon: 'briefcase' });
  });

  it('deve criar PIN se o usuario escolher a opcao de PIN', async () => {
    await render(<OnboardingScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('ENTRAR COM GOOGLE'));
    });

    const input = await screen.findByPlaceholderText('Seu nome');
    
    await act(async () => {
      fireEvent.changeText(input, 'Yuri');
    });

    await act(async () => {
      fireEvent.press(screen.getByText(/PR.XIMO/));
    });

    const btnPin = await screen.findByText('CRIAR UM PIN');
    
    await act(async () => {
      fireEvent.press(btnPin);
    });

    const pinInput = screen.getByPlaceholderText(/Digite de 4 a 6 n.meros/);
    
    await act(async () => {
      fireEvent.changeText(pinInput, '1234');
    });

    await act(async () => {
      fireEvent.press(screen.getByText('FINALIZAR E ENTRAR'));
    });

    expect(Perfil.setAppPin).toHaveBeenCalledWith('1234');
    expect(Profiles.createProfile).toHaveBeenCalled();
  });
});