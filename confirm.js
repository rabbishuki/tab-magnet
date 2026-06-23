const params = new URLSearchParams(location.search);
const newTabId = Number(params.get('newTabId'));
const existingTabId = Number(params.get('existingTabId'));

const newUrl = params.get('newUrl') || '';
const existingUrl = params.get('existingUrl') || '';

document.getElementById('new-url').textContent = newUrl;
document.getElementById('existing-url').textContent = existingUrl;

document.getElementById('switch').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'switch-to-tab', newTabId, existingTabId });
  window.close();
});

document.getElementById('reuse').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'reuse-tab-with-new-url', newTabId, existingTabId, newUrl });
  window.close();
});

document.getElementById('keep').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'keep-new-tab', newTabId });
  window.close();
});
