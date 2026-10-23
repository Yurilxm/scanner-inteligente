import React from 'react';
import { render, act } from '@testing-library/react-native';
import { CustomToast } from '../src/components/CustomToast';

jest.useFakeTimers();

describe('CustomToast', () => {
  it('renderiza a mensagem e desaparece apos 3 segundos', async () => {
    const onHideMock = jest.fn();
    const { getByText } = await render(<CustomToast message="Documento salvo!" onHide={onHideMock} />);

    expect(getByText('Documento salvo!')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(onHideMock).toHaveBeenCalledTimes(1);
  });
});
