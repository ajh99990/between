import { defineConfig } from '@umijs/max';
import defaultSettings from './defaultSettings';
import routes from './routes';

const devApi = process.env.BETWEEN_ADMIN_DEV_API;
// Full Ant Design Pro 6 scaffold: Umi Max runtime, layout, access, model, request and Tailwind plugins.
export default defineConfig({
  esbuildMinifyIIFE: true,
  hash: true,
  history: { type: 'hash' },
  publicPath: '/admin/',
  routes,
  title: 'Between · 管理控制台',
  favicons: ['/admin/logo.svg'],
  model: {},
  initialState: { loading: '@/components/Loading' },
  access: {},
  request: {},
  layout: { locale: false, ...defaultSettings },
  antd: {
    appConfig: {},
    configProvider: {
      theme: {
        token: {
          colorPrimary: '#8ea4ff',
          colorLink: '#a4baff',
          colorLinkHover: '#d1dcff',
          colorLinkActive: '#c5d2ff',
          borderRadius: 12,
          colorBgLayout: '#080d1b',
          colorBgContainer: '#131c32',
          colorBgElevated: '#19243c',
          colorBorder: '#3a4965',
          colorTextSecondary: '#b0bdd4',
          colorTextPlaceholder: '#8e9cb7',
          colorText: '#eef3ff',
          fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
          controlHeight: 42,
        },
      },
    },
  },
  locale: { default: 'zh-CN', antd: true, baseNavigator: false },
  tailwindcss: {},
  mock: false,
  fastRefresh: true,
  // Preserve the backend Origin/Host checks in development; never proxy to a live user instance.
  proxy: devApi
    ? {
        '/api/': {
          target: devApi,
          changeOrigin: true,
          onProxyReq(proxyReq) {
            proxyReq.setHeader('Origin', devApi);
          },
        },
      }
    : undefined,
});
