import { useState, useCallback, useMemo } from 'react';
import { View, Text, SectionList, StyleSheet, Pressable, Image, TextInput, Modal, ScrollView } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { getDocuments, deleteDocumentById, togglePaidStatus, SavedDocument } from '../src/db/database';
import { generateCSVFile, generatePDFFile, shareFile } from '../src/utils/export';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FS from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../src/components/ScannerBackground';
import { Theme } from '../src/constants/theme';
import { CustomModal } from '../src/components/CustomModal';

type FilterType = 'TODAS' | 'PENDENTES' | 'PAGAS';

export default function BibliotecaScreen() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('TODAS');
  const [docToDelete, setDocToDelete] = useState<SavedDocument | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ visible: boolean, content: string, uri: string }>({ visible: false, content: '', uri: '' });

  useFocusEffect(
    useCallback(() => {
      setDocuments(getDocuments());
    }, [])
  );

  const handleDelete = () => {
    if (!docToDelete) return;
    try {
      const file = new File(docToDelete.imageUri);
      if (file.exists) file.delete();
    } catch {}
    deleteDocumentById(docToDelete.id);
    setDocuments(getDocuments());
    setDocToDelete(null);
  };

  const handleTogglePaid = (doc: SavedDocument) => {
    togglePaidStatus(doc.id, doc.isPaid);
    setDocuments(getDocuments());
  };

  const handleExport = async (type: 'csv' | 'pdf') => {
    try {
      if (type === 'csv') {
        const result = await generateCSVFile(documents);
        setCsvPreview({ visible: true, content: result.content, uri: result.uri });
      } else {
        const result = await generatePDFFile(documents);
        const contentUri = await FS.getContentUriAsync(result.uri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: 'application/pdf',
        });
      }
    } catch (e) {
      console.warn('Erro ao exportar:', e);
    }
  };

  const sections = useMemo(() => {
    let filtered = documents;
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
  }, [documents, filter, search]);

  const renderItem = ({ item }: { item: SavedDocument }) => (
    <Pressable
      style={[styles.card, item.isPaid ? styles.cardPaid : null]}
      onPress={() => router.push({ pathname: '/detalhes', params: { id: item.id } })}
    >
      <Image source={{ uri: item.imageUri }} style={styles.thumbnail} />
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.documentType}</Text>
        <Text style={styles.cardSubtitle}>
          Ref: {item.referenceMonth || '-'} | Venc: {item.dueDate ? item.dueDate.split('-').reverse().join('/') : '-'}
        </Text>
        <Text style={styles.cardValue}>
          {item.totalAmountCents ? `R$ ${(item.totalAmountCents / 100).toFixed(2).replace('.', ',')}` : 'Sem valor'}
        </Text>

        <View style={styles.actionsRow}>
          <Pressable onPress={() => handleTogglePaid(item)} style={styles.actionButton}>
            <MaterialCommunityIcons name={item.isPaid ? "close-circle-outline" : "check-circle-outline"} size={20} color={Theme.colors.primary} />
            <Text style={styles.toggleText}>{item.isPaid ? 'Desmarcar' : 'Pagar'}</Text>
          </Pressable>
          <Pressable onPress={() => setDocToDelete(item)} style={styles.actionButton}>
            <MaterialCommunityIcons name="delete-outline" size={20} color={Theme.colors.danger} />
            <Text style={styles.deleteText}>Excluir</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );

  return (
    <LinearGradient colors={[Theme.colors.background, Theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={Theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>BIBLIOTECA</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.topBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar..."
            placeholderTextColor={Theme.colors.textSecondary}
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

        {sections.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum documento encontrado.</Text>
        ) : (
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
            <Text style={styles.csvModalTitle}>PREVIEW DO CSV</Text>
            <ScrollView style={styles.csvScroll}>
              <Text style={styles.csvText}>{csvPreview.content}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: Theme.fonts.bold, color: Theme.colors.primary, letterSpacing: 1 },
  topBar: { padding: 16, paddingBottom: 8, marginTop: 8 },
  searchInput: { backgroundColor: Theme.colors.panel, borderRadius: 12, padding: 12, color: Theme.colors.text, fontFamily: Theme.fonts.regular, borderWidth: 1, borderColor: Theme.colors.border },
  exportRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  exportButton: { flex: 1, backgroundColor: Theme.colors.panel, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Theme.colors.primary },
  exportText: { color: Theme.colors.primary, fontFamily: Theme.fonts.bold },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  filterButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: Theme.colors.panel, borderWidth: 1, borderColor: Theme.colors.border },
  filterButtonActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  filterText: { color: Theme.colors.textSecondary, fontFamily: Theme.fonts.medium },
  filterTextActive: { color: Theme.colors.background },
  list: { padding: 16, paddingTop: 0 },
  sectionHeader: { paddingVertical: 8 },
  sectionTitle: { color: Theme.colors.primary, fontSize: 18, fontFamily: Theme.fonts.bold, letterSpacing: 1 },
  emptyText: { textAlign: 'center', marginTop: 40, color: Theme.colors.textSecondary, fontFamily: Theme.fonts.regular },
  card: { flexDirection: 'row', backgroundColor: Theme.colors.panel, borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border },
  cardPaid: { opacity: 0.6 },
  thumbnail: { width: 80, height: 110, backgroundColor: '#000' },
  cardContent: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontFamily: Theme.fonts.bold, color: Theme.colors.text },
  cardSubtitle: { fontSize: 13, color: Theme.colors.textSecondary, marginTop: 4, fontFamily: Theme.fonts.regular },
  cardValue: { fontSize: 16, color: Theme.colors.success, fontFamily: Theme.fonts.bold, marginTop: 4 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  toggleText: { color: Theme.colors.primary, fontSize: 13, fontFamily: Theme.fonts.medium },
  deleteText: { color: Theme.colors.danger, fontSize: 13, fontFamily: Theme.fonts.medium },
  csvModalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  csvModalContent: { backgroundColor: Theme.colors.panel, borderRadius: 12, padding: 16, maxHeight: '80%' },
  csvModalTitle: { color: Theme.colors.primary, fontSize: 18, fontFamily: Theme.fonts.bold, marginBottom: 12, textAlign: 'center' },
  csvScroll: { backgroundColor: Theme.colors.background, borderRadius: 8, padding: 12, marginBottom: 16 },
  csvText: { color: Theme.colors.text, fontFamily: 'monospace', fontSize: 12 },
  csvModalActions: { flexDirection: 'row', gap: 12 },
  csvCancelButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Theme.colors.border },
  csvCancelText: { color: Theme.colors.textSecondary, fontFamily: Theme.fonts.bold },
  csvShareButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', backgroundColor: Theme.colors.primary },
  csvShareText: { color: Theme.colors.background, fontFamily: Theme.fonts.bold },

});
