import assert from "node:assert/strict";
import test from "node:test";
import { appMenuTemplate, type AppMenuActions } from "./app-menu";

type Item = {
  label?: string;
  role?: string;
  type?: string;
  accelerator?: string;
  enabled?: boolean;
  checked?: boolean;
  click?: (item: Item) => void;
  submenu?: Item[];
};

function build(platform: NodeJS.Platform, hasGameWindow = true) {
  const calls: string[] = [];
  const actions: AppMenuActions = {
    openSettings: () => calls.push("openSettings"),
    reload: () => calls.push("reload"),
    restartSimulation: () => calls.push("restartSimulation"),
    toggleDevTools: () => calls.push("toggleDevTools"),
    setAlwaysOnTop: (on) => calls.push(`setAlwaysOnTop:${on}`),
    takeScreenshot: () => calls.push("takeScreenshot"),
    openGitHub: () => calls.push("openGitHub"),
    openWebsite: () => calls.push("openWebsite"),
  };
  // Labels are the message keys, so the tests find items by key.
  const template = appMenuTemplate({
    platform,
    label: (key) => key,
    hasGameWindow,
    alwaysOnTop: false,
    actions,
  }) as Item[];
  return { calls, template };
}

function findByLabel(items: Item[], label: string): Item | undefined {
  return items.find((item) => item.label === label);
}

function allItems(items: Item[]): Item[] {
  return items.flatMap((item) => [item, ...(item.submenu ? allItems(item.submenu) : [])]);
}

test("Windows and Linux open Settings from File with Ctrl+,", () => {
  for (const platform of ["win32", "linux"] as const) {
    const { calls, template } = build(platform);
    const file = findByLabel(template, "menu.file");
    assert.ok(file?.submenu, `${platform}: File menu exists`);
    const settings = findByLabel(file.submenu, "menu.settings");
    assert.ok(settings, `${platform}: Settings is in the File menu`);
    assert.equal(settings.accelerator, "Ctrl+,", `${platform}: shortcut`);
    assert.equal(settings.enabled, true);
    settings.click?.(settings);
    assert.deepEqual(calls, ["openSettings"], `${platform}: the item opens settings`);
  }
});

test("macOS keeps Settings in the application menu with Cmd+, and does not repeat it in File", () => {
  const { template } = build("darwin");
  const appMenu = findByLabel(template, "The Human Box");
  assert.ok(appMenu?.submenu);
  const settings = findByLabel(appMenu.submenu, "menu.settings");
  assert.equal(settings?.accelerator, "Cmd+,");
  const file = findByLabel(template, "menu.file");
  assert.equal(file?.submenu && findByLabel(file.submenu, "menu.settings"), undefined);
});

test("Settings is disabled while no game window is open", () => {
  for (const platform of ["darwin", "win32", "linux"] as const) {
    const { template } = build(platform, false);
    const settings = allItems(template).find((item) => item.label === "menu.settings");
    assert.equal(settings?.enabled, false, `${platform}: Settings disabled without a window`);
  }
});

test("every custom accelerator uses its platform's own modifier", () => {
  for (const platform of ["darwin", "win32", "linux"] as const) {
    const { template } = build(platform);
    const accelerators = allItems(template)
      .map((item) => item.accelerator)
      .filter((value): value is string => typeof value === "string");
    assert.ok(accelerators.length > 0, `${platform}: the menu has shortcuts`);
    for (const accelerator of accelerators) {
      if (platform === "darwin") {
        assert.ok(accelerator.startsWith("Cmd+"), `${platform}: ${accelerator}`);
        assert.ok(!accelerator.includes("Ctrl"), `${platform}: ${accelerator}`);
      } else {
        assert.ok(accelerator.startsWith("Ctrl+"), `${platform}: ${accelerator}`);
        assert.ok(!/Cmd|Meta/.test(accelerator), `${platform}: ${accelerator}`);
      }
    }
  }
});

test("no shortcut is used by two items in one menu", () => {
  for (const platform of ["darwin", "win32", "linux"] as const) {
    const { template } = build(platform);
    const accelerators = allItems(template)
      .map((item) => item.accelerator)
      .filter((value): value is string => typeof value === "string");
    assert.equal(new Set(accelerators).size, accelerators.length, `${platform}: ${accelerators.join(", ")}`);
  }
});

test("the always-on-top item sets the window to the state it is switched to", () => {
  const { calls, template } = build("win32");
  const view = findByLabel(template, "menu.view");
  const item = view?.submenu && findByLabel(view.submenu, "menu.alwaysOnTop");
  assert.equal(item?.type, "checkbox");
  assert.equal(item?.accelerator, "Ctrl+Shift+T");
  item?.click?.({ ...item, checked: true });
  assert.deepEqual(calls, ["setAlwaysOnTop:true"]);
});
