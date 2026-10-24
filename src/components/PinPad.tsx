import { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../theme';
import { PIN_MAX, PIN_MIN, isValidPinFormat } from '../utils/pin';

type Props = {
  title: string;
  subtitle?: string;
  color?: string;
  // 'enter': digita e confere; 'create': digita duas vezes para definir um PIN novo
  mode: 'enter' | 'create';
  // Modo 'enter': devolve null se o PIN está certo, ou a mensagem de erro
  onVerify?: (pin: string) => string | null;
  onCreate?: (pin: string) => void;
  onCancel?: () => void;
  cancelText?: string;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];

export function PinPad({ title, subtitle, color: colorProp, mode, onVerify, onCreate, onCancel, cancelText = 'Cancelar' }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const color = colorProp ?? theme.colors.primary;
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const step = mode === 'create' && firstPin !== null ? 'Confirme o PIN' : subtitle;

  const submit = (value: string) => {
    if (!isValidPinFormat(value)) {
      setError(`O PIN tem de ${PIN_MIN} a ${PIN_MAX} números.`);
      return;
    }
    if (mode === 'enter') {
      const message = onVerify?.(value) ?? null;
      setPin('');
      setError(message);
      return;
    }
    if (firstPin === null) {
      setFirstPin(value);
      setPin('');
      setError(null);
    } else if (firstPin === value) {
      onCreate?.(value);
    } else {
      setFirstPin(null);
      setPin('');
      setError('Os PINs não conferem. Comece de novo.');
    }
  };

  const press = (key: string) => {
    if (key === 'back') {
      setPin(p => p.slice(0, -1));
      return;
    }
    if (key === 'ok') {
      submit(pin);
      return;
    }
    if (pin.length >= PIN_MAX) return;
    setError(null);
    setPin(pin + key);
  };

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="lock-outline" size={36} color={color} />
      <Text style={styles.title}>{title}</Text>
      {step ? <Text style={styles.subtitle}>{step}</Text> : null}

      <View style={styles.dots}>
        {Array.from({ length: PIN_MAX }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: i < PIN_MIN || i < pin.length ? color : theme.colors.border },
              i < pin.length && { backgroundColor: color },
            ]}
          />
        ))}
      </View>
      <Text style={styles.error}>{error ?? ' '}</Text>

      <View style={styles.keypad}>
        {KEYS.map(key => (
          <Pressable
            key={key}
            onPress={() => press(key)}
            style={({ pressed }) => [styles.key, key === 'ok' && { backgroundColor: color }, pressed && styles.keyPressed]}
            accessibilityLabel={key === 'back' ? 'Apagar' : key === 'ok' ? 'Confirmar' : key}
          >
            {key === 'back' ? (
              <MaterialCommunityIcons name="backspace-outline" size={26} color={theme.colors.text} />
            ) : key === 'ok' ? (
              <MaterialCommunityIcons name="check" size={28} color={theme.colors.onAccent} />
            ) : (
              <Text style={styles.keyText}>{key}</Text>
            )}
          </Pressable>
        ))}
      </View>

      {onCancel && (
        <Pressable onPress={onCancel} style={styles.cancel}>
          <Text style={styles.cancelText}>{cancelText}</Text>
        </Pressable>
      )}
    </View>
  );
}

// Mesmo teclado dentro de um modal escuro (para pedir PIN sem sair da tela)
export function PinModal(props: Props) {
  const styles = useStyles();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <PinPad {...props} />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(theme => ({
  container: { alignItems: 'center', width: '100%' },
  title: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 20, marginTop: 12, textAlign: 'center' },
  subtitle: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 14, marginTop: 4, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 14, marginTop: 24 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  error: { color: theme.colors.danger, fontFamily: theme.fonts.medium, fontSize: 13, marginTop: 12, minHeight: 18, textAlign: 'center' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 264, marginTop: 8 },
  key: { width: 72, height: 72, borderRadius: 36, margin: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.panel, borderWidth: 1, borderColor: theme.colors.border },
  keyPressed: { opacity: 0.6 },
  keyText: { color: theme.colors.text, fontFamily: theme.fonts.medium, fontSize: 26 },
  cancel: { marginTop: 12, padding: 12 },
  cancelText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: 15 },
  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 360, backgroundColor: theme.colors.background, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: theme.colors.border },
}));
