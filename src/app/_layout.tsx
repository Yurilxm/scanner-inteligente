import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, Pressable, AppState } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';

import { DocumentProvider } from '../context/DocumentContext';
import { initDatabase } from '../db/database';
import { cleanupDebugFiles } from '../utils/files';
import { applyProfileTheme } from '../utils/profileManager';
import { migrateToSinglePerfil, getPerfil, needsAppPin, appSetting, tryUnlockApp } from '../utils/perfil';
import { useTheme } from '../theme';
import { AppStateFlag } from '../utils/AppStateFlag';
import { AnimatedSplash } from '../components/AnimatedSplash';
import { ScannerBackground } from '../components/ScannerBackground';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { PinPad } from '../components/PinPad';

SplashScreen.preventAutoHideAsync();

function initApp() {
  try {
    initDatabase();
    migrateToSinglePerfil();
    applyProfileTheme();
  } catch (e) {
    console.error('Falha ao inicializar banco:', e);
  }
  cleanupDebugFiles();
  return true;
}

export default function RootLayout() {
  const [dbReady] = useState(initApp);
  const theme = useTheme();
  const styles = useStyles();
  
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_700Bold,
    JetBrainsMono_400Regular,
  });

  const ready = fontsLoaded && dbReady;
  const [splashVisible, setSplashVisible] = useState(true);
  const hideSplash = useCallback(() => setSplashVisible(false), []);

  // Lógica de Bloqueio Global
  const [isLocked, setIsLocked] = useState(needsAppPin);

  const handleUnlockBio = useCallback(async () => {
    try {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Desbloqueie o Control' });
      if (res.success) setIsLocked(false);
    } catch (e) {
      console.warn('Falha na biometria', e);
    }
  }, []);

  useEffect(() => {
    let lockTimeout: ReturnType<typeof setTimeout>;
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Espera 2 segundos antes de trancar (evita trancar ao abrir teclado, camera ou modal)
        lockTimeout = setTimeout(() => {
          if (!AppStateFlag.isPickingImage() && needsAppPin()) setIsLocked(true);
        }, 2000);
      } else if (nextAppState === 'active') {
        if (lockTimeout) clearTimeout(lockTimeout);
      }
    });
    return () => { clearTimeout(lockTimeout); sub.remove(); };
  }, []);

  useEffect(() => {
    if (isLocked && appSetting('use_biometrics') === 'true') {
      const timer = setTimeout(() => {
        handleUnlockBio();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isLocked, handleUnlockBio]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  if (isLocked) {
    const perfil = getPerfil();
    const useBio = appSetting('use_biometrics') === 'true';
    const hasPin = perfil.hasPin;

    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <SafeAreaProvider>
          <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={{ flex: 1 }}>
            <ScannerBackground />
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
              <View style={styles.lockContent}>
                <ProfileAvatar name={perfil.name} color={perfil.color} icon={perfil.icon} photoUri={perfil.photoUri} size={88} />
                {hasPin ? (
                  <PinPad
                    mode="enter"
                    title={perfil.name}
                    subtitle="Digite o PIN para abrir o Control"
                    color={perfil.color}
                    onVerify={pin => {
                      const error = tryUnlockApp(pin);
                      if (!error) setIsLocked(false);
                      return error;
                    }}
                  />
                ) : (
                  <View style={{ alignItems: 'center', marginTop: 24 }}>
                    <Text style={{ fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.text, marginBottom: 8 }}>App Bloqueado</Text>
                    {useBio && (
                      <Pressable 
                        style={{ backgroundColor: theme.colors.primary, padding: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        onPress={handleUnlockBio}
                      >
                        <MaterialCommunityIcons name="fingerprint" size={24} color={theme.colors.background} />
                        <Text style={{ fontFamily: theme.fonts.bold, color: theme.colors.background }}>TENTAR NOVAMENTE</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            </SafeAreaView>
          </LinearGradient>
        </SafeAreaProvider>
        {splashVisible && <AnimatedSplash ready={ready} onFinish={hideSplash} />}
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaProvider>
        <DocumentProvider>
          <StatusBar style={theme.statusBar} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="captura" />
            <Stack.Screen name="revisao" />
            <Stack.Screen name="biblioteca" />
            <Stack.Screen name="detalhes" />
            <Stack.Screen name="configuracoes" />
            <Stack.Screen name="lembretes" />
            <Stack.Screen name="perfis" />
            <Stack.Screen name="perfil" />
            <Stack.Screen name="conta" />
            <Stack.Screen name="frase" />
            <Stack.Screen name="auth-callback" />
            <Stack.Screen name="gaveta" />
            <Stack.Screen name="convidar" />
            <Stack.Screen name="ler-convite" />
            <Stack.Screen name="convite" />
            <Stack.Screen name="historico" />
            <Stack.Screen name="meu-perfil" />
          </Stack>
        </DocumentProvider>
      </SafeAreaProvider>
      {splashVisible && <AnimatedSplash ready={ready} onFinish={hideSplash} />}
    </GestureHandlerRootView>
  );
}

const useStyles = () => {
  const theme = useTheme();
  return {
    lockContent: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24, gap: 8 },
  };
};
