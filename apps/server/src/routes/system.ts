import type { FastifyPluginAsync } from 'fastify';
import { DEFAULT_IMAGE_MODELS, DEFAULT_TEXT_MODELS } from '@users-research/model-clients';
import { listExperienceModelCatalog } from '../services/experienceModelService.js';
import { getObservabilitySummary } from '../services/taskService.js';

export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.get('/system/models', async () => ({
    textModels: DEFAULT_TEXT_MODELS,
    imageModels: DEFAULT_IMAGE_MODELS,
  }));

  app.get('/system/model-policies', async () => ({
    presets: [
      { id: 'speed_first', name: '速度优先' },
      { id: 'balanced', name: '均衡模式' },
      { id: 'quality_first', name: '质量优先' },
    ],
  }));

  app.get('/system/experience-models', async () => listExperienceModelCatalog());

  app.get('/system/observability/summary', async () => getObservabilitySummary());
};
