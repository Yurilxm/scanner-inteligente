import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DocumentProvider } from '../context/DocumentContext';
import { initDatabase } from '../db/database';
import { cleanupDebugFiles } from '../utils/files';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';

// Impede o splash screen de sumir automaticamente
SplashScreen.preventAutoHideAsync();

function initApp() {
  try {
    initDatabase();
  } catch (e) {
    console.error('Falha ao inicializar banco:', e);
  }
  cleanupDebugFiles();
  return true;
}

export default function RootLayout() {
  // SQLite é síncrono: inicializa antes do primeiro render, sem setState em effect
  const [dbReady] = useState(initApp);

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_700Bold,
    JetBrainsMono_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded && dbReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, dbReady]);

  if (!fontsLoaded || !dbReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
      <DocumentProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="captura" />
        <Stack.Screen name="revisao" />
        <Stack.Screen name="biblioteca" />
        <Stack.Screen name="detalhes" />
        <Stack.Screen name="configuracoes" />
      </Stack>
    </DocumentProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
