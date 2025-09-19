const STORAGE_KEY = 'travel_map_markers_v3';
const LEGACY_KEYS = ['my_travel_map_markers_v2', 'my_travel_map_markers'];
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const MAP_CSS = '/map/css/map.css';
const DEFAULT_CENTER = [46.2, 6.15];
const DEFAULT_ZOOM = 12;

let activeLeafletJs = LEAFLET_JS;
let activeLeafletCss = LEAFLET_CSS;
let mapCssUrl = MAP_CSS;

const TravelMap = (() => {
  let state = null;
  let leafletPromise = null;

  function ensureState() {
    if (state) return state;
    state = {
      root: null,
      map: null,
      markersLayer: null,
      markerRegistry: new Map(),
      unsubscribers: [],
      centerPreview: null,
      placesList: null,
      searchResultsBox: null,
      searchInput: null,
      searchButton: null,
      iconSelect: null,
      addMarkerButton: null,
      clearMarkersButton: null,
      exportButton: null,
      importInput: null,
      placementToggle: null,
      searchResultData: [],
      saveThrottlerId: null,
      isPlacementMode: false,
      mapClickHandler: null,
    };
    return state;
  }

  function markRootReady(root, status) {
    root.dataset.mapReady = status;
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"'`=\\/]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '`': '&#x60;',
      '=': '&#x3D;',
      '/': '&#x2F;',
    })[char]);
  }

  function setPlacementMode(enabled) {
    const s = ensureState();
    s.isPlacementMode = Boolean(enabled);
    if (s.placementToggle) {
      s.placementToggle.classList.toggle('active', s.isPlacementMode);
      s.placementToggle.textContent = s.isPlacementMode ? '标记模式已开启 (Esc 退出)' : '开启地图标记模式';
    }
    if (s.root) {
      s.root.classList.toggle('map-placement-active', s.isPlacementMode);
    }
  }

  function setAssetConfig(dataset = {}) {
    activeLeafletJs = dataset.leafletJs || LEAFLET_JS;
    activeLeafletCss = dataset.leafletCss || LEAFLET_CSS;
    mapCssUrl = dataset.mapCss || MAP_CSS;
  }

  function loadStylesheet(href, dataAttr) {
    if (document.querySelector(`link[data-${dataAttr}]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset[dataAttr] = 'true';
    document.head.appendChild(link);
  }

  function ensureMapStyles() {
    loadStylesheet(mapCssUrl, 'travelMapCss');
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;

    loadStylesheet(activeLeafletCss, 'travelMapLeafletCss');

    leafletPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = activeLeafletJs;
      script.async = true;
      script.dataset.travelMapLeafletJs = 'true';
      script.onload = () => resolve(window.L);
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return leafletPromise;
  }

  function bind(target, event, handler, options) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(event, handler, options);
    ensureState().unsubscribers.push(() => target.removeEventListener(event, handler, options));
  }

  function throttle(fn, wait = 200) {
    let timer = null;
    let lastArgs;
    return (...args) => {
      lastArgs = args;
      if (!timer) {
        fn(...lastArgs);
        timer = setTimeout(() => {
          timer = null;
          if (lastArgs) fn(...lastArgs);
        }, wait);
      }
    };
  }

  function createEmojiIcon(L, emoji) {
    return L.divIcon({
      className: 'travel-emoji-icon',
      html: `<div class="travel-emoji-marker">${emoji}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });
  }

  function getMarkerMeta(marker) {
    if (!marker.travelMeta) {
      marker.travelMeta = {
        emoji: '📍',
        title: '',
        notes: '',
        date: '',
        photoLink: '',
      };
    }
    return marker.travelMeta;
  }

  function buildPopupHtml(marker) {
    const { title, notes, date, photoLink, emoji } = getMarkerMeta(marker);
    const { lat, lng } = marker.getLatLng();
    const hasPhoto = photoLink && /^https?:\/\//i.test(photoLink);
    const photoHtml = hasPhoto
      ? `<div class="marker-photo"><img src="${escapeHtml(photoLink)}" alt="marker photo" loading="lazy" /></div>`
      : '';

    return `
      <div class="marker-popup" data-marker-id="${marker.travelId}">
        <div class="marker-popup__header">
          <span class="marker-popup__emoji">${emoji}</span>
          <div>
            <h3 class="marker-popup__title">${escapeHtml(title || '未命名地点')}</h3>
            <p class="marker-popup__coords"><span class="lat">${lat.toFixed(6)}</span>, <span class="lng">${lng.toFixed(6)}</span></p>
          </div>
        </div>
        ${photoHtml}
        <div class="marker-popup__field">
          <label>标题</label>
          <input type="text" class="edit-title" value="${escapeHtml(title)}" placeholder="例如 东京塔" />
        </div>
        <div class="marker-popup__field">
          <label>备注</label>
          <textarea class="edit-notes" placeholder="旅途见闻、环境或心情">${escapeHtml(notes)}</textarea>
        </div>
        <div class="marker-popup__field">
          <label>日期</label>
          <input type="date" class="edit-date" value="${escapeHtml(date)}" />
        </div>
        <div class="marker-popup__field">
          <label>照片链接</label>
          <input type="url" class="edit-photo" value="${escapeHtml(photoLink)}" placeholder="https://" />
        </div>
        <div class="marker-popup__actions">
          <button type="button" class="marker-button primary save-edit">保存</button>
          <button type="button" class="marker-button ghost copy-latlng">复制坐标</button>
          <button type="button" class="marker-button danger delete-marker">删除标记</button>
        </div>
      </div>
    `;
  }

  function attachPopupEvents(marker, popup) {
    const root = popup.getElement();
    if (!root) return;

    const remove = () => {
      const s = ensureState();
      s.markersLayer.removeLayer(marker);
      s.markerRegistry.delete(marker.travelId);
      saveMarkers();
      refreshPlacesList();
    };

    const save = () => {
      const meta = getMarkerMeta(marker);
      meta.title = root.querySelector('.edit-title').value.trim();
      meta.notes = root.querySelector('.edit-notes').value.trim();
      meta.date = root.querySelector('.edit-date').value;
      meta.photoLink = root.querySelector('.edit-photo').value.trim();
      marker.setPopupContent(buildPopupHtml(marker));
      marker.once('popupopen', (evt) => attachPopupEvents(marker, evt.popup));
      saveMarkers();
      refreshPlacesList();
    };

    const copy = async () => {
      try {
        const { lat, lng } = marker.getLatLng();
        await navigator.clipboard.writeText(`${lat}, ${lng}`);
        root.querySelector('.copy-latlng').classList.add('copied');
        setTimeout(() => root.querySelector('.copy-latlng').classList.remove('copied'), 1200);
      } catch (err) {
        console.warn('Clipboard copy failed', err);
      }
    };

    bind(root.querySelector('.delete-marker'), 'click', remove);
    bind(root.querySelector('.save-edit'), 'click', save);
    bind(root.querySelector('.copy-latlng'), 'click', copy);
  }

  function registerMarkerEvents(marker) {
    const s = ensureState();
    marker.on('popupopen', (evt) => attachPopupEvents(marker, evt.popup));

    marker.on('drag', () => {
      const popupRoot = marker.getPopup()?.getElement();
      if (popupRoot) {
        popupRoot.querySelector('.lat').textContent = marker.getLatLng().lat.toFixed(6);
        popupRoot.querySelector('.lng').textContent = marker.getLatLng().lng.toFixed(6);
      }
      saveMarkersThrottled();
      updatePlacesListDebounced();
    });

    marker.on('dragend', () => {
      saveMarkers();
      refreshPlacesList();
    });
  }

  function findMarkerById(id) {
    return ensureState().markerRegistry.get(Number(id));
  }

  function addMarker(latlng, emoji, meta = {}) {
    const s = ensureState();
    const L = window.L;
    const marker = L.marker(latlng, {
      icon: createEmojiIcon(L, emoji),
      draggable: true,
    }).addTo(s.markersLayer);

    marker.travelId = L.Util.stamp(marker);
    marker.travelMeta = {
      emoji,
      title: meta.title || '',
      notes: meta.notes || '',
      date: meta.date || '',
      photoLink: meta.photoLink || '',
    };

    marker.bindPopup(buildPopupHtml(marker), { autoClose: false, closeButton: true });
    registerMarkerEvents(marker);

    s.markerRegistry.set(marker.travelId, marker);
    saveMarkers();
    refreshPlacesList();
    return marker;
  }

  function saveMarkers() {
    const s = ensureState();
    const collection = [];
    s.markersLayer.eachLayer((marker) => {
      const { lat, lng } = marker.getLatLng();
      const meta = getMarkerMeta(marker);
      collection.push({
        lat,
        lng,
        emoji: meta.emoji,
        title: meta.title,
        notes: meta.notes,
        date: meta.date,
        photoLink: meta.photoLink,
      });
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
  }

  const saveMarkersThrottled = throttle(saveMarkers, 250);
  const updatePlacesListDebounced = throttle(() => refreshPlacesList(false), 250);

  function loadMarkers() {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const legacyKey of LEGACY_KEYS) {
        const legacy = localStorage.getItem(legacyKey);
        if (legacy) {
          localStorage.setItem(STORAGE_KEY, legacy);
          raw = legacy;
          break;
        }
      }
    }
    if (!raw) return;

    let parsed = [];
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.warn('Failed to parse stored markers', error);
    }
    parsed.forEach((item) => {
      addMarker([item.lat, item.lng], item.emoji || '📍', item);
    });
  }

  function renderSearchResults() {
    const s = ensureState();
    const box = s.searchResultsBox;
    if (!box) return;

    const data = s.searchResultData;
    if (!data.length) {
      box.innerHTML = '<div class="search-empty">未找到匹配的地点，请尝试更精确的关键词。</div>';
      box.classList.remove('hidden');
      return;
    }

    box.innerHTML = `
      <div class="search-results__header">
        <span>找到 ${data.length} 个候选地点</span>
        <button type="button" class="search-results__close" data-action="close-results">关闭</button>
      </div>
      <ul class="search-results__list">
        ${data.map((item, index) => `
          <li>
            <button type="button" class="search-results__item" data-action="select-result" data-index="${index}">
              <span class="search-results__name">${escapeHtml(item.display_name)}</span>
              <span class="search-results__coords">${Number(item.lat).toFixed(5)}, ${Number(item.lon).toFixed(5)}</span>
            </button>
          </li>
        `).join('')}
      </ul>
    `;
    box.classList.remove('hidden');
  }

  async function performSearch() {
    const s = ensureState();
    const query = s.searchInput.value.trim();
    if (!query) return;

    s.searchButton.disabled = true;
    const originalLabel = s.searchButton.dataset.originalLabel || s.searchButton.textContent;
    s.searchButton.dataset.originalLabel = originalLabel;
    s.searchButton.textContent = '搜索中...';

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&accept-language=zh-CN&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
        },
      });
      if (!response.ok) throw new Error('Search failed');
      s.searchResultData = await response.json();
      renderSearchResults();
    } catch (error) {
      console.error('Search error', error);
      s.searchResultsBox.innerHTML = '<div class="search-empty">搜索失败，请稍后重试。</div>';
      s.searchResultsBox.classList.remove('hidden');
    } finally {
      s.searchButton.disabled = false;
      s.searchButton.textContent = s.searchButton.dataset.originalLabel || '搜索';
    }
  }

  function hideSearchResults() {
    const s = ensureState();
    s.searchResultsBox.classList.add('hidden');
    s.searchResultsBox.innerHTML = '';
  }

  function refreshPlacesList(forceFull = true) {
    const s = ensureState();
    if (!s.placesList) return;

    const fragments = [];
    s.markersLayer.eachLayer((marker) => {
      const meta = getMarkerMeta(marker);
      const { lat, lng } = marker.getLatLng();
      const title = meta.title || meta.notes || '未命名地点';
      const subtitleChunks = [];
      if (meta.date) subtitleChunks.push(meta.date);
      subtitleChunks.push(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      const subtitle = subtitleChunks.join(' · ');

      fragments.push(`
        <article class="place-card" data-marker-id="${marker.travelId}">
          <div class="place-card__main">
            <span class="place-card__emoji">${meta.emoji}</span>
            <div>
              <h4 class="place-card__title">${escapeHtml(title)}</h4>
              <p class="place-card__meta">${escapeHtml(subtitle)}</p>
            </div>
          </div>
          <div class="place-card__actions">
            <button type="button" data-action="goto" title="定位">查看</button>
            <button type="button" data-action="edit" title="编辑">编辑</button>
            <button type="button" data-action="delete" title="删除">删除</button>
          </div>
        </article>
      `);
    });

    if (!fragments.length) {
      s.placesList.innerHTML = '<p class="places-empty">还没有标记，尝试搜索或手动添加。</p>';
      return;
    }

    if (forceFull) {
      s.placesList.innerHTML = fragments.join('');
    } else {
      const scrollTop = s.placesList.scrollTop;
      s.placesList.innerHTML = fragments.join('');
      s.placesList.scrollTop = scrollTop;
    }
  }

  function clearMarkers() {
    const s = ensureState();
    s.markersLayer.clearLayers();
    s.markerRegistry.clear();
    saveMarkers();
    refreshPlacesList();
  }

  function updateCenterPreview() {
    const s = ensureState();
    if (!s.centerPreview || !s.map) return;
    const { lat, lng } = s.map.getCenter();
    // s.centerPreview.textContent = `中心 ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }

  function setupEventHandlers() {
    const s = ensureState();

    bind(s.searchButton, 'click', performSearch);
    bind(s.searchInput, 'keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        performSearch();
      }
    });

    bind(s.searchResultsBox, 'click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'close-results') {
        hideSearchResults();
      } else if (action === 'select-result') {
        const index = Number(target.dataset.index);
        const item = s.searchResultData[index];
        if (!item) return;
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        s.map.setView([lat, lng], Math.max(s.map.getZoom(), 12));
        const marker = addMarker([lat, lng], s.iconSelect.value, { title: item.display_name });
        marker.openPopup();
        hideSearchResults();
      }
    });

    bind(s.addMarkerButton, 'click', () => {
      const center = s.map.getCenter();
      const marker = addMarker([center.lat, center.lng], s.iconSelect.value, { title: '' });
      marker.openPopup();
    });

    bind(s.clearMarkersButton, 'click', () => {
      if (s.markersLayer.getLayers().length === 0) return;
      if (window.confirm('确认清除所有标记？')) {
        clearMarkers();
      }
    });

    bind(s.exportButton, 'click', () => {
      const raw = localStorage.getItem(STORAGE_KEY) || '[]';
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'travel-map-markers.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });

    bind(s.importInput, 'change', (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          localStorage.setItem(STORAGE_KEY, reader.result);
          s.markersLayer.clearLayers();
          s.markerRegistry.clear();
          loadMarkers();
        } catch (error) {
          console.error('Import failed', error);
          window.alert('导入失败，请确认文件格式。');
        }
      };
      reader.readAsText(file, 'utf-8');
      event.target.value = '';
    });

    if (s.placementToggle) {
      bind(s.placementToggle, 'click', () => {
        setPlacementMode(!s.isPlacementMode);
      });
    }

    bind(document, 'keydown', (event) => {
      if (event.key === 'Escape' && s.isPlacementMode) {
        setPlacementMode(false);
      }
    });

    bind(window, 'load', () => {
      try {
        s.map?.invalidateSize();
      } catch (error) {
        console.warn('Failed to invalidate map size after load', error);
      }
    });

    bind(s.placesList, 'click', (event) => {
      const actionButton = event.target.closest('[data-action]');
      if (!actionButton) return;
      const card = actionButton.closest('[data-marker-id]');
      if (!card) return;
      const marker = findMarkerById(card.dataset.markerId);
      if (!marker) return;

      const action = actionButton.dataset.action;
      if (action === 'goto') {
        const { lat, lng } = marker.getLatLng();
        s.map.flyTo([lat, lng], Math.max(s.map.getZoom(), 10), { duration: 0.8 });
        marker.openPopup();
      } else if (action === 'edit') {
        marker.openPopup();
      } else if (action === 'delete') {
        s.markersLayer.removeLayer(marker);
        s.markerRegistry.delete(marker.travelId);
        saveMarkers();
        refreshPlacesList();
      }
    });
  }

  function setupMap(root) {
    const s = ensureState();
    s.root = root;
    s.searchInput = root.querySelector('#search-input');
    s.searchButton = root.querySelector('#search-btn');
    s.searchResultsBox = root.querySelector('#search-results');
    s.iconSelect = root.querySelector('#icon-select');
    s.addMarkerButton = root.querySelector('#add-marker-btn');
    s.clearMarkersButton = root.querySelector('#clear-markers-btn');
    s.exportButton = root.querySelector('#export-btn');
    s.importInput = root.querySelector('#import-file');
    s.placesList = root.querySelector('#places-list');
    s.centerPreview = root.querySelector('#map-center-preview');
    s.placementToggle = root.querySelector('#placement-toggle');

    const mapElement = root.querySelector('#map');
    if (!mapElement) return;

    s.map = L.map(mapElement, { scrollWheelZoom: true, dragging: true });
    s.map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(s.map);

    s.markersLayer = L.layerGroup().addTo(s.map);

    const resizeHandler = throttle(() => s.map.invalidateSize(), 150);
    bind(window, 'resize', resizeHandler);

    const moveHandler = updateCenterPreview;
    s.map.on('moveend', moveHandler);
    s.unsubscribers.push(() => {
      try {
        s.map?.off('moveend', moveHandler);
      } catch (error) {
        console.warn('Failed to detach map handler', error);
      }
    });

    s.mapClickHandler = (event) => {
      if (!s.isPlacementMode) return;
      const { lat, lng } = event.latlng;
      const marker = addMarker([lat, lng], s.iconSelect ? s.iconSelect.value : '📍', {});
      marker.openPopup();
    };
    s.map.on('click', s.mapClickHandler);
    s.unsubscribers.push(() => {
      try {
        if (s.map && s.mapClickHandler) {
          s.map.off('click', s.mapClickHandler);
        }
      } catch (error) {
        console.warn('Failed to detach click handler', error);
      }
    });

    setupEventHandlers();
    setPlacementMode(false);
    updateCenterPreview();
    loadMarkers();
    const resizeOnce = () => {
      try {
        s.map?.invalidateSize();
      } catch (error) {
        console.warn('Failed to invalidate map size', error);
      }
    };
    requestAnimationFrame(resizeOnce);
    setTimeout(resizeOnce, 200);
  }

  function destroy() {
    const s = state;
    if (!s || !s.root) return;

    s.unsubscribers.forEach((fn) => {
      try {
        fn();
      } catch (error) {
        console.warn('Failed to remove listener', error);
      }
    });
    s.unsubscribers = [];

    if (s.map) {
      s.map.off();
      s.map.remove();
    }

    s.markerRegistry.clear();
    markRootReady(s.root, '');
    if (s.root) {
      s.root.classList.remove('map-placement-active');
    }
    if (s.placementToggle) {
      s.placementToggle.classList.remove('active');
      s.placementToggle.textContent = '开启地图标记模式';
    }
    s.isPlacementMode = false;

    state = null;
  }

  async function init() {
    const root = document.querySelector('[data-map-page]');
    if (!root) return;

    if (root.dataset.mapReady === 'initializing' || root.dataset.mapReady === 'ready') return;
    markRootReady(root, 'initializing');

    try {
      setAssetConfig(root.dataset || {});
      ensureMapStyles();
      await loadLeaflet();
      setupMap(root);
      markRootReady(root, 'ready');
    } catch (error) {
      console.error('Failed to initialise map page', error);
      markRootReady(root, '');
      const fallback = document.createElement('div');
      fallback.className = 'travel-map-error';
      fallback.textContent = '地图加载失败，请刷新页面或检查网络连接。';
      root.appendChild(fallback);
    }
  }

  return { init, destroy };
})();

window.TravelMap = TravelMap;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => TravelMap.init());
} else {
  TravelMap.init();
}

document.addEventListener('swup:page:view', () => TravelMap.init());
document.addEventListener('swup:visit:start', () => TravelMap.destroy());
