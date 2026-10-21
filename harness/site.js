(() => {
  const menu = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.primary-nav');
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    nav?.classList.toggle('open', open);
  });
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    menu?.setAttribute('aria-expanded', 'false');
    nav.classList.remove('open');
  }));

  const repo = 'xxxxxwater/PureGamma-harness';
  const api = `https://api.github.com/repos/${repo}`;
  const releaseState = document.querySelector('[data-release-state]');
  const setText = (selector, value) => document.querySelectorAll(selector).forEach(el => { el.textContent = value; });
  const setHref = (selector, value) => document.querySelectorAll(selector).forEach(el => { el.href = value; });
  const fileSize = bytes => `${Math.round(bytes / 1024 / 1024)} MB`;

  async function getJson(url) {
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
    return response.json();
  }

  async function refreshRelease() {
    try {
      const tags = await getJson(`${api}/tags?per_page=1`);
      if (!Array.isArray(tags) || !tags[0]?.name) throw new Error('No tags found');
      const tag = tags[0].name;
      const release = await getJson(`${api}/releases/tags/${encodeURIComponent(tag)}`);
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const mac = assets.find(asset => /macos.*x64.*\.zip$/i.test(asset.name));
      const arm64 = assets.find(asset => /macos.*arm64.*\.zip$/i.test(asset.name));
      const windows = assets.find(asset => /windows.*x64.*\.exe$/i.test(asset.name));
      setText('[data-release-version]', tag.replace(/^puregamma-harness-/, ''));
      setHref('[data-release-page]', release.html_url);
      const sums = assets.find(asset => asset.name === 'SHA256SUMS' || asset.name === 'SHA256SUMS.txt');
      if (sums) setHref('[data-checksums]', sums.browser_download_url);
      for (const [selector, asset] of [['[data-download-macos]', mac], ['[data-download-arm64]', arm64], ['[data-download-windows]', windows]]) {
        const link = document.querySelector(selector);
        if (!link) continue;
        if (asset) { link.href = asset.browser_download_url; link.removeAttribute('aria-disabled'); }
        else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); }
      }
      if (mac) setText('[data-file-macos]', `ZIP · ${fileSize(mac.size)} · Intel x64`);
      if (arm64) setText('[data-file-arm64]', `ZIP · ${fileSize(arm64.size)} · Apple Silicon arm64`);
      if (windows) setText('[data-file-windows]', `EXE · ${fileSize(windows.size)} · Windows x64`);
      if (releaseState) releaseState.textContent = mac && arm64 && windows
        ? 'Verified against the newest GitHub tag'
        : 'The newest tag does not yet include every desktop package. See release notes.';
    } catch {
      if (releaseState) releaseState.textContent = 'Showing the verified v0.2.1-rc.2-purge.2 packages · Check all versions for newer releases';
    }
  }
  refreshRelease();

  const pluginList = document.querySelector('#plugin-list');
  const pluginSearch = document.querySelector('#plugin-search');
  const pluginCategory = document.querySelector('#plugin-category');
  const pluginMore = document.querySelector('#plugin-more');
  const pluginResults = document.querySelector('#plugin-results');
  const pluginCount = document.querySelector('[data-plugin-count]');
  let plugins = [];
  let visibleCount = 8;
  const categoryNames = { ui: 'Interface', session: 'Sessions', model: 'Models', tools: 'Tools', skill: 'Skills', memory: 'Memory', dev: 'Development', workflow: 'Workflows', usage: 'Usage', theme: 'Themes', vision: 'Vision', notify: 'Notifications', fun: 'Creative', remote: 'Remote', security: 'Security', market: 'Markets', git: 'Git', browser: 'Browser', docs: 'Documents', wsl: 'WSL', voice: 'Voice', identity: 'Identity', agi: 'Agents', other: 'Other' };
  const labelFor = category => categoryNames[category || 'other'] || category;

  function normalizeIndex(index) {
    if (!index || !Array.isArray(index.fields) || !Array.isArray(index.plugins)) throw new Error('Invalid catalog');
    const name = index.fields.indexOf('fullName');
    const category = index.fields.indexOf('category');
    const path = index.fields.indexOf('path');
    const npm = index.fields.indexOf('npm');
    if (name < 0 || category < 0 || path < 0 || npm < 0) throw new Error('Unknown catalog fields');
    return index.plugins.filter(Array.isArray).map(row => ({
      name: typeof row[name] === 'string' ? row[name] : '',
      category: typeof row[category] === 'string' ? row[category] : 'other',
      path: typeof row[path] === 'string' ? row[path] : '',
      npm: typeof row[npm] === 'string' ? row[npm] : ''
    })).filter(row => row.name);
  }

  function pluginUrl(plugin) {
    if (/^\/plugins\/[a-z0-9-]+$/i.test(plugin.path)) return `https://dshmarketplace.dev${plugin.path}`;
    const repoName = plugin.name.split('#')[0];
    if (/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repoName)) return `https://github.com/${repoName}`;
    return '';
  }

  function fillCategories() {
    if (!pluginCategory) return;
    const selected = pluginCategory.value;
    const categories = [...new Set(plugins.map(plugin => plugin.category))].sort((a, b) => labelFor(a).localeCompare(labelFor(b)));
    pluginCategory.replaceChildren(new Option('All categories', 'all'));
    categories.forEach(category => pluginCategory.add(new Option(labelFor(category), category)));
    if (categories.includes(selected)) pluginCategory.value = selected;
    setText('[data-plugin-count-number]', plugins.length.toLocaleString('en-US'));
    setText('[data-category-count]', String(categories.length));
    document.querySelectorAll('[data-category-size]').forEach(el => {
      const count = plugins.filter(plugin => plugin.category === el.dataset.categorySize).length;
      el.textContent = count.toLocaleString('en-US');
    });
  }

  function renderPlugins() {
    if (!pluginList) return;
    const query = (pluginSearch?.value || '').trim().toLowerCase();
    const category = pluginCategory?.value || 'all';
    const matches = plugins.filter(plugin =>
      (category === 'all' || plugin.category === category) &&
      (!query || `${plugin.name} ${plugin.npm} ${labelFor(plugin.category)}`.toLowerCase().includes(query))
    );
    const fragment = document.createDocumentFragment();
    for (const plugin of matches.slice(0, visibleCount)) {
      const url = pluginUrl(plugin);
      const row = document.createElement(url ? 'a' : 'div');
      row.className = 'plugin-row';
      if (url) { row.href = url; row.target = '_blank'; row.rel = 'noopener noreferrer'; }
      const title = document.createElement('strong'); title.textContent = plugin.name;
      const type = document.createElement('span'); type.textContent = labelFor(plugin.category);
      const arrow = document.createElement('span'); arrow.textContent = url ? '↗' : '—';
      row.append(title, type, arrow);
      fragment.append(row);
    }
    if (!matches.length) {
      const message = document.createElement('p'); message.className = 'directory-message';
      message.textContent = plugins.length ? 'No plugins match this search.' : 'Catalog unavailable. Explore the community directory using the link below.';
      fragment.append(message);
    }
    pluginList.replaceChildren(fragment);
    if (pluginMore) pluginMore.hidden = visibleCount >= matches.length;
    if (pluginResults) pluginResults.textContent = `${Math.min(visibleCount, matches.length).toLocaleString('en-US')} of ${matches.length.toLocaleString('en-US')} shown`;
    if (pluginCount) pluginCount.textContent = `${plugins.length.toLocaleString('en-US')} listings`;
  }

  pluginSearch?.addEventListener('input', () => { visibleCount = 8; renderPlugins(); });
  pluginCategory?.addEventListener('change', () => { visibleCount = 8; renderPlugins(); });
  pluginMore?.addEventListener('click', () => { visibleCount += 16; renderPlugins(); });
  document.querySelectorAll('[data-category-target]').forEach(button => button.addEventListener('click', () => {
    if (!pluginCategory || !plugins.length) return;
    pluginSearch.value = '';
    pluginCategory.value = button.dataset.categoryTarget;
    visibleCount = 8;
    renderPlugins();
    document.querySelector('.ecosystem-directory')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  async function loadPlugins() {
    try {
      plugins = normalizeIndex(await getJson('./ecosystem-index.json'));
      fillCategories(); renderPlugins();
    } catch { renderPlugins(); }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch('https://dshmarketplace.dev/api/v1/index', { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) return;
      const latest = normalizeIndex(await response.json());
      if (latest.length >= plugins.length) { plugins = latest; fillCategories(); renderPlugins(); }
    } catch { /* The bundled snapshot remains searchable. */ }
  }
  loadPlugins();
})();
