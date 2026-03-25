import { MinusCircleOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Typography,
  message,
} from 'antd';
import type { CreateTaskFileInput } from '@users-research/shared';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { TASK_DETAIL_OVERVIEW_PATH, TASK_HISTORY_PATH } from '../lib/navigation';
import { useTaskStore } from '../store/taskStore';

const { Title, Paragraph, Text, Link: TextLink } = Typography;
type FileType = NonNullable<CreateTaskFileInput['fileType']>;

const compactFileInputs = (
  items: Array<Record<string, string | number | undefined>> | undefined,
  defaultFileType: CreateTaskFileInput['fileType'],
): CreateTaskFileInput[] =>
  (items || [])
    .filter((item) => item.fileName || item.sourceUrl || item.ossKey || item.dataUrl)
    .map((item, index) => ({
      fileId: String(item.fileId || `${defaultFileType}_${Date.now()}_${index}`),
      fileName: item.fileName ? String(item.fileName) : `${defaultFileType}-${index + 1}`,
      fileType: (item.fileType as CreateTaskFileInput['fileType']) || defaultFileType,
      sourceUrl: item.sourceUrl ? String(item.sourceUrl) : undefined,
      ossKey: item.ossKey ? String(item.ossKey) : undefined,
      mimeType: item.mimeType ? String(item.mimeType) : undefined,
      dataUrl: item.dataUrl ? String(item.dataUrl) : undefined,
      localPath: item.localPath ? String(item.localPath) : undefined,
      sizeBytes:
        typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes)
          ? item.sizeBytes
          : undefined,
      sha256: item.sha256 ? String(item.sha256) : undefined,
    }));

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
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

const inferAttachmentType = (file: File): FileType => {
  const mimeType = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.includes('sheet') || name.endsWith('.csv') || name.endsWith('.xlsx')) return 'spreadsheet';
  return 'document';
};

const hiddenFieldNames = ['fileId', 'sourceUrl', 'ossKey', 'mimeType', 'dataUrl', 'localPath', 'sizeBytes', 'sha256'];

export const CreateTaskPage = () => {
  const navigate = useNavigate();
  const setCurrentTaskId = useTaskStore((state) => state.setCurrentTaskId);
  const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<'designFiles' | 'attachments'>();
  const [showAdvancedReferences, setShowAdvancedReferences] = useState(false);
  const designUploadRef = useRef<HTMLInputElement>(null);
  const attachmentUploadRef = useRef<HTMLInputElement>(null);

  const appendUploadedFiles = async (
    target: 'designFiles' | 'attachments',
    files: FileList | null,
  ) => {
    if (!files?.length) return;

    setUploadingTarget(target);
    try {
      const uploaded = await Promise.all(
        Array.from(files).map(async (file) => {
          const fileType: FileType =
            target === 'designFiles'
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
        }),
      );

      const current = form.getFieldValue(target) || [];
      form.setFieldsValue({
        [target]: [...current, ...uploaded],
      });
      message.success(`已上传 ${uploaded.length} 个文件`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上传失败');
    } finally {
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Title level={2}>新建任务</Title>
        <Paragraph>
          这里只做一件事：创建新任务。若你要继续旧任务，请回到历史任务列表。
        </Paragraph>
        <Button>
          <Link to={TASK_HISTORY_PATH}>返回历史任务</Link>
        </Button>
      </div>

      <Alert
        type="info"
        message="当前已补齐最小真实文件链路"
        description="支持本地文件选择并上传到 server 落盘。图片/设计图会同时保留分析快照，便于 Vision 真实消费与任务回放。"
      />

      <Card className="page-card">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            inputType: 'mixed',
            taskMode: 'deep_research',
            modules: ['visionMoE', 'personaSandbox', 'externalSearch', 'multiModelReview'],
            designFiles: [],
            attachments: [],
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="任务标题" name="title">
                <Input placeholder="例如：电商首页内容种草区方向评估" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="输入类型" name="inputType" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'text', label: '文本' },
                    { value: 'design', label: '设计图' },
                    { value: 'mixed', label: '混合' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="分析模式" name="taskMode" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'quick_judgment', label: '快速判断' },
                    { value: 'deep_research', label: '深度分析' },
                    { value: 'design_review', label: '设计评估' },
                    { value: 'hypothesis_test', label: '假设验证' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="研究问题"
            name="query"
            rules={[{ required: true, message: '请输入研究问题' }]}
          >
            <Input.TextArea
              rows={5}
              placeholder="例如：我们要不要在电商首页加入内容种草区？"
            />
          </Form.Item>

          <Form.Item label="启用模块" name="modules">
            <Checkbox.Group>
              <Space size={24} wrap>
                <Checkbox value="visionMoE">Vision MoE</Checkbox>
                <Checkbox value="personaSandbox">Persona Sandbox</Checkbox>
                <Checkbox value="externalSearch">外部检索</Checkbox>
                <Checkbox value="multiModelReview">多模型复核</Checkbox>
              </Space>
            </Checkbox.Group>
          </Form.Item>

          <Card type="inner" title="设计图 / 截图输入" style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                默认只需要上传本地设计图/截图。手工录入 URL / data URL 仅用于高级调试或引用已有外链资源。
              </Paragraph>
              <Alert
                type="info"
                showIcon
                message="上传建议"
                description="当前上传链路仍使用 data URL，图片越大，请求体越大。建议单张图片控制在 15MB 以内。"
              />
              <Space wrap>
                <Button
                  icon={<UploadOutlined />}
                  loading={uploadingTarget === 'designFiles'}
                  onClick={() => designUploadRef.current?.click()}
                >
                  上传本地设计图/截图
                </Button>
                <input
                  ref={designUploadRef}
                  hidden
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    void appendUploadedFiles('designFiles', event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
                <Button type="dashed" onClick={() => setShowAdvancedReferences((value) => !value)}>
                  {showAdvancedReferences ? '隐藏高级引用模式' : '显示高级引用模式'}
                </Button>
              </Space>
              <Form.List name="designFiles">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    {fields.map((field) => (
                      <Card
                        key={field.key}
                        size="small"
                        title={`设计输入 ${field.name + 1}`}
                        extra={
                          <Button type="text" icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                        }
                      >
                        {hiddenFieldNames.map((name) => (
                          <Form.Item key={name} hidden name={[field.name, name]}>
                            <Input />
                          </Form.Item>
                        ))}
                        <Row gutter={12}>
                          <Col span={8}>
                            <Form.Item label="名称" name={[field.name, 'fileName']}>
                              <Input placeholder="例如：首页截图-方案A" />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item label="文件类型" name={[field.name, 'fileType']}>
                              <Select
                                options={[
                                  { value: 'design', label: '设计图' },
                                  { value: 'image', label: '截图' },
                                ]}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={10}>
                            <Form.Item label="sourceUrl / data URL" name={[field.name, 'sourceUrl']}>
                              <Input placeholder="https://... 或 data:image/..." />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Row gutter={12}>
                          <Col span={12}>
                            <Form.Item label="OSS Key / 外链备用" name={[field.name, 'ossKey']}>
                              <Input placeholder="oss://bucket/path 或可访问 URL" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item label="Mime Type" name={[field.name, 'mimeType']}>
                              <Input placeholder="image/png（可选）" />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.Item noStyle shouldUpdate>
                          {() => {
                            const item = (form.getFieldValue('designFiles') || [])[field.name];
                            if (!item?.sourceUrl) return null;
                            return (
                              <Text type="secondary">
                                已上传引用：
                                <TextLink href={String(item.sourceUrl)} target="_blank">
                                  {String(item.sourceUrl)}
                                </TextLink>
                              </Text>
                            );
                          }}
                        </Form.Item>
                      </Card>
                    ))}
                    {showAdvancedReferences ? (
                      <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ fileType: 'design' })}>
                        手工添加设计图/截图引用
                      </Button>
                    ) : null}
                  </Space>
                )}
              </Form.List>
            </Space>
          </Card>

          <Card type="inner" title="补充附件（可选）">
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                支持上传文档、图片、表格。当前文档已能真实落盘并保存在任务元数据中，但尚未完整接入 OCR / 文档证据抽取。
              </Paragraph>
              <Space wrap>
                <Button
                  icon={<UploadOutlined />}
                  loading={uploadingTarget === 'attachments'}
                  onClick={() => attachmentUploadRef.current?.click()}
                >
                  上传本地附件
                </Button>
                <input
                  ref={attachmentUploadRef}
                  hidden
                  type="file"
                  multiple
                  onChange={(event) => {
                    void appendUploadedFiles('attachments', event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
              </Space>
              <Form.List name="attachments">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    {fields.map((field) => (
                      <Card
                        key={field.key}
                        size="small"
                        title={`附件 ${field.name + 1}`}
                        extra={
                          <Button type="text" icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                        }
                      >
                        {hiddenFieldNames.map((name) => (
                          <Form.Item key={name} hidden name={[field.name, name]}>
                            <Input />
                          </Form.Item>
                        ))}
                        <Row gutter={12}>
                          <Col span={8}>
                            <Form.Item label="名称" name={[field.name, 'fileName']}>
                              <Input placeholder="例如：PRD 摘要" />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item label="文件类型" name={[field.name, 'fileType']}>
                              <Select
                                options={[
                                  { value: 'document', label: '文档' },
                                  { value: 'image', label: '图片' },
                                  { value: 'spreadsheet', label: '表格' },
                                ]}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={10}>
                            <Form.Item label="引用地址" name={[field.name, 'sourceUrl']}>
                              <Input placeholder="https://...（可选）" />
                            </Form.Item>
                          </Col>
                        </Row>
                      </Card>
                    ))}
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ fileType: 'document' })}>
                      手工添加附件引用
                    </Button>
                  </Space>
                )}
              </Form.List>
            </Space>
          </Card>

          <Card type="inner" title="本阶段默认策略" style={{ marginTop: 16 }}>
            <Space direction="vertical">
              <Text>• 默认走完整研究工作台链路</Text>
              <Text>• 输出结果需经过 Gate</Text>
              <Text>• Vision / Persona 结果默认降权，不直接视为 T1 事实</Text>
              <Text>• 设计图上传后会同时保留本地落盘路径与分析快照</Text>
            </Space>
          </Card>

          <div style={{ marginTop: 24 }}>
            <Button type="primary" size="large" loading={submitting} onClick={handleCreate}>
              创建并运行任务
            </Button>
          </div>
        </Form>
      </Card>
    </Space>
  );
};
