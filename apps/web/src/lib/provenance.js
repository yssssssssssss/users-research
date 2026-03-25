const fallbackWarningPattern = /mock|fallback|回退|弱视觉推断/i;
const normalizeBoundaryNoteLabel = (note) => {
    const trimmed = note.trim();
    const externalSearchMatched = trimmed.match(/^\[externalSearch\]\[([^\]]+)\]\s*(.+)$/i);
    if (!externalSearchMatched)
        return trimmed;
    const [, kind, content] = externalSearchMatched;
    const kindLabelMap = {
        fetched_article: '外部检索 / 已抓内容',
        fetched_document: '外部检索 / 已抓文档',
        search_result: '外部检索 / 搜索线索',
        partial_fallback: '外部检索 / 部分回退',
        fallback: '外部检索 / 回退',
    };
    return `${kindLabelMap[kind] || `外部检索 / ${kind}`}：${content.trim()}`;
};
const normalizeStrings = (items) => Array.from(new Set(items
    .filter((item) => typeof item === 'string')
    .map((item) => normalizeBoundaryNoteLabel(item))
    .filter(Boolean)));
export const buildBoundaryNotes = (options) => normalizeStrings([
    ...(options.report?.gateResult.blockedReasons || []),
    ...(options.selectedOutput?.gateNotes || []),
    ...(options.taskSummary?.stats.warnings || []),
]);
export const buildProvenanceSummary = (options) => {
    const evidencePool = options.taskState?.evidencePool || [];
    const boundaryNotes = buildBoundaryNotes(options);
    const fallbackWarnings = boundaryNotes.filter((item) => fallbackWarningPattern.test(item));
    const acceptedRealEvidence = evidencePool.filter((item) => item.reviewStatus === 'accepted' &&
        item.sourceLevel !== 'simulated' &&
        item.sourceLevel !== 'framework' &&
        item.sourceType !== 'experience_model');
    const acceptedRealT1EvidenceCount = acceptedRealEvidence.filter((item) => item.tier === 'T1').length;
    const pendingExternalEvidenceCount = evidencePool.filter((item) => item.sourceLevel === 'external' &&
        item.reviewStatus !== 'accepted' &&
        item.reviewStatus !== 'rejected').length;
    const fetchedArticleEvidenceCount = evidencePool.filter((item) => item.sourceLevel === 'external' &&
        ['fetched_article', 'fetched_document'].includes(String(item.traceLocation?.authenticity || ''))).length;
    const searchResultEvidenceCount = evidencePool.filter((item) => item.sourceLevel === 'external' &&
        (item.traceLocation?.authenticity === 'search_result')).length;
    const frameworkEvidenceCount = evidencePool.filter((item) => item.sourceLevel === 'framework' || item.sourceType === 'experience_model').length;
    const simulatedEvidenceCount = evidencePool.filter((item) => item.sourceLevel === 'simulated' ||
        item.sourceType === 'persona_generated' ||
        item.sourceType === 'vision_generated').length;
    const visionFindingCount = options.taskState?.visionFindings.length || 0;
    const personaFindingCount = options.taskState?.personaFindings.length || 0;
    const blockedSources = new Set(options.report?.gateResult.blockedSources || []);
    const tags = [];
    if (acceptedRealEvidence.length > 0) {
        tags.push({
            key: 'accepted-real',
            label: `已接受真实证据 ${acceptedRealEvidence.length}`,
            color: 'green',
        });
    }
    if (pendingExternalEvidenceCount > 0) {
        tags.push({
            key: 'pending-external',
            label: `外部待核查 ${pendingExternalEvidenceCount}`,
            color: 'orange',
        });
    }
    if (fetchedArticleEvidenceCount > 0) {
        tags.push({
            key: 'fetched-article',
            label: `已抓内容 ${fetchedArticleEvidenceCount}`,
            color: 'cyan',
        });
    }
    if (searchResultEvidenceCount > 0) {
        tags.push({
            key: 'search-result',
            label: `搜索线索 ${searchResultEvidenceCount}`,
            color: 'blue',
        });
    }
    if (frameworkEvidenceCount > 0) {
        tags.push({
            key: 'framework',
            label: `框架证据 ${frameworkEvidenceCount}`,
            color: 'gold',
        });
    }
    if (simulatedEvidenceCount > 0 || personaFindingCount > 0 || blockedSources.has('persona_generated')) {
        tags.push({
            key: 'simulated',
            label: `模拟线索 ${Math.max(simulatedEvidenceCount, personaFindingCount, 1)}`,
            color: 'purple',
        });
    }
    if (visionFindingCount > 0 || blockedSources.has('vision_generated')) {
        tags.push({
            key: 'vision',
            label: `Vision 辅助 ${Math.max(visionFindingCount, 1)}`,
            color: 'blue',
        });
    }
    if (fallbackWarnings.length > 0) {
        tags.push({
            key: 'fallback',
            label: `fallback 风险 ${fallbackWarnings.length}`,
            color: 'red',
        });
    }
    const riskLevel = fallbackWarnings.length > 0
        ? 'fallback'
        : frameworkEvidenceCount > 0 ||
            simulatedEvidenceCount > 0 ||
            visionFindingCount > 0 ||
            personaFindingCount > 0 ||
            pendingExternalEvidenceCount > 0 ||
            blockedSources.size > 0
            ? 'mixed'
            : 'clear';
    return {
        acceptedRealEvidenceCount: acceptedRealEvidence.length,
        acceptedRealT1EvidenceCount,
        pendingExternalEvidenceCount,
        fetchedArticleEvidenceCount,
        searchResultEvidenceCount,
        frameworkEvidenceCount,
        simulatedEvidenceCount,
        visionFindingCount,
        personaFindingCount,
        fallbackWarnings,
        boundaryNotes,
        tags,
        riskLevel,
    };
};
