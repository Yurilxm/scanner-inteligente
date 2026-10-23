import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator, Image, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native';
import { router } from 'expo-router';
import { File } from 'expo-file-system';
import { saveDocument } from '../src/db/database';
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
          const extracted = extractFields(rawData);
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

  const onCancel = async () => {
    try {
      // Apaga o arquivo fisico antes de sair
      const file = new File(imageUri);
      if (file.exists) file.delete();
    } catch {
      // Ignora erro silencioso se o arquivo ja sumiu
    }
    reset();
    router.replace('/');
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
      saveDocument(imageUri!, ocrText || '', finalFields);
      
      // Agendar a notificação se tiver vencimento e emissor
      if (finalFields.dueDate && finalFields.issuer) {
        await scheduleDueDateReminder(`doc_${Date.now()}`, finalFields.issuer, finalFields.dueDate);
      }

      reset();
      // Alerta customizado (simulando um Toast bonito via Modal)
      setIsSuccessVisible(true);
    } catch {
      Alert.alert('Erro', 'Nao foi possivel salvar o documento.');
    }
  };

  return (
    <LinearGradient colors={[Theme.colors.background, Theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Pressable onPress={() => setIsImageVisible(true)} style={styles.imageContainer}>
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
        </Pressable>

        <Modal visible={isImageVisible} transparent={true} animationType="fade">
          <View style={styles.modalContainer}>
            <Pressable style={styles.modalClose} onPress={() => setIsImageVisible(false)}>
              <MaterialCommunityIcons name="close" size={32} color="#fff" />
            </Pressable>
            <Image source={{ uri: imageUri }} style={styles.fullImage} resizeMode="contain" />
          </View>
        </Modal>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0a7ea4" />
            <Text style={styles.loadingText}>Processando OCR e extraindo campos...</Text>
          </View>
        ) : (
          <View style={styles.formContainer}>
            <Text style={styles.sectionTitle}>Campos Encontrados</Text>
            <Text style={styles.helpText}>Revise e edite os dados abaixo:</Text>

            <Pressable onPress={onDebugOcr} style={{ marginBottom: 16, padding: 8, backgroundColor: '#ff9800', borderRadius: 8, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>🐞 SALVAR JSON DO OCR (DEBUG)</Text>
            </Pressable>

            <Text style={styles.label}>Tipo do Documento</Text>
            <Text style={styles.valueText}>{fields?.documentType || 'DESCONHECIDO'}</Text>

            <Text style={styles.label}>Emissor (Ex: Enel, Prolagos)</Text>
            <TextInput style={styles.input} value={editIssuer} onChangeText={setEditIssuer} placeholder="Nao encontrado" />

            <Text style={styles.label}>Referencia (Ex: 10/2026)</Text>
            <TextInput style={styles.input} value={editReference} onChangeText={setEditReference} placeholder="Nao encontrado" />

            <Text style={styles.label}>CNPJ</Text>
            <TextInput style={styles.input} value={editCnpj} onChangeText={setEditCnpj} keyboardType="numeric" placeholder="Nao encontrado" />

            <Text style={styles.label}>Data de Vencimento (DD/MM/AAAA)</Text>
            <TextInput style={styles.input} value={editDate} onChangeText={setEditDate} placeholder="DD/MM/AAAA" />

            <Text style={styles.label}>Valor Total (R$)</Text>
            <TextInput style={styles.input} value={editValue} onChangeText={setEditValue} keyboardType="numeric" placeholder="0,00" />

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
      <CustomModal
        visible={isSuccessVisible}
        title="Sucesso!"
        message="Documento salvo na biblioteca."
        confirmText="Continuar"
        onConfirm={() => {
          setIsSuccessVisible(false);
          router.replace('/');
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
});