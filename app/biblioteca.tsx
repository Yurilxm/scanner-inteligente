import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, Alert, Image } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getDocuments, deleteDocumentById, SavedDocument } from '../src/db/database';
import { File } from 'expo-file-system';
import { exportToCSV, exportToPDF } from '../src/utils/export';

export default function BibliotecaScreen() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);

  useFocusEffect(
    useCallback(() => {
      // Recarrega a lista toda vez que a tela ganha foco
      setDocuments(getDocuments());
    }, [])
  );

  const handleDelete = (doc: SavedDocument) => {
    Alert.alert('Excluir documento', 'Tem certeza que deseja apagar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          try {
            const file = new File(doc.imageUri);
            if (file.exists) file.delete();
          } catch {}
          
          deleteDocumentById(doc.id);
          setDocuments(getDocuments()); // Atualiza a lista
        },
      },
    ]);
  };

  const handleExport = async (type: 'csv' | 'pdf') => {
    try {
      if (type === 'csv') await exportToCSV(documents);
      else await exportToPDF(documents);
    } catch {
      Alert.alert('Erro', 'Nao foi possivel exportar os documentos.');
    }
  };

  const renderItem = ({ item }: { item: SavedDocument }) => (
    <View style={styles.card}>
      <Image source={{ uri: item.imageUri }} style={styles.thumbnail} />
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.documentType}</Text>
        <Text style={styles.cardSubtitle}>
          {item.date || 'Sem data'} - {item.totalAmountCents ? `R$ ${(item.totalAmountCents / 100).toFixed(2).replace('.', ',')}` : 'Sem valor'}
        </Text>
        <Pressable onPress={() => handleDelete(item)} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Excluir</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {documents.length === 0 ? (
        <Text style={styles.emptyText}>Nenhum documento salvo ainda.</Text>
      ) : (
        <>
          <View style={styles.exportBar}>
            <Pressable style={styles.exportButton} onPress={() => handleExport('csv')}>
              <Text style={styles.exportText}>Exportar CSV</Text>
            </Pressable>
            <Pressable style={styles.exportButton} onPress={() => handleExport('pdf')}>
              <Text style={styles.exportText}>Exportar PDF</Text>
            </Pressable>
          </View>
          <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
            contentContainerStyle={styles.list}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  list: { padding: 16 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#888', fontSize: 16 },
  exportBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  exportButton: {
    flex: 1,
    backgroundColor: '#0a7ea4',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  exportText: { color: '#fff', fontWeight: '600' },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
  },
  thumbnail: { width: 80, height: 100, backgroundColor: '#ddd' },
  cardContent: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  cardSubtitle: { fontSize: 13, color: '#666', marginTop: 4 },
  deleteButton: { marginTop: 8, alignSelf: 'flex-start' },
  deleteText: { color: 'red', fontSize: 13, fontWeight: '600' },
});
