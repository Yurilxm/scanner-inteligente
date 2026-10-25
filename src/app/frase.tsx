import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { CustomModal } from '../components/CustomModal';
import { makeStyles, useTheme } from '../theme';
import { loadAccount } from '../sync/loadAccount';

type Mode = 'criar' | 'restaurar' | 'ver';

const normalizeWord = (w: string) => w.normalize('NFKD').toLowerCase().trim();

// 3 posições diferentes, em ordem, para conferir se a frase foi anotada
function pickPositions(): number[] {
  const all = Array.from({ length: 12 }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, 3).sort((a, b) => a - b);
}

function WordGrid({ words }: { words: string[] }) {
  const styles = useStyles();
  return (
    <View style={styles.grid}>
      {words.map((word, i) => (
        <View key={i} style={styles.wordCell}>
          <Text style={styles.wordIndex}>{i + 1}</Text>
          <Text style={styles.word}>{word}</Text>
        </View>
      ))}
    </View>
  );
}

export default function FraseScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const { modo } = useLocalSearchParams<{ modo?: Mode }>();
  const mode: Mode = modo === 'restaurar' || modo === 'ver' ? modo : 'criar';

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [paperMode, setPaperMode] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [step, setStep] = useState<'mostrar' | 'confirmar'>('mostrar');
  const [noted, setNoted] = useState(false);
  const [revealed, setRevealed] = useState(mode !== 'ver');
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [restoreText, setRestoreText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string; done?: boolean } | null>(null);
  const positions = useMemo(() => pickPositions(), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const account = await loadAccount();
        const status = await account.getAccountStatus();
        if (status.kind !== 'signed-in') throw new Error('Entre na sua conta primeiro.');
        if (!active) return;
        setUserId(status.userId);
        setEmail(status.email);
        if (mode === 'criar') setPhrase(account.newRecoveryPhrase());
        if (mode === 'ver') setPhrase(await account.readStoredPhrase(status.userId));
      } catch (e) {
        if (active) setNotice({ title: 'Não foi possível abrir', message: e instanceof Error ? e.message : String(e), done: true });
      }
    })();
    return () => { active = false; };
  }, [mode]);

  const words = phrase?.split(' ') ?? [];
  const typedWords = restoreText.trim() ? restoreText.trim().split(/\s+/) : [];

  const finishCreate = async () => {
    if (!userId || !phrase) return;
    const wrong = positions.filter((pos, i) => normalizeWord(answers[i]) !== normalizeWord(words[pos]));
    if (wrong.length > 0) {
      setNotice({ title: 'Palavra diferente', message: `Confira a palavra nº ${wrong.map(p => p + 1).join(', ')} na sua anotação.` });
      return;
    }
    setBusy(true);
    try {
      await (await loadAccount()).confirmNewPhrase(userId, phrase);
      setNotice({ title: 'Tudo pronto', message: 'Sua frase foi registrada. Guarde a anotação em lugar seguro, fora do celular. Em Conta e backup você também pode salvar uma cópia na sua conta Google.', done: true });
    } catch (e) {
      setNotice({ title: 'Não foi possível concluir', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  // Caminho recomendado: guarda a frase nas senhas da conta Google e registra a chave pública
  const finishWithGoogle = async () => {
    if (!userId || !phrase) return;
    setBusy(true);
    try {
      const account = await loadAccount();
      const saved = await account.savePhraseToGoogle(email, phrase);
      if (!saved) return; // recusou na janela do Android: continua aqui para escolher de novo
      await account.confirmNewPhrase(userId, phrase);
      setNotice({
        title: 'Tudo pronto',
        message: 'Sua frase foi salva no Gerenciador de Senhas da sua conta Google ("Frase de recuperação do Control"). Num celular novo, é só recuperar de lá.',
        done: true,
      });
    } catch (e) {
      setNotice({ title: 'Não foi possível salvar', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const finishRestore = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await (await loadAccount()).restoreFromPhrase(userId, restoreText);
      setNotice({ title: 'Celular conectado', message: 'Frase conferida. Seus dados da nuvem podem ser abertos neste celular.', done: true });
    } catch (e) {
      setNotice({ title: 'Frase não aceita', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'criar' ? 'FRASE DE RECUPERAÇÃO' : mode === 'restaurar' ? 'RESTAURAR' : 'SUA FRASE';

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 28 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {mode !== 'restaurar' && !phrase && !notice && <ActivityIndicator size="large" color={theme.colors.primary} />}

            {mode === 'criar' && phrase && step === 'mostrar' && !paperMode && (
              <>
                <View style={styles.warning}>
                  <MaterialCommunityIcons name="key-variant" size={22} color={theme.colors.warning} />
                  <Text style={styles.warningText}>
                    Foi criada uma frase de 12 palavras: é a chave que abre seus dados da nuvem. Guarde-a para usar o Control em outro celular.
                  </Text>
                </View>
                <Pressable style={[styles.primaryButton, busy && { opacity: 0.6 }]} disabled={busy} onPress={finishWithGoogle}>
                  {busy ? <ActivityIndicator color={theme.colors.onPrimary} /> : (
                    <>
                      <MaterialCommunityIcons name="google" size={20} color={theme.colors.onPrimary} />
                      <Text style={styles.primaryText}>  Salvar na minha conta Google</Text>
                    </>
                  )}
                </Pressable>
                <Text style={styles.text}>
                  Fica no Gerenciador de Senhas da sua conta Google. O servidor do app continua sem conseguir ler suas contas.
                </Text>
                <Pressable style={styles.linkButton} onPress={() => setPaperMode(true)} disabled={busy}>
                  <Text style={styles.linkText}>Prefiro anotar em papel</Text>
                </Pressable>
              </>
            )}

            {mode === 'criar' && phrase && step === 'mostrar' && paperMode && (
              <>
                <View style={[styles.warning]}>
                  <MaterialCommunityIcons name="key-variant" size={22} color={theme.colors.warning} />
                  <Text style={styles.warningText}>
                    Anote as 12 palavras, na ordem, em papel. Não tire print nem envie por mensagem. Quem tiver a frase abre seus dados; se você perder a frase e o celular, ninguém consegue recuperar.
                  </Text>
                </View>
                <WordGrid words={words} />
                <Pressable style={styles.checkRow} onPress={() => setNoted(n => !n)}>
                  <MaterialCommunityIcons name={noted ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={theme.colors.primary} />
                  <Text style={styles.checkText}>Anotei a frase em um lugar seguro</Text>
                </Pressable>
                <Pressable style={[styles.primaryButton, !noted && { opacity: 0.4 }]} disabled={!noted} onPress={() => setStep('confirmar')}>
                  <Text style={styles.primaryText}>Continuar</Text>
                </Pressable>
                <Pressable style={styles.linkButton} onPress={() => setPaperMode(false)}>
                  <Text style={styles.linkText}>Salvar na conta Google em vez disso</Text>
                </Pressable>
              </>
            )}

            {mode === 'criar' && phrase && step === 'confirmar' && (
              <>
                <Text style={styles.text}>Para garantir que a anotação está certa, digite estas palavras:</Text>
                {positions.map((pos, i) => (
                  <View key={pos}>
                    <Text style={styles.label}>Palavra nº {pos + 1}</Text>
                    <TextInput
                      style={styles.input}
                      value={answers[i]}
                      onChangeText={v => setAnswers(a => a.map((x, j) => (j === i ? v : x)))}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholderTextColor={theme.colors.textSecondary}
                    />
                  </View>
                ))}
                <Pressable style={[styles.primaryButton, busy && { opacity: 0.6 }]} disabled={busy} onPress={finishCreate}>
                  {busy ? <ActivityIndicator color={theme.colors.onPrimary} /> : <Text style={styles.primaryText}>Confirmar</Text>}
                </Pressable>
                <Pressable style={styles.linkButton} onPress={() => setStep('mostrar')}>
                  <Text style={styles.linkText}>Ver a frase de novo</Text>
                </Pressable>
              </>
            )}

            {mode === 'restaurar' && (
              <>
                <Text style={styles.text}>Digite as 12 palavras da sua frase, na ordem, separadas por espaço.</Text>
                <TextInput
                  style={[styles.input, styles.restoreInput]}
                  value={restoreText}
                  onChangeText={setRestoreText}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="palavra1 palavra2 palavra3 ..."
                  placeholderTextColor={theme.colors.textSecondary}
                  textAlignVertical="top"
                />
                <Text style={[styles.label, typedWords.length === 12 && { color: theme.colors.success }]}>
                  {typedWords.length} de 12 palavras
                </Text>
                <Pressable
                  style={[styles.primaryButton, (busy || typedWords.length !== 12) && { opacity: 0.4 }]}
                  disabled={busy || typedWords.length !== 12}
                  onPress={finishRestore}
                >
                  {busy ? <ActivityIndicator color={theme.colors.onPrimary} /> : <Text style={styles.primaryText}>Conferir frase</Text>}
                </Pressable>
              </>
            )}

            {mode === 'ver' && phrase && (
              <>
                <View style={styles.warning}>
                  <MaterialCommunityIcons name="eye-outline" size={22} color={theme.colors.warning} />
                  <Text style={styles.warningText}>Confira se ninguém está olhando a tela. Não tire print.</Text>
                </View>
                {revealed ? <WordGrid words={words} /> : (
                  <Pressable style={styles.primaryButton} onPress={() => setRevealed(true)}>
                    <Text style={styles.primaryText}>Mostrar frase</Text>
                  </Pressable>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <CustomModal
        visible={!!notice}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        onConfirm={() => {
          const done = notice?.done;
          setNotice(null);
          if (done) router.back();
        }}
      />
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.bold, color: theme.colors.primary, letterSpacing: 1 },
  content: { padding: 16, gap: 14 },
  warning: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft },
  warningText: { flex: 1, color: theme.colors.text, fontFamily: theme.fonts.regular, fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wordCell: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel },
  wordIndex: { width: 22, color: theme.colors.textSecondary, fontFamily: theme.fonts.mono, fontSize: 13, textAlign: 'right' },
  word: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkText: { flex: 1, color: theme.colors.text, fontFamily: theme.fonts.medium, fontSize: 15 },
  text: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 14, lineHeight: 20 },
  label: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 13, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 12, fontSize: 16, fontFamily: theme.fonts.regular, color: theme.colors.text, backgroundColor: theme.colors.panel },
  restoreInput: { minHeight: 120 },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 14, backgroundColor: theme.colors.primary },
  primaryText: { color: theme.colors.onPrimary, fontFamily: theme.fonts.bold, fontSize: 16 },
  linkButton: { alignItems: 'center', padding: 12 },
  linkText: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 14 },
}));
