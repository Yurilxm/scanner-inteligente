import { AppStateFlag } from '../src/utils/AppStateFlag';

describe('AppStateFlag', () => {
  it('deve iniciar como false', () => {
    expect(AppStateFlag.isPickingImage()).toBe(false);
  });

  it('deve atualizar o valor corretamente', () => {
    AppStateFlag.setPickingImage(true);
    expect(AppStateFlag.isPickingImage()).toBe(true);

    AppStateFlag.setPickingImage(false);
    expect(AppStateFlag.isPickingImage()).toBe(false);
  });
});
