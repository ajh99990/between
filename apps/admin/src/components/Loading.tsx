export default function Loading() {
  return (
    <div className="orbit-loading" role="status" data-testid="admin-loading">
      <div className="brand-mark" aria-hidden>
        <i />
        <i />
      </div>
      <p>正在读取管理控制台…</p>
    </div>
  );
}
