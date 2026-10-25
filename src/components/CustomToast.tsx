import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, useTheme } from '../theme';

type Props = {
  message: string;
  type?: 'success' | 'error' | 'info';
  onHide: () => void;
};

export function CustomToast({ message, type = 'success', onHide }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  // Logo abaixo da barra de status, em qualquer celular
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const timer = setTimeout(onHide, 3000);
    return () => clearTimeout(timer);
  }, [onHide]);

  const color = type === 'success' ? theme.colors.success : type === 'error' ? theme.colors.danger : theme.colors.primary;

  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={[styles.container, { top: insets.top + 12 }]}>
      <View style={[styles.toast, { borderLeftColor: color }]}>
        <Text style={[styles.text, { color }]}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles(theme => ({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 9999,
  },
  toast: {
    backgroundColor: theme.colors.panel,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  text: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
  },
}));
