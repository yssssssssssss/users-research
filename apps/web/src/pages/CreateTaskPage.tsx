import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
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
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';

const { Title, Paragraph, Text } = Typography;

const compactFileInputs = (
  items: Array<Record<string, string | undefined>> | undefined,
  defaultFileType: CreateTaskFileInput['fileType'],
): CreateTaskFileInput[] =>
  (items || [])
    .filter((item) => item.fileName || item.sourceUrl || item.ossKey)
    .map((item, index) => ({
      fileId: item.fileId || `${defaultFileType}_${Date.now()}_${index}`,
      fileName: item.fileName || `${defaultFileType}-${index + 1}`,
      fileType: (item.fileType as CreateTaskFileInput['fileType']) || defaultFileType,
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

      navigate('/workbench');
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
        <Title level={2}>新建分析任务</Title>
        <Paragraph>
          先输入研究问题，再选择是否开启 Vision MoE、Persona Sandbox、外部检索和多模型复核。
        </Paragraph>
      </div>

      <Alert
        type="info"
        message="当前为 Phase 1 骨架版"
        description="已接通任务状态、证据、Vision、Persona、报告的页面与 API 结构；当前支持手工录入设计图/截图 URL 或 data URL，供 Vision MoE 走多模态分析。"
      />

      <Card className="page-card">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            inputType: 'mixed',
            taskMode: 'deep_research',
            modules: ['visionMoE', 'personaSandbox', 'externalSearch', 'multiModelReview'],
            designFiles: [{ fileType: 'design' }],
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
                <Select options={[
                  { value: 'text', label: '文本' },
                  { value: 'design', label: '设计图' },
                  { value: 'mixed', label: '混合' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="分析模式" name="taskMode" rules={[{ required: true }]}> 
                <Select options={[
                  { value: 'quick_judgment', label: '快速判断' },
                  { value: 'deep_research', label: '深度分析' },
                  { value: 'design_review', label: '设计评估' },
                  { value: 'hypothesis_test', label: '假设验证' },
                ]} />
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

          <Card type="inner" title="设计图 / 截图引用（推荐）" style={{ marginBottom: 16 }}>
            <Paragraph type="secondary">
              先支持手工录入图片 URL、OSS 地址或 data URL。若提供可访问图片引用，Vision MoE 会优先尝试多模态分析。
            </Paragraph>
            <Form.List name="designFiles">
              {(fields, { add, remove }) => (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  {fields.map((field) => (
                    <Card
                      key={field.key}
                      size="small"
                      title={`设计输入 ${field.name + 1}`}
                      extra={<Button type="text" icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />}
                    >
                      <Row gutter={12}>
                        <Col span={8}>
                          <Form.Item label="名称" name={[field.name, 'fileName']}>
                            <Input placeholder="例如：首页截图-方案A" />
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item label="文件类型" name={[field.name, 'fileType']}>
                            <Select options={[{ value: 'design', label: '设计图' }, { value: 'image', label: '截图' }]} />
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
                    </Card>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ fileType: 'design' })}>
                    添加设计图/截图引用
                  </Button>
                </Space>
              )}
            </Form.List>
          </Card>

          <Card type="inner" title="补充附件（可选）">
            <Form.List name="attachments">
              {(fields, { add, remove }) => (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  {fields.map((field) => (
                    <Card
                      key={field.key}
                      size="small"
                      title={`附件 ${field.name + 1}`}
                      extra={<Button type="text" icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />}
                    >
                      <Row gutter={12}>
                        <Col span={8}>
                          <Form.Item label="名称" name={[field.name, 'fileName']}>
                            <Input placeholder="例如：PRD 摘要" />
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item label="文件类型" name={[field.name, 'fileType']}>
                            <Select options={[
                              { value: 'document', label: '文档' },
                              { value: 'image', label: '图片' },
                              { value: 'spreadsheet', label: '表格' },
                            ]} />
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
                    添加附件引用
                  </Button>
                </Space>
              )}
            </Form.List>
          </Card>

          <Card type="inner" title="本阶段默认策略" style={{ marginTop: 16 }}>
            <Space direction="vertical">
              <Text>• 默认走完整研究工作台链路</Text>
              <Text>• 输出结果需经过 Gate</Text>
              <Text>• Vision / Persona 结果默认降权，不直接视为 T1 事实</Text>
              <Text>• 当前若模型端支持 `image_url`，Vision MoE 会优先尝试真图输入</Text>
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
