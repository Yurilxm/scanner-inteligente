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
          setEditCnpj(extracted.cnpj || '');
          setEditCpf(extracted.cpf || '');
          setEditDate(extracted.date || '');
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
      cnpj: editCnpj || null,
      cpf: editCpf || null,
      date: editDate || null,
      totalAmountCents: editValue ? Math.round(parseFloat(editValue.replace(',', '.')) * 100) : null,
    };

    try {
      saveDocument(imageUri!, ocrText || '', finalFields);
      reset();
      Alert.alert('Sucesso', 'Documento salvo na biblioteca!', [
        { text: 'OK', onPress: () => router.replace('/') }
      ]);
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

            <Text style={styles.label}>CNPJ</Text>
            <TextInput style={styles.input} value={editCnpj} onChangeText={setEditCnpj} keyboardType="numeric" placeholder="Nao encontrado" />

            <Text style={styles.label}>CPF</Text>
            <TextInput style={styles.input} value={editCpf} onChangeText={setEditCpf} keyboardType="numeric" placeholder="Nao encontrado" />

            <Text style={styles.label}>Data (AAAA-MM-DD)</Text>
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
  container: { flex: 1, backgroundColor: '#fff' },
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
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 16, marginBottom: 8 },
  helpText: { fontSize: 13, color: '#666', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 12, marginBottom: 4 },
  valueText: { fontSize: 16, color: '#333', paddingVertical: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  textArea: { height: 150, marginTop: 8 },
  actions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#eee',
    gap: 12,
    backgroundColor: '#fff',
  },
  button: {
    flex: 1,
    backgroundColor: '#0a7ea4',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSecondary: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonTextSecondary: { color: '#555', fontSize: 16, fontWeight: '600' },
});
