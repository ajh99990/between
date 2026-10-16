import { createContext, type ReactNode, useContext, useEffect } from "react";
import type { AdminState, Config } from "./api";
export interface AdminContextValue {
  state: AdminState;
  refresh: () => Promise<void>;
  save: (config: Config) => Promise<boolean>;
  notify: (message: string, tone?: "success" | "error") => void;
  navigate: (route: string) => void;
  setDirty: (dirty: boolean) => void;
}
const AdminContext = createContext<AdminContextValue | null>(null);
export function AdminProvider({ value, children }: { value: AdminContextValue; children: ReactNode }) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("管理员会话不可用");
  return value;
}
export function useDirtyGuard(dirty: boolean) {
  const { setDirty } = useAdmin();
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}
