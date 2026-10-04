import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ProductError } from '@between/core/store';

/** Use only canonical absolute roots; never resolve against the package/dev cwd. */
export function canonicalRoot(input: string): string {
  if (!path.isAbsolute(input) || path.resolve(input) !== input) throw new ProductError('DATA_DIRECTORY_INVALID');
  const parent = path.dirname(input);
  if (realpathSync(parent) !== parent) throw new ProductError('DATA_DIRECTORY_INVALID');
  return input;
}
export function verifyPrivateDirectory(root: string): void {
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root ||
      (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))) {
    throw new ProductError('DATA_DIRECTORY_UNTRUSTED');
  }
}
/** O_NOFOLLOW, inode equality, bounded regular files; no hanging FIFO reads. */
export function readBoundedFile(file: string, maxBytes: number, privateFile = false): string {
  const before = lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maxBytes ||
      (privateFile && process.platform !== 'win32' && ((before.mode & 0o077) !== 0 || before.uid !== process.getuid?.()))) {
    throw new ProductError('CONFIGURATION_UNTRUSTED');
  }
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size > maxBytes) {
      throw new ProductError('CONFIGURATION_UNTRUSTED');
    }
    // Do not use readFileSync(fd): a regular file can grow after fstat.
    // Read at most maxBytes + 1 bytes even under an adversarial writer.
    const bytes = Buffer.alloc(maxBytes + 1);
    let used = 0;
    while (used < bytes.byteLength) {
      const count = readSync(fd, bytes, used, bytes.byteLength - used, used);
      if (count === 0) break;
      used += count;
    }
    if (used > maxBytes) throw new ProductError('CONFIGURATION_UNTRUSTED');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used));
  } finally { closeSync(fd); }
}
