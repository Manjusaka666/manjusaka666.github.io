// map/js/map.js
// 依赖 Leaflet
(function () {
  const STORAGE_KEY = 'my_travel_map_markers_v1';

  const map = L.map('map').setView([20, 0], 2);
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
        icon: layer.options && layer.options.icon && layer.options.icon.options && layer.options.icon.options.html ? layer.options.icon.options.html : '📍',
        title: layer.options && layer.options.title ? layer.options.title : ''
      });
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadMarkers() {
    markers.clearLayers();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const arr = JSON.parse(raw);
      arr.forEach(item => {
        const emoji = extractEmojiFromHtml(item.icon) || '📍';
        const marker = L.marker([item.lat, item.lng], {icon: createEmojiIcon(emoji), title: item.title || ''});
        marker.addTo(markers);
        marker.bindPopup(`<strong>${escapeHtml(item.title || emoji)}</strong><br/><button class="delete-marker">删除</button>`);
        marker.on('popupopen', e => attachDeleteHandler(e.popup, marker));
      });
      refreshPlacesList();
    } catch (e) {
      console.error('加载标记失败', e);
    }
  }

  function attachDeleteHandler(popup, marker) {
    const btn = popup.getElement().querySelector('.delete-marker');
    if (btn) {
      btn.onclick = () => {
        markers.removeLayer(marker);
        saveMarkers();
        refreshPlacesList();
      };
    }
  }

  function extractEmojiFromHtml(html) {
    if (!html) return null;
    // html like <div class="emoji-marker">📍</div>
    const m = html.match(/>([^<]+)</);
    return m ? m[1] : null;
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&"'<>]/g, c => ({'&':'&amp;','"':'&quot;','\'':'&#39;','<':'&lt;','>':'&gt;'}[c]));
  }

  // Add marker at given latlng with emoji and optional title
  function addMarker(latlng, emoji, title) {
    const marker = L.marker(latlng, {icon: createEmojiIcon(emoji), title: title || ''});
    marker.addTo(markers);
    marker.bindPopup(`<strong>${escapeHtml(title || emoji)}</strong><br/><button class="delete-marker">删除</button>`);
    marker.on('popupopen', e => attachDeleteHandler(e.popup, marker));
    saveMarkers();
    refreshPlacesList();
  }

  // UI hooks
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const iconSelect = document.getElementById('icon-select');
  const addMarkerBtn = document.getElementById('add-marker-btn');
  const clearMarkersBtn = document.getElementById('clear-markers-btn');
  const exportBtn = document.getElementById('export-btn');
  const importFile = document.getElementById('import-file');
  const placesList = document.getElementById('places-list');

  function nominatimSearch(q) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`;
    return fetch(url, {headers:{'Accept':'application/json'}}).then(r=>r.json());
  }

  searchBtn.addEventListener('click', () => doSearch());
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    searchBtn.disabled = true;
    nominatimSearch(q).then(results => {
      searchBtn.disabled = false;
      if (!results || results.length === 0) {
        alert('未找到地点');
        return;
      }
      const first = results[0];
      const lat = parseFloat(first.lat);
      const lon = parseFloat(first.lon);
      map.setView([lat, lon], 12);
      addMarker([lat, lon], iconSelect.value, first.display_name);
    }).catch(err => { searchBtn.disabled = false; alert('搜索出错'); console.error(err); });
  }

  addMarkerBtn.addEventListener('click', () => {
    const center = map.getCenter();
    addMarker([center.lat, center.lng], iconSelect.value, '');
  });

  clearMarkersBtn.addEventListener('click', () => {
    if (!confirm('确认清除所有标记？')) return;
    markers.clearLayers();
    saveMarkers();
    refreshPlacesList();
  });

  exportBtn.addEventListener('click', () => {
    const raw = localStorage.getItem(STORAGE_KEY) || '[]';
    const blob = new Blob([raw], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'markers.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  importFile.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(reader.result);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
        loadMarkers();
        alert('导入成功');
      } catch (err) { alert('导入失败：文件格式错误'); }
    };
    reader.readAsText(f);
  });

  function refreshPlacesList() {
    placesList.innerHTML = '';
    const list = [];
    markers.eachLayer(layer => {
      if (!layer.getLatLng) return;
      const latlng = layer.getLatLng();
      const title = layer.options && layer.options.title ? layer.options.title : '';
      const emoji = extractEmojiFromHtml(layer.options.icon.options.html) || '📍';
      list.push({latlng, title, emoji, layer});
    });
    if (list.length === 0) {
      placesList.innerHTML = '<p>还没有标记。你可以搜索并添加标记，或在地图中心添加。</p>';
      return;
    }
    const ul = document.createElement('ul');
    list.forEach((it, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `<button class="goto">${it.emoji}</button> <span class="place-title">${escapeHtml(it.title || `标记 ${idx+1}`)}</span> <button class="del">删除</button>`;
      const gotoBtn = li.querySelector('.goto');
      const delBtn = li.querySelector('.del');
      gotoBtn.onclick = () => { map.setView(it.latlng, 10); it.layer.openPopup(); };
      delBtn.onclick = () => { markers.removeLayer(it.layer); saveMarkers(); refreshPlacesList(); };
      ul.appendChild(li);
    });
    placesList.appendChild(ul);
  }

  // Load on start
  loadMarkers();

})();
