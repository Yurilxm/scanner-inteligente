import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { RadarLoader } from './RadarLoader';

// Mesma medida da tela nativa: splash-logo.png (1024 px, radar com 749 px) exibido com
// imageWidth 180 no app.json → o círculo do radar tem ~132 dp. Se mudar um, mude o outro.
export const SPLASH_RADAR_SIZE = Math.round((749 / 1024) * 180);
export const MIN_VISIBLE_MS = 1000;
export const FADE_MS = 350;

type Props = {
  /** true quando o app terminou de carregar (fontes e banco) */
  ready: boolean;
  /** chamado depois do esmaecimento, para desmontar a tela */
  onFinish: () => void;
};

// Continua a tela de abertura nativa (estática) com o radar girando. Fica por cima do app
// até ele estar pronto e esmaece; o primeiro quadro é igual à tela nativa, sem salto.
export function AnimatedSplash({ ready, onFinish }: Props) {
  const opacity = useSharedValue(1);
  const [minElapsed, setMinElapsed] = useState(false);
  const nativeHidden = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    opacity.value = withTiming(0, { duration: FADE_MS });
    const t = setTimeout(onFinish, FADE_MS);
    return () => clearTimeout(t);
  }, [ready, minElapsed, opacity, onFinish]);

  // Só tira a tela nativa quando esta já está desenhada por baixo dela
  const handleLayout = () => {
    if (nativeHidden.current) return;
    nativeHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  };

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.container, fadeStyle]} onLayout={handleLayout} testID="animated-splash">
      <StatusBar style="light" />
      <RadarLoader size={SPLASH_RADAR_SIZE} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
