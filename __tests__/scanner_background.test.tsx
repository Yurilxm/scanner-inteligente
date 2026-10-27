import React from 'react';
import { render } from '@testing-library/react-native';
import { ScannerBackground } from '../src/components/ScannerBackground';
import * as Theme from '../src/theme';

// Mock do react-native-svg com __esModule e default corretos
jest.mock('react-native-svg', () => {
  const MockedComponent = ({ children }: any) => <>{children}</>;
  return {
    __esModule: true,
    default: MockedComponent,
    Svg: MockedComponent,
    Line: () => null,
    Defs: ({ children }: any) => <>{children}</>,
    LinearGradient: () => null,
    Stop: () => null,
    Rect: () => null,
  };
});

describe('ScannerBackground', () => {
  it('deve renderizar no tema escuro sem quebrar', () => {
    jest.spyOn(Theme, 'useTheme').mockReturnValue({ ...Theme.THEMES.escuro, name: 'escuro' } as any);
    expect(() => render(<ScannerBackground />)).not.toThrow();
  });

  it('deve renderizar no tema claro sem quebrar', () => {
    jest.spyOn(Theme, 'useTheme').mockReturnValue({ ...Theme.THEMES.claro, name: 'claro' } as any);
    expect(() => render(<ScannerBackground />)).not.toThrow();
  });

  it('deve renderizar no tema legacy sem quebrar', () => {
    jest.spyOn(Theme, 'useTheme').mockReturnValue({ ...Theme.THEMES.legacy, name: 'legacy' } as any);
    expect(() => render(<ScannerBackground />)).not.toThrow();
  });
});
