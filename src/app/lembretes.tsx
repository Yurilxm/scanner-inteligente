import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { InviteInbox } from '../components/InviteInbox';
import { GavetaPending } from '../components/GavetaPending';
import { makeStyles, useTheme } from '../theme';
import { getCurrentProfile, getDocumentById, listPendingDocuments, PendingDocument } from '../db/database';
import { appSetting } from '../utils/perfil';
import { listScheduledReminders, scheduleDueDateReminder } from '../utils/notifications';
import { ReminderItem, remindersForProfile } from '../utils/reminders';
import { daysUntil, formatBRL, isoToBR, monthShort, relativeDays, timeHHMM } from '../utils/format';

function reminderTitle(item: ReminderItem): string {
  if (item.doc) return item.doc.issuer || 'Conta sem emissor';
  return item.docId ? 'Conta' : 'Lembrete de teste';
}

function reminderDetails(item: ReminderItem): string {
  if (!item.doc) return item.body;
  const parts = [];
  if (item.doc.dueDate) parts.push(`Vence ${isoToBR(item.doc.dueDate)}`);
  const value = formatBRL(item.doc.totalAmountCents);
  if (value) parts.push(value);
  return parts.join(' · ');
}

export default function LembretesScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const [items, setItems] = useState<ReminderItem[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [missing, setMissing] = useState<PendingDocument[]>([]);

  const enabled = appSetting('notifications_enabled') === 'true';
  const daysBefore = parseInt(appSetting('notification_days_before'), 10) || 5;
  const daily = appSetting('notification_frequency') === 'daily';

  const load = useCallback(async () => {
    const reminders = await listScheduledReminders();
    const result = remindersForProfile(reminders, getCurrentProfile(), getDocumentById);
    setItems(result.items);
    setHidden(result.hiddenFromOtherProfiles);

    // Contas pendentes com vencimento futuro mas SEM lembrete agendado
    const scheduledIds = new Set(reminders.map(r => r.docId).filter((x): x is string => !!x));
    const pending = listPendingDocuments(getCurrentProfile());
    setMissing(pending.filter(d => d.dueDate && !scheduledIds.has(d.id)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().catch(() => active && setItems([]));
      return () => { active = false; };
    }, [load])
  );

  const reagendar = useCallback(async (doc: PendingDocument) => {
    if (!doc.dueDate) return;
    await scheduleDueDateReminder(doc.id, doc.issuer || 'Conta', doc.dueDate);
    await load();
  }, [load]);

  const openDoc = (item: ReminderItem) => {
    if (item.doc) router.push({ pathname: '/detalhes', params: { id: item.doc.id } });
  };

  const next = items?.[0];

  const header = (
    <View>
      <InviteInbox />
      <GavetaPending />
      {!enabled && (
        <View style={styles.warning}>
          <MaterialCommunityIcons name="bell-off-outline" size={20} color={theme.colors.warning} />
          <Text style={styles.warningText}>Notificações desativadas. Novas contas não terão aviso.</Text>
        </View>
      )}

      {next && (
        <Pressable style={styles.hero} onPress={() => openDoc(next)}>
          <Text style={styles.heroLabel}>PRÓXIMO AVISO</Text>
          {next.when && (
            <Text style={styles.heroDate}>
              {String(next.when.getDate()).padStart(2, '0')} {monthShort(next.when)} · {timeHHMM(next.when)}
            </Text>
          )}
          {next.when && <Text style={styles.heroRelative}>{relativeDays(daysUntil(next.when))}</Text>}
          <Text style={styles.heroTitle}>{reminderTitle(next)}</Text>
          <Text style={styles.heroDetails}>{reminderDetails(next)}</Text>
        </Pressable>
      )}

      {missing.length > 0 && (
        <View style={styles.missingSection}>
          <Text style={styles.missingTitle}>SEM LEMBRETE AGENDADO</Text>
          <Text style={styles.missingHint}>
            Essas contas vencem em breve mas o aviso nao foi criado. Toque para agendar.
          </Text>
          {missing.map(doc => (
            <Pressable
              key={doc.id}
              style={styles.missingCard}
              onPress={() => reagendar(doc)}
            >
              <MaterialCommunityIcons name="bell-plus-outline" size={24} color={theme.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.missingDocTitle} numberOfLines={1}>
                  {doc.issuer || 'Conta sem emissor'}
                </Text>
                <Text style={styles.missingDocDetails} numberOfLines={1}>
                  Vence {isoToBR(doc.dueDate)}{doc.totalAmountCents ? ` · ${formatBRL(doc.totalAmountCents)}` : ''}
                </Text>
              </View>
              <Text style={styles.missingAction}>Agendar</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable style={styles.configRow} onPress={() => router.push('/configuracoes')}>
        <MaterialCommunityIcons name="clock-outline" size={18} color={theme.colors.textSecondary} />
        <Text style={styles.configText}>
          Avisos às 9h, {daysBefore} {daysBefore === 1 ? 'dia' : 'dias'} antes{daily ? ', todo dia até o vencimento' : ''}
        </Text>
        <Text style={styles.configLink}>Alterar</Text>
      </Pressable>

      {items && items.length > 1 && <Text style={styles.sectionTitle}>TODOS OS AVISOS</Text>}
    </View>
  );

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>LEMBRETES</Text>
          <View style={{ width: 28 }} />
        </View>

        {items === null ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 48 }} />
        ) : (
          <FlatList
            data={items.length > 1 ? items.slice(1) : []}
            keyExtractor={item => item.identifier}
            contentContainerStyle={styles.list}
            ListHeaderComponent={header}
            ListEmptyComponent={items.length === 0 ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="bell-sleep-outline" size={56} color={theme.colors.textSecondary} />
                <Text style={styles.emptyTitle}>Nenhum lembrete agendado</Text>
                <Text style={styles.emptyText}>
                  Ao salvar uma conta com vencimento futuro, o Control agenda um aviso para você.
                </Text>
              </View>
            ) : undefined}
            ListFooterComponent={hidden > 0 ? (
              <Text style={styles.footer}>
                {hidden} {hidden === 1 ? 'lembrete de outra gaveta não aparece' : 'lembretes de outras gavetas não aparecem'} aqui.
              </Text>
            ) : undefined}
            renderItem={({ item }) => (
              <Pressable style={styles.card} onPress={() => openDoc(item)} disabled={!item.doc}>
                <View style={styles.dateBox}>
                  <Text style={styles.dateDay}>{item.when ? String(item.when.getDate()).padStart(2, '0') : '--'}</Text>
                  <Text style={styles.dateMonth}>{item.when ? monthShort(item.when) : ''}</Text>
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{reminderTitle(item)}</Text>
                  {item.when && (
                    <Text style={styles.cardWhen}>
                      Aviso às {timeHHMM(item.when)} · {relativeDays(daysUntil(item.when))}
                    </Text>
                  )}
                  <Text style={styles.cardDetails} numberOfLines={2}>{reminderDetails(item)}</Text>
                </View>
                {item.doc && <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.primary} />}
              </Pressable>
            )}
          />
        )}
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

  warning: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft, marginBottom: 16 },
  warningText: { flex: 1, color: theme.colors.warning, fontFamily: theme.fonts.medium, fontSize: 13 },

  hero: { padding: 20, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, marginBottom: 12 },
  heroLabel: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 2 },
  heroDate: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 32, marginTop: 8 },
  heroRelative: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 15, marginTop: 2 },
  heroTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 18, marginTop: 14 },
  heroDetails: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 14, marginTop: 2 },

  missingSection: { marginBottom: 16 },
  missingTitle: { color: theme.colors.warning, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 2, marginBottom: 4 },
  missingHint: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 12, marginBottom: 8 },
  missingCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft, marginBottom: 8 },
  missingDocTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 15 },
  missingDocDetails: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 12, marginTop: 2 },
  missingAction: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 13 },

  configRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4, marginBottom: 8 },
  configText: { flex: 1, color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13 },
  configLink: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 13 },

  sectionTitle: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 2, marginTop: 8, marginBottom: 8 },

  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, marginBottom: 10 },
  dateBox: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  dateDay: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 22, lineHeight: 26 },
  dateMonth: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 11, letterSpacing: 1 },
  cardContent: { flex: 1 },
  cardTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 16 },
  cardWhen: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 13, marginTop: 2 },
  cardDetails: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13, marginTop: 2 },

  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 18, marginTop: 16 },
  emptyText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  footer: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 12, textAlign: 'center', marginTop: 12 },
}));
