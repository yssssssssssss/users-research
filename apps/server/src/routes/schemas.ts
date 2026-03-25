const idParam = (key: string) =>
  ({
    type: 'object',
    required: [key],
    properties: {
      [key]: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  }) as const;

const fileTypeEnum = ['document', 'image', 'design', 'spreadsheet'] as const;
const inputTypeEnum = ['text', 'design', 'mixed'] as const;
const taskModeEnum = [
  'quick_judgment',
  'deep_research',
  'design_review',
  'hypothesis_test',
] as const;
const reviewEvidenceStatusEnum = ['accepted', 'downgraded', 'rejected'] as const;
const tierEnum = ['T1', 'T2', 'T3'] as const;
const reviewReportActionEnum = ['approve', 'request_rework'] as const;
const overrideModeEnum = ['auto', 'manual'] as const;
const runModeEnum = ['sync', 'async'] as const;

const fileInputSchema = {
  type: 'object',
  required: ['fileId'],
  properties: {
    fileId: { type: 'string', minLength: 1 },
    fileName: { type: 'string', minLength: 1 },
    fileType: { type: 'string', enum: [...fileTypeEnum] },
    ossKey: { type: 'string', minLength: 1 },
    sourceUrl: { type: 'string', minLength: 1 },
    mimeType: { type: 'string', minLength: 1 },
    dataUrl: { type: 'string', minLength: 1 },
    localPath: { type: 'string', minLength: 1 },
    sizeBytes: { type: 'number', minimum: 0 },
    sha256: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;

export const uploadAssetBodySchema = {
  type: 'object',
  required: ['fileName', 'fileType', 'dataUrl'],
  properties: {
    fileName: { type: 'string', minLength: 1 },
    fileType: { type: 'string', enum: [...fileTypeEnum] },
    mimeType: { type: 'string', minLength: 1 },
    dataUrl: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;

export const taskIdParamsSchema = idParam('taskId');
export const evidenceIdParamsSchema = idParam('evidenceId');
export const reportIdParamsSchema = idParam('reportId');

export const createTaskBodySchema = {
  type: 'object',
  required: ['query', 'inputType', 'taskMode', 'enabledModules'],
  properties: {
    title: { type: 'string', minLength: 1 },
    query: { type: 'string', minLength: 1 },
    inputType: { type: 'string', enum: [...inputTypeEnum] },
    taskMode: { type: 'string', enum: [...taskModeEnum] },
    enabledModules: {
      type: 'object',
      required: [
        'evidence',
        'visionMoE',
        'personaSandbox',
        'externalSearch',
        'multiModelReview',
      ],
      properties: {
        evidence: { type: 'boolean' },
        visionMoE: { type: 'boolean' },
        personaSandbox: { type: 'boolean' },
        externalSearch: { type: 'boolean' },
        multiModelReview: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    attachments: {
      type: 'array',
      items: fileInputSchema,
    },
    designFiles: {
      type: 'array',
      items: fileInputSchema,
    },
  },
  additionalProperties: false,
} as const;

export const runTaskBodySchema = {
  type: 'object',
  properties: {
    runMode: { type: 'string', enum: [...runModeEnum] },
  },
  additionalProperties: false,
} as const;

export const overrideExperienceModelsBodySchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: [...overrideModeEnum] },
    modelIds: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      uniqueItems: true,
    },
  },
  additionalProperties: false,
} as const;

export const generateReportBodySchema = {
  type: 'object',
  properties: {
    candidateOutputId: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;

export const reviewEvidenceBodySchema = {
  type: 'object',
  required: ['reviewStatus'],
  properties: {
    reviewStatus: { type: 'string', enum: [...reviewEvidenceStatusEnum] },
    tier: { type: 'string', enum: [...tierEnum] },
    isUsedInReport: { type: 'boolean' },
    reviewer: { type: 'string', minLength: 1 },
    comment: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;

export const reviewReportBodySchema = {
  type: 'object',
  required: ['action'],
  properties: {
    action: { type: 'string', enum: [...reviewReportActionEnum] },
    reviewer: { type: 'string', minLength: 1 },
    comment: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;
