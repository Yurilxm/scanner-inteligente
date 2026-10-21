import { Stack } from 'expo-router';
import { DocumentProvider } from '../src/context/DocumentContext';

export default function RootLayout() {
  return (
    <DocumentProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Scanner Inteligente' }} />
        <Stack.Screen name="captura" options={{ title: 'Captura' }} />
        <Stack.Screen name="revisao" options={{ title: 'Revisao' }} />
      </Stack>
    </DocumentProvider>
  );
}
