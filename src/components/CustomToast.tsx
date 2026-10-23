import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { Theme } from '../constants/theme';

type Props = {
  message: string;
  type?: 'success' | 'error' | 'info';
  onHide: () => void;
};

export function CustomToast({ message, type = 'success', onHide }: Props) {
  useEffect(() => {
    const timer = setTimeout(onHide, 3000);
    return () => clearTimeout(timer);
  }, [onHide]);

  const color = type === 'success' ? Theme.colors.success : type === 'error' ? Theme.colors.danger : Theme.colors.primary;

  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={styles.container}>
      <View style={[styles.toast, { borderLeftColor: color }]}>
        <Text style={[styles.text, { color }]}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 9999,
  },
  toast: {
    backgroundColor: Theme.colors.panel,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  text: {
    fontFamily: Theme.fonts.medium,
    fontSize: 15,
  },
});
