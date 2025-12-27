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

// Global registry for minimized popups to ensure fixed positions and prevent overlap
interface MinimizedPopup {
  deviceId: string;
  type: 'fullControl' | 'hiddenVNC';
}

const minimizedPopups: MinimizedPopup[] = [];

export function registerMinimizedPopup(deviceId: string, type: 'fullControl' | 'hiddenVNC') {
  const key = `${deviceId}-${type}`;
  if (!minimizedPopups.find(p => `${p.deviceId}-${p.type}` === key)) {
    minimizedPopups.push({ deviceId, type });
    // Sort by deviceId and type for consistent ordering
    minimizedPopups.sort((a, b) => {
      const keyA = `${a.deviceId}-${a.type}`;
      const keyB = `${b.deviceId}-${b.type}`;
      return keyA.localeCompare(keyB);
    });
  }
}

export function unregisterMinimizedPopup(deviceId: string, type: 'fullControl' | 'hiddenVNC') {
  const key = `${deviceId}-${type}`;
  const index = minimizedPopups.findIndex(p => `${p.deviceId}-${p.type}` === key);
  if (index >= 0) {
    minimizedPopups.splice(index, 1);
  }
}

export function getMinimizedPopupIndex(deviceId: string, type: 'fullControl' | 'hiddenVNC'): number {
  const key = `${deviceId}-${type}`;
  return minimizedPopups.findIndex(p => `${p.deviceId}-${p.type}` === key);
}

export function getMinimizedPopupPosition(
  deviceId: string,
  type: 'fullControl' | 'hiddenVNC',
  minimizedWidth: number = 280,
  buttonAreaWidth: number = 300,
  horizontalSpacing: number = 8,
  topOffset: number = 8
): { x: number; y: number } {
  const index = getMinimizedPopupIndex(deviceId, type);
  if (index < 0) {
    // Not in registry, return default position
    return { x: 16, y: topOffset };
  }
  
  // Calculate position based on index (from right to left)
  const buttonAreaStartX = window.innerWidth - buttonAreaWidth;
  const x = buttonAreaStartX - minimizedWidth - (index * (minimizedWidth + horizontalSpacing));
  const y = topOffset;
  
  // Ensure popup doesn't go off-screen on the left
  return { x: Math.max(16, x), y };
}

