// Shared state store for popups to work independently across component instances
// Similar to how Android Studio emulators work - state is shared globally

interface PopupState {
  isOpen: boolean;
  isConnected: boolean;
  position: { x: number; y: number };
  isMinimized: boolean;
}

const popupStore: Record<string, {
  fullControl: PopupState;
  hiddenVNC: PopupState;
}> = {};

const listeners: Record<string, Set<() => void>> = {};

export function getPopupState(deviceId: string) {
  if (!popupStore[deviceId]) {
    popupStore[deviceId] = {
      fullControl: {
        isOpen: false,
        isConnected: false,
        position: { x: 100, y: 100 },
        isMinimized: false,
      },
      hiddenVNC: {
        isOpen: false,
        isConnected: false,
        position: { x: 100, y: 100 },
        isMinimized: false,
      },
    };
  }
  return popupStore[deviceId];
}

export function setPopupState(deviceId: string, type: 'fullControl' | 'hiddenVNC', updates: Partial<PopupState>) {
  if (!popupStore[deviceId]) {
    getPopupState(deviceId);
  }
  popupStore[deviceId][type] = { ...popupStore[deviceId][type], ...updates };
  // Notify listeners
  const key = `${deviceId}-${type}`;
  if (listeners[key]) {
    listeners[key].forEach(listener => listener());
  }
}

export function subscribe(deviceId: string, type: 'fullControl' | 'hiddenVNC', listener: () => void) {
  const key = `${deviceId}-${type}`;
  if (!listeners[key]) {
    listeners[key] = new Set();
  }
  listeners[key].add(listener);
  return () => {
    listeners[key]?.delete(listener);
  };
}

