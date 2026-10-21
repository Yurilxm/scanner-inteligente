import React, { type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { DocumentProvider, useDocument } from '../src/context/DocumentContext';

function wrapper({ children }: { children: ReactNode }) {
  return <DocumentProvider>{children}</DocumentProvider>;
}

describe('DocumentContext', () => {
  it('comeca com valores nulos', async () => {
    const { result } = await renderHook(() => useDocument(), { wrapper });
    expect(result.current.imageUri).toBeNull();
    expect(result.current.ocrText).toBeNull();
  });

  it('atualiza e reseta os valores', async () => {
    const { result } = await renderHook(() => useDocument(), { wrapper });

    await act(async () => {
      result.current.setImageUri('file:///tmp/doc.jpg');
      result.current.setOcrText('Texto teste');
    });

    expect(result.current.imageUri).toBe('file:///tmp/doc.jpg');
    expect(result.current.ocrText).toBe('Texto teste');

    await act(async () => {
      result.current.reset();
    });

    expect(result.current.imageUri).toBeNull();
    expect(result.current.ocrText).toBeNull();
  });
});
