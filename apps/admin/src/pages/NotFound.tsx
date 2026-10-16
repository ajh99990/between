import { history } from '@umijs/max';
import { Button, Result } from 'antd';
export default function NotFound() {
  return (
    <Result
      status="404"
      title="页面不存在"
      extra={<Button onClick={() => history.push('/roles')}>返回角色库</Button>}
    />
  );
}
