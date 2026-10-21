import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useDocument } from '../src/context/DocumentContext';

export default function HomeScreen() {
  const { imageUri, reset } = useDocument();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scanner Inteligente</Text>
      <Text style={styles.subtitle}>
        Fotografe ou importe um documento para comecar.
      </Text>

      <Pressable
        style={styles.button}
        onPress={() => router.push('/captura')}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Novo documento</Text>
      </Pressable>

      <Pressable
        style={[styles.button, styles.buttonSecondary]}
        onPress={() => router.push('/biblioteca')}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Biblioteca</Text>
      </Pressable>

      {imageUri ? (
        <View style={styles.uriBox}>
          <Text style={styles.uriLabel}>Imagem selecionada:</Text>
          <Text style={styles.uriText} numberOfLines={2}>
            {imageUri}
          </Text>
          <Pressable onPress={reset} accessibilityRole="button">
            <Text style={styles.linkText}>Limpar</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#0a7ea4',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 240,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0a7ea4',
    marginTop: 12,
  },
  buttonTextSecondary: { color: '#0a7ea4' },
  uriBox: {
    marginTop: 32,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    maxWidth: 320,
  },
  uriLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  uriText: { fontSize: 12, color: '#333', marginBottom: 8 },
  linkText: { color: '#0a7ea4', fontSize: 14 },
});
