import { useState, useCallback, useEffect } from 'react';
import { AuditConfig } from '../../types';
import { DEFAULT_AUDIT_CONFIG } from '../services/defaultConfig';

const API_URL = '/api/config';

export function useAuditConfig() {
  const [config, setConfig] = useState<AuditConfig>(DEFAULT_AUDIT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load config from server on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch(API_URL);
        if (response.ok) {
          const serverConfig = await response.json();
          setConfig(serverConfig);
        }
      } catch (error) {
        console.error('Failed to load config from server:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadConfig();
  }, []);

  // Save config to server
  const saveConfigToServer = useCallback(async (newConfig: AuditConfig) => {
    setIsSaving(true);
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (!response.ok) {
        throw new Error('Failed to save config');
      }
      return true;
    } catch (error) {
      console.error('Failed to save config to server:', error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const updateConfig = useCallback(async (newConfig: AuditConfig) => {
    setConfig(newConfig);
    await saveConfigToServer(newConfig);
  }, [saveConfigToServer]);

  const resetConfig = useCallback(async () => {
    setConfig(DEFAULT_AUDIT_CONFIG);
    await saveConfigToServer(DEFAULT_AUDIT_CONFIG);
  }, [saveConfigToServer]);

  const updateStepModel = useCallback(async (stepId: string, model: string) => {
    const newConfig = {
      ...config,
      steps: {
        ...config.steps,
        [stepId]: {
          ...config.steps[stepId],
          model,
        },
      },
    };
    setConfig(newConfig);
    await saveConfigToServer(newConfig);
  }, [config, saveConfigToServer]);

  const updateStepPrompt = useCallback(async (stepId: string, promptTemplate: string) => {
    const newConfig = {
      ...config,
      steps: {
        ...config.steps,
        [stepId]: {
          ...config.steps[stepId],
          promptTemplate,
        },
      },
    };
    setConfig(newConfig);
    await saveConfigToServer(newConfig);
  }, [config, saveConfigToServer]);

  return {
    config,
    setConfig: updateConfig,
    resetConfig,
    updateStepModel,
    updateStepPrompt,
    isLoading,
    isSaving,
  };
}
