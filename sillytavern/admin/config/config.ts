import { defineConfig } from '@umijs/max';
import defaultSettings from './defaultSettings';
import routes from './routes';
// Full Ant Design Pro 6 scaffold: Umi Max runtime, layout, access, model, request and Tailwind plugins.
export default defineConfig({
  hash: true, history: { type: 'hash' }, publicPath: '/admin/', routes,
  title: 'Between · 管理控制台', favicons: ['/admin/logo.svg'],
  model: {}, initialState: {}, access: {}, request: {},
  layout: { locale: false, ...defaultSettings },
  antd: { appConfig: {}, configProvider: { theme: { token: { colorPrimary: '#316a5b', borderRadius: 8, colorBgLayout: '#f3f5f3', colorText: '#20322b', fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif', controlHeight: 38 } } } },
  locale: { default: 'zh-CN', antd: true, baseNavigator: false },
  tailwindcss: {}, mock: false, fastRefresh: true,
  // Preserve the backend Origin/Host checks in development; never proxy to a live user instance.
  proxy: process.env.BETWEEN_ADMIN_DEV_API ? { '/api/': { target: process.env.BETWEEN_ADMIN_DEV_API, changeOrigin: true, onProxyReq(proxyReq) { proxyReq.setHeader('Origin', process.env.BETWEEN_ADMIN_DEV_API!); } } } : undefined,
});
