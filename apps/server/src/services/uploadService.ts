import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import type { CreateTaskFileInput, UploadAssetRequest } from '@users-research/shared';
import { appConfig } from '../config/env.js';

const UPLOAD_DIR = resolve(appConfig.paths.envDir, 'apps/server/tmp/uploads');
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ensureUploadDir = () => {
  mkdirSync(UPLOAD_DIR, { recursive: true });
};

const sanitizeFileName = (value: string) => {
  const base = basename(value || 'upload');
  const normalized = base.replace(/[^\w.\-()\u4e00-\u9fa5]+/g, '_');
  return normalized || 'upload';
};

const splitDataUrl = (value: string): { mimeType?: string; base64: string } => {
  const trimmed = value.trim();
  const match = trimmed.match(/^data:([^;]+);base64,(.+)$/);
  if (match?.[2]) {
    return {
      mimeType: match[1],
      base64: match[2],
    };
  }

  return { base64: trimmed };
};

const detectMimeType = (fallback?: string, dataUrlMimeType?: string) =>
  (fallback || dataUrlMimeType || 'application/octet-stream').trim();

export const saveUploadedAsset = (payload: UploadAssetRequest): CreateTaskFileInput => {
  if (!payload.fileName?.trim()) {
    throw new Error('上传文件缺少 fileName。');
  }
  if (!payload.dataUrl?.trim()) {
    throw new Error('上传文件缺少 dataUrl。');
  }

  ensureUploadDir();

  const { base64, mimeType: dataUrlMimeType } = splitDataUrl(payload.dataUrl);
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) {
    throw new Error('上传文件内容为空。');
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`上传文件过大，当前限制 ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)}MB。`);
  }

  const fileId = `file_${randomUUID().replace(/-/g, '')}`;
  const sanitizedName = sanitizeFileName(payload.fileName);
  const extension = extname(sanitizedName);
  const diskName = extension
    ? `${fileId}${extension}`
    : `${fileId}_${sanitizedName}`;
  const absolutePath = resolve(UPLOAD_DIR, diskName);
  writeFileSync(absolutePath, buffer);

  const mimeType = detectMimeType(payload.mimeType, dataUrlMimeType);
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  return {
    fileId,
    fileName: sanitizedName,
    fileType: payload.fileType,
    mimeType,
    sourceUrl: `/api/uploads/${diskName}`,
    dataUrl:
      payload.fileType === 'image' || payload.fileType === 'design'
        ? payload.dataUrl
        : undefined,
    localPath: absolutePath,
    sizeBytes: buffer.length,
    sha256,
  };
};

export const getUploadAssetByDiskName = (diskName: string): {
  absolutePath: string;
  fileName: string;
} => {
  const safeName = basename(diskName);
  if (!safeName || safeName !== diskName) {
    throw new Error('非法文件路径。');
  }

  const absolutePath = resolve(UPLOAD_DIR, safeName);
  if (!existsSync(absolutePath)) {
    throw new Error('上传文件不存在。');
  }

  return {
    absolutePath,
    fileName: safeName,
  };
};

export const createUploadReadStream = (diskName: string) => {
  const { absolutePath, fileName } = getUploadAssetByDiskName(diskName);
  return {
    fileName,
    stream: createReadStream(absolutePath),
  };
};
