const DEFAULT_HOSTS = ['github.com', 'linear.app', 'localhost', '127.0.0.1'];

const pendingPrompts = new Set();
const ignoredTabs = new Set();

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await chrome.storage.sync.get(['allSites', 'customHosts']);
  await chrome.storage.sync.set({
    allSites: Boolean(settings.allSites),
    customHosts: Array.isArray(settings.customHosts) ? settings.customHosts : [],
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.url) {
    checkTab(tab.id, tab.url);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    checkTab(tabId, changeInfo.url);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'switch-to-tab') {
    switchToTab(message.existingTabId, message.newTabId).finally(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'reuse-tab-with-new-url') {
    reuseTabWithNewUrl(message.existingTabId, message.newTabId, message.newUrl).finally(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'keep-new-tab') {
    pendingPrompts.delete(message.newTabId);
    ignoredTabs.add(message.newTabId);
    sendResponse({ ok: true });
  }
});

async function checkTab(newTabId, rawUrl) {
  if (ignoredTabs.has(newTabId) || pendingPrompts.has(newTabId) || !isHttpUrl(rawUrl)) {
    return;
  }

  const newUrl = normalizeUrl(rawUrl);
  if (!(await isAllowedUrl(newUrl))) {
    return;
  }

  const tabs = await chrome.tabs.query({});
  const candidates = tabs.filter((tab) => tab.id !== newTabId && tab.url && isHttpUrl(tab.url));

  const exactMatch = candidates.find((tab) => normalizeUrl(tab.url).href === newUrl.href);
  if (exactMatch) {
    await switchToTab(exactMatch.id, newTabId);
    return;
  }

  const similarMatch = candidates.find((tab) => isSimilarUrl(newUrl, normalizeUrl(tab.url)));
  if (similarMatch) {
    pendingPrompts.add(newTabId);
    openConfirmWindow(newTabId, similarMatch.id, rawUrl, similarMatch.url);
  }
}

function isHttpUrl(rawUrl) {
  return rawUrl.startsWith('http://') || rawUrl.startsWith('https://');
}

function normalizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = '';
  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url;
}

async function isAllowedUrl(url) {
  const settings = await chrome.storage.sync.get(['allSites', 'customHosts']);
  if (settings.allSites) {
    return true;
  }

  const customHosts = Array.isArray(settings.customHosts) ? settings.customHosts : [];
  return [...DEFAULT_HOSTS, ...customHosts].some((host) => hostMatches(url.hostname, host));
}

function hostMatches(hostname, allowedHost) {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}

function isSimilarUrl(a, b) {
  if (a.origin !== b.origin) {
    return false;
  }

  return a.pathname === b.pathname || a.pathname.startsWith(`${b.pathname}/`) || b.pathname.startsWith(`${a.pathname}/`);
}

async function switchToTab(existingTabId, newTabId) {
  const existingTab = await chrome.tabs.get(existingTabId);
  if (existingTab.windowId) {
    await chrome.windows.update(existingTab.windowId, { focused: true });
  }
  await chrome.tabs.update(existingTabId, { active: true });
  await closeTabIfPresent(newTabId);
  pendingPrompts.delete(newTabId);
}

async function reuseTabWithNewUrl(existingTabId, newTabId, newUrl) {
  const existingTab = await chrome.tabs.get(existingTabId);
  if (existingTab.windowId) {
    await chrome.windows.update(existingTab.windowId, { focused: true });
  }
  await chrome.tabs.update(existingTabId, { active: true, url: newUrl });
  await closeTabIfPresent(newTabId);
  pendingPrompts.delete(newTabId);
}

async function closeTabIfPresent(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch (_) {
    // The tab may already have been closed by the user.
  }
}

function openConfirmWindow(newTabId, existingTabId, newUrl, existingUrl) {
  const params = new URLSearchParams({
    newTabId: String(newTabId),
    existingTabId: String(existingTabId),
    newUrl,
    existingUrl,
  });

  chrome.windows.create({
    url: chrome.runtime.getURL(`confirm.html?${params}`),
    type: 'popup',
    width: 560,
    height: 460,
    focused: true,
  });
}
