jest.mock('expo-sqlite', () => require('../test-utils/nodeSqlite'));

import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { PROFILE_COLORS, createProfile } from '../src/db/profiles';
import { initDatabase, setProfileSettings } from '../src/db/database';
import { applyProfileTheme, switchProfile, setProfileTheme } from '../src/utils/profileManager';
import { DEFAULT_THEME, THEMES, THEME_ORDER, getThemeName, makeStyles, setThemeName, useTheme } from '../src/theme';

// Contraste WCAG entre duas cores #rrggbb
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('Paletas', () => {
  it('os três temas têm exatamente as mesmas cores definidas', () => {
    const keys = Object.keys(THEMES.escuro.colors).sort();
    for (const name of THEME_ORDER) expect(Object.keys(THEMES[name].colors).sort()).toEqual(keys);
  });

  it.each(THEME_ORDER)('tema %s: textos legíveis (contraste ≥ 4.5)', name => {
    const { colors } = THEMES[name];
    expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textSecondary, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.primary, colors.background)).toBeGreaterThanOrEqual(3); // ícones e bordas
  });

  it('texto sobre as cores de perfil é legível', () => {
    for (const c of PROFILE_COLORS) expect(contrast(THEMES.escuro.colors.onAccent, c)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Troca de tema em tempo real', () => {
  afterEach(() => act(() => setThemeName(DEFAULT_THEME)));

  it('nome inválido cai no tema padrão (Escuro)', () => {
    setThemeName('legacy');
    setThemeName('neon-rosa');
    expect(getThemeName()).toBe('escuro');
  });

  it('componentes re-renderizam com o tema novo', async () => {
    function Probe() {
      return <Text>{useTheme().label}</Text>;
    }
    const screen = await render(<Probe />);
    expect(screen.getByText('Escuro')).toBeTruthy();
    await act(async () => setThemeName('claro'));
    expect(screen.getByText('Claro')).toBeTruthy();
  });

  it('makeStyles cria um estilo por tema e reaproveita', async () => {
    const useStyles = makeStyles(theme => ({ box: { backgroundColor: theme.colors.background } }));
    const seen: object[] = [];
    function Probe() {
      seen.push(useStyles());
      return null;
    }
    const screen = await render(<Probe />);
    await screen.rerender(<Probe />);
    await act(async () => setThemeName('claro'));
    expect(seen[0]).toBe(seen[1]);                 // mesmo tema: mesmo objeto
    expect(seen.at(-1)).not.toBe(seen[0]);         // outro tema: outro estilo
    expect((seen.at(-1) as any).box.backgroundColor).toBe(THEMES.claro.colors.background);
  });
});

describe('Tema do app (SQL real)', () => {
  it('vale para todas as gavetas: trocar de gaveta não muda o tema', () => {
    initDatabase(); // como o _layout faz ao abrir o app
    const casa = createProfile({ name: 'Casa', color: PROFILE_COLORS[1], icon: 'initial' });

    switchProfile('yuri');
    setProfileTheme('legacy');
    expect(getThemeName()).toBe('legacy');

    switchProfile(casa);
    expect(getThemeName()).toBe('legacy');

    setProfileTheme('claro');
    switchProfile('yuri');
    applyProfileTheme(); // como na próxima abertura
    expect(getThemeName()).toBe('claro');
  });
});

describe('Interruptores', () => {
  it.each(THEME_ORDER)('tema %s: bolinha ligada aparece sobre o trilho', name => {
    const { colors } = THEMES[name];
    expect(contrast(colors.thumbOn, colors.primary)).toBeGreaterThanOrEqual(1.5);
  });
});
