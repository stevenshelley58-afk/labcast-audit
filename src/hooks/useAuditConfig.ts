import { useState, useCallback } from 'react';
import { AuditConfig } from '../../types';
import { DEFAULT_AUDIT_CONFIG } from '../services/defaultConfig';

export function useAuditConfig() {
  const [config, setConfig] = useState<AuditConfig>(DEFAULT_AUDIT_CONFIG);

  const updateConfig = useCallback((newConfig: AuditConfig) => {
    setConfig(newConfig);
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_AUDIT_CONFIG);
  }, []);

  const updateStepModel = useCallback((stepId: string, model: string) => {
    setConfig(prev => ({
      ...prev,
      steps: {
        ...prev.steps,
        [stepId]: {
          ...prev.steps[stepId],
          model,
        },
      },
    }));
  }, []);

  const updateStepPrompt = useCallback((stepId: string, promptTemplate: string) => {
    setConfig(prev => ({
      ...prev,
      steps: {
        ...prev.steps,
        [stepId]: {
          ...prev.steps[stepId],
          promptTemplate,
        },
      },
    }));
  }, []);

  return {
    config,
    setConfig: updateConfig,
    resetConfig,
    updateStepModel,
    updateStepPrompt,
  };
}
