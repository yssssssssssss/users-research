import type { FastifyPluginAsync } from 'fastify';
import type { UploadAssetRequest, UploadAssetResponse } from '@users-research/shared';
import { createUploadReadStream, getUploadAssetByDiskName, saveUploadedAsset } from '../services/uploadService.js';
import { uploadAssetBodySchema } from './schemas.js';

type UploadParams = { diskName: string };

const inferContentType = (filename: string) => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
};

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: UploadAssetRequest; Reply: UploadAssetResponse }>(
    '/uploads',
    {
      schema: {
        body: uploadAssetBodySchema,
      },
    },
    async (request) => ({
      file: saveUploadedAsset(request.body),
    }),
  );

  app.get<{ Params: UploadParams }>(
    '/uploads/:diskName',
    async (request, reply) => {
      const { fileName } = getUploadAssetByDiskName(request.params.diskName);
      const { stream } = createUploadReadStream(request.params.diskName);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.type(inferContentType(fileName));
      return reply.send(stream);
    },
  );
};
