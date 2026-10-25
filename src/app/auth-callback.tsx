import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../theme';
import { loadAccount } from '../sync/loadAccount';

// Volta do login com Google (scannerinteligente://auth-callback?code=...).
// No Android o link reabre o app nesta rota: termina o login e devolve para a tela Conta.
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/conta');
}

export default function AuthCallbackScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const { code, error, error_description } = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [failure, setFailure] = useState<string | null>(error_description || error || null);

  useEffect(() => {
    if (!code || failure) return;
    let active = true;
    loadAccount()
      .then(account => account.finishLogin(code))
      .then(() => { if (active) leave(); })
      .catch(e => { if (active) setFailure(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, [code, failure]);

  // Sem código e sem erro (link aberto à toa): só volta
  useEffect(() => {
    if (!code && !failure) leave();
  }, [code, failure]);

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      {failure ? (
        <View style={styles.box}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={theme.colors.warning} />
          <Text style={styles.title}>Não foi possível entrar</Text>
          <Text style={styles.text}>{failure}</Text>
          <Pressable style={styles.button} onPress={leave}>
            <Text style={styles.buttonText}>Voltar</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.box}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.text}>Concluindo login…</Text>
        </View>
      )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  safe: { flex: 1, justifyContent: 'center', padding: 24 },
  box: { alignItems: 'center', gap: 12 },
  title: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 20 },
  text: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 15, textAlign: 'center' },
  button: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12, backgroundColor: theme.colors.primary },
  buttonText: { color: theme.colors.onPrimary, fontFamily: theme.fonts.bold, fontSize: 15 },
}));
