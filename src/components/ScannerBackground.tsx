import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { makeStyles, useTheme } from '../theme';

export function ScannerBackground() {
  const theme = useTheme();
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  const translateY = useSharedValue(-100);
  const neon = theme.scanner === 'neon';

  useEffect(() => {
    if (!neon) return;
    translateY.value = withRepeat(
      withTiming(height, { duration: 4000, easing: Easing.linear }),
      -1,
      false
    );
  }, [height, translateY, neon]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const gridSize = 40;
  const linesX = Array.from({ length: Math.ceil(width / gridSize) }, (_, i) => i * gridSize);
  const linesY = Array.from({ length: Math.ceil(height / gridSize) }, (_, i) => i * gridSize);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Grade Quadriculada */}
      <Svg width="100%" height="100%">
        <Defs>
          <SvgGradient id="scanGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="transparent" stopOpacity="0" />
            <Stop offset="0.5" stopColor={theme.colors.primary} stopOpacity="0.6" />
            <Stop offset="1" stopColor="transparent" stopOpacity="0" />
          </SvgGradient>
        </Defs>
        {linesX.map((x, i) => (
          <Line key={`x-${i}`} x1={x} y1="0" x2={x} y2="100%" stroke={theme.colors.grid} strokeWidth="1" />
        ))}
        {linesY.map((y, i) => (
          <Line key={`y-${i}`} x1="0" y1={y} x2="100%" y2={y} stroke={theme.colors.grid} strokeWidth="1" />
        ))}
      </Svg>

      {/* Linha de Varredura Animada (só no tema neon) */}
      {neon && (
        <Animated.View style={[styles.scanLine, animatedStyle]}>
          <Svg width="100%" height="2">
            <Rect x="0" y="0" width="100%" height="2" fill="url(#scanGrad)" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

const useStyles = makeStyles(theme => ({
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 4,
  },
}));
