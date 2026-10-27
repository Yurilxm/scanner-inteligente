import { useState, useEffect } from 'react';
import { View, Text, Image, Pressable, ScrollView, Modal, TextInput, BackHandler, Alert } from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { getCurrentProfile, getDocumentById, deleteDocumentById, moveDocumentToProfile, togglePaidStatus, updateDocumentIssuer, SavedDocument } from '../db/database';
import { scheduleActiveSync } from '../sync/schedule';
import { File } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ScannerBackground } from '../components/ScannerBackground';
import { makeStyles, useTheme } from '../theme';
import { CustomModal } from '../components/CustomModal';
import { ZoomableImage } from '../components/ZoomableImage';
import { cancelDueDateReminders, scheduleDueDateReminder, syncDueDateReminders } from '../utils/notifications';
import { ReclassifyModal } from '../components/ReclassifyModal';
import { brDateToISO, formatBRL, isoToBR, maskDateInput, todayISO } from '../utils/format';
import { getDiagnosticsUrl, sendDiagnostics } from '../utils/devDiagnostics';
import { Profile, canEdit, canPay, listProfiles } from '../db/profiles';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { activeProfileRole } from '../utils/profileManager';
import { useDocument } from '../context/DocumentContext';

export default function DetalhesScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { setImageUri, setOcrText, setFields } = useDocument();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<SavedDocument | null>(() => (id ? getDocumentById(id) : null));
  const [zoomVisible, setZoomVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [payDateInput, setPayDateInput] = useState('');
  const [reclassifyVisible, setReclassifyVisible] = useState(false);
  const [moveVisible, setMoveVisible] = useState(false);
  const [moved, setMoved] = useState<string | null>(null);
  // Numa gaveta compartilhada, cada um só vê os botões que o papel dele permite
  const role = activeProfileRole();
  // Para onde dá para mover: outras gavetas em que esta pessoa pode adicionar contas
  const moveTargets = listProfiles().filter(p => p.id !== getCurrentProfile() && canEdit(p.role));

  useEffect(() => {
    const onBackPress = () => {
      if (zoomVisible) { setZoomVisible(false); return true; }
      if (payModalVisible) { setPayModalVisible(false); return true; }
      if (deleteVisible) { setDeleteVisible(false); return true; }
      if (reclassifyVisible) { setReclassifyVisible(false); return true; }
      if (moveVisible) { setMoveVisible(false); return true; }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    
      return () => subscription.remove();
  }, [zoomVisible, payModalVisible, deleteVisible, reclassifyVisible, moveVisible]);

  // Recarrega o documento ao voltar do editor (revisao).
  // Sem isso, o useState inicializa uma vez e nunca mais le do banco.
  useEffect(() => {
    return navigation.addListener('focus', () => {
      if (id) setDoc(getDocumentById(id));
    });
  }, [navigation, id]);

  if (!doc) return null;

  const isPix = doc.documentType === 'PIX';

  // Lazy import: expo-clipboard e modulo NATIVO. Se o APK nao foi rebuildado
  // apos instalar a dependencia, o import top-level crasharia o detalhes.
  // Aqui, so falha (com mensagem amigavel) se o usuario tocar em COPIAR.
  const copyPixKey = async (text: string) => {
    try {
      const mod = await import('expo-clipboard');
      await mod.setStringAsync(text);
      Alert.alert('Copiado!', 'A chave Pix foi copiada.');
    } catch {
      Alert.alert('Nao foi possivel copiar', 'Atualize o app (novo APK) para usar esta funcao.');
    }
  };

  const handleSendDiagnostics = async () => {
    try {
      await sendDiagnostics(doc);
      Alert.alert('Diagnóstico enviado', 'Foto, texto do OCR e campos foram enviados para o PC.');
    } catch (e) {
      Alert.alert('Falha ao enviar', e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = () => {
    try {
      if (doc.imageUri) {
        const file = new File(doc.imageUri);
        if (file.exists) file.delete();
      }
    } catch {}
    deleteDocumentById(doc.id);
    scheduleActiveSync();
    cancelDueDateReminders(doc.id).catch(e => console.warn('Erro ao cancelar notificacao', e));
    router.back();
  };

  // Leva a conta para outra gaveta; as duas sincronizam (a de origem envia a exclusão, a de destino a conta)
  const handleMove = (target: Profile) => {
    try {
      moveDocumentToProfile(doc.id, target.id);
    } catch (e) {
      setMoveVisible(false);
      Alert.alert('Não foi possível mover', e instanceof Error ? e.message : String(e));
      return;
    }
    cancelDueDateReminders(doc.id)
      .then(() => (doc.isPaid !== 1 && doc.issuer && doc.dueDate ? scheduleDueDateReminder(doc.id, doc.issuer, doc.dueDate, target.id) : undefined))
      .catch(e => console.warn('Lembrete da conta movida', e));
    scheduleActiveSync();
    import('../sync/engine').then(engine => engine.syncProfile(target.id)).catch(e => console.warn('Sincronização', e));
    setMoveVisible(false);
    setMoved(target.name);
  };

  const updateDoc = (updated: SavedDocument) => {
    setDoc(updated);
    syncDueDateReminders(updated).catch(e => console.warn('Erro ao atualizar notificacao', e));
  };

  const handleReclassified = (category: string) => {
    updateDocumentIssuer(doc.id, category);
    scheduleActiveSync();
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
    scheduleActiveSync();
    updateDoc({ ...doc, isPaid: 1, paymentDate: formattedDate });
    setPayModalVisible(false);
  };

  const handleTogglePaid = () => {
    togglePaidStatus(doc.id, doc.isPaid);
    scheduleActiveSync();
    updateDoc({ ...doc, isPaid: doc.isPaid === 1 ? 0 : 1, paymentDate: null });
  };

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>DETALHES</Text>
          <Pressable
            onPress={() => {
              // Conta sem comprovante: vai pra cadastro-manual (nao faz sentido revisao/OCR)
              if (doc.documentType === 'CONTA' && !doc.imageUri) {
                router.push({ pathname: '/cadastro-manual', params: { editId: doc.id } });
                return;
              }
              setImageUri(doc.imageUri);
              setOcrText(doc.ocrText);
              setFields({
                documentType: doc.documentType,
                issuer: doc.issuer,
                referenceMonth: doc.referenceMonth,
                cnpj: doc.cnpj,
                cpf: doc.cpf,
                totalAmountCents: doc.totalAmountCents,
                dueDate: doc.dueDate,
                boletoLine: doc.boletoLine,
                pixKey: doc.pixKey,
              });
              router.push({ 
                pathname: '/revisao', 
                params: { 
                  editId: doc.id,
                  editPaymentDate: doc.paymentDate || '',
                  editObservacao: doc.observacao || ''
                } 
              });
            }}
            style={styles.backButton}
          >
            <MaterialCommunityIcons name="pencil" size={24} color={theme.colors.primary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {doc.imageUri ? (
            <Pressable onPress={() => setZoomVisible(true)}>
              <Image source={{ uri: doc.imageUri }} style={styles.image} resizeMode="contain" />
              <Text style={styles.hint}>Toque na imagem para ampliar</Text>
            </Pressable>
          ) : null}

          <View style={styles.infoBox}>
            <Text style={styles.label}>Tipo de Documento</Text>
            <Text style={styles.value}>{doc.documentType}</Text>

            <Text style={styles.label}>Emissor</Text>
            <Text style={styles.value}>{doc.issuer || '-'}</Text>

            {!isPix && (
              <>
                <Text style={styles.label}>Referencia</Text>
                <Text style={styles.value}>{doc.referenceMonth || '-'}</Text>
              </>
            )}

            {!isPix && (
              <>
                <Text style={styles.label}>Vencimento</Text>
                <Text style={styles.value}>{isoToBR(doc.dueDate) || '-'}</Text>
              </>
            )}

            <Text style={styles.label}>Observação</Text>
            <Text style={styles.value}>{doc.observacao || '-'}</Text>
            {doc.pixKey ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.label}>Chave Pix</Text>
                  <Pressable onPress={() => copyPixKey(doc.pixKey || '')}>
                    <Text style={{ color: theme.colors.primary, fontSize: 13, fontFamily: theme.fonts.bold }}>COPIAR</Text>
                  </Pressable>
                </View>
                <Text style={styles.value}>{doc.pixKey}</Text>
              </>
            ) : null}
    

            <Text style={styles.label}>Valor Total</Text>
            <Text style={styles.value}>{formatBRL(doc.totalAmountCents) || '-'}</Text>

            <Text style={styles.label}>Situacao</Text>
            <Text style={[styles.value, { color: doc.isPaid ? theme.colors.success : theme.colors.warning }]}>
              {doc.isPaid ? 'PAGO' : 'PENDENTE'}
            </Text>
            {doc.isPaid === 1 && doc.paymentDate && (
              <>
                <Text style={styles.label}>Pago em</Text>
                <Text style={styles.value}>{isoToBR(doc.paymentDate)}</Text>
              </>
            )}
          </View>

          {canPay(role) && (
            <Pressable style={styles.toggleButton} onPress={doc.isPaid ? handleTogglePaid : handleOpenPayModal}>
              <Text style={styles.toggleText}>{doc.isPaid ? 'Desmarcar Pago' : 'Marcar como Pago'}</Text>
            </Pressable>
          )}

          {canEdit(role) && (
            <>
              <Pressable style={styles.reclassifyButton} onPress={() => setReclassifyVisible(true)}>
                <Text style={styles.reclassifyText}>Reclassificar Conta</Text>
              </Pressable>

              {moveTargets.length > 0 && (
                <Pressable style={styles.reclassifyButton} onPress={() => setMoveVisible(true)}>
                  <Text style={styles.reclassifyText}>Mover para outra gaveta</Text>
                </Pressable>
              )}

              <Pressable style={styles.deleteButton} onPress={() => setDeleteVisible(true)}>
                <Text style={styles.deleteText}>Excluir Documento</Text>
              </Pressable>
            </>
          )}

          {getDiagnosticsUrl() && (
            <Pressable style={styles.deleteButton} onPress={handleSendDiagnostics}>
              <Text style={styles.reclassifyText}>Enviar diagnóstico para o PC (dev)</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={zoomVisible} transparent animationType="fade">
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.modalContainer}>
            <Pressable style={[styles.modalClose, { top: insets.top + 16 }]} onPress={() => setZoomVisible(false)}>
              <MaterialCommunityIcons name="close" size={32} color="#fff" />
            </Pressable>
            {doc.imageUri ? <ZoomableImage uri={doc.imageUri} /> : null}
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

      <Modal visible={moveVisible} transparent animationType="fade" onRequestClose={() => setMoveVisible(false)}>
        <Pressable style={styles.moveOverlay} onPress={() => setMoveVisible(false)}>
          <Pressable style={[styles.moveSheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.moveTitle}>Mover para qual gaveta?</Text>
            <Text style={styles.moveHelp}>A conta sai desta gaveta e vai, com a foto, para a escolhida.</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {moveTargets.map(target => (
                <Pressable key={target.id} style={styles.moveRow} onPress={() => handleMove(target)}>
                  <ProfileAvatar name={target.name} color={target.color} icon={target.icon} photoUri={null} size={36} />
                  <Text style={styles.moveName} numberOfLines={1}>{target.name}</Text>
                  {target.vaultId && <MaterialCommunityIcons name="cloud-check-outline" size={18} color={theme.colors.textSecondary} />}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <CustomModal
        visible={!!moved}
        title="Conta movida"
        message={`Ela está agora na gaveta "${moved ?? ''}".`}
        onConfirm={() => { setMoved(null); router.back(); }}
      />

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

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.bold, color: theme.colors.primary, letterSpacing: 1 },
  content: { padding: 16, marginTop: 0 },
  image: { width: '100%', height: 250, borderRadius: 12, backgroundColor: '#000' },
  hint: { textAlign: 'center', color: theme.colors.textSecondary, fontSize: 12, marginTop: 8, fontFamily: theme.fonts.regular },
  infoBox: { backgroundColor: theme.colors.panel, padding: 16, borderRadius: 12, marginTop: 16, borderWidth: 1, borderColor: theme.colors.border },
  label: { color: theme.colors.primary, fontSize: 13, fontFamily: theme.fonts.medium, marginTop: 8 },
  value: { color: theme.colors.text, fontSize: 16, fontFamily: theme.fonts.regular },
  toggleButton: { backgroundColor: theme.colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  toggleText: { fontFamily: theme.fonts.bold, color: theme.colors.background, fontSize: 16 },

  reclassifyButton: { padding: 16, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 12 },
  reclassifyText: { fontFamily: theme.fonts.medium, color: theme.colors.primary, fontSize: 16 },
  deleteButton: { padding: 16, alignItems: 'center', marginTop: 8 },
  deleteText: { fontFamily: theme.fonts.medium, color: theme.colors.danger, fontSize: 16 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', paddingTop: 50, paddingBottom: 50 },
  modalClose: { position: 'absolute', top: 40, right: 20, zIndex: 10 },
  payModalBox: { backgroundColor: theme.colors.panel, padding: 20, borderRadius: 12, width: '80%', borderWidth: 1, borderColor: theme.colors.border },
  payModalTitle: { fontSize: 18, fontFamily: theme.fonts.bold, color: theme.colors.primary, marginBottom: 16, textAlign: 'center' },
  payInput: { backgroundColor: theme.colors.background, color: theme.colors.text, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, fontFamily: theme.fonts.regular, marginBottom: 16, textAlign: 'center' },
  payActions: { flexDirection: 'row', gap: 12 },
  payCancel: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  payCancelText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
  payConfirm: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', backgroundColor: theme.colors.primary },
  payConfirmText: { color: theme.colors.background, fontFamily: theme.fonts.bold },
  moveOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' },
  moveSheet: { backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10, borderWidth: 1, borderColor: theme.colors.border },
  moveTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 18 },
  moveHelp: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13 },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, marginTop: 8 },
  moveName: { flex: 1, color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 15 },
}));
