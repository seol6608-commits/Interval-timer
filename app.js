/* Interval 1.2 — 6 cohesive themes, offline-first PWA, timer and PiP preview.
   Client-side only. Storage migration from interval.app.v1 keeps prior sessions and records. */
(() => {
  'use strict';

  // Keep the 1.1 storage key so previous local records and running sessions survive upgrades.
  const KEY = 'interval.app.v1.1';
  const THEMES = {
    white: { name:'화이트', desc:'밝고 명료한 기본 테마', bg:'#f3f4f6', shell:'#ffffff', side:'#f9fafb', card:'#ffffff', panel:'#f3f5f7', ink:'#243247', muted:'#7d899a', line:'#e3e8ee', accent:'#e98b50', pale:'#fff0e6', onAccent:'#ffffff', track:'#f7eae2' },
    ivory: { name:'아이보리', desc:'따뜻한 종이 색감', bg:'#f5f0e8', shell:'#fdfbf7', side:'#f4eee2', card:'#fffdf9', panel:'#f0eadf', ink:'#4b443c', muted:'#827568', line:'#e4d9cb', accent:'#b18a64', pale:'#eee0cd', onAccent:'#ffffff', track:'#e9dfd1' },
    sky: { name:'스카이', desc:'청량한 연한 블루', bg:'#eaf3fc', shell:'#f8fbff', side:'#edf5fc', card:'#ffffff', panel:'#e2effa', ink:'#284764', muted:'#617f9a', line:'#ccdeef', accent:'#5b91d5', pale:'#dcecfb', onAccent:'#ffffff', track:'#dce8f5' },
    sage: { name:'세이지', desc:'잔잔한 그린 톤', bg:'#eef5ee', shell:'#fafcf8', side:'#f0f7f0', card:'#ffffff', panel:'#e5efe6', ink:'#365448', muted:'#688074', line:'#d1e0d3', accent:'#71a38b', pale:'#e0f0e4', onAccent:'#173a2d', track:'#daecde' },
    lavender: { name:'라벤더', desc:'부드러운 퍼플 톤', bg:'#f0eef9', shell:'#fcfbff', side:'#f6f3fd', card:'#ffffff', panel:'#ece8fa', ink:'#494061', muted:'#7d7194', line:'#dfd6ee', accent:'#9984c9', pale:'#eee7fa', onAccent:'#ffffff', track:'#e6dff3' },
    peach: { name:'피치', desc:'화사한 살구빛', bg:'#fff0e8', shell:'#fffaf7', side:'#fff3eb', card:'#ffffff', panel:'#fce6d8', ink:'#584239', muted:'#8e756b', line:'#efdace', accent:'#e99370', pale:'#fde5d6', onAccent:'#4c2c1e', track:'#f7e0d2' }
  };
  const themeKeys = Object.keys(THEMES);
  const normalizeTheme = name => Object.prototype.hasOwnProperty.call(THEMES, name) ? name : 'white';
  const activePalette = () => THEMES[normalizeTheme(data.theme)];
  const LEGACY_KEY = 'interval.app.v1';
  const DEFAULTS = [
    { id: 'study', name: '기본 타이머', minutes: 15, repeats: 3 },
    { id: 'break', name: '짧은 휴식', minutes: 5, repeats: 1 },
    { id: 'focus', name: '집중 세션', minutes: 25, repeats: 4 }
  ];
  const $ = id => document.getElementById(id);
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
  const id = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const copyPreset = p => ({ id: p.id, name: p.name, minutes: p.minutes, repeats: p.repeats });
  const safePreset = p => ({
    id: String(p?.id || id()),
    name: String(p?.name || '새 타이머').slice(0, 28),
    minutes: clamp(Math.round(Number(p?.minutes) || 15), 1, 720),
    repeats: clamp(Math.round(Number(p?.repeats) || 1), 1, 99)
  });
  const createFresh = () => ({ presets: DEFAULTS.map(copyPreset), selected: 'study', records: [], session: null, lastResult: null, theme: 'white' });

  function restoreData() {
    let raw, wasLegacy = false;
    try {
      raw = JSON.parse(localStorage.getItem(KEY));
      if (!raw || !Array.isArray(raw.presets)) {
        raw = JSON.parse(localStorage.getItem(LEGACY_KEY));
        wasLegacy = !!(raw && Array.isArray(raw.presets));
      }
    } catch (_) { raw = null; }
    if (!raw || !Array.isArray(raw.presets)) return { data: createFresh(), migrated: false };

    const presets = raw.presets.map(safePreset);
    if (wasLegacy) {
      const starter = presets.find(p => p.id === 'study');
      if (starter?.name === '반복 공부') starter.name = '기본 타이머';
    }
    const selected = presets.some(p => p.id === raw.selected) ? raw.selected : (presets[0]?.id ?? null);
    const records = Array.isArray(raw.records) ? raw.records.filter(r => r && typeof r === 'object').slice(0, 500) : [];
    let session = null;
    if (raw.session && typeof raw.session === 'object') {
      const legacy = raw.session;
      const originalPreset = legacy.preset || presets.find(p => p.id === legacy.presetId) || presets.find(p => p.id === selected);
      if (originalPreset && Number.isFinite(Number(legacy.anchor)) && Number.isFinite(Number(legacy.elapsedMs))) {
        session = {
          presetId: String(legacy.presetId || originalPreset.id),
          preset: safePreset(originalPreset),
          startedAt: Number(legacy.startedAt) || Date.now(),
          anchor: Number(legacy.anchor),
          elapsedMs: Math.max(0, Number(legacy.elapsedMs)),
          running: !!legacy.running,
          totalSec: clamp(Number(legacy.totalSec) || originalPreset.minutes * originalPreset.repeats * 60, 60, 720 * 99 * 60),
          bonusSec: Math.max(0, Number(legacy.bonusSec) || 0)
        };
      }
    }
    const lastResult = raw.lastResult?.preset ? {
      preset: safePreset(raw.lastResult.preset),
      completedAt: Number(raw.lastResult.completedAt) || Date.now(),
      totalSec: Math.max(0, Number(raw.lastResult.totalSec) || 0)
    } : null;
    return { data: { presets, selected, records, session, lastResult, theme: normalizeTheme(raw.theme) }, migrated: wasLegacy };
  }

  const restored = restoreData();
  const data = restored.data;
  let toastTimeout;
  let pipStream = null;
  let pipStatus = '시작 전';
  let previousDialogFocus = null;
  let draggedPresetId = null;
  let lastScreenTick = -1;
  let storageWarned = false;

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (_) {
      if (!storageWarned) { storageWarned = true; toast('브라우저 저장소를 사용할 수 없습니다. 기록이 보존되지 않을 수 있습니다.'); }
      return false;
    }
  }
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.add('hidden'), 3800);
  }
  const selected = () => data.presets.find(p => p.id === data.selected) || null;
  const current = () => data.session?.preset || data.lastResult?.preset || selected();
  const fullSeconds = s => s.totalSec + s.bonusSec;
  const elapsedSeconds = (s, now = Date.now()) => Math.max(0, s.elapsedMs + (s.running ? Math.max(0, now - s.anchor) : 0)) / 1000;
  const timeText = n => {
    const v = Math.max(0, Math.ceil(n));
    const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), s = v % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  const localDay = t => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function stats(now = Date.now()) {
    const p = current();
    if (!p) return null;
    const s = data.session;
    const done = !s && !!data.lastResult;
    const phaseDuration = p.minutes * 60;
    const total = s ? fullSeconds(s) : (done ? data.lastResult.totalSec : phaseDuration * p.repeats);
    const passed = s ? clamp(elapsedSeconds(s, now), 0, total) : (done ? total : 0);
    const completed = done || passed >= total ? p.repeats : Math.min(p.repeats - 1, Math.floor(passed / phaseDuration));
    const phase = done || passed >= total ? p.repeats : Math.min(p.repeats, Math.floor(passed / phaseDuration) + 1);
    const lastStart = phaseDuration * (p.repeats - 1);
    const phaseEnd = Math.min(total, phase * phaseDuration + (phase === p.repeats ? total - phaseDuration * p.repeats : 0));
    const phaseStart = (phase - 1) * phaseDuration;
    const leftPhase = done || passed >= total ? 0 : Math.max(0, phaseEnd - passed);
    const phasePct = done || passed >= total ? 1 : clamp((passed - phaseStart) / Math.max(1, phaseEnd - phaseStart), 0, 1);
    return { p, s, done, total, passed, completed, phase, leftPhase, remaining: Math.max(0, total - passed), pct: total ? Math.round(passed * 100 / total) : 0, phasePct };
  }

  function recordSession(status, now = Date.now()) {
    const s = data.session;
    if (!s) return;
    const p = s.preset;
    const total = fullSeconds(s);
    const elapsed = clamp(elapsedSeconds(s, now), 0, total);
    if (elapsed < 1) return;
    const endTime = status === '완료' && s.running
      ? Math.round(s.anchor + total * 1000 - s.elapsedMs)
      : now;
    data.records.unshift({
      id: id(), name: p.name, minutes: p.minutes, repeats: p.repeats,
      completed: status === '완료' ? p.repeats : Math.min(p.repeats, Math.floor(elapsed / (p.minutes * 60))),
      elapsedSec: Math.round(elapsed), start: s.startedAt, end: endTime, status
    });
    data.records = data.records.slice(0, 500);
  }

  function finishIfNeeded() {
    const s = data.session;
    if (!s || !s.running) return;
    if (elapsedSeconds(s) + .001 < fullSeconds(s)) return;
    recordSession('완료');
    data.lastResult = { preset: copyPreset(s.preset), completedAt: Date.now(), totalSec: fullSeconds(s) };
    data.session = null;
    if (!selected()) data.selected = data.presets[0]?.id ?? null;
    save();
    renderPresets();
    render(true);
    toast('모든 회차가 완료되었습니다. 기록이 저장되었습니다.');
  }

  function startPause() {
    finishIfNeeded();
    const now = Date.now();
    if (!data.session) {
      const p = selected();
      if (!p) return toast('먼저 타이머를 추가해주세요.');
      data.lastResult = null;
      data.session = { presetId: p.id, preset: copyPreset(p), startedAt: now, anchor: now, elapsedMs: 0, running: true, totalSec: p.minutes * p.repeats * 60, bonusSec: 0 };
    } else if (data.session.running) {
      data.session.elapsedMs += Math.max(0, now - data.session.anchor);
      data.session.running = false;
    } else {
      data.session.anchor = now;
      data.session.running = true;
    }
    save(); render(true);
  }
  function reset() {
    if (data.session) recordSession('중단');
    data.session = null;
    data.lastResult = null;
    save(); render(true);
    toast('타이머를 초기화했습니다. 진행된 시간은 중단 기록으로 남겼습니다.');
  }
  function addMinute() {
    if (!data.session) return toast('타이머를 시작한 뒤 1분을 추가할 수 있습니다.');
    data.session.bonusSec += 60;
    save(); render(true); toast('마지막 회차에 1분을 추가했습니다.');
  }

  function choosePreset(presetId) {
    if (data.session?.presetId === presetId) return;
    if (!data.session && data.selected === presetId && !data.lastResult) return;
    if (data.session && !window.confirm('현재 타이머를 중단하고 다른 타이머를 선택할까요?\n진행된 시간은 중단 기록으로 남습니다.')) return;
    if (data.session) recordSession('중단');
    data.session = null;
    data.lastResult = null;
    data.selected = presetId;
    save(); renderPresets(); render(true);
  }

  function renderPresets() {
    const list = $('presets');
    list.textContent = '';
    $('presetCount').textContent = `${data.presets.length}개`;
    if (!data.presets.length) {
      list.innerHTML = '<div class="empty-presets">저장된 타이머가 없습니다.<br>위의 <strong>새로운 타이머</strong>를 눌러 추가하세요.</div>';
      return;
    }
    for (const p of data.presets) {
      const row = document.createElement('div');
      row.className = 'preset' + ((data.session ? data.session.presetId : data.selected) === p.id ? ' active' : '');
      row.dataset.id = p.id;
      row.draggable = true;
      row.innerHTML = `<button type="button" class="preset-main" aria-label="${escapeHtml(p.name)} 선택"><span class="dot"></span><span class="ptext"><span class="pname">${escapeHtml(p.name)}</span><span class="sub">${p.minutes}분 × ${p.repeats}회</span></span></button><button type="button" class="preset-menu" aria-label="${escapeHtml(p.name)} 관리: 수정, 복제, 삭제, 순서 변경">⋯</button>`;
      row.querySelector('.preset-main').addEventListener('click', () => choosePreset(p.id));
      row.querySelector('.preset-menu').addEventListener('click', () => presetActions(p.id));
      row.addEventListener('dragstart', e => {
        draggedPresetId = p.id;
        row.classList.add('dragging');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); }
      });
      row.addEventListener('dragend', () => { draggedPresetId = null; row.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); });
      row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drag-over'); if(e.dataTransfer) e.dataTransfer.dropEffect='move'; });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', e => {
        e.preventDefault(); row.classList.remove('drag-over');
        const from = draggedPresetId || e.dataTransfer?.getData('text/plain');
        reorderTo(from, p.id);
      });
      list.appendChild(row);
    }
  }

  function movePreset(presetId, amount) {
    const i = data.presets.findIndex(p => p.id === presetId);
    if (i < 0) return;
    const j = clamp(i + amount, 0, data.presets.length - 1);
    if (j === i) return;
    const [preset] = data.presets.splice(i, 1);
    data.presets.splice(j, 0, preset);
    save(); renderPresets(); toast('타이머 순서를 변경했습니다.');
  }
  function reorderTo(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const start = data.presets.findIndex(p => p.id === fromId), dest = data.presets.findIndex(p => p.id === toId);
    if (start < 0 || dest < 0) return;
    const [preset] = data.presets.splice(start, 1);
    data.presets.splice(dest, 0, preset);
    save(); renderPresets(); toast('타이머 순서를 변경했습니다.');
  }

  function openDialog(html, focusSelector = '#closeDialog') {
    previousDialogFocus = document.activeElement;
    $('dialog').innerHTML = html;
    $('dialogLayer').classList.remove('hidden');
    $('closeDialog')?.addEventListener('click', closeDialog);
    requestAnimationFrame(() => $(focusSelector.replace('#', ''))?.focus() || $('closeDialog')?.focus());
  }
  function closeDialog() {
    $('dialogLayer').classList.add('hidden');
    $('dialog').textContent = '';
    if (previousDialogFocus?.isConnected) previousDialogFocus.focus();
    previousDialogFocus = null;
  }
  $('dialogLayer').addEventListener('click', e => { if (e.target === $('dialogLayer')) closeDialog(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('dialogLayer').classList.contains('hidden')) closeDialog(); });

  function editPreset(presetId = null) {
    const original = data.presets.find(p => p.id === presetId);
    const editing = !!original;
    const p = original || { name: '', minutes: 15, repeats: 3 };
    openDialog(`<h3 id="dialogTitle">${editing ? '타이머 수정' : '새 타이머 추가'}</h3>
      <p class="help">한 회차의 시간과 반복 횟수를 설정합니다.${editing && data.session?.presetId === p.id ? '<br>진행 중인 타이머에는 수정 내용이 적용되지 않고, 다음 실행부터 적용됩니다.' : ''}</p>
      <form id="presetForm">
        <div class="field"><label for="pName">타이머 이름</label><input id="pName" required maxlength="28" autocomplete="off" placeholder="예: 수학 공부" value="${escapeHtml(p.name)}"></div>
        <div class="cols"><div class="field"><label for="pMinutes">회차당 시간 (분)</label><input id="pMinutes" type="number" inputmode="numeric" required min="1" max="720" step="1" value="${p.minutes}"></div>
        <div class="field"><label for="pRepeats">반복 횟수 (회)</label><input id="pRepeats" type="number" inputmode="numeric" required min="1" max="99" step="1" value="${p.repeats}"></div></div>
        <div class="dialog-foot"><button type="button" class="btn" id="closeDialog">취소</button><button type="submit" class="btn primary">${editing ? '변경 저장' : '타이머 추가'}</button></div>
      </form>`, '#pName');
    $('presetForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = $('pName').value.trim();
      const minutes = Number($('pMinutes').value), repeats = Number($('pRepeats').value);
      if (!name || !Number.isInteger(minutes) || minutes < 1 || minutes > 720 || !Number.isInteger(repeats) || repeats < 1 || repeats > 99) {
        toast('이름, 회차 시간(1~720분), 반복 횟수(1~99회)를 확인해주세요.'); return;
      }
      if (editing) {
        Object.assign(original, { name, minutes, repeats });
      } else {
        const next = { id: id(), name, minutes, repeats };
        data.presets.push(next);
        if (!data.session) { data.selected = next.id; data.lastResult = null; }
      }
      save(); renderPresets(); render(true); closeDialog();
      toast(editing ? '타이머 설정을 저장했습니다.' : '새 타이머를 추가했습니다.');
    });
  }

  function duplicatePreset(presetId) {
    const i = data.presets.findIndex(p => p.id === presetId);
    if (i < 0) return;
    const source = data.presets[i];
    const copy = { ...copyPreset(source), id: id(), name: `${source.name.slice(0, 23)} 복사본` };
    data.presets.splice(i + 1, 0, copy);
    if (!data.session) { data.selected = copy.id; data.lastResult = null; }
    save(); closeDialog(); renderPresets(); render(true); toast('타이머를 복제했습니다.');
  }

  function presetActions(presetId) {
    const p = data.presets.find(p => p.id === presetId);
    if (!p) return;
    const i = data.presets.indexOf(p);
    openDialog(`<h3 id="dialogTitle">타이머 관리</h3>
      <p class="help"><strong>${escapeHtml(p.name)}</strong><br>${p.minutes}분 × ${p.repeats}회</p>
      <div class="row-label">수정 · 복제 · 삭제</div>
      <div class="action-grid">
        <button id="actionEdit" class="action" type="button">✎ 수정<span class="hint">시간·이름·횟수 변경</span></button>
        <button id="actionCopy" class="action" type="button">▢ 복제<span class="hint">동일 설정으로 추가</span></button>
        <button id="actionUp" class="action" type="button" ${i === 0 ? 'disabled' : ''}>↑ 위로<span class="hint">목록 순서 변경</span></button>
        <button id="actionDown" class="action" type="button" ${i === data.presets.length - 1 ? 'disabled' : ''}>↓ 아래로<span class="hint">목록 순서 변경</span></button>
        <button id="actionDelete" class="action danger" type="button" style="grid-column:1/-1">⌫ 삭제<span class="hint">기록은 남기고 프리셋만 제거</span></button>
      </div><div class="dialog-foot"><button class="btn" id="closeDialog">닫기</button></div>`);
    $('actionEdit').addEventListener('click', () => editPreset(presetId));
    $('actionCopy').addEventListener('click', () => duplicatePreset(presetId));
    $('actionUp').addEventListener('click', () => { movePreset(presetId, -1); closeDialog(); });
    $('actionDown').addEventListener('click', () => { movePreset(presetId, 1); closeDialog(); });
    $('actionDelete').addEventListener('click', () => confirmDelete(presetId));
  }

  function confirmDelete(presetId) {
    const p = data.presets.find(x => x.id === presetId);
    if (!p) return closeDialog();
    const isActive = data.session?.presetId === presetId;
    openDialog(`<h3 id="dialogTitle" class="danger-text">타이머 삭제</h3>
      <p class="help"><strong>${escapeHtml(p.name)}</strong>을(를) 목록에서 삭제하시겠습니까?</p>
      <div class="muted-detail">• 과거 기록은 삭제되지 않습니다.<br>• ${isActive ? '현재 실행 중인 타이머는 그대로 계속 작동합니다.' : '다른 타이머에는 영향을 주지 않습니다.'}<br>• 삭제한 프리셋 설정은 복구되지 않습니다.</div>
      <div class="dialog-foot"><button class="btn" id="closeDialog" type="button">취소</button><button class="btn danger-btn" id="confirmDelete" type="button">삭제하기</button></div>`);
    $('confirmDelete').addEventListener('click', () => {
      data.presets = data.presets.filter(x => x.id !== presetId);
      if (data.selected === presetId) data.selected = isActive ? null : (data.presets[0]?.id ?? null);
      // Session owns an immutable snapshot, so deletion does not stop its countdown.
      save(); closeDialog(); renderPresets(); render(true);
      toast('타이머를 삭제했습니다. 기존 기록은 유지됩니다.');
    });
  }

  function renderRecordSummary() {
    const day = localDay(Date.now());
    const rows = data.records.filter(r => localDay(r.start) === day);
    const total = rows.reduce((sum, r) => sum + (Number(r.elapsedSec) || 0), 0);
    $('recordSum').textContent = rows.length ? `${rows.length}세션 · ${Math.round(total / 60)}분 기록` : '아직 기록이 없습니다';
  }

  function render(force = false) {
    const tick = Math.floor(Date.now() / 200);
    if (!force && lastScreenTick === tick) return;
    lastScreenTick = tick;
    const x = stats();
    const circle = 2 * Math.PI * 146;
    $('dialProgress').style.strokeDasharray = String(circle);
    $('editSelected').disabled = !(data.presets.some(p => p.id === (data.session?.presetId || data.selected)));
    if (!x) {
      $('currentName').textContent = '타이머가 없습니다';
      $('currentSpec').textContent = '왼쪽에서 새로운 타이머를 추가하세요';
      $('clock').textContent = '--:--'; $('phase').textContent = '설정 대기';
      $('finish').textContent = '새 타이머를 만들어 시작하세요';
      $('completeCount').textContent = '0 / 0'; $('totalLeft').textContent = '00:00';
      $('pct').textContent = '0%'; $('progressBar').style.width = '0%';
      $('dialProgress').style.strokeDashoffset = String(circle);
      $('startPause').disabled = true; $('startPause').textContent = '▶ 시작';
      $('reset').disabled = true; $('addMinute').disabled = true;
      $('stateBadge').textContent = '대기'; $('stateBadge').className = 'state-chip paused';
      $('status').textContent = '타이머 추가는 왼쪽의 ＋ 버튼에서 할 수 있습니다.';
      renderRecordSummary(); return;
    }
    const { p, s, done } = x;
    $('currentName').textContent = p.name;
    $('currentSpec').textContent = `${p.minutes}분 × ${p.repeats}회 · 기본 ${p.minutes * p.repeats}분`;
    $('clock').textContent = timeText(x.leftPhase);
    $('phase').textContent = `${x.phase} / ${p.repeats}회차`;
    $('finish').textContent = done ? '모든 회차 완료' : s?.running
      ? `종료 예정 ${new Date(Date.now() + x.remaining * 1000).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}`
      : s ? '일시정지 중' : '시작 대기 중';
    $('completeCount').textContent = `${x.completed} / ${p.repeats}`;
    $('totalLeft').textContent = timeText(x.remaining);
    $('pct').textContent = `${x.pct}%`;
    $('progressBar').style.width = `${x.pct}%`;
    $('dialProgress').style.strokeDashoffset = String(circle * (1 - x.phasePct));
    $('startPause').disabled = !s && !selected();
    $('startPause').textContent = s?.running ? 'Ⅱ 일시정지' : s ? '▶ 재개' : '▶ 시작';
    $('reset').disabled = !s && !done;
    $('addMinute').disabled = !s;
    $('stateBadge').textContent = done ? '완료' : s?.running ? '진행 중' : s ? '일시정지' : '대기';
    $('stateBadge').className = 'state-chip' + (done ? ' done' : (s?.running ? '' : ' paused'));
    $('status').textContent = done ? '완료 기록이 저장되었습니다. 다시 시작하려면 시작 버튼을 누르세요.'
      : s?.running ? '실제 시각을 기준으로 시간과 회차를 계산합니다.'
      : s ? '정지된 시간은 경과 시간에 포함되지 않습니다.'
      : '시작 버튼을 눌러 타이머를 실행하세요.';
    renderRecordSummary();
  }

  function recordsDialog() {
    const rows = data.records.map(r => {
      const start = Number(r.start) || Date.now();
      const dt = new Date(start).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
      return `<div class="record-row"><div><div class="record-title">${escapeHtml(r.name || '타이머')}</div><div class="record-sub">${escapeHtml(dt)} · ${Number(r.minutes)||0}분 × ${Number(r.repeats)||0}회 · 실제 ${timeText(Number(r.elapsedSec)||0)}<br>완료 회차 ${Number(r.completed)||0}/${Number(r.repeats)||0}</div></div><span class="tag ${r.status === '완료' ? '' : 'partial'}">${escapeHtml(r.status || '기록')}</span></div>`;
    }).join('');
    openDialog(`<h3 id="dialogTitle">타이머 기록</h3><p class="help">완료·중단한 세션을 현재 기기에 저장합니다. 삭제한 프리셋의 기록도 유지됩니다.</p>
      <div style="max-height:48vh;overflow:auto">${rows || '<p style="color:#8793a3">아직 저장된 기록이 없습니다.</p>'}</div>
      <div class="dialog-foot"><button class="btn" id="csvExport" type="button" ${data.records.length ? '' : 'disabled'}>CSV 내보내기</button><button class="btn primary" id="closeDialog" type="button">닫기</button></div>`);
    $('csvExport').addEventListener('click', exportCSV);
  }
  function exportCSV() {
    const headers = ['상태', '타이머', '시작시각', '종료시각', '설정분', '반복횟수', '완료횟수', '실제초'];
    const rows = data.records.map(r => [r.status, r.name, new Date(r.start).toISOString(), new Date(r.end).toISOString(), r.minutes, r.repeats, r.completed, r.elapsedSec]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'Interval-records.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, height, radius);
    else ctx.rect(x, y, width, height);
  }
  function drawPip() {
    const canvas = $('pipCanvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const x = stats();
    const p = x?.p;
    const palette = activePalette();
    ctx.fillStyle = palette.shell; ctx.fillRect(0, 0, 640, 360);
    ctx.textAlign = 'left'; ctx.fillStyle = palette.ink;
    ctx.font = '600 32px -apple-system, sans-serif'; ctx.fillText('Interval', 52, 70);
    if (!x) {
      ctx.textAlign = 'center'; ctx.font = 'bold 48px -apple-system, sans-serif'; ctx.fillText('타이머 없음', 320, 211);
      return;
    }
    ctx.textAlign = 'right'; ctx.fillStyle = palette.accent;
    ctx.font = '600 29px -apple-system, sans-serif'; ctx.fillText(`${x.phase} / ${p.repeats}회차`, 590, 70);
    ctx.textAlign = 'center'; ctx.fillStyle = palette.ink;
    ctx.font = 'bold 112px -apple-system, sans-serif'; ctx.fillText(timeText(x.leftPhase), 320, 228);
    ctx.fillStyle = palette.track; roundRect(ctx, 52, 291, 536, 11, 6); ctx.fill();
    ctx.fillStyle = palette.accent; const width = 536 * x.phasePct;
    if (width > 0) { roundRect(ctx, 52, 291, Math.max(3, width), 11, 6); ctx.fill(); }
  }
  function pipInfo() {
    const video = $('pipVideo');
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    return {
      standalone,
      canvas: typeof $('pipCanvas').captureStream === 'function',
      webkit: typeof video.webkitSetPresentationMode === 'function',
      standard: typeof video.requestPictureInPicture === 'function',
      mode: video.webkitPresentationMode || '미확인'
    };
  }
  function pipDialog(message = '') {
    const info = pipInfo();
    openDialog(`<h3 id="dialogTitle">PiP 미니 타이머</h3>
      <p class="help">아이패드 Safari에서 실행한 뒤 다른 앱으로 이동해 시간과 회차가 갱신되는지 확인해주세요.</p>
      <canvas id="pipPreview" class="pip-preview" width="640" height="360"></canvas>
      <div class="diagnostic">${message ? `<b>${escapeHtml(message)}</b><br>` : ''}환경: ${info.standalone ? '홈 화면 앱(PWA)' : 'Safari / 브라우저'}<br>
      Canvas 영상: ${info.canvas ? '지원' : '미지원'} · Safari PiP: ${info.webkit ? '지원 API 존재' : 'API 없음'}<br>표준 PiP: ${info.standard ? 'API 존재' : 'API 없음'}<br>상태: ${escapeHtml(pipStatus)}</div>
      <p class="tip">PiP는 영상 표시 기능입니다. 다른 앱에서 초 단위 갱신이 계속되는지 실제 아이패드에서 확인해주세요. 미니 화면에는 별도의 HTML 조작 버튼을 넣지 않았습니다.</p>
      <div class="dialog-foot"><button type="button" class="btn" id="closeDialog">닫기</button><button type="button" class="btn primary" id="launchPip">PiP 실행</button></div>`);
    drawPip(); $('pipPreview').getContext('2d').drawImage($('pipCanvas'), 0, 0);
    $('launchPip').addEventListener('click', launchPip);
  }
  async function launchPip() {
    const video = $('pipVideo'); const canvas = $('pipCanvas');
    if (typeof canvas.captureStream !== 'function') { pipStatus = 'Canvas captureStream 미지원'; pipDialog(pipStatus); return; }
    try {
      drawPip();
      if (!pipStream) { pipStream = canvas.captureStream(5); video.srcObject = pipStream; }
      video.muted = true; video.playsInline = true;
      await video.play();
      const isSafariSupported = video.webkitSupportsPresentationMode?.('picture-in-picture') === true;
      if (isSafariSupported) {
        video.webkitSetPresentationMode('picture-in-picture');
        pipStatus = 'Safari PiP 진입 요청 완료';
        toast('PiP 실행을 요청했습니다. 작은 창이 나타나는지 확인하세요.');
      } else if (typeof video.requestPictureInPicture === 'function' && document.pictureInPictureEnabled) {
        await video.requestPictureInPicture(); pipStatus = '표준 PiP 진입 완료'; toast('PiP를 실행했습니다.');
      } else { pipStatus = '현재 환경에서는 PiP 실행 불가'; toast('현재 환경에서 PiP를 지원하지 않습니다.'); }
      if (!$('dialogLayer').classList.contains('hidden')) pipDialog();
    } catch (err) {
      pipStatus = `실패: ${err.name || 'Error'} — ${err.message || '알 수 없는 오류'}`;
      pipDialog(pipStatus);
    }
  }

  function applyTheme() {
    const t = activePalette();
    const root = document.documentElement;
    const vars = { 'app-bg': t.bg, 'shell': t.shell, 'sidebar': t.side, 'card': t.card,
      'panel': t.panel, 'ink': t.ink, 'muted': t.muted, 'line': t.line,
      'accent': t.accent, 'accent-pale': t.pale, 'accent-text': t.onAccent,
      'track': t.track };
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(`--${name}`, value);
    root.dataset.theme = normalizeTheme(data.theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.shell);
    $('themeName').textContent = t.name;
    $('themeButton').setAttribute('aria-label', `테마 선택 (현재 ${t.name})`);
    $('mobileThemeButton').setAttribute('aria-label', `테마 선택 (현재 ${t.name})`);
    drawPip();
  }
  function themeDialog() {
    const options = themeKeys.map(key => {
      const t = THEMES[key], isActive = normalizeTheme(data.theme) === key;
      return `<button type="button" class="theme-option${isActive ? ' selected' : ''}" data-theme="${key}" aria-pressed="${isActive}">
        <span class="theme-sample" style="background:${t.shell};border-color:${t.line}">
          <span class="theme-mini-panel" style="background:${t.panel}">
            <span class="theme-mini-line" style="background:${t.ink}"></span>
            <span class="theme-mini-line half" style="background:${t.muted}"></span>
          </span>
          <span class="theme-mini-accent" style="background:${t.accent}"></span>
        </span><span class="theme-option-title">${t.name}${isActive ? ' ✓' : ''}</span>
        <span class="theme-option-desc">${t.desc}</span>
      </button>`;
    }).join('');
    openDialog(`<h3 id="dialogTitle">테마 선택</h3>
      <p class="help">테마를 선택하면 배경·버튼·진행 링·프리셋·PiP가 모두 함께 변경됩니다.</p>
      <div class="theme-grid">${options}</div>
      <div class="dialog-foot"><button class="btn" id="closeDialog" type="button">닫기</button></div>`);
    document.querySelectorAll('.theme-option').forEach(button => button.addEventListener('click', () => {
      data.theme = normalizeTheme(button.dataset.theme);
      applyTheme(); save(); closeDialog();
      toast(`${activePalette().name} 테마가 적용되었습니다.`);
    }));
  }

  // Offline shell readiness is about cached assets, not current connectivity.
  async function updateOfflineStatus() {
    const el = $('offlineStatus');
    if (!el) return;
    if (!('serviceWorker' in navigator) || !('caches' in window)) {
      el.textContent = '오프라인 설치 미지원 환경'; el.dataset.state = 'warn'; return;
    }
    try {
      const cache = await caches.open('interval-shell-1.2.0');
      const must = ['./index.html', './styles.css?v=1.2.0', './app.js?v=1.2.0'];
      const checks = await Promise.all(must.map(path => cache.match(path)));
      const ready = checks.every(Boolean);
      el.textContent = ready ? '오프라인 사용 준비 완료' : '오프라인 파일 저장 중';
      el.dataset.state = ready ? 'ready' : 'pending';
    } catch (_) { el.textContent = '오프라인 저장 확인 불가'; el.dataset.state = 'warn'; }
  }

  $('pipVideo').addEventListener('webkitpresentationmodechanged', () => { pipStatus = `Safari 표시 모드: ${$('pipVideo').webkitPresentationMode}`; });
  $('pipVideo').addEventListener('enterpictureinpicture', () => { pipStatus = 'PiP 진입 성공'; });
  $('pipVideo').addEventListener('leavepictureinpicture', () => { pipStatus = 'PiP 종료'; });
  $('addPreset').addEventListener('click', () => editPreset());
  $('editSelected').addEventListener('click', () => editPreset(data.session?.presetId || data.selected));
  $('startPause').addEventListener('click', startPause);
  $('reset').addEventListener('click', reset);
  $('addMinute').addEventListener('click', addMinute);
  $('recordsButton').addEventListener('click', recordsDialog);
  $('pipButton').addEventListener('click', () => pipDialog());
  $('themeButton').addEventListener('click', themeDialog);
  $('mobileThemeButton').addEventListener('click', themeDialog);

  // Complete an expired session on return; always use wall-clock elapsed time, never tick counts.
  applyTheme();
  finishIfNeeded();
  if (restored.migrated) { save(); }
  renderPresets(); render(true); drawPip();
  setInterval(() => {
    finishIfNeeded(); render(); drawPip();
    const preview = $('pipPreview');
    if (preview) preview.getContext('2d').drawImage($('pipCanvas'), 0, 0);
  }, 250);
  document.addEventListener('visibilitychange', () => { finishIfNeeded(); render(true); drawPip(); save(); });
  window.addEventListener('pageshow', () => { finishIfNeeded(); render(true); drawPip(); });
  window.addEventListener('beforeunload', save);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.addEventListener('controllerchange', updateOfflineStatus);
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => { reg.update().catch(() => {}); return navigator.serviceWorker.ready; })
      .then(() => updateOfflineStatus())
      .catch(() => { $('offlineStatus').textContent = '오프라인 준비 실패 — 다시 온라인에서 열어주세요'; });
    updateOfflineStatus();
  } else {
    $('offlineStatus').textContent = 'HTTPS 배포 후 오프라인 이용 가능';
  }
})();
