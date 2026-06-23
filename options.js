const DEFAULT_HOSTS = ['github.com', 'linear.app', 'localhost', '127.0.0.1'];

const allSitesInput = document.getElementById('all-sites');
const form = document.getElementById('add-site-form');
const hostInput = document.getElementById('host-input');
const hostList = document.getElementById('host-list');
const statusEl = document.getElementById('status');

loadSettings();

allSitesInput.addEventListener('change', async () => {
  if (allSitesInput.checked) {
    const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
    if (!granted) {
      allSitesInput.checked = false;
      setStatus('All-sites permission was not granted.');
      return;
    }
  }

  await chrome.storage.sync.set({ allSites: allSitesInput.checked });
  setStatus('Settings saved.');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const host = normalizeHost(hostInput.value);
  if (!host) {
    setStatus('Enter a valid host, like example.com.');
    return;
  }

  const origins = originsForHost(host);
  const granted = await chrome.permissions.request({ origins });
  if (!granted) {
    setStatus(`Permission was not granted for ${host}.`);
    return;
  }

  const { customHosts = [] } = await chrome.storage.sync.get('customHosts');
  const nextHosts = [...new Set([...customHosts, host])].sort();
  await chrome.storage.sync.set({ customHosts: nextHosts });

  hostInput.value = '';
  setStatus(`${host} added.`);
  renderHosts(nextHosts);
});

async function loadSettings() {
  const settings = await chrome.storage.sync.get(['allSites', 'customHosts']);
  allSitesInput.checked = Boolean(settings.allSites);
  renderHosts(Array.isArray(settings.customHosts) ? settings.customHosts : []);
}

function renderHosts(customHosts) {
  hostList.textContent = '';

  for (const host of DEFAULT_HOSTS) {
    const item = document.createElement('li');
    item.innerHTML = `<span>${host}</span><small>Default</small>`;
    hostList.append(item);
  }

  for (const host of customHosts) {
    const item = document.createElement('li');
    const label = document.createElement('span');
    const removeButton = document.createElement('button');

    label.textContent = host;
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', async () => {
      const nextHosts = customHosts.filter((candidate) => candidate !== host);
      await chrome.storage.sync.set({ customHosts: nextHosts });
      await chrome.permissions.remove({ origins: originsForHost(host) });
      setStatus(`${host} removed.`);
      renderHosts(nextHosts);
    });

    item.append(label, removeButton);
    hostList.append(item);
  }
}

function normalizeHost(value) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return '';
  }

  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

function originsForHost(host) {
  if (host === 'localhost' || host === '127.0.0.1') {
    return [`http://${host}/*`, `https://${host}/*`];
  }

  return [`https://${host}/*`, `https://*.${host}/*`, `http://${host}/*`, `http://*.${host}/*`];
}

function setStatus(message) {
  statusEl.textContent = message;
  setTimeout(() => {
    statusEl.textContent = '';
  }, 3000);
}
