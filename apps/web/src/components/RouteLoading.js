import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, Space, Spin, Typography } from 'antd';
const { Text } = Typography;
export const RouteLoading = () => (_jsx(Card, { className: "page-card", children: _jsxs(Space, { direction: "vertical", align: "center", size: 12, style: { width: '100%', padding: '24px 0' }, children: [_jsx(Spin, { size: "large" }), _jsx(Text, { type: "secondary", children: "\u9875\u9762\u52A0\u8F7D\u4E2D\u2026" })] }) }));
