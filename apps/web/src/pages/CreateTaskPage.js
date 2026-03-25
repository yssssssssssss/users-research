import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { MinusCircleOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Checkbox, Col, Form, Input, Row, Select, Space, Typography, message, } from 'antd';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { TASK_DETAIL_OVERVIEW_PATH, TASK_HISTORY_PATH } from '../lib/navigation';
import { useTaskStore } from '../store/taskStore';
const { Title, Paragraph, Text, Link: TextLink } = Typography;
const compactFileInputs = (items, defaultFileType) => (items || [])
    .filter((item) => item.fileName || item.sourceUrl || item.ossKey || item.dataUrl)
    .map((item, index) => ({
    fileId: String(item.fileId || `${defaultFileType}_${Date.now()}_${index}`),
    fileName: item.fileName ? String(item.fileName) : `${defaultFileType}-${index + 1}`,
    fileType: item.fileType || defaultFileType,
    sourceUrl: item.sourceUrl ? String(item.sourceUrl) : undefined,
    ossKey: item.ossKey ? String(item.ossKey) : undefined,
    mimeType: item.mimeType ? String(item.mimeType) : undefined,
    dataUrl: item.dataUrl ? String(item.dataUrl) : undefined,
    localPath: item.localPath ? String(item.localPath) : undefined,
    sizeBytes: typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes)
        ? item.sizeBytes
        : undefined,
    sha256: item.sha256 ? String(item.sha256) : undefined,
}));
const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        if (typeof reader.result === 'string' && reader.result.trim()) {
            resolve(reader.result);
            return;
        }
        reject(new Error(`文件 ${file.name} 读取失败`));
    };
    reader.onerror = () => reject(reader.error || new Error(`文件 ${file.name} 读取失败`));
    reader.readAsDataURL(file);
});
const inferAttachmentType = (file) => {
    const mimeType = (file.type || '').toLowerCase();
    const name = file.name.toLowerCase();
    if (mimeType.startsWith('image/'))
        return 'image';
    if (mimeType.includes('sheet') || name.endsWith('.csv') || name.endsWith('.xlsx'))
        return 'spreadsheet';
    return 'document';
};
const hiddenFieldNames = ['fileId', 'sourceUrl', 'ossKey', 'mimeType', 'dataUrl', 'localPath', 'sizeBytes', 'sha256'];
export const CreateTaskPage = () => {
    const navigate = useNavigate();
    const setCurrentTaskId = useTaskStore((state) => state.setCurrentTaskId);
    const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [uploadingTarget, setUploadingTarget] = useState();
    const [showAdvancedReferences, setShowAdvancedReferences] = useState(false);
    const designUploadRef = useRef(null);
    const attachmentUploadRef = useRef(null);
    const appendUploadedFiles = async (target, files) => {
        if (!files?.length)
            return;
        setUploadingTarget(target);
        try {
            const uploaded = await Promise.all(Array.from(files).map(async (file) => {
                const fileType = target === 'designFiles'
                    ? (file.type.startsWith('image/') ? 'image' : 'design')
                    : inferAttachmentType(file);
                const dataUrl = await readFileAsDataUrl(file);
                const response = await api.uploadAsset({
                    fileName: file.name,
                    fileType,
                    mimeType: file.type || undefined,
                    dataUrl,
                });
                return response.file;
            }));
            const current = form.getFieldValue(target) || [];
            form.setFieldsValue({
                [target]: [...current, ...uploaded],
            });
            message.success(`已上传 ${uploaded.length} 个文件`);
        }
        catch (error) {
            message.error(error instanceof Error ? error.message : '上传失败');
        }
        finally {
            setUploadingTarget(undefined);
        }
    };
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
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Title, { level: 2, children: "\u65B0\u5EFA\u4EFB\u52A1" }), _jsx(Paragraph, { children: "\u8FD9\u91CC\u53EA\u505A\u4E00\u4EF6\u4E8B\uFF1A\u521B\u5EFA\u65B0\u4EFB\u52A1\u3002\u82E5\u4F60\u8981\u7EE7\u7EED\u65E7\u4EFB\u52A1\uFF0C\u8BF7\u56DE\u5230\u5386\u53F2\u4EFB\u52A1\u5217\u8868\u3002" }), _jsx(Button, { children: _jsx(Link, { to: TASK_HISTORY_PATH, children: "\u8FD4\u56DE\u5386\u53F2\u4EFB\u52A1" }) })] }), _jsx(Alert, { type: "info", message: "\u5F53\u524D\u5DF2\u8865\u9F50\u6700\u5C0F\u771F\u5B9E\u6587\u4EF6\u94FE\u8DEF", description: "\u652F\u6301\u672C\u5730\u6587\u4EF6\u9009\u62E9\u5E76\u4E0A\u4F20\u5230 server \u843D\u76D8\u3002\u56FE\u7247/\u8BBE\u8BA1\u56FE\u4F1A\u540C\u65F6\u4FDD\u7559\u5206\u6790\u5FEB\u7167\uFF0C\u4FBF\u4E8E Vision \u771F\u5B9E\u6D88\u8D39\u4E0E\u4EFB\u52A1\u56DE\u653E\u3002" }), _jsx(Card, { className: "page-card", children: _jsxs(Form, { form: form, layout: "vertical", initialValues: {
                        inputType: 'mixed',
                        taskMode: 'deep_research',
                        modules: ['visionMoE', 'personaSandbox', 'externalSearch', 'multiModelReview'],
                        designFiles: [],
                        attachments: [],
                    }, children: [_jsxs(Row, { gutter: 16, children: [_jsx(Col, { span: 12, children: _jsx(Form.Item, { label: "\u4EFB\u52A1\u6807\u9898", name: "title", children: _jsx(Input, { placeholder: "\u4F8B\u5982\uFF1A\u7535\u5546\u9996\u9875\u5185\u5BB9\u79CD\u8349\u533A\u65B9\u5411\u8BC4\u4F30" }) }) }), _jsx(Col, { span: 6, children: _jsx(Form.Item, { label: "\u8F93\u5165\u7C7B\u578B", name: "inputType", rules: [{ required: true }], children: _jsx(Select, { options: [
                                                { value: 'text', label: '文本' },
                                                { value: 'design', label: '设计图' },
                                                { value: 'mixed', label: '混合' },
                                            ] }) }) }), _jsx(Col, { span: 6, children: _jsx(Form.Item, { label: "\u5206\u6790\u6A21\u5F0F", name: "taskMode", rules: [{ required: true }], children: _jsx(Select, { options: [
                                                { value: 'quick_judgment', label: '快速判断' },
                                                { value: 'deep_research', label: '深度分析' },
                                                { value: 'design_review', label: '设计评估' },
                                                { value: 'hypothesis_test', label: '假设验证' },
                                            ] }) }) })] }), _jsx(Form.Item, { label: "\u7814\u7A76\u95EE\u9898", name: "query", rules: [{ required: true, message: '请输入研究问题' }], children: _jsx(Input.TextArea, { rows: 5, placeholder: "\u4F8B\u5982\uFF1A\u6211\u4EEC\u8981\u4E0D\u8981\u5728\u7535\u5546\u9996\u9875\u52A0\u5165\u5185\u5BB9\u79CD\u8349\u533A\uFF1F" }) }), _jsx(Form.Item, { label: "\u542F\u7528\u6A21\u5757", name: "modules", children: _jsx(Checkbox.Group, { children: _jsxs(Space, { size: 24, wrap: true, children: [_jsx(Checkbox, { value: "visionMoE", children: "Vision MoE" }), _jsx(Checkbox, { value: "personaSandbox", children: "Persona Sandbox" }), _jsx(Checkbox, { value: "externalSearch", children: "\u5916\u90E8\u68C0\u7D22" }), _jsx(Checkbox, { value: "multiModelReview", children: "\u591A\u6A21\u578B\u590D\u6838" })] }) }) }), _jsx(Card, { type: "inner", title: "\u8BBE\u8BA1\u56FE / \u622A\u56FE\u8F93\u5165", style: { marginBottom: 16 }, children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: "\u9ED8\u8BA4\u53EA\u9700\u8981\u4E0A\u4F20\u672C\u5730\u8BBE\u8BA1\u56FE/\u622A\u56FE\u3002\u624B\u5DE5\u5F55\u5165 URL / data URL \u4EC5\u7528\u4E8E\u9AD8\u7EA7\u8C03\u8BD5\u6216\u5F15\u7528\u5DF2\u6709\u5916\u94FE\u8D44\u6E90\u3002" }), _jsx(Alert, { type: "info", showIcon: true, message: "\u4E0A\u4F20\u5EFA\u8BAE", description: "\u5F53\u524D\u4E0A\u4F20\u94FE\u8DEF\u4ECD\u4F7F\u7528 data URL\uFF0C\u56FE\u7247\u8D8A\u5927\uFF0C\u8BF7\u6C42\u4F53\u8D8A\u5927\u3002\u5EFA\u8BAE\u5355\u5F20\u56FE\u7247\u63A7\u5236\u5728 15MB \u4EE5\u5185\u3002" }), _jsxs(Space, { wrap: true, children: [_jsx(Button, { icon: _jsx(UploadOutlined, {}), loading: uploadingTarget === 'designFiles', onClick: () => designUploadRef.current?.click(), children: "\u4E0A\u4F20\u672C\u5730\u8BBE\u8BA1\u56FE/\u622A\u56FE" }), _jsx("input", { ref: designUploadRef, hidden: true, type: "file", accept: "image/*", multiple: true, onChange: (event) => {
                                                    void appendUploadedFiles('designFiles', event.target.files);
                                                    event.currentTarget.value = '';
                                                } }), _jsx(Button, { type: "dashed", onClick: () => setShowAdvancedReferences((value) => !value), children: showAdvancedReferences ? '隐藏高级引用模式' : '显示高级引用模式' })] }), _jsx(Form.List, { name: "designFiles", children: (fields, { add, remove }) => (_jsxs(Space, { direction: "vertical", style: { width: '100%' }, size: 12, children: [fields.map((field) => (_jsxs(Card, { size: "small", title: `设计输入 ${field.name + 1}`, extra: _jsx(Button, { type: "text", icon: _jsx(MinusCircleOutlined, {}), onClick: () => remove(field.name) }), children: [hiddenFieldNames.map((name) => (_jsx(Form.Item, { hidden: true, name: [field.name, name], children: _jsx(Input, {}) }, name))), _jsxs(Row, { gutter: 12, children: [_jsx(Col, { span: 8, children: _jsx(Form.Item, { label: "\u540D\u79F0", name: [field.name, 'fileName'], children: _jsx(Input, { placeholder: "\u4F8B\u5982\uFF1A\u9996\u9875\u622A\u56FE-\u65B9\u6848A" }) }) }), _jsx(Col, { span: 6, children: _jsx(Form.Item, { label: "\u6587\u4EF6\u7C7B\u578B", name: [field.name, 'fileType'], children: _jsx(Select, { options: [
                                                                                { value: 'design', label: '设计图' },
                                                                                { value: 'image', label: '截图' },
                                                                            ] }) }) }), _jsx(Col, { span: 10, children: _jsx(Form.Item, { label: "sourceUrl / data URL", name: [field.name, 'sourceUrl'], children: _jsx(Input, { placeholder: "https://... \u6216 data:image/..." }) }) })] }), _jsxs(Row, { gutter: 12, children: [_jsx(Col, { span: 12, children: _jsx(Form.Item, { label: "OSS Key / \u5916\u94FE\u5907\u7528", name: [field.name, 'ossKey'], children: _jsx(Input, { placeholder: "oss://bucket/path \u6216\u53EF\u8BBF\u95EE URL" }) }) }), _jsx(Col, { span: 12, children: _jsx(Form.Item, { label: "Mime Type", name: [field.name, 'mimeType'], children: _jsx(Input, { placeholder: "image/png\uFF08\u53EF\u9009\uFF09" }) }) })] }), _jsx(Form.Item, { noStyle: true, shouldUpdate: true, children: () => {
                                                                const item = (form.getFieldValue('designFiles') || [])[field.name];
                                                                if (!item?.sourceUrl)
                                                                    return null;
                                                                return (_jsxs(Text, { type: "secondary", children: ["\u5DF2\u4E0A\u4F20\u5F15\u7528\uFF1A", _jsx(TextLink, { href: String(item.sourceUrl), target: "_blank", children: String(item.sourceUrl) })] }));
                                                            } })] }, field.key))), showAdvancedReferences ? (_jsx(Button, { type: "dashed", icon: _jsx(PlusOutlined, {}), onClick: () => add({ fileType: 'design' }), children: "\u624B\u5DE5\u6DFB\u52A0\u8BBE\u8BA1\u56FE/\u622A\u56FE\u5F15\u7528" })) : null] })) })] }) }), _jsx(Card, { type: "inner", title: "\u8865\u5145\u9644\u4EF6\uFF08\u53EF\u9009\uFF09", children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: "\u652F\u6301\u4E0A\u4F20\u6587\u6863\u3001\u56FE\u7247\u3001\u8868\u683C\u3002\u5F53\u524D\u6587\u6863\u5DF2\u80FD\u771F\u5B9E\u843D\u76D8\u5E76\u4FDD\u5B58\u5728\u4EFB\u52A1\u5143\u6570\u636E\u4E2D\uFF0C\u4F46\u5C1A\u672A\u5B8C\u6574\u63A5\u5165 OCR / \u6587\u6863\u8BC1\u636E\u62BD\u53D6\u3002" }), _jsxs(Space, { wrap: true, children: [_jsx(Button, { icon: _jsx(UploadOutlined, {}), loading: uploadingTarget === 'attachments', onClick: () => attachmentUploadRef.current?.click(), children: "\u4E0A\u4F20\u672C\u5730\u9644\u4EF6" }), _jsx("input", { ref: attachmentUploadRef, hidden: true, type: "file", multiple: true, onChange: (event) => {
                                                    void appendUploadedFiles('attachments', event.target.files);
                                                    event.currentTarget.value = '';
                                                } })] }), _jsx(Form.List, { name: "attachments", children: (fields, { add, remove }) => (_jsxs(Space, { direction: "vertical", style: { width: '100%' }, size: 12, children: [fields.map((field) => (_jsxs(Card, { size: "small", title: `附件 ${field.name + 1}`, extra: _jsx(Button, { type: "text", icon: _jsx(MinusCircleOutlined, {}), onClick: () => remove(field.name) }), children: [hiddenFieldNames.map((name) => (_jsx(Form.Item, { hidden: true, name: [field.name, name], children: _jsx(Input, {}) }, name))), _jsxs(Row, { gutter: 12, children: [_jsx(Col, { span: 8, children: _jsx(Form.Item, { label: "\u540D\u79F0", name: [field.name, 'fileName'], children: _jsx(Input, { placeholder: "\u4F8B\u5982\uFF1APRD \u6458\u8981" }) }) }), _jsx(Col, { span: 6, children: _jsx(Form.Item, { label: "\u6587\u4EF6\u7C7B\u578B", name: [field.name, 'fileType'], children: _jsx(Select, { options: [
                                                                                { value: 'document', label: '文档' },
                                                                                { value: 'image', label: '图片' },
                                                                                { value: 'spreadsheet', label: '表格' },
                                                                            ] }) }) }), _jsx(Col, { span: 10, children: _jsx(Form.Item, { label: "\u5F15\u7528\u5730\u5740", name: [field.name, 'sourceUrl'], children: _jsx(Input, { placeholder: "https://...\uFF08\u53EF\u9009\uFF09" }) }) })] })] }, field.key))), _jsx(Button, { type: "dashed", icon: _jsx(PlusOutlined, {}), onClick: () => add({ fileType: 'document' }), children: "\u624B\u5DE5\u6DFB\u52A0\u9644\u4EF6\u5F15\u7528" })] })) })] }) }), _jsx(Card, { type: "inner", title: "\u672C\u9636\u6BB5\u9ED8\u8BA4\u7B56\u7565", style: { marginTop: 16 }, children: _jsxs(Space, { direction: "vertical", children: [_jsx(Text, { children: "\u2022 \u9ED8\u8BA4\u8D70\u5B8C\u6574\u7814\u7A76\u5DE5\u4F5C\u53F0\u94FE\u8DEF" }), _jsx(Text, { children: "\u2022 \u8F93\u51FA\u7ED3\u679C\u9700\u7ECF\u8FC7 Gate" }), _jsx(Text, { children: "\u2022 Vision / Persona \u7ED3\u679C\u9ED8\u8BA4\u964D\u6743\uFF0C\u4E0D\u76F4\u63A5\u89C6\u4E3A T1 \u4E8B\u5B9E" }), _jsx(Text, { children: "\u2022 \u8BBE\u8BA1\u56FE\u4E0A\u4F20\u540E\u4F1A\u540C\u65F6\u4FDD\u7559\u672C\u5730\u843D\u76D8\u8DEF\u5F84\u4E0E\u5206\u6790\u5FEB\u7167" })] }) }), _jsx("div", { style: { marginTop: 24 }, children: _jsx(Button, { type: "primary", size: "large", loading: submitting, onClick: handleCreate, children: "\u521B\u5EFA\u5E76\u8FD0\u884C\u4EFB\u52A1" }) })] }) })] }));
};
