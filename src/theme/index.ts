import { useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';

export type ThemeName = 'escuro' | 'legacy' | 'claro';

export type AppTheme = {
  name: ThemeName;
  label: string;
  dark: boolean;
  statusBar: 'light' | 'dark';
  // Fundo animado: 'neon' = grade + linha de varredura; 'subtle' = sÃ³ a grade, bem leve
  scanner: 'neon' | 'subtle';
  colors: {
    background: string;
    backgroundGradient: string;
    panel: string;
    border: string;
    text: string;
    textSecondary: string;
    primary: string;
    onPrimary: string;      // texto/Ã­cone sobre fundo primary
    onAccent: string;       // texto/Ã­cone sobre as cores (vivas) dos perfis
    primarySoft: string;    // fundo de destaque leve (item selecionado, cartÃ£o em foco)
    success: string;
    danger: string;
    warning: string;
    warningSoft: string;
    overlay: string;        // fundo escurecido atrÃ¡s de modais
    grid: string;           // linhas do fundo
    trackOff: string;       // trilho do Switch desligado
    thumb: string;
    thumbOn: string;        // bolinha do Switch ligado (contrasta com o trilho em primary)
    thumbOff: string;
  };
  fonts: {
    regular: string;
    medium: string;
    bold: string;
    mono: string;
  };
};

const fonts = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  bold: 'Outfit_700Bold',
  mono: 'JetBrainsMono_400Regular',
};

export const THEMES: Record<ThemeName, AppTheme> = {
  // Escuro em preto e branco: sÃ³ tons de cinza; vermelho discreto apenas para aÃ§Ãµes destrutivas
  escuro: {
    name: 'escuro',
    label: 'Escuro',
    dark: true,
    statusBar: 'light',
    scanner: 'subtle',
    colors: {
      background: '#000000',
      backgroundGradient: '#0a0a0a',
      panel: '#141414',
      border: 'rgba(255,255,255,0.12)',
      text: '#ffffff',
      textSecondary: '#a3a3a3',
      primary: '#ffffff',
      onPrimary: '#000000',
      onAccent: '#14171b',
      primarySoft: 'rgba(255,255,255,0.08)',
      success: '#d4d4d4',
      danger: '#ef6b6b',
      warning: '#bdbdbd',
      warningSoft: 'rgba(255,255,255,0.07)',
      overlay: 'rgba(0,0,0,0.8)',
      grid: 'rgba(255,255,255,0.08)',
      trackOff: '#3a3a3a',
      thumb: '#ffffff',
      thumbOn: '#000000',
      thumbOff: '#a3a3a3',
    },
    fonts,
  },
  // Visual original do app: ciano neon com linha de varredura
  legacy: {
    name: 'legacy',
    label: 'Legacy',
    dark: true,
    statusBar: 'light',
    scanner: 'neon',
    colors: {
      background: '#0a0e14',
      backgroundGradient: '#0d1520',
      panel: 'rgba(15,22,35,0.85)',
      border: 'rgba(255,255,255,0.08)',
      text: '#e6edf3',
      textSecondary: '#8b949e',
      primary: '#00d4ff',
      onPrimary: '#0a0e14',
      onAccent: '#14171b',
      primarySoft: 'rgba(0,212,255,0.08)',
      success: '#3fb950',
      danger: '#f85149',
      warning: '#d29922',
      warningSoft: 'rgba(210,153,34,0.12)',
      overlay: 'rgba(0,0,0,0.8)',
      grid: 'rgba(0,212,255,0.12)',
      trackOff: '#333333',
      thumb: '#ffffff',
      thumbOn: '#ffffff',
      thumbOff: '#888888',
    },
    fonts,
  },
  claro: {
    name: 'claro',
    label: 'Claro',
    dark: false,
    statusBar: 'dark',
    scanner: 'subtle',
    colors: {
      background: '#f4f5f7',
      backgroundGradient: '#eceef2',
      panel: '#ffffff',
      border: 'rgba(16,24,40,0.10)',
      text: '#1c2430',
      textSecondary: '#5d6776',
      primary: '#2f6fab',
      onPrimary: '#ffffff',
      onAccent: '#14171b',
      primarySoft: 'rgba(47,111,171,0.08)',
      success: '#2e7d4f',
      danger: '#c0392b',
      warning: '#a86b12',
      warningSoft: 'rgba(168,107,18,0.10)',
      overlay: 'rgba(16,24,40,0.45)',
      grid: 'rgba(16,24,40,0.035)',
      trackOff: '#c9ced6',
      thumb: '#ffffff',
      thumbOn: '#ffffff',
      thumbOff: '#f1f2f4',
    },
    fonts,
  },
};

export const THEME_ORDER: ThemeName[] = ['legacy', 'escuro', 'claro'];
export const DEFAULT_THEME: ThemeName = 'legacy';

export function isThemeName(value: string): value is ThemeName {
  return value in THEMES;
}

// Estado global simples: o tema vem das configuraÃ§Ãµes do perfil ativo
let current: ThemeName = DEFAULT_THEME;
const listeners = new Set<() => void>();

export function getThemeName(): ThemeName {
  return current;
}

export function setThemeName(name: string): void {
  const next = isThemeName(name) ? name : DEFAULT_THEME;
  if (next === current) return;
  current = next;
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): AppTheme {
  return THEMES[useSyncExternalStore(subscribe, getThemeName, getThemeName)];
}

// Estilos que dependem do tema: criados uma vez por tema e reaproveitados.
// Mesma assinatura do StyleSheet.create (o "& Styles" mantÃ©m 'row', 'center' etc. como literais).
type Styles = Parameters<typeof StyleSheet.create>[0];

export function makeStyles<S extends Styles>(factory: (theme: AppTheme) => S & Styles): () => Readonly<S> {
  const cache = new Map<ThemeName, Readonly<S>>();
  return function useStyles() {
    const theme = useTheme();
    const cached = cache.get(theme.name);
    if (cached) return cached;
    const styles = StyleSheet.create(factory(theme));
    cache.set(theme.name, styles);
    return styles;
  };
}
