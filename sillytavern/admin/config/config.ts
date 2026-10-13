import { defineConfig } from '@umijs/max';
import defaultSettings from './defaultSettings';
import routes from './routes';
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
          colorPrimary:'#a999ff', colorInfo:'#a999ff', colorSuccess:'#60deb1', colorWarning:'#ffd180', colorError:'#ff879e',
          colorBgLayout:'#080c1b', colorBgContainer:'#151c30', colorBgElevated:'#1c2540', colorText:'#f1f4ff', colorTextSecondary:'#b4c0db', colorTextTertiary:'#a6b4d0', colorTextPlaceholder:'#95a3bf', colorBorder:'#526180', colorSplit:'rgba(160,177,220,.18)', borderRadius:12, controlHeight:44,
          fontFamily:'"Fira Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      },
    },
  },
  locale: { default: 'zh-CN', antd: true, baseNavigator: false },
  tailwindcss: {},
  mock: false,
  fastRefresh: true,
  // Preserve the backend Origin/Host checks in development; never proxy to a live user instance.
  proxy: process.env.BETWEEN_ADMIN_DEV_API
    ? {
        '/api/': {
          target: process.env.BETWEEN_ADMIN_DEV_API,
          changeOrigin: true,
          onProxyReq(proxyReq) {
            proxyReq.setHeader('Origin', process.env.BETWEEN_ADMIN_DEV_API!);
          },
        },
      }
    : undefined,
});
