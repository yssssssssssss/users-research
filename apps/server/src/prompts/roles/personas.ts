import type { PersonaProfileTemplate } from '@users-research/shared';

export const PERSONA_LIBRARY: PersonaProfileTemplate[] = [
  {
    id: 'price_sensitive',
    type: '价格敏感型用户',
    summary: '高度关注效率、价格和优惠信息，对冗余内容容忍度低。',
    behaviorTraits: ['决策快', '价格优先', '路径敏感'],
    concerns: ['找优惠慢', '路径绕', '信息噪音过多'],
    motivations: ['尽快完成决策', '获得明确利益点'],
  },
  {
    id: 'content_driven',
    type: '高内容消费型用户',
    summary: '愿意阅读内容帮助判断，但要求内容真正提高理解效率。',
    behaviorTraits: ['愿意阅读', '关注价值解释', '决策前需要理解'],
    concerns: ['内容空泛', '信息不可信', '内容与行动断裂'],
    motivations: ['更好理解价值', '降低试错成本'],
  },
  {
    id: 'novice_user',
    type: '低熟悉度新用户',
    summary: '对产品和页面结构不熟悉，容易受复杂度和路径摩擦影响。',
    behaviorTraits: ['认知负担高', '容易迷失', '需要明确引导'],
    concerns: ['看不懂', '不知道下一步', '不敢点击'],
    motivations: ['快速理解页面', '明确知道怎么行动'],
  },
  {
    id: 'trust_first',
    type: '谨慎信任型用户',
    summary: '优先关注专业性、可信度和风险信号，不会轻易被情绪化设计打动。',
    behaviorTraits: ['谨慎', '重视细节', '风险敏感'],
    concerns: ['不专业', '信息夸张', '缺少信任背书'],
    motivations: ['降低风险感', '获得可信依据'],
  },
];
