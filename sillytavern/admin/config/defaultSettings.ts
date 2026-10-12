import type { ProLayoutProps } from '@ant-design/pro-components';

const settings: ProLayoutProps = {
  title: 'between',
  logo: '/admin/logo.svg',
  layout: 'mix',
  navTheme: 'light',
  bgLayoutImgList: [],
  colorPrimary: '#316a5b',
  contentWidth: 'Fluid',
  fixedHeader: true,
  fixSiderbar: true,
  siderWidth: 224,
  token: {
    sider: {
      colorMenuBackground: '#142a27',
      colorTextMenu: '#a9bdb6',
      colorTextMenuSelected: '#ffffff',
      colorBgMenuItemSelected: '#2c4b41',
      colorTextMenuActive: '#ffffff',
      colorBgMenuItemHover: '#223d35',
    },
    header: { colorBgHeader: '#ffffff', colorTextRightActionsItem: '#53655e' },
    pageContainer: {
      paddingInlinePageContainerContent: 32,
      paddingBlockPageContainerContent: 24,
    },
  },
};
export default settings;
