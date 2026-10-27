// Usado para evitar que o app bloqueie quando a câmera ou galeria abre
let isPickingImage = false;
export const AppStateFlag = {
  setPickingImage: (val: boolean) => { isPickingImage = val; },
  isPickingImage: () => isPickingImage,
};
