import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AnimatedSplash, FADE_MS, MIN_VISIBLE_MS, SPLASH_RADAR_SIZE } from '../src/components/AnimatedSplash';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

describe('AnimatedSplash', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(SplashScreen.hideAsync).mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('tem o radar do mesmo tamanho da tela nativa (imageWidth 180)', () => {
    expect(SPLASH_RADAR_SIZE).toBe(132);
  });

  it('tira a tela nativa uma vez só, quando já está desenhada', async () => {
    const view = await render(<AnimatedSplash ready={false} onFinish={jest.fn()} />);
    const splash = view.getByTestId('animated-splash');
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    await fireEvent(splash, 'layout', { nativeEvent: { layout: {} } });
    await fireEvent(splash, 'layout', { nativeEvent: { layout: {} } });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('espera o app ficar pronto antes de sumir', async () => {
    const onFinish = jest.fn();
    const view = await render(<AnimatedSplash ready={false} onFinish={onFinish} />);
    await act(() => { jest.advanceTimersByTime(MIN_VISIBLE_MS + FADE_MS + 1000); });
    expect(onFinish).not.toHaveBeenCalled();

    await view.rerender(<AnimatedSplash ready onFinish={onFinish} />);
    await act(() => { jest.advanceTimersByTime(FADE_MS); });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('fica um tempo mínimo na tela mesmo se o app abrir rápido', async () => {
    const onFinish = jest.fn();
    await render(<AnimatedSplash ready onFinish={onFinish} />);
    await act(() => { jest.advanceTimersByTime(MIN_VISIBLE_MS - 1); });
    expect(onFinish).not.toHaveBeenCalled();
    await act(() => { jest.advanceTimersByTime(1); }); // tempo mínimo cumprido: começa o esmaecimento
    expect(onFinish).not.toHaveBeenCalled();
    await act(() => { jest.advanceTimersByTime(FADE_MS); });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
