import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, Select, Space, Table, Tag, Typography } from 'antd';
const { Link, Text } = Typography;
export const EvidenceReviewTable = ({ items, tierColorMap, reviewColorMap, reviewLabelMap, tierDrafts, tierOptions, actionLocked, submittingId, isRecomputing, onTierChange, onReview, }) => (_jsx(Table, { rowKey: "id", dataSource: items, pagination: false, columns: [
        {
            title: '来源名称',
            render: (_, item) => _jsx(Text, { strong: true, children: item.sourceName || '未命名来源' }),
        },
        {
            title: '来源类型',
            dataIndex: 'sourceType',
            render: (value) => _jsx(Tag, { children: value }),
        },
        {
            title: '来源级别',
            dataIndex: 'sourceLevel',
            render: (value) => _jsx(Tag, { children: value }),
        },
        {
            title: 'Tier',
            dataIndex: 'tier',
            render: (value) => _jsx(Tag, { color: tierColorMap[value] || 'default', children: value }),
        },
        {
            title: '证据内容',
            dataIndex: 'content',
            width: '24%',
        },
        {
            title: '引用文本',
            render: (_, item) => _jsx(Text, { type: "secondary", children: item.citationText || '暂无引用文本' }),
        },
        {
            title: '来源链接',
            render: (_, item) => item.sourceUrl ? (_jsx(Link, { href: item.sourceUrl, target: "_blank", children: "\u6253\u5F00\u6765\u6E90" })) : (_jsx(Text, { type: "secondary", children: "\u6682\u65E0" })),
        },
        {
            title: '复核状态',
            render: (_, item) => (_jsx(Tag, { color: reviewColorMap[item.reviewStatus] || 'default', children: reviewLabelMap[item.reviewStatus] })),
        },
        {
            title: '复核操作',
            render: (_, item) => (_jsxs(Space, { direction: "vertical", size: 8, children: [_jsx(Select, { size: "small", style: { width: 96 }, options: tierOptions, value: tierDrafts[item.id] || item.tier, disabled: actionLocked, onChange: (value) => onTierChange(item.id, value) }), _jsxs(Space, { wrap: true, size: 4, children: [_jsx(Button, { size: "small", type: "primary", loading: submittingId === item.id, disabled: actionLocked, onClick: () => onReview(item, 'accepted'), children: "\u63A5\u53D7" }), _jsx(Button, { size: "small", loading: submittingId === item.id, disabled: actionLocked, onClick: () => onReview(item, 'downgraded'), children: "\u964D\u6743" }), _jsx(Button, { size: "small", danger: true, loading: submittingId === item.id, disabled: actionLocked, onClick: () => onReview(item, 'rejected'), children: "\u62D2\u7EDD" })] }), isRecomputing ? _jsx(Text, { type: "secondary", children: "\u91CD\u7B97\u8FDB\u884C\u4E2D\uFF0C\u64CD\u4F5C\u5DF2\u9501\u5B9A" }) : null] })),
        },
    ] }));
