import { jsx as _jsx } from "react/jsx-runtime";
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
export default function App() {
    return (_jsx(ConfigProvider, { locale: zhCN, theme: { token: { borderRadius: 14 } }, children: _jsx(RouterProvider, { router: router }) }));
}
