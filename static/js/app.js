/**
 * APP.JS - Single Page Application State & Event Controller.
 * Kết nối REST API FastAPI và điều khiển 7 phân hệ giao diện thời gian thực.
 */

const AppState = {
  currentView: 'overview',
  analysisDate: '2026-08-14',
  minDate: '2025-08-15',
  maxDate: '2026-08-14',
  yards: []
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

  // Date Filter Change
  document.getElementById('analysisDateInput').addEventListener('change', async (e) => {
    AppState.analysisDate = e.target.value;
    showToast(`📅 Đang tải dữ liệu ngày: ${AppState.analysisDate}`);
    await refreshCurrentView();
  });

  // Container Filter
  document.getElementById('containerFilterSelect').addEventListener('change', async (e) => {
    await loadContainerList(e.target.value);
  });

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
    AppState.minDate = data.min_date;
    AppState.maxDate = data.max_date;
    AppState.analysisDate = data.max_date;
    AppState.yards = data.yards;

    const dateInput = document.getElementById('analysisDateInput');
    dateInput.value = data.max_date;
    dateInput.min = data.min_date;
    dateInput.max = data.max_date;
  } catch (err) {
    console.error('Lỗi khi nạp metadata:', err);
  }
}

async function loadOverviewData() {
  try {
    const res = await fetch(`/api/overview?date=${AppState.analysisDate}`);
    const data = await res.json();

    // 4 KPI Cards
    document.getElementById('kpiContCount').textContent = (data.kpi_cards.current_containers || 0).toLocaleString();
    document.getElementById('kpiTotalTeu').textContent = Math.round(data.kpi_cards.total_teu || 0).toLocaleString() + ' TEU';
    document.getElementById('kpiOverdueCount').textContent = (data.kpi_cards.overdue_containers || 0).toLocaleString();
    document.getElementById('kpiAvgDwell').textContent = data.kpi_cards.avg_dwell_days || 0;
    document.getElementById('kpiOverloadedCount').textContent = data.kpi_cards.overloaded_yards_count || 0;
    document.getElementById('kpiHighestYard').textContent = `${data.kpi_cards.highest_yard_name} (${data.kpi_cards.highest_utilization}%)`;

    // Charts
    ChartManager.renderOverviewShipping('chartOverviewShipping', data.shipping_ranking);
    ChartManager.renderOverviewType('chartOverviewType', data.container_type_ranking);

    // Tables
    const shipTbody = document.querySelector('#tableOverviewShipping tbody');
    shipTbody.innerHTML = data.shipping_ranking.map((row, idx) => `
      <tr>
        <td><strong>${idx + 1}</strong></td>
        <td><span style="font-weight:750;color:var(--primary)">${row.shipping_line_code}</span></td>
        <td>${row.shipping_line_name}</td>
        <td>${(row.current_container_count || 0).toLocaleString()}</td>
        <td><strong>${(row.total_teu || 0).toLocaleString()}</strong></td>
      </tr>
    `).join('');

    const typeTbody = document.querySelector('#tableOverviewType tbody');
    typeTbody.innerHTML = data.container_type_ranking.map((row, idx) => `
      <tr>
        <td><strong>${idx + 1}</strong></td>
        <td><strong>${row.container_type}</strong></td>
        <td>${(row.current_container_count || 0).toLocaleString()}</td>
        <td>${(row.total_teu || 0).toLocaleString()}</td>
        <td><span class="up">${row.teu_percentage}%</span></td>
      </tr>
    `).join('');

    // Overload alerts
    const alertList = document.getElementById('overviewOverloadList');
    if (data.overloaded_yards && data.overloaded_yards.length > 0) {
      alertList.innerHTML = data.overloaded_yards.map(item => `
        <div class="alert-item">
          <div class="alert-dot">!</div>
          <div>
            <div class="alert-title">
              <span>${item.yard_code} - ${item.yard_name}</span>
              <span class="pill">Quá tải ${item.ty_le_su_dung}%</span>
            </div>
            <div class="alert-sub">Sức chứa: ${item.suc_chua_toi_da} TEU • Hiện tại: ${item.suc_chua_da_su_dung} TEU</div>
          </div>
        </div>
      `).join('');
    } else {
      alertList.innerHTML = '<div style="font-size:11px;color:var(--green);padding:8px">✅ Không có khu vực bãi nào bị quá tải!</div>';
    }

    // Upcoming alerts
    const upcomingList = document.getElementById('overviewUpcomingList');
    if (data.upcoming_overdue && data.upcoming_overdue.length > 0) {
      upcomingList.innerHTML = data.upcoming_overdue.map(item => `
        <div class="alert-item">
          <div class="alert-dot info">⏳</div>
          <div>
            <div class="alert-title">
              <span style="color:var(--primary)">${item.container_no}</span>
              <span style="font-size:9.5px;color:var(--amber);font-weight:750">Còn ${item.remaining_days} ngày</span>
            </div>
            <div class="alert-sub">Bãi ${item.yard_code} • Hãng ${item.shipping_line_code} • Đã lưu ${item.dwell_days} ngày</div>
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
    const res = await fetch(`/api/containers?filter_type=${filterType}&limit=40`);
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
    const res = await fetch('/api/rankings');
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
