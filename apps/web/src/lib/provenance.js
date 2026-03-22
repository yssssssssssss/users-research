const fallbackWarningPattern = /mock|fallback|回退|弱视觉推断/i;
const normalizeStrings = (items) => Array.from(new Set(items
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
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
