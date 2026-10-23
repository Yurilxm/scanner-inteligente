import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView, Modal, TextInput, BackHandler, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { getDocumentById, deleteDocumentById, togglePaidStatus, updateDocumentIssuer, SavedDocument } from '../db/database';
import { File } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ScannerBackground } from '../components/ScannerBackground';
import { Theme } from '../constants/theme';
import { CustomModal } from '../components/CustomModal';
import { ZoomableImage } from '../components/ZoomableImage';
import { cancelDueDateReminders, syncDueDateReminders } from '../utils/notifications';
import { ReclassifyModal } from '../components/ReclassifyModal';
import { brDateToISO, formatBRL, isoToBR, maskDateInput, todayISO } from '../utils/format';

export default function DetalhesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<SavedDocument | null>(() => (id ? getDocumentById(id) : null));
  const [zoomVisible, setZoomVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [payDateInput, setPayDateInput] = useState('');
  const [reclassifyVisible, setReclassifyVisible] = useState(false);

  useEffect(() => {
    const onBackPress = () => {
      if (zoomVisible) { setZoomVisible(false); return true; }
      if (payModalVisible) { setPayModalVisible(false); return true; }
      if (deleteVisible) { setDeleteVisible(false); return true; }
      if (reclassifyVisible) { setReclassifyVisible(false); return true; }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [zoomVisible, payModalVisible, deleteVisible, reclassifyVisible]);

  if (!doc) return null;

  const handleDelete = () => {
    try {
      const file = new File(doc.imageUri);
      if (file.exists) file.delete();
    } catch {}
    deleteDocumentById(doc.id);
    cancelDueDateReminders(doc.id).catch(e => console.warn('Erro ao cancelar notificacao', e));
    router.back();
  };

  const updateDoc = (updated: SavedDocument) => {
    setDoc(updated);
    syncDueDateReminders(updated).catch(e => console.warn('Erro ao atualizar notificacao', e));
  };

  const handleReclassified = (category: string) => {
    updateDocumentIssuer(doc.id, category);
    updateDoc({ ...doc, issuer: category });
    setReclassifyVisible(false);
  };

  const handleOpenPayModal = () => {
    setPayDateInput(isoToBR(todayISO()));
    setPayModalVisible(true);
  };

  const handleConfirmPayment = () => {
    const formattedDate = brDateToISO(payDateInput);
    if (!formattedDate) {
      Alert.alert('Data invalida', 'Informe a data no formato DD/MM/AAAA');
      return;
    }
    togglePaidStatus(doc.id, doc.isPaid, formattedDate);
    updateDoc({ ...doc, isPaid: 1, paymentDate: formattedDate });
    setPayModalVisible(false);
  };

  const handleTogglePaid = () => {
    togglePaidStatus(doc.id, doc.isPaid);
    updateDoc({ ...doc, isPaid: doc.isPaid === 1 ? 0 : 1, paymentDate: null });
  };

  return (
    <LinearGradient colors={[Theme.colors.background, Theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={Theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>DETALHES</Text>
          <View style={{ width: 28 }} />
        </View>
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
            <Text style={styles.value}>{isoToBR(doc.dueDate) || '-'}</Text>

            <Text style={styles.label}>Valor Total</Text>
            <Text style={styles.value}>{formatBRL(doc.totalAmountCents) || '-'}</Text>

            <Text style={styles.label}>Situacao</Text>
            <Text style={[styles.value, { color: doc.isPaid ? Theme.colors.success : Theme.colors.warning }]}>
              {doc.isPaid ? 'PAGO' : 'PENDENTE'}
            </Text>
            {doc.isPaid === 1 && doc.paymentDate && (
              <>
                <Text style={styles.label}>Pago em</Text>
                <Text style={styles.value}>{isoToBR(doc.paymentDate)}</Text>
              </>
            )}
          </View>

          <Pressable style={styles.toggleButton} onPress={doc.isPaid ? handleTogglePaid : handleOpenPayModal}>
            <Text style={styles.toggleText}>{doc.isPaid ? 'Desmarcar Pago' : 'Marcar como Pago'}</Text>
          </Pressable>

          <Pressable style={styles.reclassifyButton} onPress={() => setReclassifyVisible(true)}>
            <Text style={styles.reclassifyText}>Reclassificar Conta</Text>
          </Pressable>

          <Pressable style={styles.deleteButton} onPress={() => setDeleteVisible(true)}>
            <Text style={styles.deleteText}>Excluir Documento</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={zoomVisible} transparent animationType="fade">
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.modalContainer}>
            <Pressable style={styles.modalClose} onPress={() => setZoomVisible(false)}>
              <MaterialCommunityIcons name="close" size={32} color="#fff" />
            </Pressable>
            <ZoomableImage uri={doc.imageUri} />
          </View>
        </GestureHandlerRootView>
      </Modal>

      <Modal visible={payModalVisible} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.payModalBox}>
            <Text style={styles.payModalTitle}>Data do Pagamento</Text>
            <TextInput
              style={styles.payInput}
              value={payDateInput}
              onChangeText={(t) => setPayDateInput(maskDateInput(t))}
              placeholder="DD/MM/AAAA"
              keyboardType="numeric"
            />
            <View style={styles.payActions}>
              <Pressable style={styles.payCancel} onPress={() => setPayModalVisible(false)}>
                <Text style={styles.payCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.payConfirm} onPress={handleConfirmPayment}>
                <Text style={styles.payConfirmText}>Confirmar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>


      {reclassifyVisible && (
        <ReclassifyModal
          title="Reclassificar Conta"
          confirmText="Salvar"
          initialCategory={doc.issuer || ''}
          ocrText={doc.ocrText || ''}
          onSaved={handleReclassified}
          onCancel={() => setReclassifyVisible(false)}
        />
      )}

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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: Theme.fonts.bold, color: Theme.colors.primary, letterSpacing: 1 },
  content: { padding: 16, marginTop: 0 },
  image: { width: '100%', height: 250, borderRadius: 12, backgroundColor: '#000' },
  hint: { textAlign: 'center', color: Theme.colors.textSecondary, fontSize: 12, marginTop: 8, fontFamily: Theme.fonts.regular },
  infoBox: { backgroundColor: Theme.colors.panel, padding: 16, borderRadius: 12, marginTop: 16, borderWidth: 1, borderColor: Theme.colors.border },
  label: { color: Theme.colors.primary, fontSize: 13, fontFamily: Theme.fonts.medium, marginTop: 8 },
  value: { color: Theme.colors.text, fontSize: 16, fontFamily: Theme.fonts.regular },
  toggleButton: { backgroundColor: Theme.colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  toggleText: { fontFamily: Theme.fonts.bold, color: Theme.colors.background, fontSize: 16 },

  reclassifyButton: { padding: 16, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: Theme.colors.primary, borderRadius: 12 },
  reclassifyText: { fontFamily: Theme.fonts.medium, color: Theme.colors.primary, fontSize: 16 },
  deleteButton: { padding: 16, alignItems: 'center', marginTop: 8 },
  deleteText: { fontFamily: Theme.fonts.medium, color: Theme.colors.danger, fontSize: 16 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', paddingTop: 50, paddingBottom: 50 },
  modalClose: { position: 'absolute', top: 40, right: 20, zIndex: 10 },
  payModalBox: { backgroundColor: Theme.colors.panel, padding: 20, borderRadius: 12, width: '80%', borderWidth: 1, borderColor: Theme.colors.border },
  payModalTitle: { fontSize: 18, fontFamily: Theme.fonts.bold, color: Theme.colors.primary, marginBottom: 16, textAlign: 'center' },
  payInput: { backgroundColor: Theme.colors.background, color: Theme.colors.text, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Theme.colors.border, fontFamily: Theme.fonts.regular, marginBottom: 16, textAlign: 'center' },
  payActions: { flexDirection: 'row', gap: 12 },
  payCancel: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Theme.colors.border },
  payCancelText: { color: Theme.colors.textSecondary, fontFamily: Theme.fonts.bold },
  payConfirm: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', backgroundColor: Theme.colors.primary },
  payConfirmText: { color: Theme.colors.background, fontFamily: Theme.fonts.bold },
});
