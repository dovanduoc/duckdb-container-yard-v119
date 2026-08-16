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
// MAPPING 8 BLOCK PHÂN KHU B (TERMINAL B - CÁT LÁI)
// =========================================================================
const BLOCK_INFO_MAP = {
  'YA01': { code: 'B01', name: 'Hàng Xuất Dãy 1', full: 'Block B01 - Hàng Xuất Dãy 1' },
  'YA02': { code: 'B02', name: 'Hàng Xuất Dãy 2', full: 'Block B02 - Hàng Xuất Dãy 2' },
  'YA03': { code: 'B03', name: 'Bãi Reefer Lạnh', full: 'Block B03 - Bãi Reefer Lạnh' },
  'YA04': { code: 'B04', name: 'Cont Tuyến Á-Âu', full: 'Block B04 - Cont Tuyến Á-Âu' },
  'YA05': { code: 'B05', name: 'Cont Tuyến Nội Địa', full: 'Block B05 - Cont Tuyến Nội Địa' },
  'YA06': { code: 'B06', name: 'Bãi Chuyển Tải', full: 'Block B06 - Bãi Chuyển Tải' },
  'YA07': { code: 'B07', name: 'Bãi Hàng DG/OOG', full: 'Block B07 - Bãi Hàng DG/OOG' },
  'YA08': { code: 'B08', name: 'Bãi Đệm Cổng B', full: 'Block B08 - Bãi Đệm Cổng B' },
};

function getBlockCode(yardCode) {
  if (!yardCode) return '-';
  const k = String(yardCode).trim().toUpperCase();
  return BLOCK_INFO_MAP[k] ? BLOCK_INFO_MAP[k].code : yardCode;
}

function getBlockName(yardCode) {
  if (!yardCode) return '-';
  const k = String(yardCode).trim().toUpperCase();
  return BLOCK_INFO_MAP[k] ? BLOCK_INFO_MAP[k].name : yardCode;
}

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
  DataGridManager.init();
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

  // Container Filter (Loại tồn bãi)
  const contFilterSelect = document.getElementById('containerFilterSelect');
  if (contFilterSelect) {
    contFilterSelect.addEventListener('change', async (e) => {
      await loadContainerList(e.target.value);
    });
  }

  // Block Yard Filter (Lọc theo từng Block Bãi B1 - B8)
  const yardFilterSelect = document.getElementById('containerYardFilterSelect');
  if (yardFilterSelect) {
    yardFilterSelect.addEventListener('change', async () => {
      await loadContainerList();
    });
  }

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

  // Xuất CSV / Excel từ màn hình Container (Hỗ trợ xuất đúng Block đang lọc)
  const expContBtn = document.getElementById('exportContainerBtn');
  if (expContBtn) {
    expContBtn.addEventListener('click', () => {
      const filterType = document.getElementById('containerFilterSelect')?.value || 'current';
      const yardCode = document.getElementById('containerYardFilterSelect')?.value || '';
      let url = `/api/containers/export?date=${AppState.analysisDate}&filter_type=${filterType}`;
      if (yardCode) {
        url += `&yard_code=${encodeURIComponent(yardCode)}`;
      }
      showToast(`📥 Đang xuất file dữ liệu container (${filterType}${yardCode ? ' • ' + yardCode : ''})...`);
      window.location.href = url;
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
      await Promise.all([
        loadContainerList(currentFilter),
        searchContainerHistory(currentSearch)
      ]);
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
      alertList.innerHTML = data.overloaded_yards.map(item => {
        const bCode = getBlockCode(item.yard_code);
        const bName = getBlockName(item.yard_code);
        return `
          <div class="alert-item" style="cursor:pointer" onclick="switchView('yard')" title="Nhấn để xem chi tiết trên Sơ đồ 2D">
            <div class="alert-dot ${item.ty_le_su_dung >= 95 ? 'red' : 'amber'}">!</div>
            <div style="flex:1;min-width:0">
              <div class="alert-title">
                <span style="font-weight:750">${bCode} - ${bName}</span>
                <span class="pill ${item.ty_le_su_dung >= 95 ? 'pill-over' : 'pill-warn'}">${item.ty_le_su_dung >= 95 ? 'QUÁ TẢI' : 'CẢNH BÁO'} ${item.ty_le_su_dung}%</span>
              </div>
              <div class="alert-sub">Sức chứa: <strong>${item.suc_chua_da_su_dung}</strong> / ${item.suc_chua_toi_da} TEU</div>
              <div style="background:var(--surface-2);height:4px;border-radius:2px;overflow:hidden;margin-top:4px">
                <div style="background:${item.ty_le_su_dung >= 95 ? 'var(--red)' : 'var(--amber)'};height:100%;width:${Math.min(item.ty_le_su_dung, 100)}%"></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      alertList.innerHTML = '<div style="font-size:11px;color:var(--green);padding:8px">✅ Không có khu vực bãi nào bị quá tải!</div>';
    }

    // Upcoming alerts (Hiển thị thời gian lưu bãi & click truy vết lộ trình)
    const upcomingList = document.getElementById('overviewUpcomingList');
    if (data.upcoming_overdue && data.upcoming_overdue.length > 0) {
      upcomingList.innerHTML = data.upcoming_overdue.map(item => {
        const bCode = getBlockCode(item.yard_code);
        return `
          <div class="alert-item" style="cursor:pointer" onclick="searchContainerHistory('${item.container_no}');switchView('container')" title="Nhấn để tra cứu lộ trình container">
            <div class="alert-dot info">⏳</div>
            <div style="flex:1;min-width:0">
              <div class="alert-title">
                <span style="color:var(--primary);font-weight:800">${item.container_no}</span>
                <span style="font-size:10px;color:var(--amber);font-weight:800;background:rgba(245,158,11,0.12);padding:2px 6px;border-radius:4px">Còn ${item.remaining_days} ngày</span>
              </div>
              <div class="alert-sub"><span class="block-code-badge" style="padding:1px 5px;font-size:10px">${bCode}</span> • Hãng <strong>${item.shipping_line_code}</strong> • Đã lưu <strong>${item.dwell_days}/30</strong> ngày</div>
              <div style="background:var(--surface-2);height:4px;border-radius:2px;overflow:hidden;margin-top:4px">
                <div style="background:var(--amber);height:100%;width:${Math.min((item.dwell_days / 30) * 100, 100)}%"></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
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
  DataGridManager.enhanceTable(document.getElementById('tableOverviewShipping'));
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
  DataGridManager.enhanceTable(document.getElementById('tableOverviewType'));
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

    // 4. Render Bảng Chi Tiết 8 Block Khu B (Terminal B)
    tbody.innerHTML = cachedYardBlocks.map(b => {
      const bCode = b.block_code || getBlockCode(b.yard_code);
      const bName = b.terminal_block_name || b.yard_name;
      return `
        <tr>
          <td><span class="block-code-badge">${bCode}</span></td>
          <td><strong style="color:var(--ink)">${bName}</strong></td>
          <td>${b.suc_chua_toi_da.toLocaleString()} TEU</td>
          <td><strong>${b.suc_chua_da_su_dung.toLocaleString()} TEU</strong></td>
          <td><strong style="color:${b.ty_le_su_dung >= 95 ? 'var(--red)' : b.ty_le_su_dung >= 85 ? 'var(--amber)' : 'var(--primary)'}">${b.ty_le_su_dung}%</strong></td>
          <td><span class="yard-status-pill ${b.ty_le_su_dung >= 95 ? 'pill-over' : b.ty_le_su_dung >= 85 ? 'pill-warn' : 'pill-safe'}">${b.trang_thai_su_dung}</span></td>
          <td style="text-align:center">
            <button class="btn-primary" style="padding:2px 8px;font-size:10.5px" onclick="drillDownToBlock('${b.yard_code}', '${bCode} - ${bName}')" title="Xem danh sách container tại ${bCode}">
              Xem cont
            </button>
          </td>
        </tr>
      `;
    }).join('');

    DataGridManager.enhanceTable(document.getElementById('tableYardDetail'));
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

    group.addEventListener('click', async () => {
      const code = group.dataset.yardCode;
      const name = group.dataset.yardName;
      await drillDownToBlock(code, name);
    });
  });
}

// =========================================================================
// INTERACTIVE PAN & ZOOM + SEMANTIC ZOOMING ENGINE CHO BẢN ĐỒ SỐ 160HA
// =========================================================================
const PanZoomState = {
  scale: 1.0,
  minScale: 0.6,
  maxScale: 6.0,
  x: 0,
  y: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  dragDistance: 0
};

function applyMapTransform(smooth = false) {
  const svg = document.getElementById('catlaiDigitalTwinSvg');
  const indicator = document.getElementById('panzoomScaleIndicator');
  if (!svg) return;

  if (smooth) {
    svg.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
    setTimeout(() => {
      if (svg) svg.style.transition = 'none';
    }, 420);
  } else {
    svg.style.transition = 'none';
  }

  // Áp dụng CSS transform trực tiếp lên thẻ SVG để kéo thả 1:1 theo con trỏ chuột
  svg.style.transformOrigin = 'center center';
  svg.style.transform = `translate(${PanZoomState.x}px, ${PanZoomState.y}px) scale(${PanZoomState.scale})`;
  
  if (indicator) {
    indicator.textContent = `${Math.round(PanZoomState.scale * 100)}%`;
  }
}

function zoomDigitalMap(factor) {
  const newScale = Math.max(PanZoomState.minScale, Math.min(PanZoomState.maxScale, PanZoomState.scale * factor));
  if (newScale === PanZoomState.scale) return;
  PanZoomState.scale = newScale;
  applyMapTransform(true);
}

function resetDigitalMapZoom() {
  PanZoomState.scale = 1.0;
  PanZoomState.x = 0;
  PanZoomState.y = 0;
  applyMapTransform(true);
  showToast('⛶ Đã đưa Bản Đồ Số về góc nhìn toàn cảnh 160ha (Fit View 100%)');
}

function autoCenterYardBlocks() {
  const dtContainer = document.getElementById('catlaiDigitalTwinContainer');
  if (!dtContainer) return;

  const rect = dtContainer.getBoundingClientRect();
  const targetScale = 2.35;
  
  // Tọa độ centroid trung tâm của 8 block Khu B: (cx: 256, cy: 508)
  // Tọa độ tâm viewBox SVG (800x827): (400, 413.5)
  const svgH = 827;
  const svgRatio = rect.height / svgH;
  
  const shiftX = (400 - 256) * svgRatio * targetScale;
  const shiftY = (413.5 - 508) * svgRatio * targetScale;

  PanZoomState.scale = targetScale;
  PanZoomState.x = shiftX;
  PanZoomState.y = shiftY;

  applyMapTransform(true);
  showToast('🎯 Auto Center: Đã tự động focus và căn giữa 8 Block Phân Khu B');
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

      // 1. TÍCH HỢP LĂN CHUỘT ZOOM ĐỘC LẬP BÊN TRONG KHUNG BẢN ĐỒ (KHÔNG ẢNH HƯỞNG TRANG WEB)
      dtContainer.addEventListener('wheel', (e) => {
        e.preventDefault(); // Chặn triệt để cuộn trang web
        e.stopPropagation();

        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
        const newScale = Math.max(PanZoomState.minScale, Math.min(PanZoomState.maxScale, PanZoomState.scale * zoomFactor));

        if (newScale !== PanZoomState.scale) {
          PanZoomState.scale = newScale;
          applyMapTransform();
        }
      }, { passive: false });

      // 2. TÍCH HỢP GIỮ CHUỘT ĐỂ KÉO DI CHUYỂN BẢN ĐỒ (PANNING DRAG & DROP)
      dtContainer.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Chỉ nhận chuột trái
        e.preventDefault(); // Chặn bôi đen text / cuộn màn hình mặc định
        PanZoomState.isDragging = true;
        PanZoomState.startX = e.clientX - PanZoomState.x;
        PanZoomState.startY = e.clientY - PanZoomState.y;
        PanZoomState.dragDistance = 0;
        dtContainer.classList.add('is-dragging');
      });

      window.addEventListener('mousemove', (e) => {
        if (!PanZoomState.isDragging) return;
        e.preventDefault();
        const newX = e.clientX - PanZoomState.startX;
        const newY = e.clientY - PanZoomState.startY;
        PanZoomState.dragDistance += Math.hypot(newX - PanZoomState.x, newY - PanZoomState.y);
        PanZoomState.x = newX;
        PanZoomState.y = newY;
        applyMapTransform();
      });

      window.addEventListener('mouseup', () => {
        if (PanZoomState.isDragging) {
          PanZoomState.isDragging = false;
          dtContainer.classList.remove('is-dragging');
        }
      });

      // 3. GẮN SỰ KIỆN HOVER TOOLTIP & CLICK DRILL-DOWN CHO 8 BLOCK BÃI
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
          // Nếu người dùng vừa kéo Pan bản đồ thì không kích hoạt Drill-Down
          if (PanZoomState.dragDistance > 6) return;

          const code = el.dataset.yardCode;
          const name = el.dataset.yardName;
          await drillDownToBlock(code, name);
        });
      });

      applyMapTransform();
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
        pathEl.style.fillOpacity = '0.75';
        pathEl.classList.remove('pulse');
      } else {
        pathEl.style.fill = '#10B981';
        pathEl.style.stroke = '#34D399';
        pathEl.style.fillOpacity = '0.7';
        pathEl.classList.remove('pulse');
      }
    }
  });
}

let currentMapMode = 'terminal-b';

function toggleYardMapMode() {
  const nextMode = currentMapMode === 'terminal-b' ? 'digital-twin' : 'terminal-b';
  setYardMapMode(nextMode);
}

function setYardMapMode(mode) {
  currentMapMode = mode;
  const svgMap = document.getElementById('catlaiSvgMap');
  const dtContainer = document.getElementById('catlaiDigitalTwinContainer');
  const panzoomToolbar = document.getElementById('mapPanZoomToolbar');
  const title = document.getElementById('yardMapTitle');
  const btnToggle = document.getElementById('btnToggleYardMapMode');
  const iconMapMode = document.getElementById('iconMapMode');

  if (mode === 'digital-twin') {
    if (svgMap) svgMap.style.display = 'none';
    if (dtContainer) dtContainer.style.display = 'block';
    if (panzoomToolbar) panzoomToolbar.style.display = 'flex';
    if (title) title.innerText = '🗺️ Bản Đồ Số 160ha Cảng Cát Lái (SNP Digital Twin GIS) • Lăn chuột/Kéo để Zoom & Pan độc lập';
    if (btnToggle) {
      btnToggle.title = 'Nhấn để chuyển sang Sơ Đồ Logic Phân Khu B';
      btnToggle.style.background = 'var(--primary)';
      btnToggle.style.color = '#FFFFFF';
      btnToggle.style.borderColor = 'var(--primary)';
    }
    if (iconMapMode) {
      iconMapMode.innerHTML = '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect>';
    }
    updateDigitalTwinHeatmap(cachedYardBlocks);
    applyMapTransform();
    showToast('🗺️ Đang hiển thị Bản Đồ Số GIS 160ha (Lăn chuột để Zoom / Kéo chuột để Pan)');
  } else {
    if (svgMap) svgMap.style.display = 'block';
    if (dtContainer) dtContainer.style.display = 'none';
    if (panzoomToolbar) panzoomToolbar.style.display = 'none';
    if (title) title.innerText = '⚓ Sơ Đồ Không Gian Mặt Bằng Phân Khu B (Terminal B - SNP Cát Lái) • 8 Block B1 - B8 Kết Nối Cổng B';
    if (btnToggle) {
      btnToggle.title = 'Nhấn để chuyển sang Bản Đồ Số Thực Địa 160ha';
      btnToggle.style.background = 'var(--surface)';
      btnToggle.style.color = 'var(--ink)';
      btnToggle.style.borderColor = 'var(--line)';
    }
    if (iconMapMode) {
      iconMapMode.innerHTML = '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line>';
    }
    showToast('📦 Đang hiển thị Sơ Đồ Điều Hành 8 Block Bãi Phân Khu B');
  }
}

// =========================================================================
// DRILL-DOWN TỪ MAP SANG DANH SÁCH CONTAINER & BỘ LỌC BLOCK BÃI
// =========================================================================
async function drillDownToBlock(yardCode, blockName) {
  // 1. Chuyển sang View Container
  await switchView('container');

  // 2. Set giá trị cho dropdown filter
  const yardSelect = document.getElementById('containerYardFilterSelect');
  if (yardSelect) {
    yardSelect.value = yardCode || '';
  }

  // 3. Tải danh sách container đã lọc
  await loadContainerList();
  showToast(`📦 Đang lọc container tại: ${blockName || yardCode} (${yardCode})`);
}

async function clearYardBlockFilter() {
  const yardSelect = document.getElementById('containerYardFilterSelect');
  if (yardSelect) {
    yardSelect.value = '';
  }
  const filterBar = document.getElementById('activeYardFilterBar');
  if (filterBar) {
    filterBar.style.display = 'none';
  }
  await loadContainerList();
  showToast('🌐 Đã hiển thị toàn bộ container các bãi cảng Cát Lái');
}

async function loadContainerList(filterType) {
  try {
    if (!filterType) {
      const typeSelect = document.getElementById('containerFilterSelect');
      filterType = typeSelect ? typeSelect.value : 'current';
    }

    const yardSelect = document.getElementById('containerYardFilterSelect');
    const yardCode = yardSelect ? yardSelect.value : '';

    // Cập nhật tiêu đề Card và thanh filter bar linh hoạt theo Block
    const cardTitle = document.getElementById('containerCardTitle');
    const filterBar = document.getElementById('activeYardFilterBar');
    const filterText = document.getElementById('activeYardFilterText');

    if (yardCode) {
      const selectedOpt = yardSelect.options[yardSelect.selectedIndex]?.text || yardCode;
      const blockShortName = selectedOpt.split(' - ')[0].replace('🏗️ ', '').trim();
      
      if (cardTitle) {
        cardTitle.textContent = `📦 Danh Sách Container trong ${blockShortName}`;
      }
      if (filterBar && filterText) {
        filterBar.style.display = 'flex';
        filterText.textContent = `📦 Đang lọc: ${selectedOpt}`;
      }
    } else {
      if (cardTitle) {
        cardTitle.textContent = '📦 Danh Sách Container toàn Bãi';
      }
      if (filterBar) {
        filterBar.style.display = 'none';
      }
    }

    let url = `/api/containers?date=${AppState.analysisDate}&filter_type=${filterType}&limit=50`;
    if (yardCode) {
      url += `&yard_code=${encodeURIComponent(yardCode)}`;
    }

    const res = await fetch(url);
    const data = await res.json();
    const tbody = document.querySelector('#tableContainerList tbody');

    if (!data.data || data.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">Không tìm thấy container nào đang tồn tại bãi <strong>${yardCode || 'này'}</strong> vào ngày ${AppState.analysisDate}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.data.map(c => {
      const bCode = getBlockCode(c.yard_code);
      const isFull = (c.full_empty || 'F').toUpperCase().startsWith('F');
      const dwellDays = Number(c.dwell_days || 0);

      // Trạng thái màu sắc thời gian lưu bãi (Dwell Time)
      let dwellClass = 'safe';
      let dwellIcon = '✓';
      if (dwellDays >= 30) {
        dwellClass = 'danger';
        dwellIcon = '🔥';
      } else if (dwellDays >= 25) {
        dwellClass = 'warning';
        dwellIcon = '⏳';
      }

      // Quy cách ISO & Trạng thái hàng (Size • Type • F/E)
      const specText = `${c.container_size || 20}' ${c.container_type || 'GP'}`;
      const feBadge = `<span class="spec-fe ${isFull ? 'full' : 'empty'}">${isFull ? 'FULL' : 'EMPTY'}</span>`;

      // Định dạng Ngày Vào (DD/MM/YYYY)
      let dateFormatted = '-';
      if (c.gate_in_ts) {
        const d = new Date(c.gate_in_ts);
        if (!isNaN(d.getTime())) {
          dateFormatted = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } else {
          dateFormatted = c.gate_in_ts.substring(0, 10);
        }
      }

      return `
        <tr>
          <td><strong style="font-family:monospace;font-size:12.5px;color:var(--primary)">${c.container_no}</strong></td>
          <td><span class="block-code-badge">${bCode}</span></td>
          <td><strong style="color:var(--ink)">${c.shipping_line_code || '-'}</strong></td>
          <td>
            <span class="dwell-pill ${dwellClass}" title="Đã lưu ${dwellDays} ngày trong bãi cảng">
              ${dwellIcon} ${dwellDays} ngày
            </span>
          </td>
          <td style="color:var(--ink-light);font-size:11.5px">${dateFormatted}</td>
          <td>
            <div class="cont-spec-tag">
              <span>${specText}</span>
              ${feBadge}
            </div>
          </td>
          <td style="text-align:center">
            <button class="btn-primary" style="padding:3px 9px;font-size:10px" onclick="searchContainerHistory('${c.container_no}')" title="Tra cứu lộ trình container">
              Truy vết
            </button>
          </td>
        </tr>
      `;
    }).join('');

    DataGridManager.enhanceTable(document.getElementById('tableContainerList'));
  } catch (err) {
    console.error('Lỗi load container list:', err);
  }
}

async function traceContainerHistory(containerNo) {
  if (!containerNo) return;
  const cleanNo = containerNo.trim().toUpperCase();

  // 1. Chuyển sang tab Container nếu đang ở tab khác
  if (AppState.currentView !== 'container') {
    AppState.currentView = 'container';
    document.querySelectorAll('[data-view]').forEach(el => {
      el.classList.toggle('active', el.dataset.view === 'container');
    });
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'view-container');
    });
    // Tải danh sách container nền song song
    loadContainerList();
  }

  // 2. Tra cứu lịch sử container và cuộn màn hình tới timeline
  await searchContainerHistory(cleanNo, true);
}

async function searchContainerHistory(containerNo, shouldScroll = false) {
  if (!containerNo) return;
  const cleanNo = containerNo.trim().toUpperCase();
  const searchInput = document.getElementById('searchContInput');
  const container = document.getElementById('containerTimelineContainer');

  if (searchInput) {
    searchInput.value = cleanNo;
  }

  if (container) {
    // HIỂN THỊ NGAY LẬP TỨC LOADING STATE (0ms phản hồi)
    container.innerHTML = `
      <div class="timeline-loading-box">
        <div class="spinner-mini"></div>
        <div>Đang truy vết lộ trình & lịch sử container <strong style="color:var(--primary)">${cleanNo}</strong>...</div>
      </div>
    `;
  }

  // Highlight thẻ Card Timeline để người dùng nhận diện ngay vị trí cập nhật
  const timelineCard = container ? container.closest('.card') : null;
  if (timelineCard && shouldScroll) {
    timelineCard.classList.remove('card-highlight-pulse');
    void timelineCard.offsetWidth; // Trigger reflow
    timelineCard.classList.add('card-highlight-pulse');
    timelineCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  try {
    const res = await fetch(`/api/containers/history?container_no=${encodeURIComponent(cleanNo)}`);
    const data = await res.json();
    if (!container) return;

    if (!data.found || !data.events || data.events.length === 0) {
      container.innerHTML = `
        <div style="padding:20px 14px;color:var(--muted);text-align:center;background:var(--surface-2);border-radius:8px;border:1px dashed var(--line)">
          <div style="font-size:24px;margin-bottom:6px">🔍</div>
          <div>Không tìm thấy container mang mã số <strong style="color:var(--ink)">${cleanNo}</strong> trong hệ thống.</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">Vui lòng kiểm tra lại mã số container hoặc chọn một container khác trên bảng.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="timeline-result-header">
        <div>
          <span style="font-size:10px;color:var(--muted);font-weight:750;text-transform:uppercase;letter-spacing:0.5px">CONTAINER NO</span>
          <div style="font-size:16px;font-weight:900;color:var(--primary);font-family:monospace">${data.container_no}</div>
        </div>
        <span class="yard-status-pill ${data.status === 'Đang tồn bãi' ? 'pill-safe' : 'pill-high'}">${data.status || 'Đang tồn bãi'}</span>
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

    showToast(`📍 Đã tải lịch sử truy vết của container ${cleanNo}`);
  } catch (err) {
    console.error('Lỗi khi tra cứu container history:', err);
    if (container) {
      container.innerHTML = `<div style="padding:14px;color:var(--red);text-align:center">❌ Lỗi kết nối khi tra cứu lịch sử container ${cleanNo}</div>`;
    }
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

    DataGridManager.enhanceTable(document.getElementById('tableTrendHistory'));
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

    DataGridManager.enhanceTable(document.getElementById('tableRankShippingFull'));
    DataGridManager.enhanceTable(document.getElementById('tableRankTypeFull'));
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

    DataGridManager.enhanceTable(document.getElementById('tableEtlRejected'));
    DataGridManager.enhanceTable(document.getElementById('tableEtlValid'));

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
    DataGridManager.enhanceTable(document.getElementById('tableBenchmarkRun'));
  } catch (err) {
    console.error('Lỗi benchmark:', err);
    showToast('❌ Lỗi khi thực thi benchmark!');
  }
}

// =========================================================================
// ENTERPRISE DATA GRID ENGINE: COLUMN FILTER & RIGHT-CLICK CONTEXT MENU
// =========================================================================
const DataGridManager = {
  activeContextMenu: null,

  init() {
    this.enhanceAllTables();

    // Lắng nghe đóng menu chuột phải khi click ra ngoài hoặc cuộn trang
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#gridContextMenu')) {
        this.hideContextMenu();
      }
    });
    window.addEventListener('scroll', () => this.hideContextMenu(), true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideContextMenu();
    });

    this.ensureContextMenuElement();
  },

  ensureContextMenuElement() {
    let menu = document.getElementById('gridContextMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'gridContextMenu';
      menu.className = 'grid-context-menu';
      document.body.appendChild(menu);
    }
  },

  enhanceAllTables() {
    document.querySelectorAll('table.data-table').forEach(table => {
      this.enhanceTable(table);
    });
  },

  enhanceTable(table) {
    if (!table) return;

    const thead = table.querySelector('thead');
    if (!thead) return;

    const headerRow = thead.querySelector('tr:first-child');
    if (!headerRow) return;

    const ths = Array.from(headerRow.querySelectorAll('th'));
    if (ths.length === 0) return;

    // 1. Gắn tính năng SẮP XẾP / ORDER THEO CỘT (Sorting) cho dòng tiêu đề đầu tiên
    ths.forEach((th, colIdx) => {
      const colText = th.textContent.trim().toLowerCase();
      // Không gán sort cho cột "#", "Thao tác", "Lộ trình"
      if (colText === '#' || colText.includes('thao tác') || colText.includes('lộ trình')) {
        return;
      }

      th.classList.add('grid-sortable-th');
      th.title = 'Nhấn để sắp xếp Tăng dần / Giảm dần / Mặc định';

      if (!th.querySelector('.grid-sort-icon')) {
        const icon = document.createElement('span');
        icon.className = 'grid-sort-icon';
        icon.textContent = '↕';
        th.appendChild(icon);
      }

      if (!th.dataset.sortBound) {
        th.dataset.sortBound = 'true';
        th.addEventListener('click', (e) => {
          if (e.target.closest('.grid-filter-wrap')) return;
          DataGridManager.toggleSort(table, colIdx);
        });
      }
    });

    // 2. Kiểm tra xem đã có dòng filter-row chưa
    let filterRow = thead.querySelector('.grid-filter-row');
    if (!filterRow) {
      filterRow = document.createElement('tr');
      filterRow.className = 'grid-filter-row';

      ths.forEach((th, colIdx) => {
        const fth = document.createElement('th');
        fth.style.padding = '3px 4px';
        fth.style.background = 'var(--surface-2, #0F172A)';

        const colText = th.textContent.trim().toLowerCase();
        // Không tạo ô filter cho cột "#", "Thao tác", "Lộ trình", "Hạng"
        if (colText === '#' || colText.includes('thao tác') || colText.includes('lộ trình') || colText === 'hạng') {
          fth.innerHTML = `
            <div style="height:24px;display:flex;align-items:center;justify-content:center">
              <button class="btn-clear-table-filter" title="Xóa toàn bộ lọc của bảng này" onclick="DataGridManager.clearFilters(this)">✕ Xóa</button>
            </div>
          `;
        } else {
          const rawTitle = th.textContent.replace(/[↕▲▼*•#]/g, '').trim();
          const shortTitle = rawTitle.length > 14 ? rawTitle.substring(0, 12) + '..' : rawTitle;
          fth.innerHTML = `
            <div class="grid-filter-wrap">
              <input type="text" class="grid-col-filter" placeholder="🔍 ${shortTitle}..." data-col-idx="${colIdx}" oninput="DataGridManager.onFilterInput(this)" />
              <button class="grid-filter-clear-btn" onclick="DataGridManager.clearSingleFilter(this)">×</button>
            </div>
          `;
        }
        filterRow.appendChild(fth);
      });

      thead.appendChild(filterRow);
    }

    // 3. Gắn sự kiện Chuột Phải (Context Menu) cho tbody
    const tbody = table.querySelector('tbody');
    if (tbody && !tbody.dataset.contextBound) {
      tbody.dataset.contextBound = 'true';
      tbody.addEventListener('contextmenu', (e) => {
        const td = e.target.closest('td');
        if (!td) return;

        // Bỏ qua dòng trống không có dữ liệu
        const tr = td.closest('tr');
        if (tr && tr.cells.length === 1 && tr.cells[0].colSpan > 1) return;

        e.preventDefault();
        e.stopPropagation();

        const colIdx = td.cellIndex;
        const th = ths[colIdx];
        const colName = th ? th.textContent.replace(/[↕▲▼*•#]/g, '').trim() : 'Cột này';
        const cellText = td.textContent.trim();

        DataGridManager.showContextMenu(e.clientX, e.clientY, {
          table,
          tr,
          td,
          colIdx,
          colName,
          cellText
        });
      });
    }

    this.applyTableFilters(table);
  },

  toggleSort(table, colIdx) {
    const thead = table.querySelector('thead');
    const headerRow = thead.querySelector('tr:first-child');
    const th = headerRow.querySelectorAll('th')[colIdx];
    if (!th) return;

    let nextDir = 'asc';
    if (th.classList.contains('sorted-asc')) nextDir = 'desc';
    else if (th.classList.contains('sorted-desc')) nextDir = 'none';

    this.sortColumn(table, colIdx, nextDir);
  },

  sortColumn(table, colIdx, direction) {
    const thead = table.querySelector('thead');
    const headerRow = thead.querySelector('tr:first-child');
    const ths = Array.from(headerRow.querySelectorAll('th'));
    const targetTh = ths[colIdx];
    if (!targetTh) return;

    // Reset tất cả icon sorting của các cột khác
    ths.forEach((th) => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      const icon = th.querySelector('.grid-sort-icon');
      if (icon) icon.textContent = '↕';
    });

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => !(r.cells.length === 1 && r.cells[0].colSpan > 1));
    if (rows.length === 0) return;

    if (direction === 'none') {
      // Khôi phục thứ tự ban đầu
      rows.sort((a, b) => (parseInt(a.dataset.origIndex || '0') - parseInt(b.dataset.origIndex || '0')));
    } else {
      // Lưu original index lần đầu
      rows.forEach((r, idx) => {
        if (!r.dataset.origIndex) r.dataset.origIndex = idx;
      });

      const icon = targetTh.querySelector('.grid-sort-icon');
      if (direction === 'asc') {
        targetTh.classList.add('sorted-asc');
        if (icon) icon.textContent = '▲';
      } else {
        targetTh.classList.add('sorted-desc');
        if (icon) icon.textContent = '▼';
      }

      rows.sort((a, b) => {
        const cellA = a.cells[colIdx]?.textContent.trim() || '';
        const cellB = b.cells[colIdx]?.textContent.trim() || '';

        const valA = DataGridManager.parseValueForSort(cellA);
        const valB = DataGridManager.parseValueForSort(cellB);

        let cmp = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          cmp = valA - valB;
        } else if (valA instanceof Date && valB instanceof Date) {
          cmp = valA.getTime() - valB.getTime();
        } else {
          cmp = String(valA).localeCompare(String(valB), 'vi', { numeric: true, sensitivity: 'base' });
        }

        return direction === 'asc' ? cmp : -cmp;
      });
    }

    rows.forEach(r => tbody.appendChild(r));
    this.applyTableFilters(table);

    const colName = targetTh.textContent.replace(/[↕▲▼*•#]/g, '').trim();
    if (direction === 'asc') showToast(`▲ Đã sắp xếp cột [${colName}] Tăng dần (A-Z / 0-9)`);
    else if (direction === 'desc') showToast(`▼ Đã sắp xếp cột [${colName}] Giảm dần (Z-A / 9-0)`);
    else showToast(`↕ Đã trả về thứ tự sắp xếp mặc định`);
  },

  parseValueForSort(str) {
    if (!str) return '';
    const s = str.trim();

    // 1. Nhận diện ngày tháng DD/MM/YYYY
    const dateDmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
    if (dateDmy) return new Date(`${dateDmy[3]}-${dateDmy[2]}-${dateDmy[1]}`);

    // 2. Nhận diện ngày tháng YYYY-MM-DD
    const dateYmd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (dateYmd) return new Date(s);

    // 3. Nhận diện số liệu (vd: "45 ngày", "1,250 TEU", "95.5%", "40'")
    const cleanNum = s.replace(/,/g, '').replace(/[^\d.-]/g, '');
    if (cleanNum !== '' && !isNaN(cleanNum)) {
      return parseFloat(cleanNum);
    }

    return s.toLowerCase();
  },

  onFilterInput(input) {
    const table = input.closest('table');
    if (!table) return;

    const clearBtn = input.nextElementSibling;
    if (clearBtn && clearBtn.classList.contains('grid-filter-clear-btn')) {
      clearBtn.style.display = input.value.trim() ? 'block' : 'none';
    }

    this.applyTableFilters(table);
  },

  clearSingleFilter(btn) {
    const wrap = btn.closest('.grid-filter-wrap');
    if (!wrap) return;
    const input = wrap.querySelector('input');
    if (input) {
      input.value = '';
      btn.style.display = 'none';
      const table = btn.closest('table');
      if (table) this.applyTableFilters(table);
    }
  },

  clearFilters(target) {
    const table = target.closest('table');
    if (!table) return;

    table.querySelectorAll('.grid-col-filter').forEach(inp => {
      inp.value = '';
      const clearBtn = inp.nextElementSibling;
      if (clearBtn && clearBtn.classList.contains('grid-filter-clear-btn')) {
        clearBtn.style.display = 'none';
      }
    });

    this.applyTableFilters(table);
    showToast('🧹 Đã xóa toàn bộ bộ lọc của bảng');
  },

  applyTableFilters(table) {
    if (!table) return;
    const filterInputs = Array.from(table.querySelectorAll('.grid-col-filter'));
    const activeFilters = filterInputs
      .map(inp => ({
        colIdx: parseInt(inp.dataset.colIdx, 10),
        query: inp.value.trim().toLowerCase()
      }))
      .filter(f => f.query !== '');

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    let matchCount = 0;

    rows.forEach(row => {
      if (row.cells.length === 1 && row.cells[0].colSpan > 1) return;

      let isMatch = true;
      for (const filter of activeFilters) {
        const cell = row.cells[filter.colIdx];
        if (!cell) {
          isMatch = false;
          break;
        }
        const cellText = cell.textContent.trim().toLowerCase();
        if (!cellText.includes(filter.query)) {
          isMatch = false;
          break;
        }
      }

      row.style.display = isMatch ? '' : 'none';
      if (isMatch) matchCount++;
    });
  },

  showContextMenu(x, y, context) {
    const menu = document.getElementById('gridContextMenu');
    if (!menu) return;

    const { table, td, colIdx, colName, cellText } = context;
    const cleanCellText = cellText.replace(/\s+/g, ' ').trim();
    const shortText = cleanCellText.length > 20 ? cleanCellText.substring(0, 18) + '...' : cleanCellText;

    const tr = td.closest('tr');

    // 1. Trích xuất mã số container chính xác (quét cả ô hiện tại và các ô trong dòng)
    let resolvedContNo = '';
    const matchDirect = cleanCellText.match(/[A-Z]{4}\d{6,7}/i);
    if (matchDirect) {
      resolvedContNo = matchDirect[0].toUpperCase();
    } else if (tr && tr.cells) {
      for (let cell of tr.cells) {
        const m = (cell.textContent || '').match(/[A-Z]{4}\d{6,7}/i);
        if (m) {
          resolvedContNo = m[0].toUpperCase();
          break;
        }
      }
    }

    // 2. Trích xuất mã block
    let resolvedBlock = '';
    const matchBlock = cleanCellText.match(/^(B0[1-8]|B[1-8]|YA0[1-8])$/i);
    if (matchBlock) {
      resolvedBlock = matchBlock[0].toUpperCase();
    } else if (tr && tr.cells) {
      for (let cell of tr.cells) {
        const mb = (cell.textContent || '').trim().match(/^(B0[1-8]|B[1-8]|YA0[1-8])$/i);
        if (mb) {
          resolvedBlock = mb[0].toUpperCase();
          break;
        }
      }
    }

    let html = `
      <div class="context-menu-header">
        <span class="context-col-tag">${colName}</span>
        <strong class="context-cell-val">${shortText || '(Trống)'}</strong>
      </div>
      <div class="context-menu-divider"></div>
      
      <button class="context-menu-item" onclick="DataGridManager.sortColumn(document.getElementById('${table.id}'), ${colIdx}, 'asc');DataGridManager.hideContextMenu()">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="M11 12h4"/><path d="M11 16h7"/><path d="M11 20h10"/></svg>
        <span>▲ Sắp xếp tăng dần (A ➔ Z / 0 ➔ 9)</span>
      </button>

      <button class="context-menu-item" onclick="DataGridManager.sortColumn(document.getElementById('${table.id}'), ${colIdx}, 'desc');DataGridManager.hideContextMenu()">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/></svg>
        <span>▼ Sắp xếp giảm dần (Z ➔ A / 9 ➔ 0)</span>
      </button>

      <div class="context-menu-divider"></div>

      <button class="context-menu-item" onclick="DataGridManager.filterByValue('${table.id}', ${colIdx}, '${encodeURIComponent(cleanCellText)}')">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <span>🔍 Lọc cột này chứa <strong>"${shortText}"</strong></span>
      </button>

      <button class="context-menu-item" onclick="DataGridManager.copyToClipboard('${encodeURIComponent(cleanCellText)}')">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>📋 Sao chép giá trị ô</span>
      </button>
    `;

    if (resolvedContNo) {
      html += `
        <button class="context-menu-item highlight" onclick="traceContainerHistory('${resolvedContNo}');DataGridManager.hideContextMenu()">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span>📍 Truy vết lộ trình <strong>${resolvedContNo}</strong></span>
        </button>
      `;
    }

    if (resolvedBlock) {
      html += `
        <button class="context-menu-item highlight" onclick="drillDownToBlock('${resolvedBlock}', '${resolvedBlock}');DataGridManager.hideContextMenu()">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon></svg>
          <span>📦 Lọc container tại <strong>${resolvedBlock}</strong></span>
        </button>
      `;
    }

    html += `
      <div class="context-menu-divider"></div>
      <button class="context-menu-item" onclick="DataGridManager.clearFilters(document.getElementById('${table.id}'));DataGridManager.hideContextMenu()">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        <span>🧹 Xóa tất cả bộ lọc của bảng này</span>
      </button>
    `;

    menu.innerHTML = html;
    menu.style.display = 'block';

    const menuRect = menu.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    let posX = x;
    let posY = y;

    if (x + menuRect.width > winW - 10) posX = winW - menuRect.width - 10;
    if (y + menuRect.height > winH - 10) posY = winH - menuRect.height - 10;

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
    this.activeContextMenu = menu;
  },

  hideContextMenu() {
    const menu = document.getElementById('gridContextMenu');
    if (menu) menu.style.display = 'none';
    this.activeContextMenu = null;
  },

  filterByValue(tableId, colIdx, encodedVal) {
    const val = decodeURIComponent(encodedVal).trim();
    const table = document.getElementById(tableId);
    if (!table) return;

    const inp = table.querySelector(`.grid-col-filter[data-col-idx="${colIdx}"]`);
    if (inp) {
      inp.value = val;
      const clearBtn = inp.nextElementSibling;
      if (clearBtn && clearBtn.classList.contains('grid-filter-clear-btn')) {
        clearBtn.style.display = 'block';
      }
      this.applyTableFilters(table);
      showToast(`🔍 Đang lọc cột theo giá trị: "${val}"`);
    }
    this.hideContextMenu();
  },

  copyToClipboard(encodedVal) {
    const val = decodeURIComponent(encodedVal);
    navigator.clipboard.writeText(val).then(() => {
      showToast(`📋 Đã sao chép: "${val}"`);
    }).catch(() => {
      showToast('❌ Không thể sao chép vào clipboard');
    });
    this.hideContextMenu();
  }
};
