const asRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;
export const getEvidenceAuthenticityKind = (item) => {
    const trace = asRecord(item.traceLocation);
    const authenticity = typeof trace?.authenticity === 'string' ? trace.authenticity : undefined;
    if (item.sourceLevel === 'framework' || item.sourceType === 'experience_model') {
        return 'framework';
    }
    if (item.sourceLevel === 'simulated'
        || item.sourceType === 'persona_generated'
        || item.sourceType === 'vision_generated') {
        return 'simulated';
    }
    if (item.sourceLevel === 'internal') {
        return 'internal';
    }
    if (item.sourceLevel === 'external' && item.reviewStatus === 'accepted') {
        return 'reviewed_external';
    }
    if (authenticity === 'fetched_article') {
        return 'fetched_article';
    }
    if (authenticity === 'fetched_document') {
        return 'fetched_document';
    }
    if (authenticity === 'search_result') {
        return 'search_result';
    }
    return 'unknown';
};
export const getEvidenceAuthenticityTag = (item) => {
    const kind = getEvidenceAuthenticityKind(item);
    switch (kind) {
        case 'reviewed_external':
            return { label: '已复核外部证据', color: 'green' };
        case 'fetched_article':
            return { label: '已抓原文', color: 'cyan' };
        case 'fetched_document':
            return { label: '已抓文档', color: 'processing' };
        case 'search_result':
            return { label: '搜索线索', color: 'blue' };
        case 'framework':
            return { label: '方法框架', color: 'gold' };
        case 'simulated':
            return { label: '模拟线索', color: 'purple' };
        case 'internal':
            return { label: '内部证据', color: 'geekblue' };
        default:
            return { label: '未分类', color: 'default' };
    }
};
export const getEvidenceSourceDomain = (item) => {
    const trace = asRecord(item.traceLocation);
    if (typeof trace?.sourceDomain === 'string' && trace.sourceDomain.trim()) {
        return trace.sourceDomain.trim();
    }
    if (!item.sourceUrl)
        return undefined;
    try {
        return new URL(item.sourceUrl).hostname.replace(/^www\./, '');
    }
    catch {
        return undefined;
    }
};
