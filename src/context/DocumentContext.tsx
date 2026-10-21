import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ExtractedFields } from '../types/document';

type DocumentContextValue = {
  imageUri: string | null;
  setImageUri: (uri: string | null) => void;
  ocrText: string | null;
  setOcrText: (text: string | null) => void;
  fields: ExtractedFields | null;
  setFields: (fields: ExtractedFields | null) => void;
  reset: () => void;
};

const DocumentContext = createContext<DocumentContextValue | undefined>(undefined);

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [imageUri, setImageUriState] = useState<string | null>(null);
  const [ocrText, setOcrTextState] = useState<string | null>(null);
  const [fields, setFieldsState] = useState<ExtractedFields | null>(null);

  const setImageUri = useCallback((uri: string | null) => {
    setImageUriState(uri);
  }, []);

  const setOcrText = useCallback((text: string | null) => {
    setOcrTextState(text);
  }, []);

  const setFields = useCallback((newFields: ExtractedFields | null) => {
    setFieldsState(newFields);
  }, []);

  const reset = useCallback(() => {
    setImageUriState(null);
    setOcrTextState(null);
    setFieldsState(null);
  }, []);

  const value = useMemo(
    () => ({ imageUri, setImageUri, ocrText, setOcrText, fields, setFields, reset }),
    [imageUri, setImageUri, ocrText, setOcrText, fields, setFields, reset],
  );

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>;
}

export function useDocument(): DocumentContextValue {
  const ctx = useContext(DocumentContext);
  if (!ctx) {
    throw new Error('useDocument deve ser usado dentro de DocumentProvider');
  }
  return ctx;
}
