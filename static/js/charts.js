/**
 * CHARTS.JS - Quản lý và vẽ toàn bộ biểu đồ Plotly.js tương tác cao.
 * Đã cấu hình TẮT WATERMARK LOGO ('Produced with Plotly.js') và hỗ trợ Offline 100%.
 */

const ChartManager = {
  isDark() {
    return document.documentElement.classList.contains('dark');
  },

  getThemeColors() {
    const dark = this.isDark();
    return {
      paper_bg: 'transparent',
      plot_bg: 'transparent',
      font_color: dark ? '#F1F5F9' : '#0F172A',
      grid_color: dark ? '#1E2E4E' : '#E2E8F0',
      primary: '#0284C7',
      teal: '#0D9488'
    };
  },

  getDefaultConfig() {
    return {
      responsive: true,
      displaylogo: false, // TẮT HOÀN TOÀN WATERMARK LOGO PLOTLY
      modeBarButtonsToRemove: ['sendDataToCloud', 'lasso2d', 'select2d']
    };
  },

  renderOverviewShipping(containerId, items) {
    if (!items || items.length === 0) return;
    const colors = this.getThemeColors();
    const x = items.map(i => i.shipping_line_code || i.shipping_line_name);
    const y = items.map(i => i.total_teu || 0);

    const trace = {
      x: x,
      y: y,
      type: 'bar',
      marker: {
        color: '#0284C7',
        opacity: 0.9,
        line: { color: '#0369A1', width: 1.5 }
      },
      text: y.map(v => v.toLocaleString() + ' TEU'),
      textposition: 'auto',
      hoverinfo: 'x+y'
    };

    const layout = {
      margin: { t: 15, r: 15, l: 35, b: 30 },
      paper_bgcolor: colors.paper_bg,
      plot_bgcolor: colors.plot_bg,
      font: { family: 'Inter, sans-serif', size: 10, color: colors.font_color },
      xaxis: { gridcolor: colors.grid_color, tickfont: { size: 9.5 } },
      yaxis: { gridcolor: colors.grid_color, tickfont: { size: 9.5 } },
      showlegend: false
    };

    Plotly.react(containerId, [trace], layout, { ...this.getDefaultConfig(), displayModeBar: false });
  },

  renderOverviewType(containerId, items) {
    if (!items || items.length === 0) return;
    const colors = this.getThemeColors();
    const labels = items.map(i => i.container_type);
    const values = items.map(i => i.total_teu || 0);

    const trace = {
      labels: labels,
      values: values,
      type: 'pie',
      hole: 0.55,
      marker: {
        colors: ['#0284C7', '#0D9488', '#7C3AED', '#F59E0B', '#10B981', '#64748B']
      },
      textinfo: 'percent',
      hoverinfo: 'label+value+percent'
    };

    const layout = {
      margin: { t: 10, r: 10, l: 10, b: 10 },
      paper_bgcolor: colors.paper_bg,
      plot_bgcolor: colors.plot_bg,
      font: { family: 'Inter, sans-serif', size: 10, color: colors.font_color },
      showlegend: true,
      legend: { orientation: 'h', y: -0.1, font: { size: 9.5 } }
    };

    Plotly.react(containerId, [trace], layout, { ...this.getDefaultConfig(), displayModeBar: false });
  },

  renderTrendArea(containerId, items) {
    if (!items || items.length === 0) return;
    const colors = this.getThemeColors();
    const x = items.map(i => i.ngay);
    const y = items.map(i => i.ty_le_su_dung || 0);

    const trace = {
      x: x,
      y: y,
      type: 'scatter',
      mode: 'lines',
      fill: 'tozeroy',
      line: { color: '#0284C7', width: 2.5 },
      fillcolor: 'rgba(2, 132, 199, 0.18)',
      hovertemplate: 'Ngày: %{x}<br>Tỷ lệ sử dụng: %{y:.1f}%<extra></extra>'
    };

    const layout = {
      margin: { t: 20, r: 20, l: 40, b: 40 },
      paper_bgcolor: colors.paper_bg,
      plot_bgcolor: colors.plot_bg,
      font: { family: 'Inter, sans-serif', size: 11, color: colors.font_color },
      xaxis: { gridcolor: colors.grid_color, title: 'Ngày phân tích' },
      yaxis: { gridcolor: colors.grid_color, title: 'Tỷ lệ sử dụng (%)', range: [0, 120] },
      showlegend: false
    };

    // Bật ModeBar khi hover nhưng TẮT LOGO PLOTLY
    Plotly.react(containerId, [trace], layout, {
      ...this.getDefaultConfig(),
      displayModeBar: 'hover'
    });
  },

  renderRankShippingFull(containerId, items) {
    if (!items || items.length === 0) return;
    const colors = this.getThemeColors();
    const x = items.map(i => i.shipping_line_code);
    const y = items.map(i => i.total_teu || 0);

    const trace = {
      x: x,
      y: y,
      type: 'bar',
      marker: { color: '#0284C7', opacity: 0.9 },
      text: y.map(v => v.toLocaleString() + ' TEU'),
      textposition: 'auto'
    };

    const layout = {
      margin: { t: 15, r: 15, l: 40, b: 40 },
      paper_bgcolor: colors.paper_bg,
      plot_bgcolor: colors.plot_bg,
      font: { family: 'Inter, sans-serif', size: 11, color: colors.font_color },
      xaxis: { gridcolor: colors.grid_color },
      yaxis: { gridcolor: colors.grid_color, title: 'Tổng sản lượng TEU' }
    };

    Plotly.react(containerId, [trace], layout, { ...this.getDefaultConfig(), displayModeBar: false });
  },

  renderRankTypeFull(containerId, items) {
    if (!items || items.length === 0) return;
    const colors = this.getThemeColors();
    const labels = items.map(i => i.container_type);
    const values = items.map(i => i.total_teu || 0);

    const trace = {
      labels: labels,
      values: values,
      type: 'pie',
      hole: 0.5,
      marker: {
        colors: ['#0284C7', '#0D9488', '#7C3AED', '#F59E0B', '#10B981', '#EC4899', '#64748B']
      },
      textinfo: 'label+percent'
    };

    const layout = {
      margin: { t: 15, r: 15, l: 15, b: 15 },
      paper_bgcolor: colors.paper_bg,
      plot_bgcolor: colors.plot_bg,
      font: { family: 'Inter, sans-serif', size: 11, color: colors.font_color }
    };

    Plotly.react(containerId, [trace], layout, { ...this.getDefaultConfig(), displayModeBar: false });
  }
};
