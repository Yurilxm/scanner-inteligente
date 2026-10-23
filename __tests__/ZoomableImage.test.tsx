import React from 'react';
import { render } from '@testing-library/react-native';
import { ZoomableImage } from '../src/components/ZoomableImage';

jest.mock('react-native-gesture-handler', () => {
  return {
    GestureDetector: ({ children }: any) => children,
    Gesture: {
      Pinch: () => ({ onUpdate: () => ({ onEnd: () => {} }) }),
      Pan: () => ({ onUpdate: () => ({ onEnd: () => {} }) }),
      Tap: () => ({ numberOfTaps: () => ({ onEnd: () => {} }) }),
      Race: () => {}
    },
  };
});

describe('ZoomableImage', () => {
  it('renders correctly with uri without throwing', () => {
    expect(() => render(<ZoomableImage uri="file://test.png" />)).not.toThrow();
  });
});
