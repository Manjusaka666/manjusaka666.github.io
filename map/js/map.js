// /map/js/map.js
(function () {
  const STORAGE_KEY = 'my_travel_map_markers_v2';

  // ---------- 工具 ----------
  function escapeHtml(str) {
    return (str || '').replace(/[&<>"'`=\/]/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      '`': '&#x60;', '=': '&#x3D;', '/': '&#x2F;'
    })[s]);
  }
  function throttle(fn, wait) {
    let last = 0, timer = null, lastArgs = null;
    return function (...args) {
      const now = Date.now();
      lastArgs = args;
      if (now - last >= wait) {
        last = now; fn.apply(this, args);
      } else if (!timer) {
        timer = setTimeout(() => { last = Date.now(); timer = null; fn.apply(this, lastArgs); }, wait);
      }
    };
  }
  function extractEmojiFromHtml(html) {
    if (!html) return null;
    const m = html.match(/>([^<]+)</);
    return m ? m[1] : null;
  }

  // ---------- 地图 ----------
  const map = L.map('map', { scrollWheelZoom: true }).setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const markers = L.layerGroup().addTo(map);

  function createEmojiIcon(emoji) {
    return L.divIcon({
      className: 'emoji-icon',
      html: '<div class="emoji-marker">' + emoji + '</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });
  }

  function saveMarkers() {
    const data = [];
    markers.eachLayer(layer => {
      if (!layer.getLatLng) return;
      data.push({
        lat: layer.getLatLng().lat,
        lng: layer.getLatLng().lng,
        icon: layer.options?.icon?.options?.html || '📍',
        title: layer.options?.title || '',
        notes: layer.options?.notes || '',
        date: layer.options?.date || '',
        photoLink: layer.options?.photoLink || ''
      });
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  const saveMarkersThrottled = throttle(saveMarkers, 300);

  function createPopupContent(marker, title, notes, date, photoLink) {
    const latlng = marker.getLatLng();
    const hasPhoto = photoLink && /^https?:\/\//i.test(photoLink);
    const imgHtml = hasPhoto ? `<div class="photo-wrap"><a href="${escapeHtml(photoLink)}" target="_blank">查看原图</a><br><img src="${escapeHtml(photoLink)}" alt="photo" loading="lazy"/></div>` : '';
    return `
      <div class="marker-popup">
        <div class="marker-info">
          <strong>${escapeHtml(title || '标记')}</strong><br/>
          <small>经纬度: <span class="lat">${latlng.lat.toFixed(6)}</span>, <span class="lng">${latlng.lng.toFixed(6)}</span></small>
          <button class="copy-latlng">复制</button>
        </div>
        ${imgHtml}
        <div class="marker-edit">
          <label>标题: <input type="text" class="edit-title" value="${escapeHtml(title || '')}" /></label>
          <label>备注: <textarea class="edit-notes">${escapeHtml(notes || '')}</textarea></label>
          <label>日期: <input type="date" class="edit-date" value="${date || ''}" /></label>
          <label>照片链接: <input type="url" class="edit-photo" value="${escapeHtml(photoLink || '')}" /></label>
          <div class="btn-row">
            <button class="save-edit">保存</button>
            <button class="delete-marker danger">删除</button>
          </div>
        </div>
      </div>`;
  }

  function attachPopupHandlers(popup, marker) {
    const root = popup.getElement();
    if (!root) return;
    root.querySelector('.delete-marker').onclick = () => {
      markers.removeLayer(marker); saveMarkers(); refreshPlacesList();
    };
    root.querySelector('.save-edit').onclick = () => {
      marker.options.title = root.querySelector('.edit-title').value || '';
      marker.options.notes = root.querySelector('.edit-notes').value || '';
      marker.options.date = root.querySelector('.edit-date').value || '';
      marker.options.photoLink = root.querySelector('.edit-photo').value || '';
      marker.setPopupContent(createPopupContent(marker, marker.options.title, marker.options.notes, marker.options.date, marker.options.photoLink));
      marker.once('popupopen', e => attachPopupHandlers(e.popup, marker));
      saveMarkers(); refreshPlacesList();
    };
    root.querySelector('.copy-latlng').onclick = async () => {
      const { lat, lng } = marker.getLatLng();
      await navigator.clipboard.writeText(`${lat}, ${lng}`);
    };
  }

  function addMarker(latlng, emoji, title, notes, date, photoLink) {
    const marker = L.marker(latlng, { icon: createEmojiIcon(emoji), title: title || '', draggable: true });
    marker.options.notes = notes || '';
    marker.options.date = date || '';
    marker.options.photoLink = photoLink || '';
    marker.addTo(markers);
    marker.bindPopup(createPopupContent(marker, title, notes, date, photoLink));
    marker.on('popupopen', e => attachPopupHandlers(e.popup, marker));
    marker.on('drag', () => {
      if (marker.isPopupOpen()) {
        const el = marker.getPopup().getElement();
        el.querySelector('.lat').textContent = marker.getLatLng().lat.toFixed(6);
        el.querySelector('.lng').textContent = marker.getLatLng().lng.toFixed(6);
      }
      saveMarkersThrottled();
    });
    marker.on('dragend', () => { saveMarkers(); refreshPlacesList(); });
    saveMarkers(); refreshPlacesList();
  }

  function loadMarkers() {
    markers.clearLayers();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    JSON.parse(raw).forEach(item => {
      const emoji = extractEmojiFromHtml(item.icon) || '📍';
      addMarker([item.lat, item.lng], emoji, item.title, item.notes, item.date, item.photoLink);
    });
  }

  // ---------- 搜索 ----------
  function nominatimSearch(q) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&accept-language=zh-CN&q=${encodeURIComponent(q)}`;
    return fetch(url).then(r => r.json());
  }
  function showSearchResults(results) {
    document.querySelector('.search-results')?.remove();
    const div = document.createElement('div');
    div.className = 'search-results';
    div.innerHTML = '<h3>选择地点：</h3>';
    const ul = document.createElement('ul');
    results.forEach(r => {
      const li = document.createElement('li');
      li.innerHTML = `<button class="select-result">${escapeHtml(r.display_name)}</button>`;
      li.querySelector('button').onclick = () => {
        map.setView([+r.lat, +r.lon], 12);
        addMarker([+r.lat, +r.lon], iconSelect.value, r.display_name);
        div.remove();
      };
      ul.appendChild(li);
    });
    div.appendChild(ul);
    const close = document.createElement('button'); close.textContent = '关闭'; close.onclick = () => div.remove();
    div.appendChild(close); document.body.appendChild(div);
  }

  // ---------- 左侧列表 ----------
  function refreshPlacesList() {
    placesList.innerHTML = '';
    const ul = document.createElement('ul');
    markers.eachLayer(layer => {
      const { lat, lng } = layer.getLatLng();
      const emoji = extractEmojiFromHtml(layer.options.icon.options.html) || '📍';
      const li = document.createElement('li');
      li.innerHTML = `<button class="goto">${emoji}</button> <span class="place-title">${escapeHtml(layer.options.title || '')}</span> <button class="del danger">删除</button>`;
      li.querySelector('.goto').onclick = () => { map.setView([lat, lng], 10); layer.openPopup(); };
      li.querySelector('.del').onclick = () => { markers.removeLayer(layer); saveMarkers(); refreshPlacesList(); };
      ul.appendChild(li);
    });
    if (ul.children.length) placesList.appendChild(ul); else placesList.innerHTML = '<p>还没有标记</p>';
  }

  // ---------- 事件 ----------
  const searchInput = document.getElementById('search-input');
  const searchBtn   = document.getElementById('search-btn');
  const iconSelect  = document.getElementById('icon-select');
  const addMarkerBtn = document.getElementById('add-marker-btn');
  const clearMarkersBtn = document.getElementById('clear-markers-btn');
  const exportBtn = document.getElementById('export-btn');
  const importFile = document.getElementById('import-file');
  const placesList = document.getElementById('places-list');

  function doSearch() {
    const q = searchInput.value.trim(); if (!q) return;
    nominatimSearch(q).then(r => r.length ? showSearchResults(r) : alert('未找到')).catch(() => alert('搜索出错'));
  }
  searchBtn.onclick = doSearch;
  searchInput.onkeydown = e => { if (e.key === 'Enter') doSearch(); };

  addMarkerBtn.onclick = () => addMarker(map.getCenter(), iconSelect.value, '');
  clearMarkersBtn.onclick = () => { if (confirm('确认清除?')) { markers.clearLayers(); saveMarkers(); refreshPlacesList(); } };
  exportBtn.onclick = () => {
    const raw = localStorage.getItem(STORAGE_KEY) || '[]';
    const blob = new Blob([raw], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'markers.json'; a.click(); URL.revokeObjectURL(url);
  };
  importFile.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { try { localStorage.setItem(STORAGE_KEY, reader.result); loadMarkers(); } catch { alert('导入失败'); } };
    reader.readAsText(f);
  };

  // init
  loadMarkers();
})();
