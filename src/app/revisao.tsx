import { useEffect, useState } from 'react';
import { View, Text, TextInput, Image, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView, Modal, BackHandler } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ZoomableImage } from '../components/ZoomableImage';
import { router, useLocalSearchParams } from 'expo-router';
import { File } from 'expo-file-system';
import { saveDocument, updateDocument, getLearnedCategories } from '../db/database';
import { appSetting } from '../utils/perfil';
import { scheduleActiveSync } from '../sync/schedule';
import { useDocument } from '../context/DocumentContext';
import { extractDocumentData } from '../utils/ocr';
import { cleanupDebugFiles } from '../utils/files';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { extractFields } from '../utils/extractor';
import { parseBRLToCents } from '../utils/money';
import { brDateToISO, centsToDecimal, isoToBR, maskCurrency, maskDateInput } from '../utils/format';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { RadarLoader } from '../components/RadarLoader';
import { makeStyles, useTheme } from '../theme';
import { CustomModal } from '../components/CustomModal';
import { ReclassifyModal } from '../components/ReclassifyModal';
import { requestNotificationPermissions, scheduleDueDateReminder } from '../utils/notifications';

export default function RevisaoScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { editId, editPaymentDate: initialPayDate, editObservacao: initialObs } = useLocalSearchParams<{ editId?: string, editPaymentDate?: string, editObservacao?: string }>();
  const { imageUri, ocrText, setOcrText, fields, setFields, reset } = useDocument();
  const [isLoading, setIsLoading] = useState(true);
  const [isImageVisible, setIsImageVisible] = useState(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Estado local para edicao
  const [editIssuer, setEditIssuer] = useState('');
  const [editReference, setEditReference] = useState('');
  const [editCnpj, setEditCnpj] = useState('');
  const [editCpf, setEditCpf] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editPaymentDate, setEditPaymentDate] = useState(isoToBR(initialPayDate));
  const [editObservacao, setEditObservacao] = useState(initialObs || '');
  const [reclassifyVisible, setReclassifyVisible] = useState(false);

  useEffect(() => {
    const onBackPress = () => {
      if (isImageVisible) {
        setIsImageVisible(false);
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [isImageVisible]);

  useEffect(() => {
    if (!imageUri) return;
    requestNotificationPermissions();

    let isMounted = true;

    async function processDocument() {
      try {
        setIsLoading(true);
        // 1. OCR
        const rawData = await extractDocumentData(imageUri!);
        const text = rawData?.text || '';
        
        if (isMounted) {
          setOcrText(text);
          // 2. Extracao usando os blocos (se disponiveis)
          const extracted = await extractFields(rawData, getLearnedCategories(), {
            allowCnpjLookup: appSetting('cnpj_lookup_enabled') === 'true',
          });
          setFields(extracted);

          // 3. Preenche estado local para edicao
          setEditIssuer(extracted.issuer || '');
          setEditReference(extracted.referenceMonth || '');
          setEditCnpj(extracted.cnpj || '');
          setEditCpf(extracted.cpf || '');
          setEditValue(centsToDecimal(extracted.totalAmountCents));

          if (extracted.documentType === 'PIX') {
            setEditDate('');
            if (!editId) {
              setEditPaymentDate(isoToBR(extracted.paymentDate));
            }
          } else {
            setEditDate(isoToBR(extracted.dueDate));
          }
        }
      } catch (error) {
        if (isMounted) {
          const msg = error instanceof Error ? error.message : String(error);
          Alert.alert('Erro no OCR', msg);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    processDocument();

    return () => {
      isMounted = false;
    };
  }, [imageUri, setOcrText, setFields, editId]);

  if (!imageUri) return null;

  const isPix = fields?.documentType === 'PIX';

  const onCancel = async () => {
    try {
      // Apaga o arquivo fisico antes de sair
      const file = new File(imageUri!);
      if (file.exists) file.delete();
    } catch {
      // Ignora erro silencioso se o arquivo ja sumiu
    }
    reset();
    router.replace('/biblioteca');
  };

  const onSave = async () => {
    if (!fields || isSaving) return;

    // Sincroniza o estado local de volta para o Contexto (se o usuario editou)
    const finalFields = {
      ...fields,
      issuer: editIssuer || null,
      referenceMonth: editReference || null,
      cnpj: editCnpj || null,
      cpf: editCpf || null,
      dueDate: editDate.trim() ? brDateToISO(editDate) : null,
      totalAmountCents: editValue.trim() ? parseBRLToCents(editValue) : null,
    };
    const paymentDateIso = editPaymentDate.trim() ? brDateToISO(editPaymentDate) : null;

    if (editValue.trim() && finalFields.totalAmountCents === null) {
      Alert.alert('Valor invalido', 'Informe o valor no formato 1.234,56');
      return;
    }
    if (editDate.trim() && !finalFields.dueDate) {
      Alert.alert('Vencimento invalido', 'Informe a data no formato DD/MM/AAAA');
      return;
    }
    if (editPaymentDate.trim() && !paymentDateIso) {
      Alert.alert('Data de pagamento invalida', 'Informe a data no formato DD/MM/AAAA');
      return;
    }

    setIsSaving(true);
    try {
      let savedId: string;
      if (editId) {
        updateDocument(editId, imageUri!, ocrText || '', finalFields, paymentDateIso, editObservacao || null);
        savedId = editId;
        setIsSuccessModalVisible(true);
      } else {
        savedId = saveDocument(imageUri!, ocrText || '', finalFields, paymentDateIso, editObservacao || null);
      }
      scheduleActiveSync();
      
      try {
        // Conta salva já paga não precisa de lembrete
        if (!paymentDateIso && finalFields.dueDate && finalFields.issuer) {
          await scheduleDueDateReminder(savedId, finalFields.issuer, finalFields.dueDate);
        }
      } catch (e) {
        console.warn("Erro ao agendar notificacao", e);
      }

      setIsSuccessVisible(true); // NÃO chamar reset() aqui!
    } catch (e) {
      console.error('Erro detalhado ao salvar:', e);
      Alert.alert('Erro ao salvar', String(e));
      setIsSaving(false);
    }
  };

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      {/* Área útil: nada fica atrás da barra de status nem dos botões de navegação do celular */}
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ color: theme.colors.primary, fontSize: 14, fontFamily: theme.fonts.bold }}>REVISAO</Text>
          <Pressable
            onPress={async () => {
              if (!ocrText) return;
              try {
                // O arquivo anterior já foi compartilhado; não deixa texto de contas acumulando
                await cleanupDebugFiles();
                const path = FileSystem.cacheDirectory + 'ocr_debug_' + Date.now() + '.txt';
                await FileSystem.writeAsStringAsync(path, ocrText);
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(path, { mimeType: 'text/plain', dialogTitle: 'OCR Bruto' });
                }
              } catch (e) {
                Alert.alert('Erro', String(e));
              }
            }}
          >
            <Text style={{ color: theme.colors.success, fontSize: 12, fontFamily: theme.fonts.bold }}>EXPORTAR OCR</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => setIsImageVisible(true)} style={styles.imageContainer}>
          <Image source={{ uri: imageUri! }} style={styles.image} resizeMode="contain" />
        </Pressable>

        <Modal visible={isImageVisible} transparent={true} animationType="fade">
          <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.modalContainer}>
              <Pressable style={[styles.modalClose, { top: insets.top + 16 }]} onPress={() => setIsImageVisible(false)}>
                <MaterialCommunityIcons name="close" size={32} color="#fff" />
              </Pressable>
              {imageUri && <ZoomableImage uri={imageUri} />}
            </View>
          </GestureHandlerRootView>
        </Modal>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <RadarLoader size={56} color={theme.colors.primary} />
            <Text style={styles.loadingText}>Processando OCR...</Text>
            <Text style={[styles.loadingText, { fontSize: 12, marginTop: 8 }]}>
              Consultando dados do emissor...
            </Text>
          </View>
        ) : (
          <View style={styles.formContainer}>
            <Text style={styles.sectionTitle}>Campos Encontrados</Text>
            <Text style={styles.helpText}>Revise e edite os dados abaixo:</Text>

            

            <Text style={styles.label}>Tipo do Documento</Text>
            <Text style={styles.valueText}>{fields?.documentType || 'DESCONHECIDO'}</Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
              <Text style={styles.label}>{isPix ? 'Recebedor' : 'Emissor'}</Text>
              {!isPix && (
                <Pressable onPress={() => setReclassifyVisible(true)}>
                  <Text style={{ color: theme.colors.primary, fontSize: 12, fontFamily: theme.fonts.bold }}>Reclassificar e Aprender</Text>
                </Pressable>
              )}
            </View>
            <TextInput style={styles.input} value={editIssuer} onChangeText={setEditIssuer} placeholder="Nao encontrado" />

            {!isPix && (
              <>
                <Text style={styles.label}>Referencia (Ex: 10/2026)</Text>
                <TextInput style={styles.input} value={editReference} onChangeText={setEditReference} placeholder="Nao encontrado" />
              </>
            )}

            <Text style={styles.label}>CNPJ</Text>
            <TextInput style={styles.input} value={editCnpj} onChangeText={setEditCnpj} keyboardType="numeric" placeholder="Nao encontrado" />

            {isPix && editCpf ? (
              <>
                <Text style={styles.label}>CPF</Text>
                <TextInput style={styles.input} value={editCpf} onChangeText={setEditCpf} keyboardType="numeric" placeholder="Nao encontrado" />
              </>
            ) : null}

            {!isPix && (
              <>
                <Text style={styles.label}>Data de Vencimento (DD/MM/AAAA)</Text>
                <TextInput style={styles.input} value={editDate} onChangeText={(t) => setEditDate(maskDateInput(t))} placeholder="DD/MM/AAAA" keyboardType="numeric" />
              </>
            )}

            <Text style={styles.label}>Valor Total (R$)</Text>
            <TextInput style={styles.input} value={editValue} onChangeText={(t) => setEditValue(maskCurrency(t))} keyboardType="numeric" placeholder="0,00" />

            <Text style={styles.label}>
              {isPix ? 'Data do Pagamento (DD/MM/AAAA)' : 'Data de Pagamento (Opcional)'}
            </Text>
            <TextInput style={styles.input} value={editPaymentDate} onChangeText={(t) => setEditPaymentDate(maskDateInput(t))} placeholder="DD/MM/AAAA" keyboardType="numeric" />
            {isPix && fields?.paymentTime ? (
              <Text style={styles.helpText}>Hora do comprovante: {fields.paymentTime}</Text>
            ) : null}

            {isPix && (
              <>
                <Text style={styles.label}>Observacao</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60 }]}
                  value={editObservacao}
                  onChangeText={setEditObservacao}
                  placeholder="Anotacao livre"
                  multiline
                  textAlignVertical="top"
                />
              </>
            )}

            <Text style={styles.sectionTitle}>Texto Completo (OCR)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              value={ocrText || ''}
              onChangeText={setOcrText}
              placeholder="Nenhum texto reconhecido."
              textAlignVertical="top"
            />
          </View>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={styles.buttonSecondary} onPress={onCancel}>
          <Text style={styles.buttonTextSecondary}>Descartar</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onSave} disabled={isLoading || isSaving}>
          <Text style={styles.buttonText}>Salvar Documento</Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>
      </SafeAreaView>

      {reclassifyVisible && (
        <ReclassifyModal
          initialCategory={editIssuer}
          ocrText={ocrText || ''}
          onSaved={(category) => {
            setEditIssuer(category);
            setReclassifyVisible(false);
          }}
          onCancel={() => setReclassifyVisible(false)}
        />
      )}

      <CustomModal
        visible={isSuccessVisible}
        title="Sucesso!"
        message="Documento salvo na biblioteca."
        confirmText="Continuar"
        onConfirm={() => {
          setIsSuccessVisible(false);
          router.replace('/biblioteca');
        }}
        onCancel={() => {
          setIsSuccessVisible(false);
          router.replace('/biblioteca');
        }}
      />
      <CustomModal
        visible={isSuccessModalVisible}
        title="Sucesso"
        message={editId ? 'Documento atualizado com sucesso.' : 'Documento salvo com sucesso.'}
        onConfirm={() => { setIsSuccessModalVisible(false); if (!editId) reset(); router.back(); }}
      />
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  imageContainer: {
    height: 200,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  loadingBox: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: theme.colors.textSecondary },
  formContainer: { padding: 16 },
  sectionTitle: { fontSize: 18, fontFamily: theme.fonts.bold, color: theme.colors.primary, marginTop: 16, marginBottom: 8 },
  helpText: { fontSize: 13, fontFamily: theme.fonts.regular, color: theme.colors.textSecondary, marginBottom: 16 },
  label: { fontSize: 13, fontFamily: theme.fonts.medium, color: theme.colors.primary, marginTop: 12, marginBottom: 4 },
  valueText: { fontSize: 16, fontFamily: theme.fonts.regular, color: theme.colors.text, paddingVertical: 4 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    fontFamily: theme.fonts.regular,
    color: theme.colors.text,
    backgroundColor: theme.colors.panel,
  },
  textArea: { height: 150, marginTop: 8 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', paddingTop: 50, paddingBottom: 50 },
  modalClose: { position: 'absolute', top: 40, right: 20, zIndex: 10 },
  actions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
    backgroundColor: theme.colors.panel,
  },
  button: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: theme.colors.background, fontFamily: theme.fonts.bold, fontSize: 16 },
  buttonSecondary: {
    flex: 1,
    backgroundColor: theme.colors.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonTextSecondary: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 16 },

}));