import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DocumentProvider } from '../src/context/DocumentContext';
import { initDatabase } from '../src/db/database';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';

// Impede o splash screen de sumir automaticamente
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_700Bold,
    JetBrainsMono_400Regular,
  });

  useEffect(() => {
    initDatabase();
    setDbReady(true);
  }, []);

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
