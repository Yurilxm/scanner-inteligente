import { useState, useCallback, useMemo } from 'react';
import { View, Text, SectionList, FlatList, Pressable, Image, TextInput, Modal, ScrollView, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getDocuments, deleteDocumentById, togglePaidStatus, getCurrentProfile, SavedDocument } from '../db/database';
import { generateCSVFile, generatePDFFile, shareFile } from '../utils/export';
import { cancelDueDateReminders, syncDueDateReminders } from '../utils/notifications';
import { formatBRL } from '../utils/format';
import { File } from 'expo-file-system';
// getContentUriAsync da API nova é só um stub que lança erro; a implementação está na legacy
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { makeStyles, useTheme } from '../theme';
import { CustomModal } from '../components/CustomModal';
import { scheduleActiveSync } from '../sync/schedule';
import { canEdit, canPay } from '../db/profiles';
import { activeProfileRole } from '../utils/profileManager';

type FilterType = 'TODAS' | 'PENDENTES' | 'PAGAS';

export default function BibliotecaScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('TODAS');
  const [docToDelete, setDocToDelete] = useState<SavedDocument | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ visible: boolean, content: string, uri: string }>({ visible: false, content: '', uri: '' });
  const [selectedIssuer, setSelectedIssuer] = useState<string | null>(null);
  const role = activeProfileRole();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setDocuments(getDocuments());
      import('../sync/engine')
        .then(engine => engine.syncActiveProfile())
        .then(() => { if (active) setDocuments(getDocuments()); })
        .catch(e => console.warn('Sincronização', e));
      return () => { active = false; };
    }, [])
  );

  const handleDelete = () => {
    if (!docToDelete) return;
    try {
      if (docToDelete.imageUri) {
        const file = new File(docToDelete.imageUri);
        if (file.exists) file.delete();
      }
    } catch {}
    deleteDocumentById(docToDelete.id);
    scheduleActiveSync();
    cancelDueDateReminders(docToDelete.id).catch(e => console.warn('Erro ao cancelar notificacao', e));
    setDocuments(getDocuments());
    setDocToDelete(null);
  };

  const handleTogglePaid = (doc: SavedDocument) => {
    togglePaidStatus(doc.id, doc.isPaid);
    scheduleActiveSync();
    syncDueDateReminders({ ...doc, isPaid: doc.isPaid === 1 ? 0 : 1 })
      .catch(e => console.warn('Erro ao atualizar notificacao', e));
    setDocuments(getDocuments());
  };

  const handleExport = async (type: 'csv' | 'pdf') => {
    if (documents.length === 0) {
      Alert.alert('Biblioteca vazia', 'Escaneie ou importe uma conta antes de exportar.');
      return;
    }
    try {
      if (type === 'csv') {
        const result = await generateCSVFile(documents, getCurrentProfile());
        setCsvPreview({ visible: true, content: result.content, uri: result.uri });
      } else {
        const result = await generatePDFFile(documents);
        try {
          const contentUri = await getContentUriAsync(result.uri);
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            flags: 1,
            type: 'application/pdf',
          });
        } catch {
          // Fallback: Se o Android nao tiver visualizador padrao, abre o compartilhamento (que tem opcao de visualizar)
          await shareFile(result.uri, 'application/pdf', 'Visualizar PDF', 'com.adobe.pdf');
        }
      }
    } catch (e) {
      console.warn('Erro ao exportar:', e);
      Alert.alert('Erro ao exportar', e instanceof Error ? e.message : String(e));
    }
  };

  const issuerGroups = useMemo(() => {
    let filtered = documents;
    if (search.trim()) {
      const s = search.toLowerCase();
      filtered = filtered.filter(d => (d.issuer || 'OUTROS').toLowerCase().includes(s));
    }

    const groups = filtered.reduce((acc, doc) => {
      const key = doc.issuer || 'OUTROS';
      if (!acc[key]) acc[key] = { count: 0, pending: 0 };
      acc[key].count++;
      if (doc.isPaid === 0) acc[key].pending++;
      return acc;
    }, {} as Record<string, { count: number, pending: number }>);
    
    return Object.keys(groups).sort().map(key => ({ issuer: key, ...groups[key] }));
  }, [documents, search]);

  const sections = useMemo(() => {
    let filtered = selectedIssuer ? documents.filter(d => (d.issuer || 'OUTROS') === selectedIssuer) : documents;
    if (filter === 'PENDENTES') filtered = filtered.filter(d => d.isPaid === 0);
    if (filter === 'PAGAS') filtered = filtered.filter(d => d.isPaid === 1);

    if (search.trim()) {
      const s = search.toLowerCase();
      filtered = filtered.filter(d =>
        (d.issuer && d.issuer.toLowerCase().includes(s)) ||
        (d.referenceMonth && d.referenceMonth.includes(s))
      );
    }

    const grouped = filtered.reduce((acc, doc) => {
      const key = doc.issuer || 'OUTROS';
      if (!acc[key]) acc[key] = [];
      acc[key].push(doc);
      return acc;
    }, {} as Record<string, SavedDocument[]>);

    return Object.keys(grouped).sort().map(key => ({ title: key, data: grouped[key] }));
  }, [documents, filter, search, selectedIssuer]);

  const renderItem = ({ item }: { item: SavedDocument }) => (
    <Pressable
      style={[styles.card, item.isPaid ? styles.cardPaid : null]}
      onPress={() => router.push({ pathname: '/detalhes', params: { id: item.id } })}
    >
      {item.imageUri ? (
        <Image source={{ uri: item.imageUri }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailEmpty]}>
          <MaterialCommunityIcons name="file-document-outline" size={28} color={theme.colors.textSecondary} />
        </View>
      )}
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.documentType}</Text>
        <Text style={styles.cardSubtitle}>
          Ref: {item.referenceMonth || '-'} | Venc: {item.dueDate ? item.dueDate.split('-').reverse().join('/') : '-'}
        </Text>
        <Text style={styles.cardValue}>
          {formatBRL(item.totalAmountCents) || 'Sem valor'}
        </Text>

        <View style={styles.actionsRow}>
          {canPay(role) && (
            <Pressable onPress={() => handleTogglePaid(item)} style={styles.actionButton}>
              <MaterialCommunityIcons name={item.isPaid ? "close-circle-outline" : "check-circle-outline"} size={20} color={theme.colors.primary} />
              <Text style={styles.toggleText}>{item.isPaid ? 'Desmarcar' : 'Pagar'}</Text>
            </Pressable>
          )}
          {canEdit(role) && (
            <Pressable onPress={() => setDocToDelete(item)} style={styles.actionButton}>
              <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.danger} />
              <Text style={styles.deleteText}>Excluir</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => selectedIssuer ? setSelectedIssuer(null) : router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{selectedIssuer ? selectedIssuer : 'BIBLIOTECA'}</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.topBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar..."
            placeholderTextColor={theme.colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
          <View style={styles.exportRow}>
            <Pressable style={styles.exportButton} onPress={() => handleExport('csv')}>
              <Text style={styles.exportText}>CSV</Text>
            </Pressable>
            <Pressable style={styles.exportButton} onPress={() => handleExport('pdf')}>
              <Text style={styles.exportText}>PDF</Text>
            </Pressable>
          </View>
        </View>

        {selectedIssuer !== null && (
        <View style={styles.filterRow}>
          {(['TODAS', 'PENDENTES', 'PAGAS'] as FilterType[]).map(f => (
            <Pressable
              key={f}
              style={[styles.filterButton, filter === f && styles.filterButtonActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
            </Pressable>
          ))}
        </View>
        )}

        {selectedIssuer === null ? (
          // Tela 1: Lista de Emissores
          <FlatList
            data={issuerGroups}
            keyExtractor={(item) => item.issuer}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable style={styles.issuerCard} onPress={() => setSelectedIssuer(item.issuer)}>
                <View style={styles.issuerCardLeft}>
                  <Text style={styles.issuerCardTitle}>{item.issuer}</Text>
                  <Text style={styles.issuerCardSubtitle}>{item.count} contas cadastradas</Text>
                </View>
                <View style={styles.issuerCardRight}>
                  {item.pending > 0 && (
                    <View style={styles.badgePending}><Text style={styles.badgeText}>{item.pending} pendentes</Text></View>
                  )}
                  <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.primary} />
                </View>
              </Pressable>
            )}
          />
        ) : sections.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum documento encontrado.</Text>
        ) : (
          // Tela 2: Lista de Contas do Emissor
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            renderSectionHeader={({ section: { title } }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{title}</Text>
              </View>
            )}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
          />
        )}
      </SafeAreaView>


      <Modal visible={csvPreview.visible} transparent animationType="slide">
        <View style={styles.csvModalContainer}>
          <View style={styles.csvModalContent}>
            <Text style={styles.csvModalTitle}>PREVIEW DO RELATÓRIO</Text>
            <ScrollView style={styles.csvScroll}>
              {csvPreview.content.split('\n').filter(l => l.trim() !== '').map((linha, index) => {
                if (index === 0) return null; // Pula o cabeçalho
                const cols = linha.replace('\uFEFF', '').split(';');
                if (cols.length < 5) return null;
                return (
                  <View key={index} style={styles.csvCard}>
                    <Text style={styles.csvCardTitle}>{cols[2]} - {cols[1]}</Text>
                    <Text style={styles.csvCardText}>Ref: {cols[3]} | Venc: {cols[4]}</Text>
                    <Text style={styles.csvCardValue}>R$ {cols[5]}</Text>
                    {cols[7] === 'Sim' && cols[8] && (
                      <Text style={{ color: theme.colors.success, fontSize: 12, marginTop: 4 }}>
                        Pago em: {cols[8]}
                      </Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.csvModalActions}>
              <Pressable style={styles.csvCancelButton} onPress={() => setCsvPreview({ visible: false, content: '', uri: '' })}>
                <Text style={styles.csvCancelText}>Fechar</Text>
              </Pressable>
              <Pressable style={styles.csvShareButton} onPress={async () => {
                await shareFile(csvPreview.uri, 'text/csv', 'Exportar CSV', 'public.comma-separated-values-text');
                setCsvPreview({ visible: false, content: '', uri: '' });
              }}>
                <Text style={styles.csvShareText}>Compartilhar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <CustomModal
        visible={!!docToDelete}
        title="Excluir Documento"
        message="Tem certeza que deseja apagar este documento? Ele nao podera ser recuperado."
        confirmText="Excluir"
        cancelText="Cancelar"
        isDestructive
        onConfirm={handleDelete}
        onCancel={() => setDocToDelete(null)}
      />
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.bold, color: theme.colors.primary, letterSpacing: 1 },
  topBar: { padding: 16, paddingBottom: 8, marginTop: 8 },
  searchInput: { backgroundColor: theme.colors.panel, borderRadius: 12, padding: 12, color: theme.colors.text, fontFamily: theme.fonts.regular, borderWidth: 1, borderColor: theme.colors.border },
  exportRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  exportButton: { flex: 1, backgroundColor: theme.colors.panel, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.primary },
  exportText: { color: theme.colors.primary, fontFamily: theme.fonts.bold },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  filterButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: theme.colors.panel, borderWidth: 1, borderColor: theme.colors.border },
  filterButtonActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium },
  filterTextActive: { color: theme.colors.background },
  list: { padding: 16, paddingTop: 0 },

  issuerCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.panel, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.border },
  issuerCardLeft: { flex: 1 },
  issuerCardTitle: { fontSize: 18, fontFamily: theme.fonts.bold, color: theme.colors.primary },
  issuerCardSubtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  issuerCardRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badgePending: { backgroundColor: theme.colors.warningSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { color: theme.colors.warning, fontSize: 12, fontFamily: theme.fonts.medium },
  sectionHeader: { paddingVertical: 8 },
  sectionTitle: { color: theme.colors.primary, fontSize: 18, fontFamily: theme.fonts.bold, letterSpacing: 1 },
  emptyText: { textAlign: 'center', marginTop: 40, color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
  card: { flexDirection: 'row', backgroundColor: theme.colors.panel, borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border },
  cardPaid: { opacity: 0.6 },
  thumbnail: { width: 80, height: 110, backgroundColor: '#000' },
  thumbnailEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontFamily: theme.fonts.bold, color: theme.colors.text },
  cardSubtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4, fontFamily: theme.fonts.regular },
  cardValue: { fontSize: 16, color: theme.colors.success, fontFamily: theme.fonts.bold, marginTop: 4 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  toggleText: { color: theme.colors.primary, fontSize: 13, fontFamily: theme.fonts.medium },
  deleteText: { color: theme.colors.danger, fontSize: 13, fontFamily: theme.fonts.medium },
  csvModalContainer: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'center', padding: 20 },
  csvModalContent: { backgroundColor: theme.colors.panel, borderRadius: 12, padding: 16, maxHeight: '80%' },
  csvModalTitle: { color: theme.colors.primary, fontSize: 18, fontFamily: theme.fonts.bold, marginBottom: 12, textAlign: 'center' },
  csvScroll: { backgroundColor: theme.colors.background, borderRadius: 8, padding: 12, marginBottom: 16 },
  csvCard: { backgroundColor: theme.colors.panel, padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  csvCardTitle: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 14 },
  csvCardText: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 },
  csvCardValue: { color: theme.colors.success, fontFamily: theme.fonts.bold, fontSize: 14, marginTop: 4 },
  csvModalActions: { flexDirection: 'row', gap: 12 },
  csvCancelButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  csvCancelText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
  csvShareButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', backgroundColor: theme.colors.primary },
  csvShareText: { color: theme.colors.background, fontFamily: theme.fonts.bold },

}));
