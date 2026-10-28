let isPickingImage = false;
let requestingPermission = false;

export const AppStateFlag = {
  setPickingImage: (val: boolean) => { isPickingImage = val; },
  isPickingImage: () => isPickingImage,
  setRequestingPermission: (val: boolean) => { requestingPermission = val; },
  isRequestingPermission: () => requestingPermission,
};
