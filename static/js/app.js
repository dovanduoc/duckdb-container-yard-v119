/**
 * APP.JS - Single Page Application State & Event Controller.
 * Kết nối REST API FastAPI và điều khiển 7 phân hệ giao diện thời gian thực.
 */

const AppState = {
  currentView: 'overview',
  analysisDate: '2026-08-14',
  minDate: '2025-08-15',
  maxDate: '2026-08-14',
  yards: [],
  shippingRankingData: [],
  typeRankingData: [],
  showFullShipping: false,
  showFullType: false
};

// =========================================================================
// TOAST NOTIFICATION
// =========================================================================
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// =========================================================================
// INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadMetadata();
  await loadOverviewData();
});

function setupEventListeners() {
  // Navigation switch (Sidebar & Tabs)
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  // Theme Toggle
  document.getElementById('themeBtn').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    try {
      localStorage.setItem('yard-analytics-theme', isDark ? 'dark' : 'light');
    } catch(e) {}
    showToast(isDark ? '🌙 Đã bật chế độ giao diện tối' : '☀️ Đã bật chế độ giao diện sáng');
    // Refresh biểu đồ theo màu theme mới
    refreshCurrentView();
  });

  // Collapse Sidebar
  document.getElementById('collapseBtn').addEventListener('click', () => {
    document.getElementById('app').classList.toggle('collapsed');
  });

  // Refresh Button
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    const icon = document.getElementById('refreshIcon');
    icon.classList.remove('spin');
    void icon.offsetWidth;
    icon.classList.add('spin');
    await refreshCurrentView();
    showToast('🔄 Đã cập nhật lại toàn bộ số liệu thời gian thực!');
  });

  // Auto Refresh khi chọn hoặc thay đổi ngày phân tích (Tự động tải lại 100% không cần bấm Refresh)
  let dateChangeTimer = null;
  const handleDateChange = async (newDate) => {
    if (!newDate) return;
    AppState.analysisDate = newDate;

    // Kích hoạt hiệu ứng quay icon refresh để phản hồi trực quan
    const icon = document.getElementById('refreshIcon');
    if (icon) {
      icon.classList.remove('spin');
      void icon.offsetWidth;
      icon.classList.add('spin');
    }

    showToast(`📅 Tự động cập nhật số liệu ngày: ${newDate}`);
    await refreshCurrentView();
  };

  const dateInput = document.getElementById('analysisDateInput');
  dateInput.addEventListener('change', async (e) => {
    await handleDateChange(e.target.value);
  });
  dateInput.addEventListener('input', (e) => {
    clearTimeout(dateChangeTimer);
    dateChangeTimer = setTimeout(async () => {
      if (e.target.value && e.target.value.length === 10) {
        await handleDateChange(e.target.value);
      }
    }, 200);
  });

  // Toggle View Bảng Hãng tàu (Top 5 <-> Full)
  const toggleShipping = () => {
    AppState.showFullShipping = !AppState.showFullShipping;
    renderOverviewShippingTable();
    showToast(AppState.showFullShipping ? '📊 Đang hiển thị toàn bộ hãng tàu' : '📊 Đang hiển thị Top 5 hãng tàu');
  };
  const shipTopBtn = document.getElementById('toggleShippingViewBtn');
  const shipBottomBtn = document.getElementById('toggleShippingViewBtnBottom');
  if (shipTopBtn) shipTopBtn.addEventListener('click', toggleShipping);
  if (shipBottomBtn) shipBottomBtn.addEventListener('click', toggleShipping);

  // Toggle View Bảng Loại Container (Top 5 <-> Full)
  const toggleType = () => {
    AppState.showFullType = !AppState.showFullType;
    renderOverviewTypeTable();
    showToast(AppState.showFullType ? '▥ Đang hiển thị toàn bộ loại container' : '▥ Đang hiển thị Top 5 loại container');
  };
  const typeTopBtn = document.getElementById('toggleTypeViewBtn');
  const typeBottomBtn = document.getElementById('toggleTypeViewBtnBottom');
  if (typeTopBtn) typeTopBtn.addEventListener('click', toggleType);
  if (typeBottomBtn) typeBottomBtn.addEventListener('click', toggleType);

  // Container Filter
  document.getElementById('containerFilterSelect').addEventListener('change', async (e) => {
    await loadContainerList(e.target.value);
  });

  // Xuất file CSV / Excel danh sách sắp quá hạn từ Dashboard
  const triggerExportUpcoming = () => {
    showToast('📥 Đang xuất danh sách container sắp quá hạn...');
    window.location.href = `/api/containers/export?date=${AppState.analysisDate}&filter_type=upcoming`;
  };
  const expUpTop = document.getElementById('exportUpcomingTopBtn');
  const expUpBottom = document.getElementById('exportUpcomingBottomBtn');
  if (expUpTop) expUpTop.addEventListener('click', triggerExportUpcoming);
  if (expUpBottom) expUpBottom.addEventListener('click', triggerExportUpcoming);

  // Xem toàn bộ danh sách sắp quá hạn trên màn hình Container (Tự động chuyển ngữ cảnh & kích hoạt nạp dữ liệu)
  const triggerViewAllUpcoming = async () => {
    showToast('📦 Đang chuyển sang danh sách Container sắp quá hạn (còn ≤5 ngày)...');
    await switchView('container', { filterType: 'upcoming' });
  };
  const viewUpTop = document.getElementById('viewAllUpcomingTopBtn');
  const viewUpBottom = document.getElementById('viewAllUpcomingBottomBtn');
  if (viewUpTop) viewUpTop.addEventListener('click', triggerViewAllUpcoming);
  if (viewUpBottom) viewUpBottom.addEventListener('click', triggerViewAllUpcoming);

  // Xuất CSV / Excel từ màn hình Container
  const expContBtn = document.getElementById('exportContainerBtn');
  if (expContBtn) {
    expContBtn.addEventListener('click', () => {
      const filterType = document.getElementById('containerFilterSelect').value || 'current';
      showToast(`📥 Đang xuất dữ liệu container (${filterType})...`);
      window.location.href = `/api/containers/export?date=${AppState.analysisDate}&filter_type=${filterType}`;
    });
  }

  // Search Container
  document.getElementById('searchContBtn').addEventListener('click', async () => {
    const no = document.getElementById('searchContInput').value.trim();
    if (no) await searchContainerHistory(no);
  });

  document.getElementById('searchContInput').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const no = e.target.value.trim();
      if (no) await searchContainerHistory(no);
    }
  });

  // Trend Yard Select
  document.getElementById('trendYardSelect').addEventListener('change', async (e) => {
    await loadTrendData(e.target.value);
  });

  // ETL Run Button
  document.getElementById('runEtlBtn').addEventListener('click', async () => {
    const source = document.getElementById('etlSourceSelect').value;
    await executeEtl(source);
  });

  // Benchmark Run Button
  document.getElementById('runBenchmarkBtn').addEventListener('click', async () => {
    const rows = document.getElementById('benchRowsSelect').value;
    await executeBenchmark(rows);
  });
}

// =========================================================================
// VIEW SWITCHER WITH CONTEXT AUTO-PROPAGATION
// =========================================================================
async function switchView(viewName, params = {}) {
  AppState.currentView = viewName;

  // Active classes trên Sidebar và Top Tabs Bar
  document.querySelectorAll('[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewName);
  });

  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `view-${viewName}`);
  });

  // Tự động gán tham số ngữ cảnh trước khi nạp dữ liệu
  if (viewName === 'container') {
    if (params.filterType) {
      const filterSelect = document.getElementById('containerFilterSelect');
      if (filterSelect) {
        filterSelect.value = params.filterType;
      }
    }
    if (params.containerNo) {
      const searchInput = document.getElementById('searchContInput');
      if (searchInput) {
        searchInput.value = params.containerNo;
      }
    }
  } else if (viewName === 'trend') {
    if (params.yardId) {
      const trendSelect = document.getElementById('trendYardSelect');
      if (trendSelect) {
        trendSelect.value = params.yardId;
      }
    }
  }

  // Tự động nạp dữ liệu chính xác theo ngữ cảnh vừa chuyển
  await refreshCurrentView();
}

async function refreshCurrentView() {
  const now = new Date();
  document.getElementById('updateTimeTxt').textContent =
    `Cập nhật lúc ${now.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})} • ${now.toLocaleDateString('vi-VN')}`;

  switch (AppState.currentView) {
    case 'overview':
      await loadOverviewData();
      break;
    case 'yard':
      await loadYardMatrix();
      break;
    case 'container':
      const currentFilter = document.getElementById('containerFilterSelect').value || 'current';
      const currentSearch = document.getElementById('searchContInput').value.trim() || 'PILU0017000';
      await loadContainerList(currentFilter);
      await searchContainerHistory(currentSearch);
      break;
    case 'trend':
      await loadTrendData(document.getElementById('trendYardSelect').value);
      break;
    case 'ranking':
      await loadRankingData();
      break;
    default:
      break;
  }
}

// =========================================================================
// API CALLS & DATA LOADERS
// =========================================================================
async function loadMetadata() {
  try {
    const res = await fetch('/api/meta');
    const data = await res.json();
    const cleanMinDate = String(data.min_date || '2025-08-15').slice(0, 10);
    const cleanMaxDate = String(data.max_date || '2026-08-14').slice(0, 10);

    AppState.minDate = cleanMinDate;
    AppState.maxDate = cleanMaxDate;
    AppState.analysisDate = cleanMaxDate;
    AppState.yards = data.yards;

    const dateInput = document.getElementById('analysisDateInput');
    if (dateInput) {
      dateInput.min = cleanMinDate;
      dateInput.max = cleanMaxDate;
      dateInput.value = cleanMaxDate;
    }
  } catch (err) {
    console.error('Lỗi khi nạp metadata:', err);
  }
}

async function loadOverviewData() {
  try {
    const res = await fetch(`/api/overview?date=${AppState.analysisDate}`);
    const data = await res.json();

    if (data.selected_date) {
      const cleanDate = String(data.selected_date).slice(0, 10);
      const dateInput = document.getElementById('analysisDateInput');
      if (dateInput && dateInput.value !== cleanDate) {
        dateInput.value = cleanDate;
      }
    }

    // 4 KPI Cards
    document.getElementById('kpiContCount').textContent = (data.kpi_cards.current_containers || 0).toLocaleString();
    document.getElementById('kpiTotalTeu').textContent = Math.round(data.kpi_cards.total_teu || 0).toLocaleString() + ' TEU';
    document.getElementById('kpiOverdueCount').textContent = (data.kpi_cards.overdue_containers || 0).toLocaleString();
    document.getElementById('kpiAvgDwell').textContent = data.kpi_cards.avg_dwell_days || 0;
    document.getElementById('kpiOverloadedCount').textContent = data.kpi_cards.overloaded_yards_count || 0;
    document.getElementById('kpiHighestYard').textContent = `${data.kpi_cards.highest_yard_name} (${data.kpi_cards.highest_utilization}%)`;

    // Lưu dữ liệu bảng xếp hạng
    AppState.shippingRankingData = data.shipping_ranking || [];
    AppState.typeRankingData = data.container_type_ranking || [];

    // Charts (luôn vẽ Top 5 gọn gàng cho đồ họa)
    ChartManager.renderOverviewShipping('chartOverviewShipping', AppState.shippingRankingData.slice(0, 5));
    ChartManager.renderOverviewType('chartOverviewType', AppState.typeRankingData.slice(0, 5));

    // Dynamic Data Grid Tables (mặc định Top 5, có nút bấm xem Full)
    renderOverviewShippingTable();
    renderOverviewTypeTable();

    // Overload alerts (Hiển thị trực quan mức lấp đầy & click chuyển sang Sơ đồ 2D)
    const alertList = document.getElementById('overviewOverloadList');
    if (data.overloaded_yards && data.overloaded_yards.length > 0) {
      alertList.innerHTML = data.overloaded_yards.map(item => `
        <div class="alert-item" style="cursor:pointer" onclick="switchView('yard')" title="Nhấn để xem chi tiết trên Sơ đồ 2D">
          <div class="alert-dot ${item.ty_le_su_dung >= 95 ? 'red' : 'amber'}">!</div>
          <div style="flex:1;min-width:0">
            <div class="alert-title">
              <span style="font-weight:750">${item.yard_code} - ${item.yard_name}</span>
              <span class="pill ${item.ty_le_su_dung >= 95 ? 'pill-over' : 'pill-warn'}">${item.ty_le_su_dung >= 95 ? 'QUÁ TẢI' : 'CẢNH BÁO'} ${item.ty_le_su_dung}%</span>
            </div>
            <div class="alert-sub">Sức chứa: <strong>${item.suc_chua_da_su_dung}</strong> / ${item.suc_chua_toi_da} TEU</div>
            <div style="background:var(--surface-2);height:4px;border-radius:2px;overflow:hidden;margin-top:4px">
              <div style="background:${item.ty_le_su_dung >= 95 ? 'var(--red)' : 'var(--amber)'};height:100%;width:${Math.min(item.ty_le_su_dung, 100)}%"></div>
            </div>
          </div>
        </div>
      `).join('');
    } else {
      alertList.innerHTML = '<div style="font-size:11px;color:var(--green);padding:8px">✅ Không có khu vực bãi nào bị quá tải!</div>';
    }

    // Upcoming alerts (Hiển thị thời gian lưu bãi & click truy vết lộ trình)
    const upcomingList = document.getElementById('overviewUpcomingList');
    if (data.upcoming_overdue && data.upcoming_overdue.length > 0) {
      upcomingList.innerHTML = data.upcoming_overdue.map(item => `
        <div class="alert-item" style="cursor:pointer" onclick="searchContainerHistory('${item.container_no}');switchView('container')" title="Nhấn để tra cứu lộ trình container">
          <div class="alert-dot info">⏳</div>
          <div style="flex:1;min-width:0">
            <div class="alert-title">
              <span style="color:var(--primary);font-weight:800">${item.container_no}</span>
              <span style="font-size:10px;color:var(--amber);font-weight:800;background:rgba(245,158,11,0.12);padding:2px 6px;border-radius:4px">Còn ${item.remaining_days} ngày</span>
            </div>
            <div class="alert-sub">Bãi ${item.yard_code} • Hãng ${item.shipping_line_code} • Đã lưu ${item.dwell_days}/30 ngày</div>
            <div style="background:var(--surface-2);height:4px;border-radius:2px;overflow:hidden;margin-top:4px">
              <div style="background:var(--amber);height:100%;width:${Math.min((item.dwell_days / 30) * 100, 100)}%"></div>
            </div>
          </div>
        </div>
      `).join('');
    } else {
      upcomingList.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px">Không có container nào sắp quá hạn.</div>';
    }

  } catch (err) {
    console.error('Lỗi khi nạp dữ liệu overview:', err);
  }
}

function renderOverviewShippingTable() {
  const data = AppState.shippingRankingData || [];
  const total = data.length;
  const isFull = AppState.showFullShipping;
  const displayData = isFull ? data : data.slice(0, 5);

  const shipTbody = document.querySelector('#tableOverviewShipping tbody');
  if (!shipTbody) return;

  if (displayData.length === 0) {
    shipTbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Không có dữ liệu</td></tr>';
    return;
  }

  shipTbody.innerHTML = displayData.map((row, idx) => `
    <tr>
      <td><strong>${row.ranking || idx + 1}</strong></td>
      <td><span style="font-weight:750;color:var(--primary)">${row.shipping_line_code}</span></td>
      <td>${row.shipping_line_name}</td>
      <td>${(row.current_container_count || 0).toLocaleString()}</td>
      <td><strong>${(row.total_teu || 0).toLocaleString()}</strong></td>
    </tr>
  `).join('');

  // Cập nhật text nút bấm header & footer
  const topTxt = document.getElementById('shippingToggleTxt');
  const topBtn = document.getElementById('toggleShippingViewBtn');
  const bottomBtn = document.getElementById('toggleShippingViewBtnBottom');

  if (topTxt) topTxt.textContent = isFull ? 'Thu gọn (Top 5)' : `Xem tất cả (${total})`;
  if (topBtn) topBtn.classList.toggle('expanded', isFull);
  if (bottomBtn) bottomBtn.textContent = isFull ? '▲ Thu gọn về Top 5' : `Xem toàn bộ ${total} hãng tàu ➔`;
}

function renderOverviewTypeTable() {
  const data = AppState.typeRankingData || [];
  const total = data.length;
  const isFull = AppState.showFullType;
  const displayData = isFull ? data : data.slice(0, 5);

  const typeTbody = document.querySelector('#tableOverviewType tbody');
  if (!typeTbody) return;

  if (displayData.length === 0) {
    typeTbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Không có dữ liệu</td></tr>';
    return;
  }

  typeTbody.innerHTML = displayData.map((row, idx) => `
    <tr>
      <td><strong>${row.ranking || idx + 1}</strong></td>
      <td><strong>${row.container_type}</strong></td>
      <td>${(row.current_container_count || 0).toLocaleString()}</td>
      <td>${(row.total_teu || 0).toLocaleString()}</td>
      <td><span class="up">${row.teu_percentage}%</span></td>
    </tr>
  `).join('');

  // Cập nhật text nút bấm header & footer
  const topTxt = document.getElementById('typeToggleTxt');
  const topBtn = document.getElementById('toggleTypeViewBtn');
  const bottomBtn = document.getElementById('toggleTypeViewBtnBottom');

  if (topTxt) topTxt.textContent = isFull ? 'Thu gọn (Top 5)' : `Xem tất cả (${total})`;
  if (topBtn) topBtn.classList.toggle('expanded', isFull);
  if (bottomBtn) bottomBtn.textContent = isFull ? '▲ Thu gọn về Top 5' : `Xem toàn bộ ${total} loại container ➔`;
}

let cachedYardBlocks = [];
let digitalTwinLoaded = false;

async function loadYardMatrix() {
  try {
    const res = await fetch(`/api/yard-matrix?date=${AppState.analysisDate}`);
    const data = await res.json();
    cachedYardBlocks = data.blocks || [];
    const container = document.getElementById('yardHeatmapContainer');
    const tbody = document.querySelector('#tableYardDetail tbody');

    // 1. Render Sơ Đồ Không Gian Mặt Bằng Khu B (Terminal B) 8 Block B1 - B8 Vector SVG
    renderCatLaiSvgMap(cachedYardBlocks);

    // 2. Cập nhật Bản Đồ Số 160ha nếu đã nạp hoặc nạp sẵn
    await initDigitalTwinMap(cachedYardBlocks);

    // 3. Render 8 Block cards chi tiết của Khu B
    container.innerHTML = cachedYardBlocks.map(block => {
      let pillClass = 'pill-safe';
      let fillClass = 'fill-safe';
      let statusText = 'AN TOÀN';

      if (block.ty_le_su_dung >= 95) {
        pillClass = 'pill-over'; fillClass = 'fill-over'; statusText = 'QUÁ TẢI';
      } else if (block.ty_le_su_dung >= 85) {
        pillClass = 'pill-warn'; fillClass = 'fill-warn'; statusText = 'CẢNH BÁO';
      } else if (block.ty_le_su_dung >= 70) {
        pillClass = 'pill-high'; fillClass = 'fill-high'; statusText = 'MỨC CAO';
      }

      const displayCode = block.block_code || block.yard_code;
      const displayName = block.terminal_block_name || block.yard_name;
      const subTxt = block.block_sub || 'Terminal B • Cát Lái';

      return `
        <div class="yard-block-card" style="cursor:pointer" onclick="switchView('container')" title="Nhấn để xem danh sách container tại ${displayCode}">
          <div class="yard-block-top">
            <div>
              <div class="yard-block-code" style="color:var(--primary)">${displayCode}</div>
              <div class="yard-block-name" style="font-weight:700">${displayName}</div>
              <div style="font-size:9.5px;color:var(--muted);margin-top:2px">${subTxt}</div>
            </div>
            <span class="yard-status-pill ${pillClass}">${statusText}</span>
          </div>
          <div class="yard-block-metric">
            <span class="yard-util-value">${block.ty_le_su_dung}%</span>
            <span class="yard-cap-detail">${block.suc_chua_da_su_dung.toLocaleString()} / ${block.suc_chua_toi_da.toLocaleString()} TEU</span>
          </div>
          <div class="yard-progress-bg">
            <div class="yard-progress-fill ${fillClass}" style="width: ${Math.min(block.ty_le_su_dung, 100)}%"></div>
          </div>
        </div>
      `;
    }).join('');

    // 4. Render Bảng Chi Tiết 8 Block Khu B
    tbody.innerHTML = cachedYardBlocks.map(b => `
      <tr>
        <td><strong style="color:var(--primary)">${b.block_code || b.yard_code}</strong></td>
        <td><strong>${b.terminal_block_name || b.yard_name}</strong></td>
        <td>${b.suc_chua_toi_da.toLocaleString()}</td>
        <td><strong>${b.suc_chua_da_su_dung.toLocaleString()}</strong></td>
        <td><strong>${b.ty_le_su_dung}%</strong></td>
        <td><span class="yard-status-pill ${b.ty_le_su_dung >= 95 ? 'pill-over' : b.ty_le_su_dung >= 85 ? 'pill-warn' : 'pill-safe'}">${b.trang_thai_su_dung}</span></td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Lỗi khi nạp yard matrix:', err);
  }
}

function renderCatLaiSvgMap(blocks) {
  const svg = document.getElementById('catlaiSvgMap');
  const tooltip = document.getElementById('catlaiMapTooltip');
  if (!svg) return;

  const blockMap = {};
  blocks.forEach(b => { blockMap[b.yard_code] = b; });

  // 8 Block bãi của Khu B (Terminal B)
  const yardLayout = [
    { code: 'YA01', blockCode: 'BLOCK B1', blockName: 'Block B1 - Hàng Xuất Dãy 1', sub: 'B1.1 - B1.4 • RTG 6+1', x: 40, y: 110, w: 200, h: 100 },
    { code: 'YA02', blockCode: 'BLOCK B2', blockName: 'Block B2 - Hàng Xuất Dãy 2', sub: 'B2.1 - B2.6 • RTG 6+1', x: 260, y: 110, w: 210, h: 100 },
    { code: 'YA03', blockCode: 'BLOCK B3', blockName: 'Block B3 - Bãi Reefer Lạnh', sub: 'R_B1 - R_B4 • Cắm lạnh', x: 490, y: 110, w: 200, h: 100 },
    { code: 'YA04', blockCode: 'BLOCK B4', blockName: 'Block B4 - Cont Tuyến Á-Âu', sub: 'B4.1 - B4.6 • Quốc Tế', x: 710, y: 110, w: 210, h: 100 },
    { code: 'YA05', blockCode: 'BLOCK B5', blockName: 'Block B5 - Cont Tuyến Nội Địa', sub: 'B5.1 - B5.6 • Nội Địa', x: 40, y: 240, w: 200, h: 100 },
    { code: 'YA06', blockCode: 'BLOCK B6', blockName: 'Block B6 - Bãi Chuyển Tải', sub: 'B6.1 - B6.4 • Chuyển Tải', x: 260, y: 240, w: 210, h: 100 },
    { code: 'YA07', blockCode: 'BLOCK B7', blockName: 'Block B7 - Hàng DG / OOG', sub: 'B7.1 - B7.4 • Quá Khổ', x: 490, y: 240, w: 200, h: 100 },
    { code: 'YA08', blockCode: 'BLOCK B8', blockName: 'Block B8 - Bãi Đệm Cổng B', sub: 'B8.1 - B8.4 • Đệm Cổng B', x: 710, y: 240, w: 210, h: 100 }
  ];

  const getColorScheme = (util) => {
    if (util >= 95) return { fill: '#FEF2F2', stroke: '#EF4444', text: '#B91C1C', pill: '#EF4444', label: 'QUÁ TẢI' };
    if (util >= 85) return { fill: '#FFFBEB', stroke: '#F59E0B', text: '#B45309', pill: '#F59E0B', label: 'CẢNH BÁO' };
    if (util >= 70) return { fill: '#F0F9FF', stroke: '#0284C7', text: '#0369A1', pill: '#0284C7', label: 'MỨC CAO' };
    return { fill: '#ECFDF5', stroke: '#10B981', text: '#047857', pill: '#10B981', label: 'AN TOÀN' };
  };

  let blocksSvg = yardLayout.map(layout => {
    const data = blockMap[layout.code] || {
      yard_name: layout.blockName,
      ty_le_su_dung: 0,
      suc_chua_da_su_dung: 0,
      suc_chua_toi_da: 1000,
      trang_thai_su_dung: 'AN TOÀN'
    };
    const c = getColorScheme(data.ty_le_su_dung);
    const isOver = data.ty_le_su_dung >= 95;
    const progressWidth = Math.min((layout.w - 24) * (data.ty_le_su_dung / 100), layout.w - 24);
    const displayBlockCode = layout.blockCode;
    const displayBlockName = layout.blockName;

    return `
      <g class="catlai-block-group ${isOver ? 'pulse' : ''}" data-yard-code="${layout.code}" data-block-code="${displayBlockCode}" data-yard-name="${displayBlockName}" data-util="${data.ty_le_su_dung}" data-used="${data.suc_chua_da_su_dung}" data-max="${data.suc_chua_toi_da}" data-status="${data.trang_thai_su_dung}" transform="translate(${layout.x}, ${layout.y})">
        <rect class="catlai-block-bg" x="0" y="0" width="${layout.w}" height="${layout.h}" rx="8" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.8" />
        <text x="12" y="22" font-size="12.5" font-weight="900" fill="#0F172A">${displayBlockCode}</text>
        <rect x="${layout.w - 76}" y="10" width="64" height="18" rx="4" fill="${c.pill}" opacity="0.15" />
        <text x="${layout.w - 44}" y="23" font-size="9.5" font-weight="800" fill="${c.text}" text-anchor="middle">${c.label}</text>
        <text x="12" y="40" font-size="10.5" font-weight="750" fill="#334155">${displayBlockName}</text>
        <text x="12" y="54" font-size="9.5" fill="#64748B">${layout.sub}</text>
        <text x="12" y="74" font-size="16" font-weight="850" fill="${c.text}">${data.ty_le_su_dung}%</text>
        <text x="${layout.w - 12}" y="74" font-size="10.5" font-weight="700" fill="#475569" text-anchor="end">${data.suc_chua_da_su_dung.toLocaleString()} / ${data.suc_chua_toi_da.toLocaleString()} TEU</text>
        <rect x="12" y="82" width="${layout.w - 24}" height="5" rx="2.5" fill="#E2E8F0" />
        <rect x="12" y="82" width="${Math.max(progressWidth, 4)}" height="5" rx="2.5" fill="${c.stroke}" />
      </g>
    `;
  }).join('');

  svg.innerHTML = `
    <defs>
      <linearGradient id="riverGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0284C7" stop-opacity="0.25" />
        <stop offset="50%" stop-color="#38BDF8" stop-opacity="0.35" />
        <stop offset="100%" stop-color="#0284C7" stop-opacity="0.25" />
      </linearGradient>
      <linearGradient id="wharfGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#475569" />
        <stop offset="100%" stop-color="#334155" />
      </linearGradient>
    </defs>

    <!-- Sông Đồng Nai -->
    <rect x="0" y="0" width="960" height="90" fill="url(#riverGrad)" />
    <text x="50" y="28" font-size="12" font-weight="900" fill="#0369A1" letter-spacing="1">⚓ SÔNG ĐỒNG NAI (LUỒNG HÀNG HẢI CẢNG CÁT LÁI - SNP)</text>

    <!-- Tàu Container -->
    <g transform="translate(140, 20)">
      <path d="M 0 15 L 20 0 L 160 0 L 175 15 L 160 30 L 20 30 Z" fill="#1E293B" stroke="#0F172A" stroke-width="1" />
      <rect x="30" y="4" width="22" height="10" fill="#38BDF8" rx="1" /><rect x="56" y="4" width="22" height="10" fill="#EF4444" rx="1" /><rect x="82" y="4" width="22" height="10" fill="#10B981" rx="1" /><rect x="108" y="4" width="22" height="10" fill="#F59E0B" rx="1" />
      <text x="145" y="20" font-size="8.5" font-weight="900" fill="#FFFFFF" text-anchor="middle">MAERSK</text>
    </g>
    <g transform="translate(580, 20)">
      <path d="M 0 15 L 20 0 L 170 0 L 185 15 L 170 30 L 20 30 Z" fill="#1E293B" stroke="#0F172A" stroke-width="1" />
      <rect x="30" y="4" width="22" height="10" fill="#EF4444" rx="1" /><rect x="56" y="4" width="22" height="10" fill="#38BDF8" rx="1" /><rect x="82" y="4" width="22" height="10" fill="#F59E0B" rx="1" /><rect x="108" y="4" width="22" height="10" fill="#10B981" rx="1" />
      <text x="150" y="20" font-size="8.5" font-weight="900" fill="#FFFFFF" text-anchor="middle">COSCO</text>
    </g>

    <!-- Cầu Tàu Berths 1-8 -->
    <g transform="translate(30, 68)">
      <rect x="0" y="0" width="900" height="24" rx="3" fill="url(#wharfGrad)" />
      <text x="60" y="16" font-size="10" font-weight="900" fill="#FFFFFF">BERTH 1</text><text x="175" y="16" font-size="10" font-weight="900" fill="#FFFFFF">BERTH 2</text><text x="285" y="16" font-size="10" font-weight="900" fill="#FFFFFF">BERTH 3</text><text x="395" y="16" font-size="10" font-weight="900" fill="#FFFFFF">BERTH 4</text><text x="505" y="16" font-size="10" font-weight="900" fill="#FFFFFF">BERTH 5</text><text x="615" y="16" font-size="10" font-weight="900" fill="#FFFFFF">BERTH 6</text><text x="725" y="16" font-size="10" font-weight="900" fill="#FFFFFF">BERTH 7</text><text x="835" y="16" font-size="10" font-weight="900" fill="#FFFFFF">BERTH 8</text>
      <!-- Cẩu Bờ STS -->
      <g transform="translate(180, -14)"><rect x="0" y="0" width="12" height="14" fill="#F59E0B" rx="1"/><line x1="6" y1="-8" x2="6" y2="0" stroke="#F59E0B" stroke-width="3"/><text x="6" y="10" font-size="7" font-weight="850" fill="#000" text-anchor="middle">QC1</text></g>
      <g transform="translate(250, -14)"><rect x="0" y="0" width="12" height="14" fill="#F59E0B" rx="1"/><line x1="6" y1="-8" x2="6" y2="0" stroke="#F59E0B" stroke-width="3"/><text x="6" y="10" font-size="7" font-weight="850" fill="#000" text-anchor="middle">QC2</text></g>
      <g transform="translate(620, -14)"><rect x="0" y="0" width="12" height="14" fill="#F59E0B" rx="1"/><line x1="6" y1="-8" x2="6" y2="0" stroke="#F59E0B" stroke-width="3"/><text x="6" y="10" font-size="7" font-weight="850" fill="#000" text-anchor="middle">QC3</text></g>
      <g transform="translate(700, -14)"><rect x="0" y="0" width="12" height="14" fill="#F59E0B" rx="1"/><line x1="6" y1="-8" x2="6" y2="0" stroke="#F59E0B" stroke-width="3"/><text x="6" y="10" font-size="7" font-weight="850" fill="#000" text-anchor="middle">QC4</text></g>
    </g>

    <!-- Đường nội bộ -->
    <rect x="30" y="96" width="900" height="8" fill="#CBD5E1" rx="2" />
    <rect x="30" y="218" width="900" height="14" fill="#CBD5E1" rx="2" />
    <rect x="30" y="348" width="900" height="12" fill="#CBD5E1" rx="2" />

    <!-- 8 Block Bãi Khu B -->
    ${blocksSvg}

    <!-- Khu Vực Cổng B -->
    <g transform="translate(30, 370)">
      <rect x="0" y="0" width="900" height="105" rx="8" fill="#0F172A" opacity="0.04" />
      <rect x="0" y="0" width="900" height="105" rx="8" fill="none" stroke="#CBD5E1" stroke-width="1" />
      <g transform="translate(40, 14)">
        <rect x="0" y="0" width="380" height="46" rx="6" fill="#1E293B" stroke="#F59E0B" stroke-width="1.5" />
        <text x="190" y="20" font-size="12" font-weight="900" fill="#FBBF24" text-anchor="middle">🚧 CỔNG B (GATE 2) • GIAO NHẬN HÀNG XUẤT KHU B</text>
        <text x="190" y="36" font-size="9" fill="#94A3B8" text-anchor="middle">Gate In 8 Làn Tự Động • Trạm Cân Điện Tử 1-4 • Kiểm Hóa Hải Quan</text>
      </g>
      <g transform="translate(440, 14)">
        <rect x="0" y="0" width="420" height="46" rx="6" fill="#0B132B" stroke="#0284C7" stroke-width="1.2" />
        <text x="210" y="20" font-size="11.5" font-weight="900" fill="#38BDF8" text-anchor="middle">🏢 TRUNG TÂM ĐIỀU HÀNH PHÂN KHU B (TERMINAL B OPS)</text>
        <text x="210" y="36" font-size="9" font-weight="700" fill="#10B981" text-anchor="middle">● Kết nối DuckDB Realtime OLAP • Điều phối cẩu RTG Block B1 - B8</text>
      </g>
      <g transform="translate(40, 68)">
        <rect x="0" y="0" width="820" height="24" rx="4" fill="#334155" />
        <text x="410" y="16" font-size="10" font-weight="800" fill="#FFFFFF" text-anchor="middle">➔ LUỒNG XE ĐẦU KÉO TỪ 8 BLOCK B1-B8 ➔ RA CỔNG B ➔ TRỤC ĐƯỜNG NGUYỄN THỊ ĐỊNH (VÀNH ĐAI 2)</text>
      </g>
    </g>
  `;

  // Gắn sự kiện Hover & Click cho từng Block
  svg.querySelectorAll('.catlai-block-group').forEach(group => {
    group.addEventListener('mouseenter', (e) => {
      const code = group.dataset.yardCode;
      const bCode = group.dataset.blockCode;
      const name = group.dataset.yardName;
      const util = group.dataset.util;
      const used = Number(group.dataset.used).toLocaleString();
      const max = Number(group.dataset.max).toLocaleString();
      const status = group.dataset.status;

      tooltip.innerHTML = `
        <div class="catlai-tooltip-title">
          <span>${bCode} (${code})</span>
          <span style="color:${util >= 95 ? '#EF4444' : util >= 85 ? '#F59E0B' : '#10B981'}">${util}%</span>
        </div>
        <div style="font-size:11px;color:#E2E8F0;font-weight:700;margin-bottom:4px">${name}</div>
        <div class="catlai-tooltip-row"><span>Phân khu:</span><strong>Khu B (Terminal B)</strong></div>
        <div class="catlai-tooltip-row"><span>Cổng giao nhận:</span><strong>Cổng B (Gate 2)</strong></div>
        <div class="catlai-tooltip-row"><span>Sức chứa tối đa:</span><strong>${max} TEU</strong></div>
        <div class="catlai-tooltip-row"><span>Đã sử dụng:</span><strong>${used} TEU</strong></div>
        <div class="catlai-tooltip-row"><span>Trạng thái:</span><strong>${status}</strong></div>
        <div style="font-size:10px;color:#38BDF8;margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);padding-top:4px;text-align:center">
          👉 Nhấn để lọc danh sách container tại Block này
        </div>
      `;
      tooltip.classList.add('show');
    });

    group.addEventListener('mousemove', (e) => {
      const wrapper = document.querySelector('.catlai-map-wrapper');
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    });

    group.addEventListener('mouseleave', () => {
      tooltip.classList.remove('show');
    });

    group.addEventListener('click', async () => {
      const bCode = group.dataset.blockCode;
      const name = group.dataset.yardName;
      showToast(`📦 Đang xem danh sách container tại ${bCode} (${name})...`);
      await switchView('container');
    });
  });
}

async function initDigitalTwinMap(blocks) {
  const dtContainer = document.getElementById('catlaiDigitalTwinContainer');
  const tooltip = document.getElementById('catlaiMapTooltip');
  if (!dtContainer) return;

  if (!digitalTwinLoaded) {
    try {
      const res = await fetch('/static/img/catlaiport_map_styled.svg');
      const svgText = await res.text();
      dtContainer.innerHTML = svgText;
      digitalTwinLoaded = true;

      // Gắn sự kiện Hover & Click cho 8 Block bãi tương tác trên bản đồ số 160ha
      dtContainer.querySelectorAll('.digital-yard-block').forEach(el => {
        el.addEventListener('mouseenter', (e) => {
          const code = el.dataset.yardCode;
          const bCode = el.dataset.blockCode;
          const name = el.dataset.yardName;
          const sub = el.dataset.sub;
          const util = el.dataset.util || '0';
          const used = Number(el.dataset.used || 0).toLocaleString();
          const max = Number(el.dataset.max || 1000).toLocaleString();
          const status = el.dataset.status || 'AN TOÀN';

          tooltip.innerHTML = `
            <div class="catlai-tooltip-title">
              <span>${bCode} (${code})</span>
              <span style="color:${util >= 95 ? '#EF4444' : util >= 85 ? '#F59E0B' : '#10B981'}">${util}%</span>
            </div>
            <div style="font-size:11px;color:#E2E8F0;font-weight:700;margin-bottom:4px">${name}</div>
            <div style="font-size:10px;color:#94A3B8;margin-bottom:6px">${sub}</div>
            <div class="catlai-tooltip-row"><span>Phân khu:</span><strong>Khu B (Terminal B)</strong></div>
            <div class="catlai-tooltip-row"><span>Cổng giao nhận:</span><strong>Cổng B (Gate 2)</strong></div>
            <div class="catlai-tooltip-row"><span>Sức chứa tối đa:</span><strong>${max} TEU</strong></div>
            <div class="catlai-tooltip-row"><span>Đã sử dụng:</span><strong>${used} TEU</strong></div>
            <div class="catlai-tooltip-row"><span>Trạng thái:</span><strong>${status}</strong></div>
            <div style="font-size:10px;color:#38BDF8;margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);padding-top:4px;text-align:center">
              👉 Nhấn để lọc danh sách container tại Block này
            </div>
          `;
          tooltip.classList.add('show');
        });

        el.addEventListener('mousemove', (e) => {
          const wrapper = document.querySelector('.catlai-map-wrapper');
          if (!wrapper) return;
          const rect = wrapper.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          tooltip.style.left = `${x}px`;
          tooltip.style.top = `${y}px`;
        });

        el.addEventListener('mouseleave', () => {
          tooltip.classList.remove('show');
        });

        el.addEventListener('click', async () => {
          const bCode = el.dataset.blockCode;
          const name = el.dataset.yardName;
          showToast(`📦 Đang xem danh sách container tại ${bCode} (${name})...`);
          await switchView('container');
        });
      });
    } catch (err) {
      console.error('Lỗi khi nạp SVG Digital Twin:', err);
    }
  }

  updateDigitalTwinHeatmap(blocks);
}

function updateDigitalTwinHeatmap(blocks) {
  const dtContainer = document.getElementById('catlaiDigitalTwinContainer');
  if (!dtContainer || !blocks) return;

  blocks.forEach(b => {
    const code = b.yard_code;
    const util = b.ty_le_su_dung;
    const pathEl = dtContainer.querySelector(`#digital-block-${code}`);
    const badgeTxtEl = dtContainer.querySelector(`#badge-txt-${code}`);
    const badgeGroupEl = dtContainer.querySelector(`#badge-${code}`);

    if (pathEl) {
      pathEl.dataset.util = util;
      pathEl.dataset.used = b.suc_chua_da_su_dung;
      pathEl.dataset.max = b.suc_chua_toi_da;
      pathEl.dataset.status = b.trang_thai_su_dung;

      if (util >= 95) {
        pathEl.style.fill = '#EF4444';
        pathEl.style.stroke = '#F87171';
        pathEl.style.fillOpacity = '0.9';
        pathEl.classList.add('pulse');
      } else if (util >= 85) {
        pathEl.style.fill = '#F59E0B';
        pathEl.style.stroke = '#FBBF24';
        pathEl.style.fillOpacity = '0.85';
        pathEl.classList.remove('pulse');
      } else if (util >= 70) {
        pathEl.style.fill = '#0284C7';
        pathEl.style.stroke = '#38BDF8';
        pathEl.style.fillOpacity = '0.8';
        pathEl.classList.remove('pulse');
      } else {
        pathEl.style.fill = '#10B981';
        pathEl.style.stroke = '#34D399';
        pathEl.style.fillOpacity = '0.75';
        pathEl.classList.remove('pulse');
      }
    }

    if (badgeTxtEl) {
      const displayCode = b.block_code ? b.block_code.replace('Block ', 'B') : code;
      badgeTxtEl.textContent = `${displayCode}: ${util}%`;
      badgeTxtEl.setAttribute('fill', util >= 95 ? '#F87171' : util >= 85 ? '#FBBF24' : util >= 70 ? '#38BDF8' : '#34D399');
    }

    if (badgeGroupEl) {
      const rect = badgeGroupEl.querySelector('rect');
      if (rect) {
        rect.setAttribute('stroke', util >= 95 ? '#EF4444' : util >= 85 ? '#F59E0B' : util >= 70 ? '#38BDF8' : '#34D399');
      }
    }
  });
}

function setYardMapMode(mode) {
  const svgMap = document.getElementById('catlaiSvgMap');
  const dtContainer = document.getElementById('catlaiDigitalTwinContainer');
  const title = document.getElementById('yardMapTitle');
  const btnB = document.getElementById('btnModeTerminalB');
  const btnDT = document.getElementById('btnModeDigitalTwin');

  if (mode === 'digital-twin') {
    if (svgMap) svgMap.style.display = 'none';
    if (dtContainer) dtContainer.style.display = 'block';
    if (title) title.innerText = '🗺️ Bản Đồ Số 160ha Cảng Cát Lái (SNP Digital Twin GIS) • Tương Tác 8 Block Khu B & Heatmap Realtime';
    if (btnB) { btnB.className = 'btn btn-secondary btn-sm'; }
    if (btnDT) { btnDT.className = 'btn btn-primary btn-sm'; }
    updateDigitalTwinHeatmap(cachedYardBlocks);
    showToast('🗺️ Đang hiển thị Bản Đồ Số GIS 160ha Cát Lái (Có tương tác Heatmap 8 Block)');
  } else {
    if (svgMap) svgMap.style.display = 'block';
    if (dtContainer) dtContainer.style.display = 'none';
    if (title) title.innerText = '⚓ Sơ Đồ Không Gian Mặt Bằng Phân Khu B (Terminal B - SNP Cát Lái) • 8 Block B1 - B8 Kết Nối Cổng B';
    if (btnB) { btnB.className = 'btn btn-primary btn-sm'; }
    if (btnDT) { btnDT.className = 'btn btn-secondary btn-sm'; }
    showToast('📦 Đang hiển thị Sơ Đồ Điều Hành 8 Block Bãi Phân Khu B');
  }
}

async function loadContainerList(filterType) {
  try {
    const res = await fetch(`/api/containers?date=${AppState.analysisDate}&filter_type=${filterType}&limit=40`);
    const data = await res.json();
    const tbody = document.querySelector('#tableContainerList tbody');

    if (!data.data || data.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">Không tìm thấy container phù hợp</td></tr>';
      return;
    }

    tbody.innerHTML = data.data.map(c => `
      <tr>
        <td><strong style="color:var(--primary)">${c.container_no}</strong></td>
        <td>${c.shipping_line_code || '-'}</td>
        <td>${c.yard_code || '-'}</td>
        <td>${c.container_size || 20}'</td>
        <td>${c.container_type || '-'}</td>
        <td>${c.full_empty || '-'}</td>
        <td>${c.gate_in_ts || '-'}</td>
        <td><strong>${c.dwell_days || 0} ngày</strong></td>
        <td><button class="btn-primary" style="padding:3px 8px;font-size:10px" onclick="searchContainerHistory('${c.container_no}')">Xem lộ trình</button></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Lỗi load container list:', err);
  }
}

async function searchContainerHistory(containerNo) {
  try {
    document.getElementById('searchContInput').value = containerNo;
    const res = await fetch(`/api/containers/history?container_no=${encodeURIComponent(containerNo)}`);
    const data = await res.json();
    const container = document.getElementById('containerTimelineContainer');

    if (!data.found) {
      container.innerHTML = `<div style="padding:14px;color:var(--muted);text-align:center">Không tìm thấy container mang mã số <strong>${containerNo}</strong> trong hệ thống.</div>`;
      return;
    }

    container.innerHTML = `
      <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-size:10px;color:var(--muted);font-weight:750;text-transform:uppercase">CONTAINER NO</span>
          <div style="font-size:15px;font-weight:850;color:var(--primary)">${data.container_no}</div>
        </div>
        <span class="yard-status-pill ${data.status === 'Đang tồn bãi' ? 'pill-safe' : 'pill-high'}">${data.status}</span>
      </div>

      <div class="timeline-stepper">
        ${data.events.map((evt, idx) => `
          <div class="timeline-step">
            <div class="timeline-marker">${idx + 1}</div>
            <div class="timeline-card">
              <div class="timeline-header">
                <span class="timeline-title">${evt.title}</span>
                <span class="timeline-time">${evt.timestamp}</span>
              </div>
              <div class="timeline-desc">${evt.description}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    showToast(`📍 Đã tải lịch sử truy vết của ${containerNo}`);
  } catch (err) {
    console.error('Lỗi khi tra cứu container history:', err);
  }
}

async function loadTrendData(yardId) {
  try {
    const res = await fetch(`/api/trend?yard_id=${yardId}&start_date=${AppState.minDate}&end_date=${AppState.maxDate}`);
    const data = await res.json();

    ChartManager.renderTrendArea('chartTrendArea', data.data);

    const tbody = document.querySelector('#tableTrendHistory tbody');
    tbody.innerHTML = (data.data || []).slice(-30).reverse().map(row => `
      <tr>
        <td><strong>${row.ngay}</strong></td>
        <td>${row.yard_code}</td>
        <td>${row.yard_name}</td>
        <td>${row.suc_chua_toi_da.toLocaleString()}</td>
        <td><strong>${row.suc_chua_da_su_dung.toLocaleString()}</strong></td>
        <td><strong style="color:${row.ty_le_su_dung >= 95 ? 'var(--red)' : 'var(--ink)'}">${row.ty_le_su_dung}%</strong></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Lỗi khi nạp trend:', err);
  }
}

async function loadRankingData() {
  try {
    const res = await fetch(`/api/rankings?date=${AppState.analysisDate}`);
    const data = await res.json();

    ChartManager.renderRankShippingFull('chartRankShipping', data.shipping_lines);
    ChartManager.renderRankTypeFull('chartRankType', data.container_types);

    const shipTbody = document.querySelector('#tableRankShippingFull tbody');
    shipTbody.innerHTML = data.shipping_lines.map(row => `
      <tr>
        <td><strong>${row.ranking}</strong></td>
        <td><strong style="color:var(--primary)">${row.shipping_line_code}</strong></td>
        <td>${row.shipping_line_name}</td>
        <td>${(row.current_container_count || 0).toLocaleString()}</td>
        <td><strong>${(row.total_teu || 0).toLocaleString()}</strong></td>
        <td><span class="up">${row.market_share_percentage}%</span></td>
      </tr>
    `).join('');

    const typeTbody = document.querySelector('#tableRankTypeFull tbody');
    typeTbody.innerHTML = data.container_types.map(row => `
      <tr>
        <td><strong>${row.ranking}</strong></td>
        <td><strong>${row.container_type}</strong></td>
        <td>${(row.current_container_count || 0).toLocaleString()}</td>
        <td><strong>${(row.total_teu || 0).toLocaleString()}</strong></td>
        <td><span class="up">${row.teu_percentage}%</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Lỗi khi nạp rankings:', err);
  }
}

async function executeEtl(sourceType) {
  try {
    showToast('⏳ Đang chạy pipeline ETL phân loại dữ liệu bằng DuckDB...');
    const formData = new FormData();
    formData.append('source_type', sourceType);

    const res = await fetch('/api/etl/run', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    document.getElementById('etlResultSection').style.display = 'block';
    document.getElementById('etlTotal').textContent = data.total_rows.toLocaleString() + ' dòng';
    document.getElementById('etlValid').textContent = data.valid_rows.toLocaleString() + ' dòng';
    document.getElementById('etlError').textContent = data.error_rows.toLocaleString() + ' dòng';

    const rejTbody = document.querySelector('#tableEtlRejected tbody');
    rejTbody.innerHTML = data.rejected_sample.map(r => `
      <tr>
        <td><strong style="color:var(--red)">${r.container_no}</strong></td>
        <td>${r.container_size || '-'}</td>
        <td><span style="color:var(--red);font-weight:650">${r.error_reason}</span></td>
      </tr>
    `).join('');

    const valTbody = document.querySelector('#tableEtlValid tbody');
    valTbody.innerHTML = data.valid_sample.map(v => `
      <tr>
        <td><strong style="color:var(--green)">${v.container_no}</strong></td>
        <td>${v.shipping_line_id}</td>
        <td>${v.yard_area_id}</td>
        <td>${v.container_size}'</td>
        <td>${v.full_empty}</td>
      </tr>
    `).join('');

    showToast(`✅ Đã hoàn thành ETL! ${data.valid_rows} dòng hợp lệ, ${data.error_rows} dòng lỗi.`);
  } catch (err) {
    console.error('Lỗi ETL:', err);
    showToast('❌ Lỗi khi thực hiện ETL!');
  }
}

async function executeBenchmark(rows) {
  try {
    showToast(`⏳ Đang chạy thực nghiệm đo hiệu năng DuckDB ${Number(rows).toLocaleString()} dòng...`);
    const res = await fetch(`/api/benchmark/run?rows=${rows}`);
    const data = await res.json();
    const m = data.metrics;

    document.getElementById('benchResultSection').style.display = 'block';
    document.getElementById('benchRatioSize').textContent = `${m.size_ratio}x`;
    document.getElementById('benchRatioScan').textContent = `${m.speedup_ratio}x`;
    document.getElementById('benchRatioAgg').textContent = `${m.agg_speedup_ratio}x`;

    const tbody = document.querySelector('#tableBenchmarkRun tbody');
    tbody.innerHTML = `
      <tr>
        <td><strong>Dung lượng lưu trữ trên đĩa</strong></td>
        <td>${m.csv_size_mb} MB</td>
        <td><strong>${m.parquet_size_mb} MB</strong></td>
        <td><span class="up">Tiết kiệm ${m.size_ratio}x</span></td>
      </tr>
      <tr>
        <td><strong>Tốc độ quét toàn bộ bảng (Scan)</strong></td>
        <td>${m.csv_scan_s} giây</td>
        <td><strong>${m.parquet_scan_s} giây</strong></td>
        <td><span class="up">Nhanh hơn ${m.speedup_ratio}x</span></td>
      </tr>
      <tr>
        <td><strong>Tốc độ truy vấn tổng hợp (Filter + Group By)</strong></td>
        <td>${m.csv_agg_s} giây</td>
        <td><strong>${m.parquet_agg_s} giây</strong></td>
        <td><span class="up">Nhanh hơn ${m.agg_speedup_ratio}x</span></td>
      </tr>
    `;

    showToast(`✅ Hoàn thành đo hiệu năng DuckDB ${Number(rows).toLocaleString()} dòng!`);
  } catch (err) {
    console.error('Lỗi benchmark:', err);
    showToast('❌ Lỗi khi thực thi benchmark!');
  }
}
