import { element } from "../core/dom";
import {
  WALLPAPER_RANGES,
  type WallpaperNumber,
  type Settings,
  type SettingsStore,
} from "../core/settings";
import {
  wallpaperStore,
  MAX_IMAGE_BYTES,
  type WallpaperStore,
  type WallpaperInfo,
} from "../core/wallpaper";
import {
  inspectImage,
  prepareWallpaper,
  needsOptimization,
  formatBytes,
} from "./wallpaper-image";
export function mountWallpaperSettings(
  parent: HTMLElement,
  store: SettingsStore,
  initial: Settings,
  assets: WallpaperStore = wallpaperStore,
) {
  let settings = initial,
    images: WallpaperInfo[] = [],
    disposed = false,
    busy = false,
    generation = 0,
    listGeneration = 0;
  const card = element("div", "wallpaper-settings");
  const preview = element("div", "wallpaper-preview");
  const previewImage = element("img");
  previewImage.alt = "Current Home wallpaper";
  previewImage.hidden = true;
  const previewTitle = element("span", "wallpaper-preview-title", "Your Home");
  preview.append(previewImage, previewTitle);
  const description = element(
    "p",
    "wallpaper-description",
    "A background that feels like you. Images are copied into the extension and stay on this device.",
  );
  const toolbar = element("div", "wallpaper-toolbar");
  const choose = element(
    "button",
    "wallpaper-button wallpaper-primary",
    "Choose image",
  );
  choose.type = "button";
  const black = element("button", "wallpaper-button", "Use solid black");
  black.type = "button";
  const input = element("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp,image/avif";
  input.hidden = true;
  input.setAttribute("aria-label", "Import Home wallpaper");
  choose.onclick = () => input.click();
  toolbar.append(choose, black, input);
  const warning = element("section", "wallpaper-warning");
  warning.hidden = true;
  warning.setAttribute("role", "alertdialog");
  warning.setAttribute("aria-label", "Large wallpaper image");
  const warningTitle = element("h3", "", "This image may slow down Home");
  const warningCopy = element("p");
  const warningActions = element("div", "wallpaper-warning-actions");
  const compress = element(
      "button",
      "wallpaper-button wallpaper-primary",
      "Compress image",
    ),
    proceed = element("button", "wallpaper-button", "Proceed anyway"),
    cancel = element("button", "wallpaper-button wallpaper-cancel", "Cancel");
  for (const button of [compress, proceed, cancel]) button.type = "button";
  warningActions.append(compress, proceed, cancel);
  warning.append(warningTitle, warningCopy, warningActions);
  const status = element("p", "wallpaper-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const galleryHeader = element("div", "wallpaper-gallery-heading");
  galleryHeader.append(element("h3", "", "Saved images"));
  const gallerySummary = element("span");
  galleryHeader.append(gallerySummary);
  const gallery = element("ul", "wallpaper-gallery");
  gallery.setAttribute("aria-label", "Saved wallpapers");
  const empty = element(
    "p",
    "wallpaper-empty",
    "Your saved images will appear here. Deleting an image also deletes its stored copy.",
  );
  const controls = element("div", "wallpaper-controls");
  const toggles = new Map<
    "homeWallpaperBlur" | "homeWallpaperExtend",
    HTMLInputElement
  >();
  function addToggle(
    key: "homeWallpaperBlur" | "homeWallpaperExtend",
    label: string,
    description: string,
  ) {
    const row = element("label", "setting-row"),
      copy = element("span", "setting-copy"),
      input = element("input"),
      pill = element("span", "switch");
    copy.append(
      element("span", "setting-label", label),
      element("span", "setting-description", description),
    );
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.setAttribute("aria-label", label);
    pill.append(input, element("span", "switch-track"));
    row.append(copy, pill);
    controls.append(row);
    toggles.set(key, input);
    input.onchange = () => {
      const value = input.checked;
      void operation(() => store.set({ [key]: value }));
    };
  }
  addToggle(
    "homeWallpaperBlur",
    "Glass blur",
    "Soft frosting and richer color. Your avatar and text stay sharp.",
  );
  addToggle(
    "homeWallpaperExtend",
    "Cinematic surroundings",
    "Extend blurred edge colors underneath nearby content.",
  );
  const ranges = new Map<
    WallpaperNumber,
    {
      row: HTMLElement;
      input: HTMLInputElement;
      output: HTMLOutputElement;
      suffix: string;
    }
  >();
  function addRange(
    parent: HTMLElement,
    key: WallpaperNumber,
    label: string,
    suffix = "%",
  ) {
    const row = element("label", "setting-row range-row"),
      text = element("span", "setting-copy", label),
      control = element("span", "range-control"),
      range = element("input"),
      output = element("output");
    range.type = "range";
    const [min, max] = WALLPAPER_RANGES[key];
    range.min = String(min);
    range.max = String(max);
    range.step = "1";
    range.setAttribute("aria-label", label);
    range.oninput = () => (output.value = range.value + suffix);
    range.onchange = () => {
      const value = Number(range.value);
      void operation(() => store.set({ [key]: value }));
    };
    control.append(range, output);
    row.append(text, control);
    parent.append(row);
    ranges.set(key, { row, input: range, output, suffix });
  }
  addRange(controls, "homeWallpaperBlurAmount", "Wallpaper blur", "px");
  addRange(controls, "homeWallpaperDim", "Wallpaper dimming");
  const framing = element("details", "wallpaper-advanced");
  framing.append(element("summary", "", "Framing & image adjustments"));
  const frameControls = element("div");
  framing.append(frameControls);
  controls.append(framing);
  const fitRow = element("label", "setting-row"),
    fit = element("select");
  fit.setAttribute("aria-label", "Wallpaper fit");
  for (const [value, label] of [
    ["cover", "Fill the image area"],
    ["contain", "Show the whole image"],
  ]) {
    const option = element("option", "", label);
    option.value = value;
    fit.append(option);
  }
  fitRow.append(element("span", "setting-copy", "Image fit"), fit);
  frameControls.append(fitRow);
  fit.onchange = () => {
    const value = fit.value as Settings["homeWallpaperFit"];
    void operation(() => store.set({ homeWallpaperFit: value }));
  };
  addRange(frameControls, "homeWallpaperX", "Horizontal position");
  addRange(frameControls, "homeWallpaperY", "Vertical position");
  addRange(frameControls, "homeWallpaperBrightness", "Image brightness");
  addRange(frameControls, "homeWallpaperSaturation", "Image saturation");
  addRange(frameControls, "homeWallpaperFade", "Image bottom fade");
  const surroundings = element("details", "wallpaper-advanced");
  surroundings.append(element("summary", "", "Surrounding adjustments"));
  const ambientControls = element("div");
  surroundings.append(ambientControls);
  controls.append(surroundings);
  addRange(ambientControls, "homeWallpaperExtendX", "Side extension", "px");
  addRange(
    ambientControls,
    "homeWallpaperExtendY",
    "Extension below image",
    "px",
  );
  addRange(
    ambientControls,
    "homeWallpaperExtendBlur",
    "Surrounding blur",
    "px",
  );
  addRange(
    ambientControls,
    "homeWallpaperExtendOpacity",
    "Surrounding opacity",
  );
  addRange(
    ambientControls,
    "homeWallpaperExtendSaturation",
    "Surrounding saturation",
  );
  addRange(ambientControls, "homeWallpaperExtendFade", "Surrounding fade");
  const note = element(
    "p",
    "wallpaper-description",
    "Solid black is the default. Reduce transparency temporarily hides your wallpaper without deleting it.",
  );
  card.append(
    preview,
    description,
    toolbar,
    warning,
    status,
    galleryHeader,
    gallery,
    empty,
    controls,
    note,
  );
  parent.append(card);
  let pending: File | undefined;
  function sync() {
    const active = images.find(
      (image) => image.id === settings.homeWallpaperId,
    );
    previewImage.hidden = !active;
    if (active) previewImage.src = active.thumbnail;
    else previewImage.removeAttribute("src");
    previewTitle.textContent = active
      ? active.name
      : "Pure black. Simply Home.";
    previewImage.style.objectFit = settings.homeWallpaperFit;
    previewImage.style.objectPosition = `${settings.homeWallpaperX}% ${settings.homeWallpaperY}%`;
    previewImage.style.filter = `blur(${settings.homeWallpaperBlur ? settings.homeWallpaperBlurAmount / 4 : 0}px) brightness(${(settings.homeWallpaperBrightness / 100) * (1 - settings.homeWallpaperDim / 100)}) saturate(${settings.homeWallpaperSaturation / 100})`;
    black.setAttribute("aria-pressed", String(!settings.homeWallpaperId));
    fit.value = settings.homeWallpaperFit;
    fit.disabled = !active || busy;
    for (const [key, input] of toggles) {
      input.checked = settings[key];
      input.disabled = !active || busy;
    }
    for (const [key, control] of ranges) {
      control.input.value = String(settings[key]);
      control.output.value = control.input.value + control.suffix;
      control.input.disabled =
        !active ||
        busy ||
        (key.startsWith("homeWallpaperExtend") &&
          !settings.homeWallpaperExtend);
      control.row.hidden =
        key === "homeWallpaperBlurAmount" && !settings.homeWallpaperBlur;
    }
    gallerySummary.textContent = images.length
      ? `${images.length} saved · ${formatBytes(images.reduce((n, image) => n + image.bytes, 0))}`
      : "";
    empty.hidden = !!images.length;
    gallery.replaceChildren();
    for (const image of images) {
      const item = element("li", "wallpaper-gallery-item");
      const select = element("button", "wallpaper-gallery-select");
      select.type = "button";
      select.setAttribute("aria-label", `Use wallpaper ${image.name}`);
      select.setAttribute(
        "aria-pressed",
        String(image.id === settings.homeWallpaperId),
      );
      select.disabled = busy;
      const thumb = element("img");
      thumb.src = image.thumbnail;
      thumb.alt = "";
      thumb.loading = "lazy";
      const name = element("span", "wallpaper-gallery-name", image.name);
      name.title = image.name;
      select.append(
        thumb,
        name,
        element("span", "wallpaper-gallery-size", formatBytes(image.bytes)),
      );
      select.onclick = () => {
        generation++;
        pending = undefined;
        warning.hidden = true;
        void operation(() => assets.select(image.id));
      };
      const remove = element("button", "wallpaper-gallery-delete", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `Delete wallpaper ${image.name}`);
      remove.title = "Delete image and its local copy";
      remove.disabled = busy;
      remove.onclick = () =>
        void operation(
          () => assets.remove(image.id),
          "Image and its local copy deleted.",
        );
      item.append(select, remove);
      gallery.append(item);
    }
    for (const button of [choose, black, compress, proceed, cancel])
      button.disabled = busy;
    if (pending && pending.size > MAX_IMAGE_BYTES) proceed.disabled = true;
    card.setAttribute("aria-busy", String(busy));
  }
  async function refresh() {
    const token = ++listGeneration;
    try {
      const next = await assets.list();
      if (!disposed && token === listGeneration) {
        images = next;
        sync();
      }
    } catch {
      if (!disposed)
        status.textContent =
          "Couldn’t load saved images. Reopen settings to try again.";
    }
  }
  async function operation(
    action: () => Promise<void>,
    message = "Saved on this device.",
  ) {
    if (busy || disposed) return;
    busy = true;
    sync();
    status.textContent = "Saving…";
    try {
      await action();
      if (!disposed) {
        settings = await store.get();
        await refresh();
        status.textContent = message;
      }
    } catch (error) {
      if (!disposed)
        status.textContent =
          error instanceof Error ? error.message : "Couldn’t save. Try again.";
    } finally {
      if (!disposed) {
        busy = false;
        sync();
      }
    }
  }
  async function saveSelected(optimize: boolean) {
    const file = pending;
    if (!file || busy) return;
    warning.hidden = true;
    await operation(
      async () => {
        status.textContent = optimize
          ? "Optimizing image…"
          : "Copying image into the extension…";
        const image = await prepareWallpaper(file, optimize);
        await assets.set(image);
        pending = undefined;
      },
      optimize
        ? "Optimized copy saved. Your original file is unchanged."
        : "Local copy saved. The original file is no longer needed.",
    );
    if (pending && !disposed) warning.hidden = false;
  }
  compress.onclick = () => void saveSelected(true);
  proceed.onclick = () => void saveSelected(false);
  cancel.onclick = () => {
    generation++;
    pending = undefined;
    warning.hidden = true;
    status.textContent = "Import cancelled.";
  };
  black.onclick = () => {
    generation++;
    pending = undefined;
    warning.hidden = true;
    void operation(
      () => assets.select(""),
      "Home is solid black. Your saved images are still in the gallery.",
    );
  };
  input.onchange = () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const token = ++generation;
    pending = undefined;
    warning.hidden = true;
    status.textContent = "Checking image…";
    void inspectImage(file)
      .then((info) => {
        if (disposed || token !== generation) return;
        pending = file;
        if (needsOptimization(info)) {
          warningCopy.textContent = `${formatBytes(info.bytes)} · ${info.width.toLocaleString()} × ${info.height.toLocaleString()}. Large images use more memory and may load slowly. Compress image keeps a high-quality copy sized for screens up to 4K.${info.bytes > MAX_IMAGE_BYTES ? " This image must be compressed to fit the 32 MB import limit." : ""}`;
          warning.hidden = false;
          status.textContent = "Choose how to import this image.";
          sync();
          compress.focus();
        } else void saveSelected(false);
      })
      .catch((error) => {
        if (!disposed && token === generation) {
          status.textContent =
            error instanceof Error ? error.message : "Couldn’t open image.";
          pending = undefined;
        }
      });
  };
  const unsubscribe = store.subscribe((next) => {
    const changed =
      next.homeWallpaperRevision !== settings.homeWallpaperRevision ||
      next.homeWallpaperId !== settings.homeWallpaperId;
    settings = next;
    if (changed) void refresh();
    else sync();
  });
  sync();
  void refresh();
  return () => {
    disposed = true;
    generation++;
    listGeneration++;
    pending = undefined;
    input.value = "";
    unsubscribe();
  };
}
