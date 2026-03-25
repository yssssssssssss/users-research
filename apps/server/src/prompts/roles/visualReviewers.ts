import type { VisualReviewerRole } from '@users-research/shared';

export interface VisualReviewerDefinition {
  role: VisualReviewerRole;
  label: string;
  description: string;
  systemPrompt: string;
  dimensions: string[];
  preferredModelId: string;
}

export const VISUAL_REVIEWERS: VisualReviewerDefinition[] = [
  {
    role: 'structural',
    label: '视觉设计师',
    description: '关注画面设计的风格、美观度，以及整体视觉表现的完成度。',
    systemPrompt: '优秀的视觉设计师，会根据画面设计的风格、美观度来进行分析和评估，并给出建议',
    dimensions: ['设计风格', '美观度', '视觉一致性', '画面质感', '整体完成度'],
    preferredModelId: 'GPT 5.2',
  },
  {
    role: 'emotional',
    label: '交互体验设计师',
    description: '关注重点是否突出、文字是否清晰，以及浏览动线和操作体验是否科学合理。',
    systemPrompt:
      '优秀的交互体验设计师，会根据画面重点是否突出，文字是否清晰，用户的浏览动线和操作体验是否科学合理，来进行分析和评估，并给出建议',
    dimensions: ['重点突出度', '文字清晰度', '浏览动线', '操作体验', '信息层级'],
    preferredModelId: 'GPT 5.2',
  },
  {
    role: 'behavioral',
    label: '创意策划师',
    description: '关注画面与文案的创意性、传播性和独特性。',
    systemPrompt:
      '优秀的创意策划师，会根据画面和文案的创意性、传播性、独特性，来进行分析和评估，并给出建议',
    dimensions: ['创意性', '传播性', '独特性', '文案表达', '记忆点'],
    preferredModelId: 'GPT 5.2',
  },
];
