import { Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function HomeScreen() {
  return (
    <LinearGradient colors={['#0B132B', '#1C2541', '#0B132B']} style={styles.container}>
      <Text style={styles.title}>SCANNER INTELIGENTE</Text>
      <Text style={styles.subtitle}>Digitalize, extraia e gerencie suas contas.</Text>

      <Pressable
        style={styles.button}
        onPress={() => router.push('/captura')}
      >
        <LinearGradient colors={['#00F5FF', '#0088CC']} style={styles.buttonGradient}>
          <Text style={styles.buttonText}>+ NOVO DOCUMENTO</Text>
        </LinearGradient>
      </Pressable>

      <Pressable
        style={styles.buttonSecondary}
        onPress={() => router.push('/biblioteca')}
      >
        <Text style={styles.buttonTextSecondary}>ABRIR BIBLIOTECA</Text>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#00F5FF', marginBottom: 8, letterSpacing: 2 },
  subtitle: { fontSize: 16, color: '#A0AAB2', textAlign: 'center', marginBottom: 48 },
  button: { width: '100%', maxWidth: 320, borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  buttonGradient: { paddingVertical: 16, alignItems: 'center' },
  buttonText: { color: '#0B132B', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  buttonSecondary: { width: '100%', maxWidth: 320, paddingVertical: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#00F5FF' },
  buttonTextSecondary: { color: '#00F5FF', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
});
