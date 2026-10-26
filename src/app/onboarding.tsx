import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';

import { ScannerBackground } from '../components/ScannerBackground';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { makeStyles, useTheme } from '../theme';
import { createProfile, PROFILE_COLORS } from '../db/profiles';
import { updatePerfil, setAppPin, setAppSettingValue } from '../utils/perfil';
import { signInWithGoogle } from '../sync/auth';

export default function OnboardingScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const [step, setStep] = useState<'login' | 'profile' | 'auth_choice' | 'pin'>('login');
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROFILE_COLORS[0]);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);
      const session = await signInWithGoogle();
      if (session) setStep('profile');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível conectar ao Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleProfile = () => {
    if (name.trim().length < 2) return Alert.alert('Ops', 'Digite um nome válido.');
    updatePerfil({ name: name.trim(), color, icon: 'initial' });
    setStep('auth_choice');
  };

  const finishSetup = (pinToSave: string) => {
    setAppPin(pinToSave);
    createProfile({ name: 'Minhas contas', color: color, icon: 'briefcase' });
    router.replace('/');
  };

  const handleBiometrics = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return Alert.alert('Ops', 'Seu celular não tem sensor biométrico.');

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return Alert.alert('Ops', 'Nenhuma digital ou rosto cadastrado no celular.');

    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Configure sua biometria',
      fallbackLabel: 'Usar PIN',
    });

    if (auth.success) {
      setAppSettingValue('use_biometrics', 'true');
      finishSetup('1234'); // PIN de fallback invisível
    }
  };

  const handlePin = () => {
    if (pin.length < 4) return Alert.alert('Ops', 'O PIN deve ter pelo menos 4 dígitos.');
    setAppSettingValue('use_biometrics', 'false');
    finishSetup(pin);
  };

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center' }}>
          
          {step === 'login' && (
            <View style={styles.box}>
              <MaterialCommunityIcons name="radar" size={80} color={theme.colors.primary} style={{ marginBottom: 20 }} />
              <Text style={styles.title}>BEM-VINDO AO CONTROL</Text>
              <Text style={styles.subtitle}>Para começar, conecte sua conta Google para manter seus dados seguros na nuvem.</Text>
              <Pressable style={styles.btnPrimary} onPress={handleLogin} disabled={loading}>
                <MaterialCommunityIcons name="google" size={24} color={theme.colors.background} />
                <Text style={styles.btnText}>{loading ? 'CONECTANDO...' : 'ENTRAR COM GOOGLE'}</Text>
              </Pressable>
            </View>
          )}

          {step === 'profile' && (
            <View style={styles.box}>
              <Text style={styles.title}>COMO PODEMOS TE CHAMAR?</Text>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <ProfileAvatar name={name || '?'} color={color} icon="initial" photoUri={null} size={100} />
              </View>
              <TextInput style={styles.input} placeholder="Seu nome" placeholderTextColor={theme.colors.textSecondary} value={name} onChangeText={setName} autoFocus />
              <Text style={styles.label}>Escolha uma cor:</Text>
              <View style={styles.colorRow}>
                {PROFILE_COLORS.slice(0, 5).map(c => (
                  <Pressable key={c} onPress={() => setColor(c)} style={[styles.colorCircle, { backgroundColor: c, borderColor: color === c ? '#FFF' : 'transparent' }]} />
                ))}
              </View>
              <Pressable style={styles.btnPrimary} onPress={handleProfile}>
                <Text style={styles.btnText}>PRÓXIMO</Text>
              </Pressable>
            </View>
          )}

          {step === 'auth_choice' && (
            <View style={styles.box}>
              <Text style={styles.title}>PROTEJA SEU APP</Text>
              <Text style={styles.subtitle}>Como você quer bloquear o Control quando não estiver usando?</Text>
              
              <Pressable style={[styles.btnSecondary, { marginBottom: 16 }]} onPress={handleBiometrics}>
                <MaterialCommunityIcons name="fingerprint" size={32} color={theme.colors.primary} />
                <Text style={styles.btnTextSecondary}>USAR BIOMETRIA</Text>
              </Pressable>

              <Pressable style={styles.btnSecondary} onPress={() => setStep('pin')}>
                <MaterialCommunityIcons name="dialpad" size={32} color={theme.colors.primary} />
                <Text style={styles.btnTextSecondary}>CRIAR UM PIN</Text>
              </Pressable>
            </View>
          )}

          {step === 'pin' && (
            <View style={styles.box}>
              <Text style={styles.title}>CRIE SEU PIN DE SEGURANÇA</Text>
              <Text style={styles.subtitle}>Este PIN será pedido toda vez que você abrir o Control.</Text>
              <TextInput style={styles.input} placeholder="Digite de 4 a 6 números" placeholderTextColor={theme.colors.textSecondary} value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus />
              <Pressable style={styles.btnPrimary} onPress={handlePin}>
                <Text style={styles.btnText}>FINALIZAR E ENTRAR</Text>
              </Pressable>
            </View>
          )}

        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: 24 },
  box: { backgroundColor: theme.colors.panel, padding: 24, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border },
  title: { fontSize: 22, fontFamily: theme.fonts.bold, color: theme.colors.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: theme.fonts.regular, color: theme.colors.textSecondary, marginBottom: 24, textAlign: 'center', lineHeight: 20 },
  input: { backgroundColor: theme.colors.background, color: theme.colors.text, fontFamily: theme.fonts.medium, fontSize: 16, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 16 },
  label: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, marginBottom: 8 },
  colorRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  colorCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 2 },
  btnPrimary: { backgroundColor: theme.colors.primary, padding: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnSecondary: { backgroundColor: theme.colors.panel, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  btnText: { color: theme.colors.background, fontFamily: theme.fonts.bold, fontSize: 16 },
  btnTextSecondary: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 16 },
}));
