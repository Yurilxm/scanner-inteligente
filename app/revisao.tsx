import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator, Image, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView, Modal, BackHandler } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ZoomableImage } from '../src/components/ZoomableImage';
import { router } from 'expo-router';
import { File } from 'expo-file-system';
import { saveDocument, getLearnedCategories, saveLearnedCategory, getLearnedPatternForCategory } from '../src/db/database';
import { useDocument } from '../src/context/DocumentContext';
import { extractDocumentData, extractRawOcrData } from '../src/utils/ocr';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { extractFields } from '../src/utils/extractor';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../src/components/ScannerBackground';
import { Theme } from '../src/constants/theme';
import { CustomModal } from '../src/components/CustomModal';
import { requestNotificationPermissions, scheduleDueDateReminder } from '../src/utils/notifications';

export default function RevisaoScreen() {

  const formatDateInput = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 4) return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
  };

  const { imageUri, ocrText, setOcrText, fields, setFields, reset } = useDocument();
  const [isLoading, setIsLoading] = useState(true);
  const [isImageVisible, setIsImageVisible] = useState(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);

  // Estado local para edicao
  const [editIssuer, setEditIssuer] = useState('');
  const [editReference, setEditReference] = useState('');
  const [editCnpj, setEditCnpj] = useState('');
  const [editCpf, setEditCpf] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editPaymentDate, setEditPaymentDate] = useState('');
  const [reclassifyVisible, setReclassifyVisible] = useState(false);
  const [reclassifyCategory, setReclassifyCategory] = useState('');
  const [reclassifyKeyword, setReclassifyKeyword] = useState('');

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
    requestNotificationPermissions();
    if (!imageUri) {
      setIsSuccessVisible(true);
      return;
    }

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
          const extracted = await extractFields(rawData, getLearnedCategories());
          setFields(extracted);

          // 3. Preenche estado local para edicao
          setEditIssuer(extracted.issuer || '');
          setEditReference(extracted.referenceMonth || '');
          setEditCnpj(extracted.cnpj || '');
          setEditCpf(extracted.cpf || '');
          // Inverte de AAAA-MM-DD para DD/MM/AAAA
          setEditDate(extracted.dueDate ? extracted.dueDate.split('-').reverse().join('/') : '');
          setEditValue(extracted.totalAmountCents ? (extracted.totalAmountCents / 100).toFixed(2).replace('.', ',') : '');
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
  }, [imageUri, setOcrText, setFields]);

  if (!imageUri) return null;

  const handleOpenReclassify = () => {
    setReclassifyCategory(editIssuer || '');
    // Se já existe uma palavra salva para essa categoria, usa ela
    const existing = getLearnedPatternForCategory(editIssuer || '');
    if (existing) {
      setReclassifyKeyword(existing.toUpperCase());
    } else {
      // Senão, tenta sugerir pelo Beneficiário
      const benMatch = (ocrText || '').match(/(?:BENEFICIARIO|CEDENTE)[^A-Z0-9]+([A-Z0-9\s]{4,40})/i);
      if (benMatch) {
        setReclassifyKeyword(benMatch[1].trim().split(' ')[0].toUpperCase());
      } else {
        const words = (ocrText || '').split(/\s+/).filter(w => w.length > 4 && /^[A-Za-z]+$/.test(w));
        setReclassifyKeyword(words.length > 0 ? words[0].toUpperCase() : '');
      }
    }
    setReclassifyVisible(true);
  };

  const handleSaveReclassify = () => {
    if (!reclassifyCategory.trim() || !reclassifyKeyword.trim()) return;
    saveLearnedCategory(reclassifyKeyword.trim(), reclassifyCategory.trim().toUpperCase());
    setEditIssuer(reclassifyCategory.trim().toUpperCase());
    setReclassifyVisible(false);
  };

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

  const onDebugOcr = async () => {
    try {
      if (!imageUri) return;
      const rawData = await extractRawOcrData(imageUri);
      const path = `${FileSystem.documentDirectory}debug_ocr_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(rawData, null, 2));
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: 'application/json',
          dialogTitle: 'Enviar JSON de OCR',
        });
      } else {
        Alert.alert('Erro', 'Compartilhamento indisponivel.');
      }
    } catch (e) {
      Alert.alert('Erro no Debug', String(e));
    }
  };

  const onSave = async () => {
    if (!fields) return;

    // Sincroniza o estado local de volta para o Contexto (se o usuario editou)
    const finalFields = {
      ...fields,
      issuer: editIssuer || null,
      referenceMonth: editReference || null,
      cnpj: editCnpj || null,
      cpf: editCpf || null,
      dueDate: editDate.includes('/') ? editDate.split('/').reverse().join('-') : editDate || null,
      totalAmountCents: editValue ? Math.round(parseFloat(editValue.replace(',', '.')) * 100) : null,
    };

    try {
      let paymentDateIso = null;
      if (editPaymentDate && editPaymentDate.trim() !== '') {
        const parts = editPaymentDate.split('/');
        if (parts.length === 3) {
          // Garante que tenha dois dígitos (ex: 8 vira 08)
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
          paymentDateIso = `${year}-${month}-${day}`;
        }
      }

      console.log('Salvando com paymentDateIso:', paymentDateIso);
      const savedId = saveDocument(imageUri!, ocrText || '', finalFields, paymentDateIso);
      
      try {
        if (finalFields.dueDate && finalFields.issuer) {
          await scheduleDueDateReminder(savedId, finalFields.issuer, finalFields.dueDate);
        }
      } catch (e) {
        console.warn("Erro ao agendar notificacao", e);
      }

      setIsSuccessVisible(true); // NÃO chamar reset() aqui!
    } catch (e) {
      console.error('Erro detalhado ao salvar:', e);
      Alert.alert('Erro ao salvar', String(e));
    }
  };

  return (
    <LinearGradient colors={[Theme.colors.background, Theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => setIsImageVisible(true)} style={styles.imageContainer}>
          <Image source={{ uri: imageUri! }} style={styles.image} resizeMode="contain" />
        </Pressable>

        <Modal visible={isImageVisible} transparent={true} animationType="fade">
          <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.modalContainer}>
              <Pressable style={styles.modalClose} onPress={() => setIsImageVisible(false)}>
                <MaterialCommunityIcons name="close" size={32} color="#fff" />
              </Pressable>
              {imageUri && <ZoomableImage uri={imageUri} />}
            </View>
          </GestureHandlerRootView>
        </Modal>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Theme.colors.primary} />
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
              <Text style={styles.label}>Emissor</Text>
              <Pressable onPress={handleOpenReclassify}>
                <Text style={{ color: Theme.colors.primary, fontSize: 12, fontFamily: Theme.fonts.bold }}>Reclassificar e Aprender</Text>
              </Pressable>
            </View>
            <TextInput style={styles.input} value={editIssuer} onChangeText={setEditIssuer} placeholder="Nao encontrado" />

            <Text style={styles.label}>Referencia (Ex: 10/2026)</Text>
            <TextInput style={styles.input} value={editReference} onChangeText={setEditReference} placeholder="Nao encontrado" />

            <Text style={styles.label}>CNPJ</Text>
            <TextInput style={styles.input} value={editCnpj} onChangeText={setEditCnpj} keyboardType="numeric" placeholder="Nao encontrado" />

            <Text style={styles.label}>Data de Vencimento (DD/MM/AAAA)</Text>
            <TextInput style={styles.input} value={editDate} onChangeText={setEditDate} placeholder="DD/MM/AAAA" />

            <Text style={styles.label}>Valor Total (R$)</Text>
            <TextInput style={styles.input} value={editValue} onChangeText={setEditValue} keyboardType="numeric" placeholder="0,00" />

            <Text style={styles.label}>Data de Pagamento (Opcional)</Text>
            <TextInput style={styles.input} value={editPaymentDate} onChangeText={(t) => setEditPaymentDate(formatDateInput(t))} placeholder="DD/MM/AAAA" keyboardType="numeric" />

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
        <Pressable style={styles.button} onPress={onSave} disabled={isLoading}>
          <Text style={styles.buttonText}>Salvar Documento</Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>

      <Modal visible={reclassifyVisible} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.payModalBox}>
            <Text style={styles.payModalTitle}>Reclassificar e Aprender</Text>
            <Text style={{ color: Theme.colors.textSecondary, fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
              Vou aprender que boletos com esta palavra-chave pertencem a esta categoria.
            </Text>

            <Text style={styles.label}>Nome da Categoria</Text>
            <TextInput
              style={styles.input}
              value={reclassifyCategory}
              onChangeText={setReclassifyCategory}
              placeholder="Ex: CONDOMINIO CISNE BRANCO"
              autoCapitalize="characters"
            />

            <Text style={styles.label}>Palavra-chave (padrão)</Text>
            <TextInput
              style={styles.input}
              value={reclassifyKeyword}
              onChangeText={setReclassifyKeyword}
              placeholder="Ex: CISNE BRANCO"
              autoCapitalize="characters"
            />

            <View style={styles.payActions}>
              <Pressable style={styles.payCancel} onPress={() => setReclassifyVisible(false)}>
                <Text style={styles.payCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.payConfirm} onPress={handleSaveReclassify}>
                <Text style={styles.payConfirmText}>Aprender</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
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
  loadingText: { marginTop: 12, color: '#555' },
  formContainer: { padding: 16 },
  sectionTitle: { fontSize: 18, fontFamily: Theme.fonts.bold, color: Theme.colors.primary, marginTop: 16, marginBottom: 8 },
  helpText: { fontSize: 13, fontFamily: Theme.fonts.regular, color: Theme.colors.textSecondary, marginBottom: 16 },
  label: { fontSize: 13, fontFamily: Theme.fonts.medium, color: Theme.colors.primary, marginTop: 12, marginBottom: 4 },
  valueText: { fontSize: 16, fontFamily: Theme.fonts.regular, color: Theme.colors.text, paddingVertical: 4 },
  input: {
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    fontFamily: Theme.fonts.regular,
    color: Theme.colors.text,
    backgroundColor: Theme.colors.panel,
  },
  textArea: { height: 150, marginTop: 8 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', paddingTop: 50, paddingBottom: 50 },
  modalClose: { position: 'absolute', top: 40, right: 20, zIndex: 10 },
  fullImage: { width: '100%', height: '100%' },
  actions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderColor: Theme.colors.border,
    gap: 12,
    backgroundColor: Theme.colors.panel,
  },
  button: {
    flex: 1,
    backgroundColor: Theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: Theme.colors.background, fontFamily: Theme.fonts.bold, fontSize: 16 },
  buttonSecondary: {
    flex: 1,
    backgroundColor: Theme.colors.panel,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonTextSecondary: { color: Theme.colors.primary, fontFamily: Theme.fonts.medium, fontSize: 16 },

  payModalBox: { backgroundColor: Theme.colors.panel, padding: 20, borderRadius: 12, width: '80%', borderWidth: 1, borderColor: Theme.colors.border },
  payModalTitle: { fontSize: 18, fontFamily: Theme.fonts.bold, color: Theme.colors.primary, marginBottom: 16, textAlign: 'center' },
  payActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  payCancel: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Theme.colors.border },
  payCancelText: { color: Theme.colors.textSecondary, fontFamily: Theme.fonts.bold },
  payConfirm: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', backgroundColor: Theme.colors.primary },
  payConfirmText: { color: Theme.colors.background, fontFamily: Theme.fonts.bold },
});