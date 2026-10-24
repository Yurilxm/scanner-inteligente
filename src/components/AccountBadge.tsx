import React from 'react';
import { Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { makeStyles, useTheme } from '../theme';

// Azul do selo de verificado (o mesmo do Google); legível sobre preto e sobre branco
const VERIFIED_BLUE = '#1A73E8';

type Props = {
  state: 'pending' | 'synced';
  email: string;
  onPress: () => void;
};

// Selo da conta Google no canto da tela inicial, no lugar do botão "Entrar"
export function AccountBadge({ state, email, onPress }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const synced = state === 'synced';

  return (
    <Pressable
      onPress={onPress}
      style={styles.touch}
      accessibilityRole="button"
      accessibilityLabel={synced
        ? `Conta Google ${email} conectada e verificada`
        : `Conta Google ${email} conectada. Falta a frase de recuperação neste celular`}
    >
      <Animated.View entering={ZoomIn.duration(250)} style={styles.circle}>
        <MaterialCommunityIcons name="google" size={20} color={theme.colors.primary} />
        <View style={styles.mark}>
          <MaterialCommunityIcons
            name={synced ? 'check-decagram' : 'alert-circle'}
            size={16}
            color={synced ? VERIFIED_BLUE : theme.colors.warning}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const useStyles = makeStyles(theme => ({
  touch: { padding: 6 },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
  },
  // Fundo do tema atrás do selo, para ele "recortar" o círculo como um selo de verificado
  mark: { position: 'absolute', right: -5, bottom: -5, borderRadius: 10, backgroundColor: theme.colors.background },
}));
