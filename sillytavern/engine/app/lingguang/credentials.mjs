import { mkdir, chmod, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';

// One process owns this credential file. The HTTP adapter only receives getAccessToken.
export class PlanCredentials {
  constructor(file, { fetchImpl = fetch, now = Date.now } = {}) {
    if (!isAbsolute(file)) throw new Error('Credential path must be absolute and outside the repository');
    this.file = file;
    this.fetch = fetchImpl;
    this.now = now;
    this.refreshing = null;
  }

  async load() {
    try { return JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Cannot read saved authorization'); }
  }

  async save(record) {
    if (!record.client_id || record.client_id === 'dynamic_agent_client' || !record.subject ||
        !record.access_token || !Number.isFinite(record.expires_at)) throw new Error('Invalid authorization record');
    const directory = dirname(this.file);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(record)); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temporary, this.file);
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }

  async getAccessToken() {
    if (this.refreshing) return this.refreshing;
    // Install the promise before reading disk, so concurrent requests never rotate twice.
    this.refreshing = this.obtainToken();
    try { return await this.refreshing; }
    finally { this.refreshing = null; }
  }

  async obtainToken() {
    const saved = await this.load();
    if (!saved) throw new Error('Sign-in required: no saved authorization');
    if (saved.expires_at > this.now() + 60_000) return saved.access_token;
    if (!saved.refresh_token) throw new Error('Sign-in required: authorization is not renewable');
    let response;
    try {
      response = await this.fetch('https://auth.openai.com/api/accounts/oauth/token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: saved.client_id,
          refresh_token: saved.refresh_token, resource: 'https://api.openai.com/v1' }),
      });
    } catch { throw new Error('Authorization renewal connection failed; saved credentials retained'); }
    if (!response.ok) {
      // Do not log response bodies, which may contain sensitive request data.
      if (response.status === 400 || response.status === 401)
        throw new Error('Authorization renewal rejected; sign-in may be required');
      throw new Error(`Authorization renewal temporarily unavailable (HTTP ${response.status}); saved credentials retained`);
    }
    const token = await response.json();
    if (!token.access_token || !Number.isFinite(token.expires_in) || token.expires_in <= 0 ||
        String(token.token_type).toLowerCase() !== 'bearer') throw new Error('Invalid authorization renewal response');
    await this.save({ ...saved, access_token: token.access_token,
      refresh_token: token.refresh_token ?? saved.refresh_token,
      id_token: token.id_token ?? saved.id_token, scope: token.scope ?? saved.scope,
      expires_at: this.now() + token.expires_in * 1000 });
    return token.access_token;
  }
}
