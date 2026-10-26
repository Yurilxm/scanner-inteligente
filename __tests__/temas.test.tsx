import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useTheme, setThemeName, getThemeName } from '../src/theme';
import { createProfile } from '../src/db/profiles';
import { switchProfile } from '../src/utils/profileManager';

jest.mock('expo-sqlite', () => require('../test-utils/nodeSqlite'));

const Probe = () => {
  const theme = useTheme();
  return <Text>{theme.label}</Text>;
};

describe('Troca de tema', () => {
  it('nome inválido cai no tema padrão (Legacy)', () => {
    setThemeName('neon-rosa');
    expect(getThemeName()).toBe('legacy');
  });

  it('componentes re-renderizam com o tema novo', async () => {
    await render(<Probe />);
    expect(screen.getByText('Legacy')).toBeTruthy();
    await act(async () => setThemeName('claro'));
    expect(screen.getByText('Claro')).toBeTruthy();
  });
});