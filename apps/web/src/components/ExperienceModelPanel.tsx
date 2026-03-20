import { Alert, Button, Card, Empty, List, Select, Space, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type {
  EvidenceItem,
  ExperienceModelCatalogItem,
  TaskSnapshotResponse,
  TaskSummaryResponse,
} from '@users-research/shared';
import { api } from '../lib/api';

const { Paragraph, Text } = Typography;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

interface ExperienceModelPanelProps {
  taskId?: string;
  evidencePool?: EvidenceItem[];
  currentNode?: string;
  onTaskUpdated?: (summary: TaskSummaryResponse, state: TaskSnapshotResponse) => void;
}

export const ExperienceModelPanel = ({
  taskId,
  evidencePool,
  currentNode,
  onTaskUpdated,
}: ExperienceModelPanelProps) => {
  const models = evidencePool?.filter((item) => item.sourceType === 'experience_model') || [];
  const [catalog, setCatalog] = useState<ExperienceModelCatalogItem[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isAnalyzing =
    currentNode === 'experience_model_router' || currentNode === 'problem_decomposer';

  useEffect(() => {
    api.getExperienceModelCatalog()
      .then(setCatalog)
      .catch((error) => {
        message.error(error instanceof Error ? error.message : '体验模型目录加载失败');
      });
  }, []);

  const recommendedModelIds = useMemo(
    () =>
      models
        .map((item) => asRecord(item.traceLocation)?.modelId)
        .filter((item): item is string => typeof item === 'string'),
    [models],
  );

  useEffect(() => {
    setSelectedModelIds(recommendedModelIds);
  }, [recommendedModelIds.join('|')]);

  const applyOverride = async (mode: 'auto' | 'manual') => {
    if (!taskId) return;
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
    } catch (error) {
      message.error(error instanceof Error ? error.message : '体验模型覆盖失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card title="推荐体验模型" className="page-card">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="系统会先读体验模型总索引，再定向研读具体模型 PDF"
          description="这些结果用于补充分析框架与评估维度，不直接等同于真实用户事实证据。"
        />

        <Card type="inner" title="模型选择控制台">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Text type="secondary">
              默认由系统自动推荐，你也可以手动指定模型覆盖当前推荐结果。
            </Text>
            <Select
              mode="multiple"
              allowClear
              style={{ width: '100%' }}
              placeholder="选择要用于当前任务的体验模型"
              options={catalog.map((item) => ({
                label: `${item.name}｜${item.dimensions.join(' / ')}`,
                value: item.id,
              }))}
              value={selectedModelIds}
              onChange={(value) => setSelectedModelIds(value)}
            />
            <Space wrap>
              <Button
                type="primary"
                loading={submitting}
                disabled={!taskId}
                onClick={() => void applyOverride('manual')}
              >
                应用手动选择
              </Button>
              <Button
                loading={submitting}
                disabled={!taskId}
                onClick={() => void applyOverride('auto')}
              >
                恢复自动推荐
              </Button>
            </Space>
          </Space>
        </Card>

        {models.length ? (
          <List
            itemLayout="vertical"
            dataSource={models}
            renderItem={(item) => {
              const trace = asRecord(item.traceLocation);
              const reasons = asStringArray(trace?.selectionReasons);
              const dimensions = asStringArray(trace?.dimensions);
              const questions = asStringArray(trace?.evaluationQuestions);
              const metrics = asStringArray(trace?.metricPrompts);
              const selectionMode = trace?.selectionMode === 'manual' ? '手动覆盖' : '自动推荐';

              return (
                <List.Item key={item.id}>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space wrap>
                      <Text strong>{item.sourceName || '体验模型'}</Text>
                      <Tag color="blue">{item.sourceLevel}</Tag>
                      <Tag color="gold">{item.tier}</Tag>
                      <Tag color={selectionMode === '手动覆盖' ? 'purple' : 'green'}>{selectionMode}</Tag>
                    </Space>

                    <Paragraph style={{ marginBottom: 0 }}>{item.content}</Paragraph>

                    {dimensions.length ? (
                      <div>
                        <Text strong>关注维度：</Text>
                        <Space wrap style={{ marginTop: 6 }}>
                          {dimensions.map((dimension) => (
                            <Tag key={dimension}>{dimension}</Tag>
                          ))}
                        </Space>
                      </div>
                    ) : null}

                    {reasons.length ? (
                      <div>
                        <Text strong>推荐原因：</Text>
                        <List
                          size="small"
                          dataSource={reasons}
                          renderItem={(reason) => <List.Item>{reason}</List.Item>}
                        />
                      </div>
                    ) : null}

                    {questions.length ? (
                      <div>
                        <Text strong>建议追问：</Text>
                        <List
                          size="small"
                          dataSource={questions}
                          renderItem={(question) => <List.Item>{question}</List.Item>}
                        />
                      </div>
                    ) : null}

                    {metrics.length ? (
                      <div>
                        <Text strong>建议指标：</Text>
                        <Space wrap style={{ marginTop: 6 }}>
                          {metrics.map((metric) => (
                            <Tag color="purple" key={metric}>
                              {metric}
                            </Tag>
                          ))}
                        </Space>
                      </div>
                    ) : null}

                    {item.citationText ? (
                      <Paragraph type="secondary" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                        {item.citationText}
                      </Paragraph>
                    ) : null}
                  </Space>
                </List.Item>
              );
            }}
          />
        ) : isAnalyzing ? (
          <Alert
            type="warning"
            showIcon
            message="体验模型分析进行中"
            description="系统正在读取总索引并挑选合适的模型 PDF，请稍后刷新或等待任务流推进。"
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前任务尚未产出体验模型推荐"
          />
        )}
      </Space>
    </Card>
  );
};
