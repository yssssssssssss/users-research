import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Checkbox, Col, Form, Input, Row, Select, Space, Typography, message, } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { TASK_DETAIL_OVERVIEW_PATH, TASK_HISTORY_PATH } from '../lib/navigation';
import { useTaskStore } from '../store/taskStore';
const { Title, Paragraph, Text } = Typography;
const compactFileInputs = (items, defaultFileType) => (items || [])
    .filter((item) => item.fileName || item.sourceUrl || item.ossKey)
    .map((item, index) => ({
    fileId: item.fileId || `${defaultFileType}_${Date.now()}_${index}`,
    fileName: item.fileName || `${defaultFileType}-${index + 1}`,
    fileType: item.fileType || defaultFileType,
    sourceUrl: item.sourceUrl,
    ossKey: item.ossKey,
    mimeType: item.mimeType,
}));
export const CreateTaskPage = () => {
    const navigate = useNavigate();
    const setCurrentTaskId = useTaskStore((state) => state.setCurrentTaskId);
    const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const handleCreate = async () => {
        setSubmitting(true);
        try {
            const values = await form.validateFields();
            const enabledModules = {
                evidence: true,
                visionMoE: values.modules?.includes('visionMoE') ?? true,
                personaSandbox: values.modules?.includes('personaSandbox') ?? true,
                externalSearch: values.modules?.includes('externalSearch') ?? true,
                multiModelReview: values.modules?.includes('multiModelReview') ?? true,
            };
            const created = await api.createTask({
                title: values.title,
                query: values.query,
                inputType: values.inputType,
                taskMode: values.taskMode,
                enabledModules,
                attachments: compactFileInputs(values.attachments, 'document'),
                designFiles: compactFileInputs(values.designFiles, 'design'),
            });
            const preview = await api.previewPlan(created.taskId);
            setCurrentTaskId(created.taskId);
            setTaskSummary({
                taskId: created.taskId,
                title: values.title,
                query: values.query,
                inputType: values.inputType,
                taskMode: values.taskMode,
                status: 'queued',
                reviewStatus: 'pending',
                currentNode: 'problem_decomposer',
                enabledModules,
                stats: {
                    costEstimate: undefined,
                    elapsedSeconds: 0,
                    warnings: [`任务已入队，预计 ${preview.predictedPlan.estimatedLatencySeconds} 秒完成首轮分析。`],
                },
            });
            navigate(TASK_DETAIL_OVERVIEW_PATH(created.taskId));
            message.success(`任务已创建，预计 ${preview.predictedPlan.estimatedLatencySeconds} 秒完成首轮分析。`);
            void api.runTask(created.taskId).catch((error) => {
                message.error(error instanceof Error ? error.message : '任务启动失败');
            });
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Title, { level: 2, children: "\u65B0\u5EFA\u4EFB\u52A1" }), _jsx(Paragraph, { children: "\u8FD9\u91CC\u53EA\u505A\u4E00\u4EF6\u4E8B\uFF1A\u521B\u5EFA\u65B0\u4EFB\u52A1\u3002\u82E5\u4F60\u8981\u7EE7\u7EED\u65E7\u4EFB\u52A1\uFF0C\u8BF7\u56DE\u5230\u5386\u53F2\u4EFB\u52A1\u5217\u8868\u3002" }), _jsx(Button, { children: _jsx(Link, { to: TASK_HISTORY_PATH, children: "\u8FD4\u56DE\u5386\u53F2\u4EFB\u52A1" }) })] }), _jsx(Alert, { type: "info", message: "\u5F53\u524D\u4E3A Phase 1 \u9AA8\u67B6\u7248", description: "\u5DF2\u63A5\u901A\u4EFB\u52A1\u72B6\u6001\u3001\u8BC1\u636E\u3001Vision\u3001Persona\u3001\u62A5\u544A\u9875\u9762\u4E0E SQLite \u672C\u5730\u6301\u4E45\u5316\u3002\u5F53\u524D\u9875\u9762\u53EA\u4FDD\u7559\u65B0\u5EFA\u6D41\u7A0B\uFF0C\u5386\u53F2\u4EFB\u52A1\u5DF2\u8FC1\u79FB\u5230\u5DE6\u4FA7\u72EC\u7ACB\u5165\u53E3\u3002" }), _jsx(Card, { className: "page-card", children: _jsxs(Form, { form: form, layout: "vertical", initialValues: {
                        inputType: 'mixed',
                        taskMode: 'deep_research',
                        modules: ['visionMoE', 'personaSandbox', 'externalSearch', 'multiModelReview'],
                        designFiles: [{ fileType: 'design' }],
                    }, children: [_jsxs(Row, { gutter: 16, children: [_jsx(Col, { span: 12, children: _jsx(Form.Item, { label: "\u4EFB\u52A1\u6807\u9898", name: "title", children: _jsx(Input, { placeholder: "\u4F8B\u5982\uFF1A\u7535\u5546\u9996\u9875\u5185\u5BB9\u79CD\u8349\u533A\u65B9\u5411\u8BC4\u4F30" }) }) }), _jsx(Col, { span: 6, children: _jsx(Form.Item, { label: "\u8F93\u5165\u7C7B\u578B", name: "inputType", rules: [{ required: true }], children: _jsx(Select, { options: [
                                                { value: 'text', label: '文本' },
                                                { value: 'design', label: '设计图' },
                                                { value: 'mixed', label: '混合' },
                                            ] }) }) }), _jsx(Col, { span: 6, children: _jsx(Form.Item, { label: "\u5206\u6790\u6A21\u5F0F", name: "taskMode", rules: [{ required: true }], children: _jsx(Select, { options: [
                                                { value: 'quick_judgment', label: '快速判断' },
                                                { value: 'deep_research', label: '深度分析' },
                                                { value: 'design_review', label: '设计评估' },
                                                { value: 'hypothesis_test', label: '假设验证' },
                                            ] }) }) })] }), _jsx(Form.Item, { label: "\u7814\u7A76\u95EE\u9898", name: "query", rules: [{ required: true, message: '请输入研究问题' }], children: _jsx(Input.TextArea, { rows: 5, placeholder: "\u4F8B\u5982\uFF1A\u6211\u4EEC\u8981\u4E0D\u8981\u5728\u7535\u5546\u9996\u9875\u52A0\u5165\u5185\u5BB9\u79CD\u8349\u533A\uFF1F" }) }), _jsx(Form.Item, { label: "\u542F\u7528\u6A21\u5757", name: "modules", children: _jsx(Checkbox.Group, { children: _jsxs(Space, { size: 24, wrap: true, children: [_jsx(Checkbox, { value: "visionMoE", children: "Vision MoE" }), _jsx(Checkbox, { value: "personaSandbox", children: "Persona Sandbox" }), _jsx(Checkbox, { value: "externalSearch", children: "\u5916\u90E8\u68C0\u7D22" }), _jsx(Checkbox, { value: "multiModelReview", children: "\u591A\u6A21\u578B\u590D\u6838" })] }) }) }), _jsxs(Card, { type: "inner", title: "\u8BBE\u8BA1\u56FE / \u622A\u56FE\u5F15\u7528\uFF08\u63A8\u8350\uFF09", style: { marginBottom: 16 }, children: [_jsx(Paragraph, { type: "secondary", children: "\u5148\u652F\u6301\u624B\u5DE5\u5F55\u5165\u56FE\u7247 URL\u3001OSS \u5730\u5740\u6216 data URL\u3002\u82E5\u63D0\u4F9B\u53EF\u8BBF\u95EE\u56FE\u7247\u5F15\u7528\uFF0CVision MoE \u4F1A\u4F18\u5148\u5C1D\u8BD5\u591A\u6A21\u6001\u5206\u6790\u3002" }), _jsx(Form.List, { name: "designFiles", children: (fields, { add, remove }) => (_jsxs(Space, { direction: "vertical", style: { width: '100%' }, size: 12, children: [fields.map((field) => (_jsxs(Card, { size: "small", title: `设计输入 ${field.name + 1}`, extra: _jsx(Button, { type: "text", icon: _jsx(MinusCircleOutlined, {}), onClick: () => remove(field.name) }), children: [_jsxs(Row, { gutter: 12, children: [_jsx(Col, { span: 8, children: _jsx(Form.Item, { label: "\u540D\u79F0", name: [field.name, 'fileName'], children: _jsx(Input, { placeholder: "\u4F8B\u5982\uFF1A\u9996\u9875\u622A\u56FE-\u65B9\u6848A" }) }) }), _jsx(Col, { span: 6, children: _jsx(Form.Item, { label: "\u6587\u4EF6\u7C7B\u578B", name: [field.name, 'fileType'], children: _jsx(Select, { options: [{ value: 'design', label: '设计图' }, { value: 'image', label: '截图' }] }) }) }), _jsx(Col, { span: 10, children: _jsx(Form.Item, { label: "sourceUrl / data URL", name: [field.name, 'sourceUrl'], children: _jsx(Input, { placeholder: "https://... \u6216 data:image/..." }) }) })] }), _jsxs(Row, { gutter: 12, children: [_jsx(Col, { span: 12, children: _jsx(Form.Item, { label: "OSS Key / \u5916\u94FE\u5907\u7528", name: [field.name, 'ossKey'], children: _jsx(Input, { placeholder: "oss://bucket/path \u6216\u53EF\u8BBF\u95EE URL" }) }) }), _jsx(Col, { span: 12, children: _jsx(Form.Item, { label: "Mime Type", name: [field.name, 'mimeType'], children: _jsx(Input, { placeholder: "image/png\uFF08\u53EF\u9009\uFF09" }) }) })] })] }, field.key))), _jsx(Button, { type: "dashed", icon: _jsx(PlusOutlined, {}), onClick: () => add({ fileType: 'design' }), children: "\u6DFB\u52A0\u8BBE\u8BA1\u56FE/\u622A\u56FE\u5F15\u7528" })] })) })] }), _jsx(Card, { type: "inner", title: "\u8865\u5145\u9644\u4EF6\uFF08\u53EF\u9009\uFF09", children: _jsx(Form.List, { name: "attachments", children: (fields, { add, remove }) => (_jsxs(Space, { direction: "vertical", style: { width: '100%' }, size: 12, children: [fields.map((field) => (_jsx(Card, { size: "small", title: `附件 ${field.name + 1}`, extra: _jsx(Button, { type: "text", icon: _jsx(MinusCircleOutlined, {}), onClick: () => remove(field.name) }), children: _jsxs(Row, { gutter: 12, children: [_jsx(Col, { span: 8, children: _jsx(Form.Item, { label: "\u540D\u79F0", name: [field.name, 'fileName'], children: _jsx(Input, { placeholder: "\u4F8B\u5982\uFF1APRD \u6458\u8981" }) }) }), _jsx(Col, { span: 6, children: _jsx(Form.Item, { label: "\u6587\u4EF6\u7C7B\u578B", name: [field.name, 'fileType'], children: _jsx(Select, { options: [
                                                                    { value: 'document', label: '文档' },
                                                                    { value: 'image', label: '图片' },
                                                                    { value: 'spreadsheet', label: '表格' },
                                                                ] }) }) }), _jsx(Col, { span: 10, children: _jsx(Form.Item, { label: "\u5F15\u7528\u5730\u5740", name: [field.name, 'sourceUrl'], children: _jsx(Input, { placeholder: "https://...\uFF08\u53EF\u9009\uFF09" }) }) })] }) }, field.key))), _jsx(Button, { type: "dashed", icon: _jsx(PlusOutlined, {}), onClick: () => add({ fileType: 'document' }), children: "\u6DFB\u52A0\u9644\u4EF6\u5F15\u7528" })] })) }) }), _jsx(Card, { type: "inner", title: "\u672C\u9636\u6BB5\u9ED8\u8BA4\u7B56\u7565", style: { marginTop: 16 }, children: _jsxs(Space, { direction: "vertical", children: [_jsx(Text, { children: "\u2022 \u9ED8\u8BA4\u8D70\u5B8C\u6574\u7814\u7A76\u5DE5\u4F5C\u53F0\u94FE\u8DEF" }), _jsx(Text, { children: "\u2022 \u8F93\u51FA\u7ED3\u679C\u9700\u7ECF\u8FC7 Gate" }), _jsx(Text, { children: "\u2022 Vision / Persona \u7ED3\u679C\u9ED8\u8BA4\u964D\u6743\uFF0C\u4E0D\u76F4\u63A5\u89C6\u4E3A T1 \u4E8B\u5B9E" }), _jsx(Text, { children: "\u2022 \u5F53\u524D\u82E5\u6A21\u578B\u7AEF\u652F\u6301 image_url\uFF0CVision MoE \u4F1A\u4F18\u5148\u5C1D\u8BD5\u771F\u56FE\u8F93\u5165" })] }) }), _jsx("div", { style: { marginTop: 24 }, children: _jsx(Button, { type: "primary", size: "large", loading: submitting, onClick: handleCreate, children: "\u521B\u5EFA\u5E76\u8FD0\u884C\u4EFB\u52A1" }) })] }) })] }));
};
