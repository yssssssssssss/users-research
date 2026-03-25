import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Button, Card, Collapse, Empty, Select, Space, Tag, Typography } from 'antd';
import { getEvidenceAuthenticityKind, getEvidenceAuthenticityTag, getEvidenceSourceDomain, } from '../../lib/evidenceMeta';
const { Link, Paragraph, Text } = Typography;
const asRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;
const sourceTypeLabelMap = {
    internal_metric: '内部指标',
    internal_report: '内部报告',
    interview: '访谈',
    survey: '问卷',
    prd: 'PRD',
    web_article: '网页文章',
    industry_report: '行业报告',
    historical_case: '历史案例',
    experience_model: '体验模型',
    vision_generated: 'Vision',
    persona_generated: 'Persona',
};
const sourceLevelLabelMap = {
    internal: '内部',
    external: '外部',
    simulated: '模拟',
    framework: '框架',
};
const reviewSortWeight = {
    unreviewed: 0,
    accepted: 1,
    downgraded: 2,
    rejected: 3,
};
const authenticitySortWeight = {
    reviewed_external: 0,
    fetched_article: 1,
    fetched_document: 1,
    search_result: 2,
    internal: 3,
    framework: 4,
    simulated: 5,
    unknown: 6,
};
const buildPreview = (value, maxLength = 220) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized)
        return '暂无内容';
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
};
const sortEvidenceItems = (items) => items.slice().sort((left, right) => {
    const reviewDiff = reviewSortWeight[left.reviewStatus] - reviewSortWeight[right.reviewStatus];
    if (reviewDiff !== 0)
        return reviewDiff;
    const leftAuthenticity = authenticitySortWeight[getEvidenceAuthenticityKind(left)];
    const rightAuthenticity = authenticitySortWeight[getEvidenceAuthenticityKind(right)];
    if (leftAuthenticity !== rightAuthenticity)
        return leftAuthenticity - rightAuthenticity;
    if (left.isUsedInReport !== right.isUsedInReport) {
        return left.isUsedInReport ? -1 : 1;
    }
    return (right.sourceDate || '').localeCompare(left.sourceDate || '');
});
export const EvidenceReviewTable = ({ items, tierColorMap, reviewColorMap, reviewLabelMap, tierDrafts, tierOptions, actionLocked, submittingId, isRecomputing, onTierChange, onReview, }) => {
    if (!items.length) {
        return _jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u6CA1\u6709\u53EF\u590D\u6838\u7684\u8BC1\u636E" });
    }
    const sortedItems = sortEvidenceItems(items);
    const groupedSections = [
        {
            key: 'unreviewed',
            title: '待复核',
            description: '优先处理未复核条目，避免关键证据长期停留在待确认状态。',
            items: sortedItems.filter((item) => item.reviewStatus === 'unreviewed'),
        },
        {
            key: 'accepted',
            title: '已接受',
            description: '这些条目已经纳入当前证据判断，可继续微调 Tier 或复核理由。',
            items: sortedItems.filter((item) => item.reviewStatus === 'accepted'),
        },
        {
            key: 'downgraded',
            title: '已降权',
            description: '这类条目保留参考价值，但不应被当作强证据直接引用。',
            items: sortedItems.filter((item) => item.reviewStatus === 'downgraded'),
        },
        {
            key: 'rejected',
            title: '已拒绝',
            description: '已明确排除的条目，保留在这里供追溯与回看。',
            items: sortedItems.filter((item) => item.reviewStatus === 'rejected'),
        },
    ].filter((section) => section.items.length > 0);
    return (_jsx(Space, { direction: "vertical", size: 20, style: { width: '100%' }, children: groupedSections.map((section) => (_jsx("div", { className: "evidence-review-section", children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsxs("div", { className: "evidence-review-section-header", children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx(Text, { strong: true, style: { fontSize: 15, display: 'block' }, children: section.title }), _jsx(Text, { type: "secondary", className: "content-wrap-safe", children: section.description })] }), _jsxs(Tag, { color: "blue", style: { margin: 0 }, children: [section.items.length, " \u6761"] })] }), _jsx(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: section.items.map((item) => {
                            const authenticityTag = getEvidenceAuthenticityTag(item);
                            const reviewMeta = asRecord(asRecord(item.traceLocation)?.reviewMeta);
                            const reviewer = typeof reviewMeta?.reviewer === 'string' ? reviewMeta.reviewer : undefined;
                            const comment = typeof reviewMeta?.comment === 'string' ? reviewMeta.comment : undefined;
                            const nextTier = tierDrafts[item.id] || item.tier;
                            const tierChanged = nextTier !== item.tier;
                            const domain = getEvidenceSourceDomain(item);
                            const detailItems = [
                                {
                                    key: 'full-content',
                                    label: '展开完整证据内容',
                                    children: (_jsx(Paragraph, { className: "content-wrap-safe content-wrap-safe-pre", style: { marginBottom: 0 }, children: item.content })),
                                },
                            ];
                            if (item.citationText) {
                                detailItems.push({
                                    key: 'citation',
                                    label: '查看引用文本',
                                    children: (_jsx(Paragraph, { className: "content-wrap-safe content-wrap-safe-pre", style: { marginBottom: 0 }, children: item.citationText })),
                                });
                            }
                            if (reviewer || comment) {
                                detailItems.push({
                                    key: 'review-meta',
                                    label: '查看复核记录',
                                    children: (_jsxs(Space, { direction: "vertical", size: 4, style: { width: '100%' }, children: [reviewer ? (_jsxs(Text, { className: "content-wrap-safe", children: ["\u5BA1\u6838\u4EBA\uFF1A", reviewer] })) : null, comment ? (_jsxs(Text, { className: "content-wrap-safe content-wrap-safe-pre", children: ["\u7406\u7531\uFF1A", comment] })) : null] })),
                                });
                            }
                            return (_jsx(Card, { size: "small", className: "evidence-review-card", children: _jsxs(Space, { direction: "vertical", size: 16, className: "content-block-safe", children: [_jsxs("div", { className: "evidence-review-card-head", children: [_jsxs("div", { style: { minWidth: 0, flex: 1 }, children: [_jsx(Text, { strong: true, className: "content-wrap-safe", style: { fontSize: 15 }, children: item.sourceName || '未命名来源' }), _jsxs(Text, { type: "secondary", className: "content-wrap-safe", style: { display: 'block', marginTop: 4 }, children: [sourceTypeLabelMap[item.sourceType] || item.sourceType, ' · ', sourceLevelLabelMap[item.sourceLevel] || item.sourceLevel, item.sourceDate ? ` · ${item.sourceDate}` : ''] })] }), _jsxs(Space, { wrap: true, className: "evidence-review-card-tags", children: [_jsx(Tag, { color: authenticityTag.color, children: authenticityTag.label }), _jsx(Tag, { color: tierColorMap[item.tier] || 'default', children: item.tier }), _jsx(Tag, { color: reviewColorMap[item.reviewStatus] || 'default', children: reviewLabelMap[item.reviewStatus] }), tierChanged ? (_jsxs(Tag, { color: "magenta", children: ["\u5F85\u8C03\u6574\u81F3 ", nextTier] })) : null, item.isUsedInReport ? _jsx(Tag, { color: "cyan", children: "\u5DF2\u5165\u62A5\u544A" }) : null] })] }), _jsxs("div", { className: "evidence-review-card-layout", children: [_jsxs("div", { className: "content-block-safe", children: [_jsx(Text, { strong: true, style: { display: 'block', marginBottom: 6 }, children: "\u8BC1\u636E\u6458\u8981" }), _jsx(Paragraph, { className: "content-wrap-safe content-wrap-safe-pre", style: { marginBottom: 0 }, children: buildPreview(item.content) }), (item.citationText || detailItems.length > 1) ? (_jsx(Collapse, { size: "small", ghost: true, style: { marginTop: 12 }, items: detailItems })) : null] }), _jsx("div", { className: "evidence-review-card-side", children: _jsxs(Space, { direction: "vertical", size: 10, style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Text, { strong: true, style: { display: 'block', marginBottom: 6 }, children: "\u6765\u6E90\u4FE1\u606F" }), _jsxs(Space, { direction: "vertical", size: 4, style: { width: '100%' }, children: [_jsxs(Text, { className: "content-wrap-safe", children: ["\u57DF\u540D\uFF1A", domain || '未知域名'] }), _jsxs(Text, { className: "content-wrap-safe", children: ["\u94FE\u63A5\uFF1A", item.sourceUrl ? (_jsxs(_Fragment, { children: [' ', _jsx(Link, { href: item.sourceUrl, target: "_blank", children: "\u6253\u5F00\u6765\u6E90" })] })) : (' 暂无')] }), item.citationText ? (_jsx(Text, { type: "secondary", className: "content-wrap-safe", children: "\u5DF2\u9644\u5F15\u7528\u6587\u672C" })) : (_jsx(Text, { type: "secondary", children: "\u6682\u65E0\u5F15\u7528\u6587\u672C" }))] })] }), _jsxs("div", { children: [_jsx(Text, { strong: true, style: { display: 'block', marginBottom: 6 }, children: "\u590D\u6838\u64CD\u4F5C" }), _jsxs(Space, { direction: "vertical", size: 8, style: { width: '100%' }, children: [_jsx(Select, { size: "small", style: { width: 120 }, options: tierOptions, value: nextTier, disabled: actionLocked, onChange: (value) => onTierChange(item.id, value) }), _jsxs(Space, { wrap: true, size: 6, children: [_jsx(Button, { size: "small", type: "primary", loading: submittingId === item.id, disabled: actionLocked, onClick: () => onReview(item, 'accepted'), children: "\u63A5\u53D7" }), _jsx(Button, { size: "small", loading: submittingId === item.id, disabled: actionLocked, onClick: () => onReview(item, 'downgraded'), children: "\u964D\u6743" }), _jsx(Button, { size: "small", danger: true, loading: submittingId === item.id, disabled: actionLocked, onClick: () => onReview(item, 'rejected'), children: "\u62D2\u7EDD" })] }), isRecomputing ? (_jsx(Text, { type: "secondary", children: "\u91CD\u7B97\u8FDB\u884C\u4E2D\uFF0C\u64CD\u4F5C\u5DF2\u9501\u5B9A" })) : null] })] })] }) })] })] }) }, item.id));
                        }) })] }) }, section.key))) }));
};
