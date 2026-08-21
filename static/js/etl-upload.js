/**
 * ETL-UPLOAD.JS - Bổ sung Browse/Upload CSV cho màn hình ETL demo.
 * Backend /api/etl/run đã hỗ trợ multipart UploadFile; module này chỉ bổ sung UI và wiring frontend.
 */

(function () {
  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function renderEtlResult(data) {
    document.getElementById('etlResultSection').style.display = 'block';
    document.getElementById('etlTotal').textContent = `${Number(data.total_rows || 0).toLocaleString()} dòng`;
    document.getElementById('etlValid').textContent = `${Number(data.valid_rows || 0).toLocaleString()} dòng`;
    document.getElementById('etlError').textContent = `${Number(data.error_rows || 0).toLocaleString()} dòng`;

    const rejected = data.rejected_sample || [];
    const valid = data.valid_sample || [];

    const rejTbody = document.querySelector('#tableEtlRejected tbody');
    rejTbody.innerHTML = rejected.length
      ? rejected.map(r => `
        <tr>
          <td><strong style="color:var(--red)">${r.container_no || '-'}</strong></td>
          <td>${r.container_size || '-'}</td>
          <td><span style="color:var(--red);font-weight:650">${r.error_reason || '-'}</span></td>
        </tr>
      `).join('')
      : '<tr><td colspan="3" style="text-align:center;color:var(--muted)">Không có dòng bị từ chối</td></tr>';

    const valTbody = document.querySelector('#tableEtlValid tbody');
    valTbody.innerHTML = valid.length
      ? valid.map(v => `
        <tr>
          <td><strong style="color:var(--green)">${v.container_no || '-'}</strong></td>
          <td>${v.shipping_line_id ?? '-'}</td>
          <td>${v.yard_area_id ?? '-'}</td>
          <td>${v.container_size ? `${v.container_size}'` : '-'}</td>
          <td>${v.full_empty || '-'}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Không có dòng hợp lệ</td></tr>';

    if (typeof DataGridManager !== 'undefined') {
      DataGridManager.enhanceTable(document.getElementById('tableEtlRejected'));
      DataGridManager.enhanceTable(document.getElementById('tableEtlValid'));
    }
  }

  function initEtlUpload() {
    const sourceSelect = document.getElementById('etlSourceSelect');
    const runButton = document.getElementById('runEtlBtn');
    if (!sourceSelect || !runButton || document.getElementById('etlUploadPanel')) return;

    // Bổ sung nguồn Upload vào select hiện hữu.
    const uploadOption = document.createElement('option');
    uploadOption.value = 'upload';
    uploadOption.textContent = 'Tải lên file CSV từ máy tính (Browse file)';
    sourceSelect.appendChild(uploadOption);

    // Tạo vùng Browse file ngay trong hàng điều khiển ETL.
    const uploadPanel = document.createElement('div');
    uploadPanel.id = 'etlUploadPanel';
    uploadPanel.style.display = 'none';
    uploadPanel.style.alignItems = 'center';
    uploadPanel.style.gap = '8px';
    uploadPanel.style.flex = '1 1 360px';
    uploadPanel.innerHTML = `
      <input
        type="file"
        id="etlFileInput"
        class="form-control"
        accept=".csv,text/csv"
        aria-label="Chọn file CSV để chạy ETL"
        style="min-width:260px;max-width:420px"
      />
      <span id="etlFileInfo" style="font-size:11px;color:var(--muted);white-space:nowrap">Chưa chọn file</span>
    `;
    sourceSelect.insertAdjacentElement('afterend', uploadPanel);

    const fileInput = document.getElementById('etlFileInput');
    const fileInfo = document.getElementById('etlFileInfo');

    const syncUploadState = () => {
      const isUpload = sourceSelect.value === 'upload';
      uploadPanel.style.display = isUpload ? 'flex' : 'none';
      if (!isUpload) {
        fileInput.value = '';
        fileInfo.textContent = 'Chưa chọn file';
      }
    };

    sourceSelect.addEventListener('change', syncUploadState);
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        fileInfo.textContent = 'Chưa chọn file';
        return;
      }
      fileInfo.textContent = `${file.name} • ${formatFileSize(file.size)}`;
    });
    syncUploadState();

    // Giữ nguyên executeEtl cũ cho demo/raw; chỉ mở rộng nhánh upload.
    const originalExecuteEtl = executeEtl;
    executeEtl = async function executeEtlWithUpload(sourceType) {
      if (sourceType !== 'upload') {
        return originalExecuteEtl(sourceType);
      }

      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        showToast('📂 Vui lòng Browse và chọn file CSV trước khi chạy ETL.');
        fileInput.focus();
        return;
      }

      if (!file.name.toLowerCase().endsWith('.csv')) {
        showToast('❌ File tải lên phải có định dạng .csv');
        fileInput.value = '';
        fileInfo.textContent = 'Chưa chọn file';
        return;
      }

      try {
        runButton.disabled = true;
        runButton.textContent = '⏳ Đang xử lý file...';
        showToast(`📤 Đang tải ${file.name} và chạy ETL bằng DuckDB...`);

        const formData = new FormData();
        formData.append('source_type', 'upload');
        formData.append('file', file, file.name);

        const res = await fetch('/api/etl/run', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || `HTTP ${res.status}`);
        }

        renderEtlResult(data);
        showToast(
          `✅ ${file.name}: ${Number(data.valid_rows || 0).toLocaleString()} hợp lệ, ` +
          `${Number(data.error_rows || 0).toLocaleString()} lỗi.`
        );
      } catch (err) {
        console.error('Lỗi ETL upload:', err);
        showToast(`❌ Không thể xử lý file: ${err.message || 'Lỗi ETL upload'}`);
      } finally {
        runButton.disabled = false;
        runButton.textContent = '🚀 Chạy ETL & Phân loại dữ liệu';
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEtlUpload);
  } else {
    initEtlUpload();
  }
})();
