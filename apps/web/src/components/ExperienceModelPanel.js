import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, Button, Card, Empty, List, Select, Space, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
const { Paragraph, Text } = Typography;
const asRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;
const asStringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
export const ExperienceModelPanel = ({ taskId, evidencePool, currentNode, onTaskUpdated, }) => {
    const models = evidencePool?.filter((item) => item.sourceType === 'experience_model') || [];
    const [catalog, setCatalog] = useState([]);
    const [selectedModelIds, setSelectedModelIds] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const isAnalyzing = currentNode === 'experience_model_router' || currentNode === 'problem_decomposer';
    useEffect(() => {
        api.getExperienceModelCatalog()
            .then(setCatalog)
            .catch((error) => {
            message.error(error instanceof Error ? error.message : '体验模型目录加载失败');
        });
    }, []);
    const recommendedModelIds = useMemo(() => models
        .map((item) => asRecord(item.traceLocation)?.modelId)
        .filter((item) => typeof item === 'string'), [models]);
    useEffect(() => {
        setSelectedModelIds(recommendedModelIds);
    }, [recommendedModelIds.join('|')]);
    const applyOverride = async (mode) => {
        if (!taskId)
            return;
        if (mode === 'manual' && !selectedModelIds.length) {
            message.warning('请先选择至少一个体验模型');
            return;
        }
        setSubmitting(true);
        try {
            const result = await api.overrideExperienceModels(taskId, {
                mode,
                modelIds: mode === 'manual' ? selectedModelIds : undefined,
            });
            onTaskUpdated?.(result.task, result.state);
            setSelectedModelIds(result.selectedModelIds);
            message.success(mode === 'manual' ? '已应用手动体验模型覆盖' : '已恢复为自动推荐模型');
        }
        catch (error) {
            message.error(error instanceof Error ? error.message : '体验模型覆盖失败');
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsx(Card, { title: "\u63A8\u8350\u4F53\u9A8C\u6A21\u578B", className: "page-card", children: _jsxs(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: [_jsx(Alert, { type: "info", showIcon: true, message: "\u7CFB\u7EDF\u4F1A\u5148\u8BFB\u4F53\u9A8C\u6A21\u578B\u603B\u7D22\u5F15\uFF0C\u518D\u5B9A\u5411\u7814\u8BFB\u5177\u4F53\u6A21\u578B PDF", description: "\u8FD9\u4E9B\u7ED3\u679C\u7528\u4E8E\u8865\u5145\u5206\u6790\u6846\u67B6\u4E0E\u8BC4\u4F30\u7EF4\u5EA6\uFF0C\u4E0D\u76F4\u63A5\u7B49\u540C\u4E8E\u771F\u5B9E\u7528\u6237\u4E8B\u5B9E\u8BC1\u636E\u3002" }), _jsx(Card, { type: "inner", title: "\u6A21\u578B\u9009\u62E9\u63A7\u5236\u53F0", children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsx(Text, { type: "secondary", children: "\u9ED8\u8BA4\u7531\u7CFB\u7EDF\u81EA\u52A8\u63A8\u8350\uFF0C\u4F60\u4E5F\u53EF\u4EE5\u624B\u52A8\u6307\u5B9A\u6A21\u578B\u8986\u76D6\u5F53\u524D\u63A8\u8350\u7ED3\u679C\u3002" }), _jsx(Select, { mode: "multiple", allowClear: true, style: { width: '100%' }, placeholder: "\u9009\u62E9\u8981\u7528\u4E8E\u8BE5\u4EFB\u52A1\u7684\u4F53\u9A8C\u6A21\u578B", options: catalog.map((item) => ({
                                    label: `${item.name}｜${item.dimensions.join(' / ')}`,
                                    value: item.id,
                                })), value: selectedModelIds, onChange: (value) => setSelectedModelIds(value) }), _jsxs(Space, { wrap: true, children: [_jsx(Button, { type: "primary", loading: submitting, disabled: !taskId, onClick: () => void applyOverride('manual'), children: "\u5E94\u7528\u624B\u52A8\u9009\u62E9" }), _jsx(Button, { loading: submitting, disabled: !taskId, onClick: () => void applyOverride('auto'), children: "\u6062\u590D\u81EA\u52A8\u63A8\u8350" })] })] }) }), models.length ? (_jsx(List, { itemLayout: "vertical", dataSource: models, renderItem: (item) => {
                        const trace = asRecord(item.traceLocation);
                        const reasons = asStringArray(trace?.selectionReasons);
                        const dimensions = asStringArray(trace?.dimensions);
                        const questions = asStringArray(trace?.evaluationQuestions);
                        const metrics = asStringArray(trace?.metricPrompts);
                        const selectionMode = trace?.selectionMode === 'manual' ? '手动覆盖' : '自动推荐';
                        return (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", size: 8, style: { width: '100%' }, children: [_jsxs(Space, { wrap: true, children: [_jsx(Text, { strong: true, children: item.sourceName || '体验模型' }), _jsx(Tag, { color: "blue", children: item.sourceLevel }), _jsx(Tag, { color: "gold", children: item.tier }), _jsx(Tag, { color: selectionMode === '手动覆盖' ? 'purple' : 'green', children: selectionMode })] }), _jsx(Paragraph, { style: { marginBottom: 0 }, children: item.content }), dimensions.length ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u5173\u6CE8\u7EF4\u5EA6\uFF1A" }), _jsx(Space, { wrap: true, style: { marginTop: 6 }, children: dimensions.map((dimension) => (_jsx(Tag, { children: dimension }, dimension))) })] })) : null, reasons.length ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u63A8\u8350\u539F\u56E0\uFF1A" }), _jsx(List, { size: "small", dataSource: reasons, renderItem: (reason) => _jsx(List.Item, { children: reason }) })] })) : null, questions.length ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u5EFA\u8BAE\u8FFD\u95EE\uFF1A" }), _jsx(List, { size: "small", dataSource: questions, renderItem: (question) => _jsx(List.Item, { children: question }) })] })) : null, metrics.length ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u5EFA\u8BAE\u6307\u6807\uFF1A" }), _jsx(Space, { wrap: true, style: { marginTop: 6 }, children: metrics.map((metric) => (_jsx(Tag, { color: "purple", children: metric }, metric))) })] })) : null, item.citationText ? (_jsx(Paragraph, { type: "secondary", style: { whiteSpace: 'pre-wrap', marginBottom: 0 }, children: item.citationText })) : null] }) }, item.id));
                    } })) : isAnalyzing ? (_jsx(Alert, { type: "warning", showIcon: true, message: "\u4F53\u9A8C\u6A21\u578B\u5206\u6790\u8FDB\u884C\u4E2D", description: "\u7CFB\u7EDF\u6B63\u5728\u8BFB\u53D6\u603B\u7D22\u5F15\u5E76\u6311\u9009\u5408\u9002\u7684\u6A21\u578B PDF\uFF0C\u8BF7\u7A0D\u540E\u5237\u65B0\u6216\u7B49\u5F85\u4EFB\u52A1\u6D41\u63A8\u8FDB\u3002" })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u8BE5\u4EFB\u52A1\u5C1A\u672A\u4EA7\u51FA\u4F53\u9A8C\u6A21\u578B\u63A8\u8350" }))] }) }));
};
