import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { makeStyles, useTheme } from '../theme';
import { getProfile } from '../db/profiles';
import type { HistoryEntry } from '../sync/sharing';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Dia por extenso para os cabeçalhos ("hoje", "ontem" ou a data)
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoje';
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function HistoricoScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = id ? getProfile(id) : null;
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const sharing = await import('../sync/sharing');
      const page = await sharing.loadHistory(id, before);
      setEntries(prev => (before === null ? page.entries : [...prev, ...page.entries]));
      setNext(page.next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(null); }, [load]));

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>HISTÓRICO</Text>
          <View style={{ width: 28 }} />
        </View>

        <FlatList
          data={entries}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.help}>
              Tudo que acontece em {profile?.name ?? 'esta gaveta'} fica registrado pelo servidor, e ninguém consegue apagar.
            </Text>
          }
          renderItem={({ item, index }) => {
            const showDay = index === 0 || dayLabel(entries[index - 1].at) !== dayLabel(item.at);
            return (
              <>
                {showDay && <Text style={styles.day}>{dayLabel(item.at)}</Text>}
                <View style={styles.row}>
                  <View style={styles.iconBox}>
                    <MaterialCommunityIcons name={item.icon as never} size={20} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.text}>{item.text}</Text>
                    <Text style={styles.time}>{new Date(item.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                </View>
              </>
            );
          }}
          ListEmptyComponent={!loading && !error ? <Text style={styles.help}>Nada registrado ainda.</Text> : undefined}
          ListFooterComponent={
            <View style={styles.footer}>
              {loading && <ActivityIndicator color={theme.colors.primary} />}
              {error && (
                <>
                  <Text style={styles.error}>{error}</Text>
                  <Pressable style={styles.secondaryButton} onPress={() => load(null)}>
                    <Text style={styles.secondaryText}>Tentar de novo</Text>
                  </Pressable>
                </>
              )}
              {!loading && !error && next !== null && (
                <Pressable style={styles.secondaryButton} onPress={() => load(next)}>
                  <Text style={styles.secondaryText}>Ver mais antigos</Text>
                </Pressable>
              )}
            </View>
          }
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.bold, color: theme.colors.primary, letterSpacing: 1 },
  list: { padding: 16, paddingTop: 4 },
  help: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13, marginBottom: 8, lineHeight: 18 },
  day: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 2, marginTop: 16, marginBottom: 6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, marginBottom: 8 },
  iconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  text: { color: theme.colors.text, fontFamily: theme.fonts.regular, fontSize: 14, lineHeight: 20 },
  time: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 12, marginTop: 2 },
  footer: { paddingVertical: 16, gap: 10 },
  error: { color: theme.colors.warning, fontFamily: theme.fonts.regular, fontSize: 14, textAlign: 'center' },
  secondaryButton: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary },
  secondaryText: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 15 },
}));
