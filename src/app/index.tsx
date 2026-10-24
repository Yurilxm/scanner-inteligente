import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { Theme } from '../constants/theme';
import { APP_NAME } from '../constants';
import { getCurrentProfile, changeProfile } from '../db/database';
import { useState } from 'react';

export default function HomeScreen() {
  const [profile, setProfile] = useState(getCurrentProfile());

  const handleToggleProfile = () => {
    const next = profile === 'yuri' ? 'mae' : 'yuri';
    changeProfile(next);
    setProfile(next);
  };

  return (
    <LinearGradient colors={[Theme.colors.background, Theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />

      <Pressable
        style={{ position: 'absolute', top: 60, right: 20, zIndex: 10, padding: 8 }}
        onPress={() => router.push('/configuracoes')}
      >
        <MaterialCommunityIcons name="cog" size={28} color={Theme.colors.primary} />
      </Pressable>

      <View style={styles.content}>
        <MaterialCommunityIcons name="radar" size={64} color={Theme.colors.primary} style={styles.icon} />
        <Text style={styles.title}>{APP_NAME.toUpperCase()}</Text>
        <Text style={styles.subtitle}>Monitore, digitalize e organize suas contas.</Text>

        <Pressable style={styles.profileButton} onPress={handleToggleProfile}>
          <MaterialCommunityIcons name="account-switch" size={20} color={Theme.colors.background} />
          <Text style={styles.profileText}>Perfil: {profile === 'yuri' ? 'YURI' : 'MÃE'}</Text>
        </Pressable>

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
  subtitle: { fontSize: 16, fontFamily: Theme.fonts.regular, color: Theme.colors.textSecondary, textAlign: 'center', marginBottom: 24 },
  profileButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.colors.primary, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, marginBottom: 32, gap: 8 },
  profileText: { color: Theme.colors.background, fontFamily: Theme.fonts.bold, fontSize: 14 },
  button: { width: '100%', maxWidth: 320, borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  buttonGradient: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { color: Theme.colors.background, fontSize: 16, fontFamily: Theme.fonts.bold, letterSpacing: 1 },
  buttonSecondary: { width: '100%', maxWidth: 320, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: Theme.colors.primary, gap: 8, backgroundColor: Theme.colors.panel },
  buttonTextSecondary: { color: Theme.colors.primary, fontSize: 16, fontFamily: Theme.fonts.bold, letterSpacing: 1 },
});
