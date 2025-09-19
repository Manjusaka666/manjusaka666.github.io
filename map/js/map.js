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
        title: layer.options && layer.options.title ? layer.options.title : '',
        notes: layer.options && layer.options.notes ? layer.options.notes : '',
        date: layer.options && layer.options.date ? layer.options.date : '',
        photoLink: layer.options && layer.options.photoLink ? layer.options.photoLink : ''
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
        const marker = L.marker([item.lat, item.lng], {icon: createEmojiIcon(emoji), title: item.title || '', draggable: true});
        marker.options.notes = item.notes || '';
        marker.options.date = item.date || '';
        marker.options.photoLink = item.photoLink || '';
        marker.addTo(markers);
        marker.bindPopup(createPopupContent(marker, item.title, item.notes, item.date, item.photoLink));
        marker.on('popupopen', e => attachDeleteHandler(e.popup, marker));
        marker.on('dragend', () => {
          saveMarkers();
          refreshPlacesList();
        });
      });
      refreshPlacesList();
    } catch (e) {
      console.error('加载标记失败', e);
    }
  }

  function attachDeleteHandler(popup, marker) {
    const btn = popup.getElement().querySelector('.delete-marker');
    const saveBtn = popup.getElement().querySelector('.save-edit');
    if (btn) {
      btn.onclick = () => {
        markers.removeLayer(marker);
        saveMarkers();
        refreshPlacesList();
      };
    }
    if (saveBtn) {
      saveBtn.onclick = () => {
        const titleInput = popup.getElement().querySelector('.edit-title');
        const notesInput = popup.getElement().querySelector('.edit-notes');
        const dateInput = popup.getElement().querySelector('.edit-date');
        const photoInput = popup.getElement().querySelector('.edit-photo');
        if (titleInput && notesInput && dateInput && photoInput) {
          marker.options.title = titleInput.value;
          marker.options.notes = notesInput.value;
          marker.options.date = dateInput.value;
          marker.options.photoLink = photoInput.value;
          marker.setPopupContent(createPopupContent(marker, marker.options.title, marker.options.notes, marker.options.date, marker.options.photoLink));
          saveMarkers();
          refreshPlacesList();
        }
      };
    }
  }

  function extractEmojiFromHtml(html) {
    if (!html) return null;
    // html like <div class="emoji-marker">📍</div>
    const m = html.match(/>([^<]+)</);
    return m ? m[1] : null;
  }

  function createPopupContent(marker, title, notes, date, photoLink) {
    const latlng = marker.getLatLng();
    return `
      <div class="marker-popup">
        <div class="marker-info">
          <strong>${escapeHtml(title || '标记')}</strong><br/>
          <small>经纬度: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}</small>
        </div>
        <div class="marker-edit">
          <label>标题: <input type="text" class="edit-title" value="${escapeHtml(title || '')}" /></label><br/>
          <label>备注: <textarea class="edit-notes">${escapeHtml(notes || '')}</textarea></label><br/>
          <label>日期: <input type="date" class="edit-date" value="${date || ''}" /></label><br/>
          <label>照片链接: <input type="url" class="edit-photo" value="${escapeHtml(photoLink || '')}" /></label><br/>
          <button class="save-edit">保存</button>
        </div>
        <button class="delete-marker">删除</button>
      </div>
    `;
  }

  // Add marker at given latlng with emoji and optional title
  function addMarker(latlng, emoji, title, notes, date, photoLink) {
    const marker = L.marker(latlng, {icon: createEmojiIcon(emoji), title: title || '', draggable: true});
    marker.addTo(markers);
    marker.bindPopup(createPopupContent(marker, title, notes, date, photoLink));
    marker.on('popupopen', e => attachDeleteHandler(e.popup, marker));
    marker.on('dragend', () => {
      saveMarkers();
      refreshPlacesList();
    });
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
      showSearchResults(results);
    }).catch(err => { searchBtn.disabled = false; alert('搜索出错'); console.error(err); });
  }

  function showSearchResults(results) {
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'search-results';
    resultsDiv.innerHTML = '<h3>选择地点：</h3>';
    const ul = document.createElement('ul');
    results.slice(0, 5).forEach((result, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `<button class="select-result">${result.display_name}</button>`;
      li.querySelector('.select-result').onclick = () => {
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        map.setView([lat, lon], 12);
        addMarker([lat, lon], iconSelect.value, result.display_name);
        document.body.removeChild(resultsDiv);
      };
      ul.appendChild(li);
    });
    resultsDiv.appendChild(ul);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.onclick = () => document.body.removeChild(resultsDiv);
    resultsDiv.appendChild(closeBtn);
    document.body.appendChild(resultsDiv);
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
