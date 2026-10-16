import { describe, expect, it } from 'vitest';
import { createSurfaceMotion } from '../public/design/surface-motion.js';

function fixture(reduce = false, moveSurface = true, extras = {}) {
  const changes = new Set();
  const media = {
    matches: reduce,
    addEventListener: (_type, callback) => changes.add(callback),
    removeEventListener: (_type, callback) => changes.delete(callback),
  };
  const doc = { defaultView: {
    matchMedia: () => media,
    getComputedStyle: (node) => ({
      transform: node.transform,
      opacity: node.opacity,
      borderColor: 'rgba(196, 217, 235, 0.2)',
      boxShadow: 'rgba(4, 7, 11, 0.36) 0px 24px 80px 0px',
      getPropertyValue: () => '',
    }),
  } };
  function element() {
    const calls = [];
    return {
      ownerDocument: doc, dataset: {}, transform: 'none', opacity: '1', calls,
      animate(frames, options) {
        let complete, reject;
        const finished = new Promise((resolve, fail) => { complete = resolve; reject = fail; });
        const call = { frames, options, complete, finished, cancelled: false, cancel() { call.cancelled = true; reject(); } };
        calls.push(call);
        return call;
      },
    };
  }
  const surface = element(), text = element();
  const motion = createSurfaceMotion({ surface, foregrounds: () => extras.fadeSurface ? [surface] : [text], moveSurface, ...extras });
  return { motion, surface, text, media, changes };
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe('glass surface motion lifecycle', () => {
  it('fades an un-nested menu surface as one layer without transforming it', async () => {
    const { motion, surface, text } = fixture(false, false, { fadeSurface: true });
    motion.set(true);
    expect(surface.calls[0].frames).toEqual([{ opacity: '0' }, { opacity: '1' }]);
    expect(text.calls).toHaveLength(0);
    surface.calls[0].complete();
    await flush();
    motion.set(false);
    expect(surface.calls[1].frames).toEqual([{ opacity: '1' }, { opacity: '0' }]);
    motion.destroy();
  });

  it('fades modal border and shadow alpha without fading the glass ancestor', () => {
    const { motion, surface } = fixture(false, false, { fadeDecorations: true });
    motion.set(true);
    expect(surface.calls[0].frames).toEqual([
      { borderColor: 'transparent', boxShadow: 'transparent 0px 24px 80px 0px' },
      { borderColor: 'rgba(196, 217, 235, 0.2)', boxShadow: 'rgba(4, 7, 11, 0.36) 0px 24px 80px 0px' },
    ]);
    expect(surface.calls[0].frames.every(frame => !('opacity' in frame) && !('transform' in frame))).toBe(true);
    motion.destroy();
  });

  it('keeps backdrop-filter hosts stationary while independent drawing layers fade', async () => {
    const { motion, surface, text } = fixture(false, false);
    motion.set(true);
    expect(surface.calls).toHaveLength(0);
    expect(text.calls[0].frames).toEqual([{ opacity: '0' }, { opacity: '1' }]);
    text.calls[0].complete();
    await flush();
    motion.set(false);
    expect(surface.calls).toHaveLength(0);
    expect(text.calls[1].frames).toEqual([{ opacity: '1' }, { opacity: '0' }]);
    motion.destroy();
  });

  it('moves the surface without fading its glass material or scaling the text', async () => {
    const { motion, surface, text } = fixture();
    motion.set(true);
    expect(motion.state).toBe('entering');
    expect(surface.calls[0].frames).toEqual([{ transform: 'translateY(6px)' }, { transform: 'none' }]);
    expect(surface.calls[0].options.duration).toBe(210);
    expect(text.calls[0].frames).toEqual([{ opacity: '0' }, { opacity: '1' }]);
    surface.calls[0].complete(); text.calls[0].complete();
    await flush();
    expect(motion.state).toBe('open');
    motion.destroy();
  });

  it('reverses from the current frame and ignores completion from an interrupted exit', async () => {
    const { motion, surface, text } = fixture();
    let hidden = false;
    motion.set(true);
    surface.transform = 'matrix(1, 0, 0, 1, 0, 3)'; text.opacity = '0.4';
    motion.set(false, { onFinish: () => { hidden = true; } });
    expect(surface.calls[1].frames[0].transform).toBe(surface.transform);
    expect(text.calls[1].frames[0].opacity).toBe('0.4');
    expect(surface.calls[1].options.duration).toBe(150);
    motion.set(true);
    await flush();
    expect(hidden).toBe(false);
    expect(motion.state).toBe('entering');
    surface.calls[2].complete(); text.calls[2].complete();
    await flush();
    expect(motion.state).toBe('open');
    expect(hidden).toBe(false);
    motion.destroy();
  });

  it('closes synchronously on permission loss and cancels retained frames on destroy', async () => {
    const { motion, surface, text } = fixture();
    let hidden = false;
    motion.set(true);
    motion.set(false, { onFinish: () => { hidden = true; } });
    expect(hidden).toBe(false);
    motion.set(false, { immediate: true, onFinish: () => { hidden = true; } });
    expect(hidden).toBe(true);
    expect(motion.state).toBe('closed');
    motion.set(true);
    motion.destroy();
    expect(surface.calls.every(call => call.cancelled)).toBe(true);
    expect(text.calls.every(call => call.cancelled)).toBe(true);
    await flush();
    expect(motion.state).toBe('closed');
  });

  it('uses a short foreground fade without movement for reduced motion', async () => {
    const { motion, surface, text, media, changes } = fixture(true);
    motion.set(true);
    expect(surface.calls).toHaveLength(0);
    expect(text.calls[0].options.duration).toBe(60);
    text.calls[0].complete();
    await flush();
    expect(motion.state).toBe('open');
    motion.set(false);
    media.matches = false;
    for (const change of changes) change();
    expect(motion.state).toBe('closed');
    motion.destroy();
    expect(changes.size).toBe(0);
  });
});
