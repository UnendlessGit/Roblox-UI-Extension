import { afterEach, expect, it, vi } from "vitest";
import { createProductRecovery } from "../../src/content/product-recovery";
import type { ResourceBridge } from "../../src/core/bridge";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

it("late catalog replies cannot reinsert content after Cinema is disabled", async () => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<div id="item-list-container-recommendations"></div>';
  let resolve!: (value: unknown) => void;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const bridge: ResourceBridge = { get: <T>() => pending as Promise<T> };
  const recovery = createProductRecovery(bridge);
  recovery.update(new URL("https://www.roblox.com/bundles/291/Zombie"));
  await vi.advanceTimersByTimeAsync(1601);
  expect(document.querySelector('[role="status"]')).not.toBeNull();
  recovery.destroy();
  resolve({ data: [{ id: 299, name: "Superhero" }] });
  await vi.runAllTimersAsync();
  expect(document.querySelector("[data-rc-product-recovery]")).toBeNull();
});

it("populated native lists need no catalog requests", async () => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<div id="item-list-container-recommendations"><a href="/bundles/299">Superhero</a></div><div id="populated-item-list" data-rc-included-expanded="true"><div class="item-list-carousel"><a href="/catalog/1">Native part</a></div></div>';
  const get = vi.fn();
  const recovery = createProductRecovery({ get });
  recovery.update(new URL("https://www.roblox.com/bundles/291/Zombie"));
  await vi.runAllTimersAsync();
  expect(get).not.toHaveBeenCalled();
  expect(document.querySelector("[data-rc-product-recovery]")).toBeNull();
  recovery.destroy();
});
