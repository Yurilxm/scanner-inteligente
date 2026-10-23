import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView, Modal } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { getDocumentById, deleteDocumentById, togglePaidStatus, SavedDocument } from '../src/db/database';
import { File } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../src/components/ScannerBackground';
import { Theme } from '../src/constants/theme';
import { CustomModal } from '../src/components/CustomModal';

export default function DetalhesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<SavedDocument | null>(null);
  const [zoomVisible, setZoomVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);

  useEffect(() => {
    if (id) setDoc(getDocumentById(id));
  }, [id]);

  if (!doc) return null;

  const handleDelete = () => {
    try {
      const file = new File(doc.imageUri);
      if (file.exists) file.delete();
    } catch {}
    deleteDocumentById(doc.id);
    router.back();
  };

  const handleTogglePaid = () => {
    togglePaidStatus(doc.id, doc.isPaid);
    setDoc({ ...doc, isPaid: doc.isPaid === 1 ? 0 : 1 });
  };

  return (
    <LinearGradient colors={[Theme.colors.background, Theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <Stack.Screen options={{ title: 'Detalhes', headerStyle: { backgroundColor: Theme.colors.background }, headerTintColor: Theme.colors.primary }} />

      <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => setZoomVisible(true)}>
            <Image source={{ uri: doc.imageUri }} style={styles.image} resizeMode="contain" />
            <Text style={styles.hint}>Toque na imagem para ampliar</Text>
          </Pressable>

          <View style={styles.infoBox}>
            <Text style={styles.label}>Tipo de Documento</Text>
            <Text style={styles.value}>{doc.documentType}</Text>

            <Text style={styles.label}>Emissor</Text>
            <Text style={styles.value}>{doc.issuer || '-'}</Text>

            <Text style={styles.label}>Referencia</Text>
            <Text style={styles.value}>{doc.referenceMonth || '-'}</Text>

            <Text style={styles.label}>Vencimento</Text>
            <Text style={styles.value}>{doc.dueDate ? doc.dueDate.split('-').reverse().join('/') : '-'}</Text>

            <Text style={styles.label}>Valor Total</Text>
            <Text style={styles.value}>{doc.totalAmountCents ? `R$ ${(doc.totalAmountCents / 100).toFixed(2).replace('.', ',')}` : '-'}</Text>

            <Text style={styles.label}>Situacao</Text>
            <Text style={[styles.value, { color: doc.isPaid ? Theme.colors.success : Theme.colors.warning }]}>
              {doc.isPaid ? 'PAGO' : 'PENDENTE'}
            </Text>
          </View>

          <Pressable style={styles.toggleButton} onPress={handleTogglePaid}>
            <Text style={styles.toggleText}>{doc.isPaid ? 'Desmarcar Pago' : 'Marcar como Pago'}</Text>
          </Pressable>

          <Pressable style={styles.deleteButton} onPress={() => setDeleteVisible(true)}>
            <Text style={styles.deleteText}>Excluir Documento</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={zoomVisible} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <Pressable style={styles.modalClose} onPress={() => setZoomVisible(false)}>
            <MaterialCommunityIcons name="close" size={32} color="#fff" />
          </Pressable>
          <Image source={{ uri: doc.imageUri }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </Modal>

      <CustomModal
        visible={deleteVisible}
        title="Excluir Documento"
        message="Tem certeza que deseja apagar este documento?"
        confirmText="Excluir"
        cancelText="Cancelar"
        isDestructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteVisible(false)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, marginTop: 8 },
  image: { width: '100%', height: 250, borderRadius: 12, backgroundColor: '#000' },
  hint: { textAlign: 'center', color: Theme.colors.textSecondary, fontSize: 12, marginTop: 8, fontFamily: Theme.fonts.regular },
  infoBox: { backgroundColor: Theme.colors.panel, padding: 16, borderRadius: 12, marginTop: 16, borderWidth: 1, borderColor: Theme.colors.border },
  label: { color: Theme.colors.primary, fontSize: 13, fontFamily: Theme.fonts.medium, marginTop: 8 },
  value: { color: Theme.colors.text, fontSize: 16, fontFamily: Theme.fonts.regular },
  toggleButton: { backgroundColor: Theme.colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  toggleText: { fontFamily: Theme.fonts.bold, color: Theme.colors.background, fontSize: 16 },
  deleteButton: { padding: 16, alignItems: 'center', marginTop: 8 },
  deleteText: { fontFamily: Theme.fonts.medium, color: Theme.colors.danger, fontSize: 16 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', paddingTop: 50, paddingBottom: 50 },
  modalClose: { position: 'absolute', top: 40, right: 20, zIndex: 10 },
  fullImage: { width: '100%', height: '100%' },
});
