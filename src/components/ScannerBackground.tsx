import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useTheme } from '../theme';

export function ScannerBackground() {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();

  const gridSize = 40;
  const linesX = Array.from({ length: Math.ceil(width / gridSize) }, (_, i) => i * gridSize);
  const linesY = Array.from({ length: Math.ceil(height / gridSize) }, (_, i) => i * gridSize);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        {linesX.map((x, i) => (
          <Line key={`x-${i}`} x1={x} y1="0" x2={x} y2="100%" stroke={theme.colors.grid} strokeWidth="1" />
        ))}
        {linesY.map((y, i) => (
          <Line key={`y-${i}`} x1="0" y1={y} x2="100%" y2={y} stroke={theme.colors.grid} strokeWidth="1" />
        ))}
      </Svg>
    </View>
  );
}
