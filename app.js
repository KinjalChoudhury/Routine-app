(function(){
  const LS_KEY = 'ledger_data_v1';

  // ---------- Fixed daily task template ----------
  // key: stable identity used every day. locked: cannot delete, and cannot
  // uncheck once done. removable:false for the other 4 fixed tasks means
  // they also can't be deleted, but CAN be unchecked.
  const FIXED_TEMPLATE = [
    { key:'wash',    label:'Washing clothes', locked:false, editable:false, shopping:false },
    { key:'bath',    label:'Bath',            locked:true,  editable:false, shopping:false },
    { key:'study1',  label:'Study 1',         locked:true,  editable:true,  shopping:false, topic:'', duration:'' },
    { key:'study2',  label:'Study 2',         locked:true,  editable:true,  shopping:false, topic:'', duration:'' },
    { key:'study3',  label:'Study 3',         locked:false, editable:true,  shopping:false, topic:'', duration:'' },
    { key:'study4',  label:'Study 4',         locked:false, editable:true,  shopping:false, topic:'', duration:'' },
    { key:'buy',     label:'Buy things',      locked:false, editable:false, shopping:true, items:[] },
  ];

  function todayISO(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function fmtLong(iso){
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  }
  function fmtShort(iso){
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  }
  function daysBetween(fromISO, toISO){
    const a = new Date(fromISO + 'T00:00:00');
    const b = new Date(toISO + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }
  function cryptoId(){
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  }
  function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }

  function freshFixedTasks(){
    return FIXED_TEMPLATE.map(t => {
      const task = {
        key:t.key, label:t.label, locked:t.locked, editable:t.editable, shopping:t.shopping,
        done:false
      };
      if(t.editable){
        task.topic = '';
        task.duration = '';
      }
      if(t.shopping){
        task.items = [];
      }
      return task;
    });
  }

  function load(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return { deadlines: [], days: {} };
      const parsed = JSON.parse(raw);
      return { deadlines: parsed.deadlines || [], days: parsed.days || {} };
    }catch(e){
      console.error('Routine: failed to load data', e);
      return { deadlines: [], days: {} };
    }
  }
  function save(){
    try{
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    }catch(e){
      console.error('Routine: failed to save data', e);
    }
    if(window.__ledgerSyncToCloud) window.__ledgerSyncToCloud(state);
  }

  let state = load();
  const TODAY = todayISO();

  function ensureToday(){
    if(!state.days[TODAY]){
      state.days[TODAY] = { fixed: freshFixedTasks(), extra: [] };
    } else {
      // migrate: ensure any newly-added fixed keys exist (forward-compat)
      const existingKeys = new Set(state.days[TODAY].fixed.map(t => t.key));
      FIXED_TEMPLATE.forEach(t => {
        if(!existingKeys.has(t.key)){
          state.days[TODAY].fixed.push(freshFixedTasks().find(f => f.key === t.key));
        }
      });
      if(!state.days[TODAY].extra) state.days[TODAY].extra = [];
    }
    save();
  }

  function pruneOldDays(){
    const cutoff = new Date(TODAY + 'T00:00:00');
    cutoff.setDate(cutoff.getDate() - 45);
    const cutoffISO = cutoff.getFullYear() + '-' + String(cutoff.getMonth()+1).padStart(2,'0') + '-' + String(cutoff.getDate()).padStart(2,'0');
    let changed = false;
    Object.keys(state.days).forEach(d => {
      if(d < cutoffISO){
        delete state.days[d];
        changed = true;
      }
    });
    if(changed) save();
  }

  // ---------- Deadlines ----------
  const deadlineRail = document.getElementById('deadlineRail');
  const deadlineCount = document.getElementById('deadlineCount');

  function renderDeadlines(){
    const active = state.deadlines.filter(d => !d.done).sort((a,b) => a.due.localeCompare(b.due));
    deadlineRail.innerHTML = '';
    deadlineCount.textContent = active.length ? (active.length + ' pending') : '';

    if(active.length === 0){
      deadlineRail.innerHTML = '<div class="empty-rail">No deadlines yet. Add one below — you\'ll be reminded here every day until it\'s done.</div>';
      return;
    }

    active.forEach(item => {
      const diff = daysBetween(TODAY, item.due);
      const card = document.createElement('div');
      card.className = 'dcard';
      let badgeText;
      if(diff < 0){
        card.classList.add('overdue');
        badgeText = Math.abs(diff) + (Math.abs(diff)===1 ? ' day overdue' : ' days overdue');
      } else if(diff === 0){
        card.classList.add('urgent');
        badgeText = 'Due today';
      } else if(diff <= 3){
        card.classList.add('urgent');
        badgeText = diff + (diff===1 ? ' day left' : ' days left');
      } else {
        badgeText = diff + ' days left';
      }

      card.innerHTML = `
        <span class="badge">${badgeText}</span>
        <div class="name"></div>
        <div class="due">Due ${fmtShort(item.due)}</div>
        <div class="actions">
          <button class="btn-done" data-action="done" data-id="${item.id}">Mark done</button>
          <button class="btn-del" data-action="del" data-id="${item.id}">Remove</button>
        </div>
      `;
      card.querySelector('.name').textContent = item.name;
      deadlineRail.appendChild(card);
    });
  }

  deadlineRail.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if(!btn) return;
    const id = btn.dataset.id;
    if(btn.dataset.action === 'done'){
      const d = state.deadlines.find(x => x.id === id);
      if(d) d.done = true;
    } else if(btn.dataset.action === 'del'){
      state.deadlines = state.deadlines.filter(x => x.id !== id);
    }
    save();
    renderDeadlines();
  });

  document.getElementById('addDeadlineBtn').addEventListener('click', () => {
    const nameInput = document.getElementById('dTaskName');
    const dateInput = document.getElementById('dTaskDate');
    const name = nameInput.value.trim();
    const due = dateInput.value;
    if(!name || !due){ nameInput.focus(); return; }
    state.deadlines.push({ id: cryptoId(), name, due, done:false });
    nameInput.value = '';
    dateInput.value = '';
    save();
    renderDeadlines();
  });

  // ---------- Today: fixed + extra tasks ----------
  const taskList = document.getElementById('taskList');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const progressPct = document.getElementById('progressPct');

  function fixedTask(key){ return state.days[TODAY].fixed.find(t => t.key === key); }

  function renderToday(){
    const day = state.days[TODAY];
    taskList.innerHTML = '';

    day.fixed.forEach(t => renderFixedRow(t));
    day.extra.forEach(t => renderExtraRow(t));

    const allDone = [...day.fixed.map(t=>t.done), ...day.extra.map(t=>t.done)];
    const total = allDone.length;
    const done = allDone.filter(Boolean).length;
    const pct = total ? Math.round((done/total)*100) : 0;
    progressFill.style.width = pct + '%';
    progressText.textContent = done + ' of ' + total + ' done';
    progressPct.textContent = pct + '%';
  }

  function renderFixedRow(t){
    const li = document.createElement('li');
    li.className = 'trow' + (t.done ? ' done' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox';
    checkbox.checked = t.done;
    checkbox.setAttribute('aria-label', 'Mark ' + t.label + ' as done');
    if(t.locked && t.done) checkbox.disabled = true;
    checkbox.addEventListener('change', () => {
      t.done = checkbox.checked;
      save();
      renderToday();
    });

    const body = document.createElement('div');
    body.className = 'trow-body';

    const main = document.createElement('div');
    main.className = 'trow-main';
    const label = document.createElement('span');
    label.className = 'task-text';
    label.textContent = t.editable && t.topic ? t.topic : t.label;
    main.appendChild(label);
    if(t.locked){
      const lock = document.createElement('span');
      lock.className = 'lock-icon';
      lock.textContent = 'fixed';
      main.appendChild(lock);
    }
    body.appendChild(main);

    if(t.editable){
      const editWrap = document.createElement('div');
      editWrap.className = 'study-edit';
      editWrap.innerHTML = `
        <span class="field-label">Topic</span>
        <input type="text" class="topic-input" placeholder="${t.label}" value="${escapeAttr(t.topic || '')}" maxlength="60">
        <span class="field-label">Duration</span>
        <div class="dur-picker-wrap">
          <button type="button" class="dur-picker-btn">${t.duration ? escapeAttr(t.duration) : 'Set time'}</button>
          <div class="dur-flyout" hidden>
            <div class="dur-flyout-row">
              <div class="dur-col">
                <span class="dur-col-label">Hours</span>
                <select class="dur-hours"></select>
              </div>
              <div class="dur-col">
                <span class="dur-col-label">Minutes</span>
                <select class="dur-minutes"></select>
              </div>
            </div>
            <div class="dur-flyout-actions">
              <button type="button" class="dur-clear">Clear</button>
              <button type="button" class="dur-done">Done</button>
            </div>
          </div>
        </div>
      `;
      const topicInput = editWrap.querySelector('.topic-input');
      topicInput.addEventListener('input', () => {
        t.topic = topicInput.value;
        label.textContent = t.topic ? t.topic : t.label;
        save();
      });

      const durBtn = editWrap.querySelector('.dur-picker-btn');
      const flyout = editWrap.querySelector('.dur-flyout');
      const hoursSel = editWrap.querySelector('.dur-hours');
      const minsSel = editWrap.querySelector('.dur-minutes');
      const clearBtn = editWrap.querySelector('.dur-clear');
      const doneBtn = editWrap.querySelector('.dur-done');

      for(let h = 0; h <= 6; h++){
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h + (h === 1 ? ' hr' : ' hrs');
        hoursSel.appendChild(opt);
      }
      for(let m = 0; m < 60; m += 5){
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m + ' min';
        minsSel.appendChild(opt);
      }

      function parseDuration(str){
        if(!str) return { h:0, m:0 };
        const hMatch = str.match(/(\d+)\s*h/);
        const mMatch = str.match(/(\d+)\s*m/);
        return { h: hMatch ? parseInt(hMatch[1]) : 0, m: mMatch ? parseInt(mMatch[1]) : 0 };
      }
      function formatDuration(h, m){
        if(h === 0 && m === 0) return '';
        const parts = [];
        if(h > 0) parts.push(h + (h === 1 ? ' hr' : ' hrs'));
        if(m > 0) parts.push(m + ' min');
        return parts.join(' ');
      }

      const initial = parseDuration(t.duration);
      hoursSel.value = String(initial.h);
      minsSel.value = String(Math.round(initial.m / 5) * 5);

      function closeFlyout(){
        flyout.hidden = true;
        document.removeEventListener('click', outsideClickHandler);
      }
      function outsideClickHandler(e){
        if(!editWrap.contains(e.target)) closeFlyout();
      }
      durBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !flyout.hidden;
        document.querySelectorAll('.dur-flyout').forEach(f => f.hidden = true);
        if(!isOpen){
          flyout.hidden = false;
          setTimeout(() => document.addEventListener('click', outsideClickHandler), 0);
        }
      });
      clearBtn.addEventListener('click', () => {
        hoursSel.value = '0';
        minsSel.value = '0';
        t.duration = '';
        durBtn.textContent = 'Set time';
        save();
        closeFlyout();
      });
      doneBtn.addEventListener('click', () => {
        const h = parseInt(hoursSel.value);
        const m = parseInt(minsSel.value);
        t.duration = formatDuration(h, m);
        durBtn.textContent = t.duration || 'Set time';
        save();
        closeFlyout();
      });

      body.appendChild(editWrap);
    }

    if(t.shopping){
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'shop-toggle';
      const itemCount = t.items.length;
      const doneCount = t.items.filter(i => i.done).length;
      toggleBtn.textContent = itemCount ? `Shopping list (${doneCount}/${itemCount})` : 'Add a shopping list';

      const shopUl = document.createElement('ul');
      shopUl.className = 'shop-list';

      function renderShop(){
        shopUl.innerHTML = '';
        t.items.forEach(item => {
          const sli = document.createElement('li');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'checkbox';
          cb.checked = item.done;
          cb.addEventListener('change', () => {
            item.done = cb.checked;
            save();
            renderShop();
            refreshShopToggleLabel();
          });
          const txt = document.createElement('span');
          txt.className = 'shop-item-text' + (item.done ? ' done' : '');
          txt.textContent = item.name;
          const del = document.createElement('button');
          del.className = 'shop-del';
          del.textContent = '✕';
          del.addEventListener('click', () => {
            t.items = t.items.filter(i => i.id !== item.id);
            save();
            renderShop();
            refreshShopToggleLabel();
          });
          sli.appendChild(cb);
          sli.appendChild(txt);
          sli.appendChild(del);
          shopUl.appendChild(sli);
        });

        const addRow = document.createElement('li');
        addRow.className = 'shop-add';
        addRow.style.listStyle = 'none';
        addRow.innerHTML = `<input type="text" placeholder="e.g. Milk, notebooks" maxlength="60"><button type="button">Add</button>`;
        const addInput = addRow.querySelector('input');
        const addBtn = addRow.querySelector('button');
        function addItem(){
          const val = addInput.value.trim();
          if(!val) return;
          t.items.push({ id: cryptoId(), name: val, done:false });
          addInput.value = '';
          save();
          renderShop();
          refreshShopToggleLabel();
        }
        addBtn.addEventListener('click', addItem);
        addInput.addEventListener('keydown', (e) => { if(e.key==='Enter') addItem(); });
        shopUl.appendChild(addRow);
      }

      function refreshShopToggleLabel(){
        const ic = t.items.length;
        const dc = t.items.filter(i=>i.done).length;
        toggleBtn.textContent = ic ? `Shopping list (${dc}/${ic})` : 'Add a shopping list';
      }

      toggleBtn.addEventListener('click', () => {
        shopUl.classList.toggle('open');
        refreshShopToggleLabel();
      });

      renderShop();
      body.appendChild(toggleBtn);
      body.appendChild(shopUl);
    }

    li.appendChild(checkbox);
    li.appendChild(body);
    taskList.appendChild(li);
  }

  function renderExtraRow(t){
    const li = document.createElement('li');
    li.className = 'trow' + (t.done ? ' done' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox';
    checkbox.checked = t.done;
    checkbox.setAttribute('aria-label', 'Mark ' + t.name + ' as done');
    checkbox.addEventListener('change', () => {
      t.done = checkbox.checked;
      save();
      renderToday();
    });

    const body = document.createElement('div');
    body.className = 'trow-body';
    const main = document.createElement('div');
    main.className = 'trow-main';
    const label = document.createElement('span');
    label.className = 'task-text';
    label.textContent = t.name;
    main.appendChild(label);
    const tag = document.createElement('span');
    tag.className = 'lock-icon';
    tag.textContent = 'today only';
    main.appendChild(tag);
    body.appendChild(main);

    const del = document.createElement('button');
    del.className = 'task-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Remove task');
    del.addEventListener('click', () => {
      state.days[TODAY].extra = state.days[TODAY].extra.filter(x => x.id !== t.id);
      save();
      renderToday();
    });

    li.appendChild(checkbox);
    li.appendChild(body);
    li.appendChild(del);
    taskList.appendChild(li);
  }

  document.getElementById('addTaskBtn').addEventListener('click', addExtraFromInput);
  document.getElementById('newTaskName').addEventListener('keydown', (e) => {
    if(e.key === 'Enter') addExtraFromInput();
  });
  document.getElementById('dTaskName').addEventListener('keydown', (e) => {
    if(e.key === 'Enter') document.getElementById('dTaskDate').focus();
  });

  function addExtraFromInput(){
    const input = document.getElementById('newTaskName');
    const name = input.value.trim();
    if(!name) { input.focus(); return; }
    state.days[TODAY].extra.push({ id: cryptoId(), name, done:false });
    input.value = '';
    save();
    renderToday();
  }

  // ---------- History ----------
  const historyBody = document.getElementById('historyBody');
  const historyToggle = document.getElementById('historyToggle');
  const historyChev = document.getElementById('historyChev');

  function renderHistory(){
    const dates = Object.keys(state.days).filter(d => d !== TODAY).sort((a,b) => b.localeCompare(a)).slice(0, 45);
    historyBody.innerHTML = '';
    if(dates.length === 0){
      historyBody.innerHTML = '<div class="empty-today">No past days yet — they\'ll show up here once tomorrow begins.</div>';
      return;
    }
    dates.forEach(d => {
      const day = state.days[d];
      const fixed = day.fixed || [];
      const extra = day.extra || [];
      const all = [...fixed.map(t=>t.done), ...extra.map(t=>t.done)];
      const total = all.length;
      const done = all.filter(Boolean).length;
      const pct = total ? Math.round((done/total)*100) : 0;

      const wrap = document.createElement('div');
      wrap.className = 'hday-wrap';

      const row = document.createElement('div');
      row.className = 'hday';
      row.innerHTML = `
        <button type="button" class="hday-toggle" aria-label="Show details for ${fmtLong(d)}">
          <svg viewBox="0 0 16 16" width="10" height="10" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 5.5C3 4.5 4.2 4 5 4.6L8 7L11 4.6C11.8 4 13 4.5 13 5.5C13 5.9 12.8 6.3 12.5 6.5L8.6 9.6C8.25 9.9 7.75 9.9 7.4 9.6L3.5 6.5C3.2 6.3 3 5.9 3 5.5Z" fill="currentColor"/>
          </svg>
        </button>
        <span class="hday-date"></span>
        <span class="hday-count">${done}/${total}</span>
      `;
      row.querySelector('.hday-date').textContent = fmtLong(d);

      const detail = document.createElement('div');
      detail.className = 'hday-detail';
      detail.hidden = true;

      const ul = document.createElement('ul');
      ul.className = 'hday-list';
      fixed.forEach(t => {
        const li = document.createElement('li');
        li.className = t.done ? 'done' : '';
        const nameText = (t.editable && t.topic) ? t.topic : t.label;
        const durText = (t.editable && t.duration) ? ` (${t.duration})` : '';
        li.textContent = (t.done ? '✓ ' : '— ') + nameText + durText;
        ul.appendChild(li);
      });
      extra.forEach(t => {
        const li = document.createElement('li');
        li.className = t.done ? 'done' : '';
        li.textContent = (t.done ? '✓ ' : '— ') + t.name + ' (today only)';
        ul.appendChild(li);
      });
      if(fixed.length === 0 && extra.length === 0){
        const li = document.createElement('li');
        li.textContent = 'No tasks recorded for this day.';
        ul.appendChild(li);
      }
      detail.appendChild(ul);

      const toggleBtn = row.querySelector('.hday-toggle');
      toggleBtn.addEventListener('click', () => {
        const willOpen = detail.hidden === true;
        detail.hidden = !willOpen;
        toggleBtn.classList.toggle('open', willOpen);
      });

      wrap.appendChild(row);
      wrap.appendChild(detail);
      historyBody.appendChild(wrap);
    });
  }

  historyToggle.addEventListener('click', () => {
    const open = historyBody.classList.toggle('open');
    historyChev.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
  });

  // ---------- Auth UI (Google sign-in via Firebase, once configured) ----------
  const authBox = document.getElementById('authBox');
  const syncNote = document.getElementById('syncNote');

  function renderSignedOut(){
    authBox.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'signin-btn';
    btn.innerHTML = `
      <svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.6 5.1 29.6 3 24 3c-7.4 0-13.8 4.1-17.1 10.2z"/><path fill="#4CAF50" d="M24 45c5.5 0 10.4-1.8 14.2-5l-6.6-5.6C29.4 35.7 26.8 36.5 24 36.5c-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.1 40.6 16 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.6 5.6C41.4 36.6 45 30.9 45 24c0-1.4-.1-2.4-.4-3.5z"/></svg>
      <span>Sign in with Google</span>
    `;
    btn.addEventListener('click', () => {
      if(window.__ledgerSignIn) window.__ledgerSignIn();
      else syncNote.textContent = 'Sign-in isn\u2019t set up yet — add your Firebase config in the file to enable it.';
    });
    authBox.appendChild(btn);
  }

  function renderSignedIn(user){
    authBox.innerHTML = '';
    const chip = document.createElement('div');
    chip.className = 'user-chip';
    const displayName = user.displayName || user.email || 'You';

    let avatar;
    if(user.photoURL){
      avatar = document.createElement('img');
      avatar.className = 'user-avatar';
      avatar.src = user.photoURL;
      avatar.alt = '';
      avatar.referrerPolicy = 'no-referrer';
      avatar.addEventListener('error', () => {
        // Fall back to an initial if the photo fails to load
        const fallback = document.createElement('span');
        fallback.className = 'user-avatar user-avatar-fallback';
        fallback.textContent = displayName.trim().charAt(0).toUpperCase();
        avatar.replaceWith(fallback);
      });
    } else {
      avatar = document.createElement('span');
      avatar.className = 'user-avatar user-avatar-fallback';
      avatar.textContent = displayName.trim().charAt(0).toUpperCase();
    }

    const name = document.createElement('span');
    name.textContent = displayName;
    const signOutBtn = document.createElement('button');
    signOutBtn.textContent = 'Sign out';
    signOutBtn.addEventListener('click', () => { if(window.__ledgerSignOut) window.__ledgerSignOut(); });
    chip.appendChild(avatar);
    chip.appendChild(name);
    chip.appendChild(signOutBtn);
    authBox.appendChild(chip);
    syncNote.innerHTML = '<span class="sync-dot"></span>Synced across your devices';
  }

  renderSignedOut();
  if(window.FIREBASE_READY === false){
    syncNote.textContent = 'Cross-device sync not set up yet (see setup notes in file) — saving on this device only.';
  }

  window.addEventListener('ledger-firebase-unconfigured', () => {
    syncNote.textContent = 'Cross-device sync not set up yet (see setup notes in file) — saving on this device only.';
  });

  window.addEventListener('ledger-firebase-error', () => {
    syncNote.textContent = 'Couldn\u2019t connect to sync — using this device only for now.';
  });

  window.addEventListener('ledger-firebase-ready', () => {
    const fb = window.__ledgerFirebase;
    let currentUid = null;
    let applyingRemote = false;

    window.__ledgerSignIn = () => {
      fb.signInWithPopup(fb.auth, fb.provider).catch(err => {
        console.error('Routine: sign-in failed', err);
        syncNote.textContent = 'Sign-in didn\u2019t go through — try again.';
      });
    };
    window.__ledgerSignOut = () => { fb.signOut(fb.auth); };

    let localWriteInFlight = false;
    let syncDebounceTimer = null;
    let latestPendingData = null;

    // Firestore rejects any field set to JS `undefined` (unlike null/omitted).
    // Round-tripping through JSON strips those keys out safely, so old or
    // accidentally-malformed local data can't block a sync.
    function sanitizeForFirestore(data){
      return JSON.parse(JSON.stringify(data));
    }

    function flushPendingSync(){
      if(syncDebounceTimer === null || latestPendingData === null) return;
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = null;
      const data = latestPendingData;
      latestPendingData = null;
      if(!currentUid) return;
      localWriteInFlight = true;
      fb.setDoc(fb.doc(fb.db, 'users', currentUid), sanitizeForFirestore(data), { merge:false })
        .catch(err => { console.error('Routine: cloud save failed', err); })
        .finally(() => { localWriteInFlight = false; });
    }

    window.__ledgerSyncToCloud = (data) => {
      if(!currentUid || applyingRemote) return;
      latestPendingData = data;
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => {
        syncDebounceTimer = null;
        latestPendingData = null;
        localWriteInFlight = true;
        fb.setDoc(fb.doc(fb.db, 'users', currentUid), sanitizeForFirestore(data), { merge:false })
          .catch(err => { console.error('Routine: cloud save failed', err); })
          .finally(() => { localWriteInFlight = false; });
      }, 400);
    };

    // Make sure any pending (debounced) change is written before the page
    // closes, refreshes, or is backgrounded — otherwise a quick refresh
    // right after typing can lose the last edit.
    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'hidden') flushPendingSync();
    });
    window.addEventListener('pagehide', flushPendingSync);
    window.addEventListener('beforeunload', flushPendingSync);

    fb.onAuthStateChanged(fb.auth, async (user) => {
      if(user){
        currentUid = user.uid;
        renderSignedIn(user);
        try{
          const snap = await fb.getDoc(fb.doc(fb.db, 'users', user.uid));
          if(snap.exists()){
            applyingRemote = true;
            const remote = snap.data();
            state = { deadlines: remote.deadlines || [], days: remote.days || {} };
            ensureToday();
            renderDeadlines();
            renderToday();
            renderHistory();
            applyingRemote = false;
          } else {
            window.__ledgerSyncToCloud(state);
          }
          fb.onSnapshot(fb.doc(fb.db, 'users', user.uid), (docSnap) => {
            if(!docSnap.exists()) return;
            if(localWriteInFlight || syncDebounceTimer) return;
            applyingRemote = true;
            const remote = docSnap.data();
            state = { deadlines: remote.deadlines || [], days: remote.days || {} };
            ensureToday();
            renderDeadlines();
            renderToday();
            renderHistory();
            applyingRemote = false;
          });
        }catch(err){
          console.error('Routine: cloud load failed', err);
          syncNote.textContent = 'Couldn\u2019t load synced data — showing local copy.';
        }
      } else {
        currentUid = null;
        renderSignedOut();
        syncNote.textContent = '';
      }
    });
  });

  // ---------- Init ----------
  document.getElementById('todayDate').textContent = fmtShort(TODAY);
  document.getElementById('todayLongDate').textContent = fmtLong(TODAY);

  ensureToday();
  pruneOldDays();
  renderDeadlines();
  renderToday();
  renderHistory();

  if('Notification' in window && Notification.permission === 'default'){
    document.addEventListener('click', function reqOnce(){
      Notification.requestPermission();
      document.removeEventListener('click', reqOnce);
    }, { once:true });
  }
})();
