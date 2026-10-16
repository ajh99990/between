import { history, useModel } from '@umijs/max';
import { useCallback, useRef, useState } from 'react';
import type { AdminState } from '@/services/types';

interface AdminModel {
  data?: AdminState;
  busy: boolean;
  error: string;
  notice: string;
  reload: () => Promise<AdminState>;
  mutate: (
    action: () => Promise<unknown>,
    success?: string,
  ) => Promise<boolean>;
  clearFeedback: () => void;
}

import { ApiError, getState } from '@/services/admin';
export default function useAdmin(): AdminModel {
  const { initialState, setInitialState } = useModel('@@initialState');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        void setInitialState((s) => ({
          ...s,
          data: undefined,
          authenticated: false,
        }));
        history.replace('/login');
      }
      setError(e instanceof Error ? e.message : '操作失败，请重试。');
    },
    [setInitialState],
  );
  const reload = useCallback(async () => {
    try {
      const data = await getState();
      await setInitialState((s) => ({
        ...s,
        data,
        authenticated: true,
        error: undefined,
      }));
      setError('');
      return data;
    } catch (e) {
      handleError(e);
      throw e;
    }
  }, [setInitialState, handleError]);
  const mutate = useCallback(
    async (
      action: () => Promise<unknown>,
      success = '已保存，更改已生效。',
    ) => {
      if (lock.current) return false;
      lock.current = true;
      setBusy(true);
      setError('');
      setNotice('');
      try {
        await action();
        try {
          await reload();
          setNotice(success);
        } catch {
          setNotice(
            '操作已完成，但读取最新状态失败。请刷新状态，不要重复提交。',
          );
        }
        return true;
      } catch (e) {
        handleError(e);
        return false;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [reload, handleError],
  );
  return {
    data: initialState?.data,
    busy,
    error,
    notice,
    reload,
    mutate,
    clearFeedback: () => {
      setError('');
      setNotice('');
    },
  };
}
