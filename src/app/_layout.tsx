import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DocumentProvider } from '../context/DocumentContext';
import { initDatabase } from '../db/database';
import { cleanupDebugFiles } from '../utils/files';
import { applyProfileTheme } from '../utils/profileManager';
import { migrateToSinglePerfil } from '../utils/perfil';
import { useTheme } from '../theme';
import { AnimatedSplash } from '../components/AnimatedSplash';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';

// Segura a tela nativa até a animada (AnimatedSplash) estar desenhada por cima
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
  // SQLite é síncrono: inicializa antes do primeiro render, sem setState em effect
  const [dbReady] = useState(initApp);
  const theme = useTheme();

  // Fundo nativo da janela acompanha o tema (evita piscar na troca de telas)
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme]);

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_700Bold,
    JetBrainsMono_400Regular,
  });

  const ready = fontsLoaded && dbReady;
  const [splashVisible, setSplashVisible] = useState(true);
  const hideSplash = useCallback(() => setSplashVisible(false), []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {ready && (
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
      )}
      {splashVisible && <AnimatedSplash ready={ready} onFinish={hideSplash} />}
    </GestureHandlerRootView>
  );
}
