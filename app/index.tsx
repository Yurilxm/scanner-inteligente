import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../src/components/ScannerBackground';
import { Theme } from '../src/constants/theme';
import { APP_NAME } from '../src/constants';

export default function HomeScreen() {
  return (
    <LinearGradient colors={[Theme.colors.background, Theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      
      <View style={styles.content}>
        <MaterialCommunityIcons name="radar" size={64} color={Theme.colors.primary} style={styles.icon} />
        <Text style={styles.title}>{APP_NAME.toUpperCase()}</Text>
        <Text style={styles.subtitle}>Monitore, digitalize e organize suas contas.</Text>

        <Pressable
          style={styles.button}
          onPress={() => router.push('/captura')}
        >
          <LinearGradient colors={[Theme.colors.primary, Theme.colors.success]} style={styles.buttonGradient}>
            <MaterialCommunityIcons name="barcode-scan" size={24} color={Theme.colors.background} />
            <Text style={styles.buttonText}>NOVO DOCUMENTO</Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          style={styles.buttonSecondary}
          onPress={() => router.push('/biblioteca')}
        >
          <MaterialCommunityIcons name="file-document-multiple-outline" size={24} color={Theme.colors.primary} />
          <Text style={styles.buttonTextSecondary}>ABRIR BIBLIOTECA</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  icon: { marginBottom: 16, textShadowColor: Theme.colors.primary, textShadowRadius: 20 },
  title: { fontSize: 32, fontFamily: Theme.fonts.bold, color: Theme.colors.primary, marginBottom: 8, letterSpacing: 2 },
  subtitle: { fontSize: 16, fontFamily: Theme.fonts.regular, color: Theme.colors.textSecondary, textAlign: 'center', marginBottom: 48 },
  button: { width: '100%', maxWidth: 320, borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  buttonGradient: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { color: Theme.colors.background, fontSize: 16, fontFamily: Theme.fonts.bold, letterSpacing: 1 },
  buttonSecondary: { width: '100%', maxWidth: 320, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: Theme.colors.primary, gap: 8, backgroundColor: Theme.colors.panel },
  buttonTextSecondary: { color: Theme.colors.primary, fontSize: 16, fontFamily: Theme.fonts.bold, letterSpacing: 1 },
});
