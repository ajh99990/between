import { describe, expect, it } from "vitest";
import { blockOverlayExitScroll, createOverlayMotion } from "../src/motion/overlay-motion";

function fixture() {
  const pending: {
    target: HTMLElement;
    frames: Keyframe[];
    options: KeyframeAnimationOptions;
    finish(): void;
    cancelled: boolean;
  }[] = [];
  const style = {
    opacity: "1",
    borderColor: "rgba(196, 217, 235, 0.2)",
    boxShadow: "rgba(4, 7, 11, 0.36) 0px 24px 80px",
  };
  const view = { getComputedStyle: () => style };
  const node = () => {
    const target = {
      dataset: {},
      ownerDocument: { defaultView: view },
      style,
      animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
        let finish = () => {};
        let reject = (_reason: unknown) => {};
        const finished = new Promise<Animation>((resolve, rejectPromise) => {
          finish = () => resolve(animation as unknown as Animation);
          reject = rejectPromise;
        });
        const item = {
          target: target as unknown as HTMLElement,
          frames,
          options,
          finish: () => finish(),
          cancelled: false,
        };
        const animation = {
          finished,
          cancel() {
            item.cancelled = true;
            reject(new Error("cancelled"));
          },
        };
        pending.push(item);
        return animation;
      },
    };
    return target as unknown as HTMLElement;
  };
  const surface = node();
  const material = node();
  const foreground = node();
  const scrim = node();
  const motion = createOverlayMotion({
    surface,
    foregrounds: () => [material, foreground, scrim],
    fadeDecorations: true,
  });
  return {
    surface,
    material,
    foreground,
    scrim,
    motion,
    pending,
    complete: async () => {
      for (const item of pending) if (!item.cancelled) item.finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe("分层浮层生命周期", () => {
  it("仅在视觉退出期间阻止wheel和touch滚动，清理后恢复", () => {
    const document = new EventTarget();
    const release = blockOverlayExitScroll(document as Document);
    expect(document.dispatchEvent(new Event("wheel", { cancelable: true }))).toBe(false);
    expect(document.dispatchEvent(new Event("touchmove", { cancelable: true }))).toBe(false);
    expect(document.dispatchEvent(new Event("keydown", { cancelable: true }))).toBe(true);
    release();
    release();
    expect(document.dispatchEvent(new Event("wheel", { cancelable: true }))).toBe(true);
    expect(document.dispatchEvent(new Event("touchmove", { cancelable: true }))).toBe(true);
  });
  it("材质、前景和遮罩同步退出，玻璃宿主不降低透明度或缩放", async () => {
    const f = fixture();
    f.motion.set(true);
    expect(f.motion.state).toBe("entering");
    expect(f.pending).toHaveLength(4);
    expect(f.pending.find((item) => item.target === f.surface)?.frames).toEqual([
      { borderColor: "transparent", boxShadow: "transparent 0px 24px 80px" },
      {
        borderColor: "rgba(196, 217, 235, 0.2)",
        boxShadow: "rgba(4, 7, 11, 0.36) 0px 24px 80px",
      },
    ]);
    for (const item of f.pending)
      for (const frame of item.frames) expect(frame).not.toHaveProperty("transform");
    await f.complete();
    expect(f.motion.state).toBe("open");
    let closed = false;
    f.motion.set(false, {
      onFinish: () => {
        closed = true;
      },
    });
    expect(closed).toBe(false);
    await f.complete();
    expect(f.motion.state).toBe("closed");
    expect(closed).toBe(true);
  });

  it("退出中重开取消旧完成回调，旧 promise 不能卸载新窗口", async () => {
    const f = fixture();
    f.motion.set(true, { immediate: true });
    let oldClosed = 0;
    f.motion.set(false, {
      onFinish: () => {
        oldClosed++;
      },
    });
    const old = [...f.pending];
    f.motion.set(true);
    expect(old.every((animation) => animation.cancelled)).toBe(true);
    for (const item of old) item.finish();
    await f.complete();
    expect(f.motion.state).toBe("open");
    expect(oldClosed).toBe(0);
  });

  it("销毁取消动画且不触发延迟业务完成", async () => {
    const f = fixture();
    f.motion.set(true, { immediate: true });
    let closed = false;
    f.motion.set(false, {
      onFinish: () => {
        closed = true;
      },
    });
    f.motion.destroy();
    await f.complete();
    expect(f.motion.state).toBe("closed");
    expect(f.pending.every((animation) => animation.cancelled)).toBe(true);
    expect(closed).toBe(false);
    f.motion.set(true);
    expect(f.motion.state).toBe("closed");
  });

  it("键盘立即完成，减少动态只保留60毫秒透明度", async () => {
    const f = fixture();
    f.motion.set(true, { immediate: true });
    expect(f.pending).toHaveLength(0);
    expect(f.motion.state).toBe("open");
    f.motion.set(false, { reduced: true });
    expect(f.pending.every((animation) => animation.options.duration === 60)).toBe(true);
    await f.complete();
    expect(f.motion.state).toBe("closed");
  });

  it("同一实例在完整关闭后能够重新打开", async () => {
    const f = fixture();
    f.motion.set(true);
    await f.complete();
    f.motion.set(false);
    await f.complete();
    f.motion.set(true);
    expect(f.motion.state).toBe("entering");
    const material = f.pending.at(-3);
    expect(material?.frames[0]).toEqual({ opacity: "0" });
    await f.complete();
    expect(f.motion.state).toBe("open");
  });

  it("权限失效时立即结束正在退出的帧且只执行当前完成回调", async () => {
    const f = fixture();
    f.motion.set(true, { immediate: true });
    let stale = 0;
    let current = 0;
    f.motion.set(false, {
      onFinish: () => {
        stale++;
      },
    });
    expect(f.pending.length).toBeGreaterThan(0);
    f.motion.set(false, {
      immediate: true,
      onFinish: () => {
        current++;
      },
    });
    expect(f.motion.state).toBe("closed");
    expect(current).toBe(1);
    expect(f.pending.every((item) => item.cancelled)).toBe(true);
    await f.complete();
    expect(stale).toBe(0);
    expect(current).toBe(1);
  });

  it("中断后从当前透明度衔接，不重新闪回全透明", async () => {
    const f = fixture();
    f.motion.set(true, { immediate: true });
    f.material.style.opacity = "0.42";
    f.motion.set(false);
    f.motion.set(true);
    const latest = f.pending.filter((item) => !item.cancelled && item.target === f.material);
    expect(latest).toHaveLength(1);
    expect(latest[0].frames).toEqual([{ opacity: "0.42" }, { opacity: "1" }]);
    await f.complete();
    expect(f.motion.state).toBe("open");
  });

  it("没有动画API时仍同步完成开关，不留下等待中的浮层", () => {
    const f = fixture();
    Object.defineProperty(f.surface, "animate", { value: undefined });
    let closed = false;
    f.motion.set(true);
    expect(f.motion.state).toBe("open");
    f.motion.set(false, {
      onFinish: () => {
        closed = true;
      },
    });
    expect(f.motion.state).toBe("closed");
    expect(closed).toBe(true);
    expect(f.pending).toHaveLength(0);
  });
});
