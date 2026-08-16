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

  // Xem toàn bộ danh sách sắp quá hạn trên màn hình Container
  const triggerViewAllUpcoming = async () => {
    switchView('container');
    const filterSelect = document.getElementById('containerFilterSelect');
    if (filterSelect) {
      filterSelect.value = 'upcoming';
      await loadContainerList('upcoming');
    }
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
// VIEW SWITCHER
// =========================================================================
function switchView(viewName) {
  AppState.currentView = viewName;

  // Active classes
  document.querySelectorAll('[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewName);
  });

  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `view-${viewName}`);
  });

  refreshCurrentView();
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
      await loadContainerList(document.getElementById('containerFilterSelect').value);
      await searchContainerHistory(document.getElementById('searchContInput').value.trim() || 'PILU0017000');
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

async function loadYardMatrix() {
  try {
    const res = await fetch(`/api/yard-matrix?date=${AppState.analysisDate}`);
    const data = await res.json();
    const container = document.getElementById('yardHeatmapContainer');
    const tbody = document.querySelector('#tableYardDetail tbody');

    // 8 Block cards
    container.innerHTML = data.blocks.map(block => {
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

      return `
        <div class="yard-block-card">
          <div class="yard-block-top">
            <div>
              <div class="yard-block-code">${block.yard_code}</div>
              <div class="yard-block-name">${block.yard_name}</div>
            </div>
            <span class="yard-status-pill ${pillClass}">${statusText}</span>
          </div>
          <div class="yard-block-metric">
            <span class="yard-util-value">${block.ty_le_su_dung}%</span>
            <span class="yard-cap-detail">${block.suc_chua_da_su_dung} / ${block.suc_chua_toi_da} TEU</span>
          </div>
          <div class="yard-progress-bg">
            <div class="yard-progress-fill ${fillClass}" style="width: ${Math.min(block.ty_le_su_dung, 100)}%"></div>
          </div>
        </div>
      `;
    }).join('');

    // Detail table
    tbody.innerHTML = data.blocks.map(b => `
      <tr>
        <td><strong>${b.yard_code}</strong></td>
        <td>${b.yard_name}</td>
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
