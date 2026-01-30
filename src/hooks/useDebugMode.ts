import { useState, useCallback } from 'react';

// Simple hash function for password comparison
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Pre-computed hash of 'audit' - the default debug password
const DEBUG_PASSWORD_HASH = 'f7db9674d3b614ed30b9e9dc1adc49d2a13cc49cfbc2d8c65abbe7d16a8d7ed3';

export function useDebugMode() {
  const [isVisible, setIsVisible] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const promptPassword = useCallback(async () => {
    if (isAuthenticated) {
      setIsVisible(true);
      return;
    }

    const password = window.prompt('Enter debug password:');
    if (!password) return;

    const hash = await sha256(password);
    if (hash === DEBUG_PASSWORD_HASH) {
      setIsAuthenticated(true);
      setIsVisible(true);
    } else {
      window.alert('Invalid password');
    }
  }, [isAuthenticated]);

  const show = useCallback(() => {
    if (isAuthenticated) {
      setIsVisible(true);
    } else {
      promptPassword();
    }
  }, [isAuthenticated, promptPassword]);

  const hide = useCallback(() => {
    setIsVisible(false);
  }, []);

  const toggle = useCallback(() => {
    if (isVisible) {
      hide();
    } else {
      show();
    }
  }, [isVisible, show, hide]);

  return {
    isVisible,
    isAuthenticated,
    show,
    hide,
    toggle,
    promptPassword,
  };
}
