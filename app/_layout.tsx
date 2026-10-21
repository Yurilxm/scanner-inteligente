import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { DocumentProvider } from '../src/context/DocumentContext';
import { initDatabase } from '../src/db/database';

export default function RootLayout() {
  useEffect(() => {
    initDatabase();
  }, []);

  return (
    <DocumentProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Scanner Inteligente' }} />
        <Stack.Screen name="captura" options={{ title: 'Captura' }} />
        <Stack.Screen name="revisao" options={{ title: 'Revisao' }} />
        <Stack.Screen name="biblioteca" options={{ title: 'Biblioteca' }} />
      </Stack>
    </DocumentProvider>
  );
}
