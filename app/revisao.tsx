import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { File } from 'expo-file-system';
import { saveDocument } from '../src/db/database';
import { useDocument } from '../src/context/DocumentContext';
import { extractTextFromImage } from '../src/utils/ocr';
import { extractFields } from '../src/utils/extractor';

export default function RevisaoScreen() {
  const { imageUri, ocrText, setOcrText, fields, setFields, reset } = useDocument();
  const [isLoading, setIsLoading] = useState(true);

  // Estado local para edicao
  const [editIssuer, setEditIssuer] = useState('');
  const [editReference, setEditReference] = useState('');
  const [editCnpj, setEditCnpj] = useState('');
  const [editCpf, setEditCpf] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (!imageUri) {
      router.replace('/');
      return;
    }

    let isMounted = true;

    async function processDocument() {
      try {
        setIsLoading(true);
        // 1. OCR
        const text = await extractTextFromImage(imageUri!);
        
        if (isMounted) {
          setOcrText(text);
          // 2. Extracao
          const extracted = extractFields(text);
          setFields(extracted);

          // 3. Preenche estado local para edicao
          setEditIssuer(extracted.issuer || '');
          setEditReference(extracted.referenceMonth || '');
          setEditCnpj(extracted.cnpj || '');
          setEditCpf(extracted.cpf || '');
          setEditDate(extracted.dueDate || '');
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

  const onSave = () => {
    if (!fields) return;

    // Sincroniza o estado local de volta para o Contexto (se o usuario editou)
    const finalFields = {
      ...fields,
      issuer: editIssuer || null,
      referenceMonth: editReference || null,
      cnpj: editCnpj || null,
      cpf: editCpf || null,
      dueDate: editDate || null,
      totalAmountCents: editValue ? Math.round(parseFloat(editValue.replace(',', '.')) * 100) : null,
    };

    try {
      saveDocument(imageUri!, ocrText || '', finalFields);
      reset();
      // Alerta customizado (simulando um Toast bonito via Modal)
      Alert.alert('✅ SUCESSO', 'Documento salvo na biblioteca com sucesso!', [{ text: 'Continuar', onPress: () => router.replace('/') }]);
    } catch {
      Alert.alert('Erro', 'Nao foi possivel salvar o documento.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.imageContainer}>
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0a7ea4" />
            <Text style={styles.loadingText}>Processando OCR e extraindo campos...</Text>
          </View>
        ) : (
          <View style={styles.formContainer}>
            <Text style={styles.sectionTitle}>Campos Encontrados</Text>
            <Text style={styles.helpText}>Revise e edite os dados abaixo:</Text>

            <Text style={styles.label}>Tipo do Documento</Text>
            <Text style={styles.valueText}>{fields?.documentType || 'DESCONHECIDO'}</Text>

            <Text style={styles.label}>Emissor (Ex: Enel, Prolagos)</Text>
            <TextInput style={styles.input} value={editIssuer} onChangeText={setEditIssuer} placeholder="Nao encontrado" />

            <Text style={styles.label}>Referencia (Ex: 10/2026)</Text>
            <TextInput style={styles.input} value={editReference} onChangeText={setEditReference} placeholder="Nao encontrado" />

            <Text style={styles.label}>CNPJ</Text>
            <TextInput style={styles.input} value={editCnpj} onChangeText={setEditCnpj} keyboardType="numeric" placeholder="Nao encontrado" />

            <Text style={styles.label}>CPF</Text>
            <TextInput style={styles.input} value={editCpf} onChangeText={setEditCpf} keyboardType="numeric" placeholder="Nao encontrado" />

            <Text style={styles.label}>Data de Vencimento (AAAA-MM-DD)</Text>
            <TextInput style={styles.input} value={editDate} onChangeText={setEditDate} placeholder="Nao encontrada" />

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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B132B' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  imageContainer: {
    height: 250,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  loadingBox: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: '#555' },
  formContainer: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#00F5FF', marginTop: 16, marginBottom: 8 },
  helpText: { fontSize: 13, color: '#A0AAB2', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#00F5FF', marginTop: 12, marginBottom: 4 },
  valueText: { fontSize: 16, color: '#fff', paddingVertical: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#1C2541',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#fff',
    backgroundColor: '#1C2541',
  },
  textArea: { height: 150, marginTop: 8 },
  actions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#1C2541',
    gap: 12,
    backgroundColor: '#0B132B',
  },
  button: {
    flex: 1,
    backgroundColor: '#00F5FF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#0B132B', fontSize: 16, fontWeight: '900' },
  buttonSecondary: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#00F5FF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonTextSecondary: { color: '#00F5FF', fontSize: 16, fontWeight: '600' },
});
