import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';

// Mesmo desenho do glifo "radar" do MaterialCommunityIcons (o do ícone e da tela inicial).
// Em SVG para não depender da fonte de ícones, que ainda nem carregou na abertura do app.
const RADAR_PATH =
  'M19.07,4.93L17.66,6.34C19.1,7.79 20,9.79 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12C4,7.92 7.05,4.56 11,4.07V6.09' +
  'C8.16,6.57 6,9.03 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12C18,10.34 17.33,8.84 16.24,7.76L14.83,9.17' +
  'C15.55,9.9 16,10.9 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12C8,10.14 9.28,8.59 11,8.14V10.28' +
  'C10.4,10.63 10,11.26 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12C14,11.26 13.6,10.62 13,10.28V2H12' +
  'A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,9.24 20.88,6.74 19.07,4.93Z';

// Rastro da varredura: fatias atrás do ponteiro, cada vez mais transparentes (um "degradê cônico")
const TRAIL_SLICES = 14;
const TRAIL_SLICE_DEG = 6;

function pointAt(deg: number): string {
  const rad = (deg * Math.PI) / 180;
  return `${(12 + 10 * Math.sin(rad)).toFixed(3)},${(12 - 10 * Math.cos(rad)).toFixed(3)}`;
}

const TRAIL = Array.from({ length: TRAIL_SLICES }, (_, i) => {
  const end = -i * TRAIL_SLICE_DEG;
  const start = end - TRAIL_SLICE_DEG - 0.6; // leve sobreposição para não aparecer emenda
  return {
    d: `M12,12L${pointAt(start)}A10,10 0 0,1 ${pointAt(end)}Z`,
    opacity: 0.32 * (1 - i / TRAIL_SLICES),
  };
});

const SPIN_MS = 2200;
const PING_MS = 1800;

type Props = {
  /** Diâmetro do círculo externo do radar, em dp */
  size: number;
  color?: string;
};

export function RadarLoader({ size, color = '#FFFFFF' }: Props) {
  const spin = useSharedValue(0);
  const ping = useSharedValue(0);
  // Os efeitos entram aos poucos: o primeiro quadro é idêntico ao radar parado
  const intro = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: SPIN_MS, easing: Easing.linear }), -1, false);
    ping.value = withRepeat(withTiming(1, { duration: PING_MS, easing: Easing.out(Easing.quad) }), -1, false);
    intro.value = withTiming(1, { duration: 500 });
  }, [spin, ping, intro]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));
  const trailStyle = useAnimatedStyle(() => ({ opacity: intro.value }));
  const pingStyle = useAnimatedStyle(() => ({
    opacity: (1 - ping.value) * 0.45 * intro.value,
    transform: [{ scale: 1 + ping.value * 0.7 }],
  }));

  const box = { width: size, height: size };

  return (
    <View style={box} accessibilityRole="progressbar" accessibilityLabel="Carregando">
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.ping, { borderRadius: size / 2, borderColor: color }, pingStyle]}
      />
      <Animated.View style={[StyleSheet.absoluteFill, spinStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, trailStyle]}>
          <Svg width={size} height={size} viewBox="2 2 20 20">
            {TRAIL.map((slice, i) => (
              <Path key={i} d={slice.d} fill={color} opacity={slice.opacity} />
            ))}
          </Svg>
        </Animated.View>
        <Svg width={size} height={size} viewBox="2 2 20 20" style={StyleSheet.absoluteFill}>
          <Path d={RADAR_PATH} fill={color} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ping: { borderWidth: 2 },
});
