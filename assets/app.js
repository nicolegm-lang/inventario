import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const app = document.getElementById('app');

let supabase = null;
let session = null;
let profile = null;
let items = [];
let movements = [];
let allowedAccounts = [];
let profiles = [];
let subscriptions = [];

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

function getConfig() {
  const localUrl = localStorage.getItem('LAB_SUPABASE_URL') || '';
  const localKey = localStorage.getItem('LAB_SUPABASE_ANON_KEY') || '';
  const fileConfig = window.LAB_CONFIG || {};
  return {
    url: localUrl || fileConfig.SUPABASE_URL || '',
    key: localKey || fileConfig.SUPABASE_ANON_KEY || ''
  };
}

function hasConfig() {
  const { url, key } = getConfig();
  return url.startsWith('https://') && key.length > 20;
}

function initClient() {
  if (!hasConfig()) return null;
  const { url, key } = getConfig();
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

function cloneTemplate(id) {
  const template = document.getElementById(id);
  return template.content.cloneNode(true);
}

function toast(message, type = 'info') {
  const el = qs('#toast');
  if (!el) return alert(message);
  el.textContent = message;
  el.hidden = false;
  el.style.background = type === 'error' ? '#7f1d1d' : type === 'success' ? '#14532d' : '#0f172a';
  setTimeout(() => { el.hidden = true; }, 4200);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function normalize(text) {
  return (text || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeHtml(value) {
  return (value ?? '').toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function roleText(role) {
  return role === 'admin' ? 'Administrador' : 'Usuario';
}

function statusBadge(status, item = null) {
  const s = status || 'disponible';
  let klass = 'success';
  let label = s.replaceAll('_', ' ');
  if (['baja', 'caducado', 'agotado'].includes(s)) klass = 'danger';
  if (s === 'en_revision') klass = 'warning';
  if (item && Number(item.min_stock || 0) > 0 && Number(item.quantity || 0) <= Number(item.min_stock)) {
    klass = 'warning';
    label = `${label} · bajo stock`;
  }
  return `<span class="badge ${klass}">${escapeHtml(label)}</span>`;
}

async function safeCall(fn, fallbackMessage = 'Ocurrió un error') {
  try {
    return await fn();
  } catch (error) {
    console.error(error);
    toast(error.message || fallbackMessage, 'error');
    return null;
  }
}

async function boot() {
  supabase = initClient();
  renderAuth();
  if (!supabase) return;

  const { data } = await supabase.auth.getSession();
  session = data.session;
  supabase.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    if (!session) {
      cleanupSubscriptions();
      profile = null;
      renderAuth();
    }
  });

  if (session) await renderMain();
}

function renderAuth() {
  app.innerHTML = '';
  app.appendChild(cloneTemplate('auth-template'));
  const configNotice = qs('#configNotice');
  configNotice.hidden = hasConfig();

  const config = getConfig();
  qs('#setupUrl').value = config.url;
  qs('#setupKey').value = config.key;

  qsa('[data-auth-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('[data-auth-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      qsa('.panel').forEach(panel => panel.classList.remove('active'));
      qs(`#${btn.dataset.authTab}Form`)?.classList.add('active');
    });
  });

  qs('#setupForm').addEventListener('submit', (e) => {
    e.preventDefault();
    localStorage.setItem('LAB_SUPABASE_URL', qs('#setupUrl').value.trim());
    localStorage.setItem('LAB_SUPABASE_ANON_KEY', qs('#setupKey').value.trim());
    toast('Configuración guardada. Recargando...', 'success');
    setTimeout(() => location.reload(), 800);
  });

  qs('#clearSetupBtn').addEventListener('click', () => {
    localStorage.removeItem('LAB_SUPABASE_URL');
    localStorage.removeItem('LAB_SUPABASE_ANON_KEY');
    toast('Configuración local eliminada. Recargando...', 'success');
    setTimeout(() => location.reload(), 800);
  });

  qs('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!supabase) {
      toast('Primero configura Supabase.', 'error');
      return;
    }
    const email = qs('#loginEmail').value.trim().toLowerCase();
    const password = qs('#loginPassword').value;
    await safeCall(async () => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      session = data.session;
      await renderMain();
    }, 'No se pudo iniciar sesión');
  });

  qs('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!supabase) {
      toast('Primero configura Supabase.', 'error');
      return;
    }
    const name = qs('#registerName').value.trim();
    const email = qs('#registerEmail').value.trim().toLowerCase();
    const password = qs('#registerPassword').value;
    await safeCall(async () => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } }
      });
      if (error) throw error;
      if (data.session) {
        session = data.session;
        await renderMain();
      } else {
        toast('Cuenta creada. Revisa tu correo si Supabase pide confirmación.', 'success');
      }
    }, 'No se pudo crear la cuenta');
  });
}

async function renderMain() {
  app.innerHTML = '';
  app.appendChild(cloneTemplate('main-template'));
  bindMainEvents();
  await loadProfile();
  applyProfileUI();

  if (!profile?.active) {
    showInactiveOnly();
    return;
  }

  await Promise.all([loadItems(), loadMovements()]);
  if (profile.role === 'admin') await Promise.all([loadAllowedAccounts(), loadProfiles()]);
  renderAll();
  subscribeRealtime();
}

function bindMainEvents() {
  qsa('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
  qs('#logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    cleanupSubscriptions();
    session = null;
    profile = null;
    renderAuth();
  });
  qs('#newItemBtn').addEventListener('click', () => openItemDialog());
  qs('#inventorySearch').addEventListener('input', renderInventory);
  qs('#historySearch').addEventListener('input', renderHistory);
  qs('#refreshHistoryBtn').addEventListener('click', async () => { await loadMovements(); renderHistory(); });
  qs('#itemForm').addEventListener('submit', saveItem);
  qs('#closeItemDialog').addEventListener('click', closeItemDialog);
  qs('#cancelItemBtn').addEventListener('click', closeItemDialog);
  qs('#movementForm').addEventListener('submit', saveMovement);
  qs('#movementType').addEventListener('change', updateMovementQuantityLabel);
  qs('#allowedForm').addEventListener('submit', saveAllowedAccount);
  qs('#passwordForm').addEventListener('submit', updatePassword);
}

function setView(view) {
  qsa('.nav').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  qsa('.view').forEach(section => section.classList.remove('active'));
  qs(`#${view}View`)?.classList.add('active');
  const titles = {
    dashboard: 'Resumen',
    inventory: 'Inventario',
    movement: 'Registrar movimiento',
    history: 'Historial',
    users: 'Usuarios',
    account: 'Mi cuenta'
  };
  qs('#viewTitle').textContent = titles[view] || 'Inventario';
}

async function loadProfile() {
  const user = session?.user;
  if (!user) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    console.warn(error);
    profile = { id: user.id, email: user.email, name: user.email, role: 'usuario', active: false };
    return;
  }
  profile = data || { id: user.id, email: user.email, name: user.email, role: 'usuario', active: false };
}

function applyProfileUI() {
  const email = session?.user?.email || profile?.email || '';
  qs('#userInfo').textContent = `${profile?.name || email} · ${email}`;
  qs('#roleBadge').textContent = `${roleText(profile?.role)}${profile?.active ? '' : ' · pendiente'}`;
  qsa('.admin-only').forEach(el => {
    el.style.display = profile?.role === 'admin' && profile?.active ? '' : 'none';
  });
  renderProfileDetails();
}

function showInactiveOnly() {
  qsa('.view').forEach(section => section.classList.remove('active'));
  qs('#inactiveView').hidden = false;
  qs('#inactiveView').classList.add('active');
  qs('#viewTitle').textContent = 'Cuenta pendiente';
  qsa('.nav').forEach(btn => btn.disabled = true);
}

async function loadItems() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  items = data || [];
}

async function loadMovements() {
  const { data, error } = await supabase
    .from('movements')
    .select('*, items(name, unit), profiles(name, email)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  movements = data || [];
}

async function loadAllowedAccounts() {
  const { data, error } = await supabase
    .from('allowed_accounts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  allowedAccounts = data || [];
}

async function loadProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  profiles = data || [];
}

function renderAll() {
  renderDashboard();
  renderInventory();
  renderMovementOptions();
  renderHistory();
  renderUsers();
  renderProfileDetails();
}

function renderDashboard() {
  const now = new Date();
  const in30 = new Date();
  in30.setDate(now.getDate() + 30);
  const lowStock = items.filter(item => Number(item.min_stock || 0) > 0 && Number(item.quantity || 0) <= Number(item.min_stock));
  const expiring = items.filter(item => {
    if (!item.expiration_date) return false;
    const d = new Date(`${item.expiration_date}T00:00:00`);
    return d >= now && d <= in30;
  });
  qs('#statItems').textContent = items.length;
  qs('#statLow').textContent = lowStock.length;
  qs('#statExpiring').textContent = expiring.length;
  qs('#statMovements').textContent = movements.length;
  qs('#lowStockList').innerHTML = lowStock.length ? lowStock.map(item => `
    <div class="list-item">
      <h4>${escapeHtml(item.name)}</h4>
      <p>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)} · mínimo ${escapeHtml(item.min_stock)} ${escapeHtml(item.unit)}</p>
    </div>`).join('') : '<p class="muted">Sin alertas de bajo stock.</p>';
  qs('#expiringList').innerHTML = expiring.length ? expiring.map(item => `
    <div class="list-item">
      <h4>${escapeHtml(item.name)}</h4>
      <p>Caduca: ${formatDate(item.expiration_date)} · Lote ${escapeHtml(item.lot || '—')}</p>
    </div>`).join('') : '<p class="muted">Sin caducidades próximas.</p>';
}

function renderInventory() {
  const tbody = qs('#inventoryTable');
  const term = normalize(qs('#inventorySearch')?.value || '');
  const filtered = items.filter(item => {
    const blob = normalize([item.name, item.category, item.location, item.lot, item.provider, item.status].join(' '));
    return blob.includes(term);
  });
  tbody.innerHTML = filtered.length ? filtered.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong><br><span class="muted small">${escapeHtml(item.description || '')}</span></td>
      <td>${escapeHtml(item.category || '—')}</td>
      <td><strong>${escapeHtml(item.quantity)}</strong> ${escapeHtml(item.unit || '')}<br><span class="muted small">mín. ${escapeHtml(item.min_stock ?? '—')}</span></td>
      <td>${escapeHtml(item.location || '—')}</td>
      <td>${escapeHtml(item.lot || '—')}</td>
      <td>${formatDate(item.expiration_date)}</td>
      <td>${statusBadge(item.status, item)}</td>
      <td class="actions"><button class="secondary" data-edit-item="${item.id}">Editar</button></td>
    </tr>
  `).join('') : '<tr><td colspan="8" class="muted">No hay productos registrados.</td></tr>';

  qsa('[data-edit-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = items.find(i => i.id === btn.dataset.editItem);
      openItemDialog(item);
    });
  });
}

function renderMovementOptions() {
  const select = qs('#movementItem');
  select.innerHTML = items.map(item => `<option value="${item.id}">${escapeHtml(item.name)} · ${escapeHtml(item.quantity)} ${escapeHtml(item.unit || '')}</option>`).join('');
  updateMovementQuantityLabel();
}

function renderHistory() {
  const tbody = qs('#historyTable');
  const term = normalize(qs('#historySearch')?.value || '');
  const filtered = movements.filter(movement => {
    const blob = normalize([
      movement.items?.name,
      movement.type,
      movement.reason,
      movement.notes,
      movement.profiles?.name,
      movement.profiles?.email
    ].join(' '));
    return blob.includes(term);
  });
  tbody.innerHTML = filtered.length ? filtered.map(movement => `
    <tr>
      <td>${formatDateTime(movement.created_at)}</td>
      <td><strong>${escapeHtml(movement.items?.name || '—')}</strong></td>
      <td>${escapeHtml(movement.type)}</td>
      <td>${escapeHtml(movement.quantity)}</td>
      <td>${escapeHtml(movement.previous_quantity)}</td>
      <td>${escapeHtml(movement.new_quantity)}</td>
      <td>${escapeHtml(movement.profiles?.name || movement.profiles?.email || '—')}</td>
      <td>${escapeHtml(movement.reason || '—')}<br><span class="muted small">${escapeHtml(movement.notes || '')}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="8" class="muted">No hay movimientos registrados.</td></tr>';
}

function renderUsers() {
  if (profile?.role !== 'admin') return;
  qs('#profilesList').innerHTML = profiles.length ? profiles.map(p => `
    <div class="list-item">
      <div class="row">
        <div>
          <h4>${escapeHtml(p.name || p.email)}</h4>
          <p>${escapeHtml(p.email)} · ${roleText(p.role)} · ${p.active ? 'Activo' : 'Inactivo'}</p>
        </div>
        <div class="actions">
          <button class="secondary" data-toggle-profile="${p.id}" data-active="${p.active ? '0' : '1'}">${p.active ? 'Desactivar' : 'Activar'}</button>
          <button class="ghost" data-role-profile="${p.id}" data-role="${p.role === 'admin' ? 'usuario' : 'admin'}">Hacer ${p.role === 'admin' ? 'usuario' : 'admin'}</button>
        </div>
      </div>
    </div>
  `).join('') : '<p class="muted">No hay usuarios registrados.</p>';

  qs('#allowedList').innerHTML = allowedAccounts.length ? allowedAccounts.map(acc => `
    <div class="list-item">
      <div class="row">
        <div>
          <h4>${escapeHtml(acc.name || acc.email)}</h4>
          <p>${escapeHtml(acc.email)} · ${roleText(acc.role)} · ${acc.active ? 'Autorizado' : 'Desactivado'}</p>
        </div>
        <div class="actions">
          <button class="secondary" data-toggle-allowed="${escapeHtml(acc.email)}" data-active="${acc.active ? '0' : '1'}">${acc.active ? 'Desactivar' : 'Activar'}</button>
        </div>
      </div>
    </div>
  `).join('') : '<p class="muted">No hay correos autorizados.</p>';

  qsa('[data-toggle-profile]').forEach(btn => {
    btn.addEventListener('click', async () => updateProfile(btn.dataset.toggleProfile, { active: btn.dataset.active === '1' }));
  });
  qsa('[data-role-profile]').forEach(btn => {
    btn.addEventListener('click', async () => updateProfile(btn.dataset.roleProfile, { role: btn.dataset.role }));
  });
  qsa('[data-toggle-allowed]').forEach(btn => {
    btn.addEventListener('click', async () => updateAllowedAccount(btn.dataset.toggleAllowed, { active: btn.dataset.active === '1' }));
  });
}

function renderProfileDetails() {
  const el = qs('#profileDetails');
  if (!el || !profile) return;
  el.innerHTML = `
    <div class="detail-row"><span>Nombre</span><strong>${escapeHtml(profile.name || '—')}</strong></div>
    <div class="detail-row"><span>Correo</span><strong>${escapeHtml(profile.email || session?.user?.email || '—')}</strong></div>
    <div class="detail-row"><span>Rol</span><strong>${roleText(profile.role)}</strong></div>
    <div class="detail-row"><span>Estado</span><strong>${profile.active ? 'Activo' : 'Pendiente / inactivo'}</strong></div>
  `;
}

function openItemDialog(item = null) {
  qs('#itemDialogTitle').textContent = item ? 'Editar producto' : 'Agregar producto';
  qs('#itemId').value = item?.id || '';
  qs('#itemName').value = item?.name || '';
  qs('#itemCategory').value = item?.category || '';
  qs('#itemQuantity').value = item?.quantity ?? 0;
  qs('#itemUnit').value = item?.unit || '';
  qs('#itemMinStock').value = item?.min_stock ?? '';
  qs('#itemLocation').value = item?.location || '';
  qs('#itemLot').value = item?.lot || '';
  qs('#itemExpiration').value = item?.expiration_date || '';
  qs('#itemProvider').value = item?.provider || '';
  qs('#itemStatus').value = item?.status || 'disponible';
  qs('#itemDescription').value = item?.description || '';
  qs('#itemDialog').showModal();
}

function closeItemDialog() {
  qs('#itemDialog').close();
}

async function saveItem(e) {
  e.preventDefault();
  await safeCall(async () => {
    const id = qs('#itemId').value || null;
    const payload = {
      name: qs('#itemName').value.trim(),
      category: qs('#itemCategory').value.trim() || null,
      quantity: Number(qs('#itemQuantity').value || 0),
      unit: qs('#itemUnit').value.trim(),
      min_stock: qs('#itemMinStock').value === '' ? null : Number(qs('#itemMinStock').value),
      location: qs('#itemLocation').value.trim() || null,
      lot: qs('#itemLot').value.trim() || null,
      expiration_date: qs('#itemExpiration').value || null,
      provider: qs('#itemProvider').value.trim() || null,
      status: qs('#itemStatus').value,
      description: qs('#itemDescription').value.trim() || null,
      updated_by: session.user.id
    };

    let error;
    if (id) {
      ({ error } = await supabase.from('items').update(payload).eq('id', id));
    } else {
      payload.created_by = session.user.id;
      ({ error } = await supabase.from('items').insert(payload));
    }
    if (error) throw error;
    closeItemDialog();
    await loadItems();
    renderAll();
    toast('Producto guardado.', 'success');
  }, 'No se pudo guardar el producto');
}

function updateMovementQuantityLabel() {
  const type = qs('#movementType')?.value;
  const label = qs('#movementQuantityLabel');
  const input = qs('#movementQuantity');
  if (!label || !input) return;
  if (type === 'ajuste') {
    label.firstChild.textContent = 'Cantidad final después del conteo físico';
    input.disabled = false;
    input.required = true;
  } else if (type === 'baja') {
    label.firstChild.textContent = 'Cantidad';
    input.value = 0;
    input.disabled = true;
    input.required = false;
  } else {
    label.firstChild.textContent = 'Cantidad';
    input.disabled = false;
    input.required = true;
  }
}

async function saveMovement(e) {
  e.preventDefault();
  await safeCall(async () => {
    const type = qs('#movementType').value;
    const payload = {
      p_item_id: qs('#movementItem').value,
      p_type: type,
      p_quantity: type === 'baja' ? 0 : Number(qs('#movementQuantity').value || 0),
      p_reason: qs('#movementReason').value.trim(),
      p_notes: qs('#movementNotes').value.trim() || null
    };
    const { error } = await supabase.rpc('register_movement', payload);
    if (error) throw error;
    qs('#movementForm').reset();
    updateMovementQuantityLabel();
    await Promise.all([loadItems(), loadMovements()]);
    renderAll();
    toast('Movimiento registrado.', 'success');
  }, 'No se pudo registrar el movimiento');
}

async function saveAllowedAccount(e) {
  e.preventDefault();
  if (profile?.role !== 'admin') return;
  await safeCall(async () => {
    const payload = {
      email: qs('#allowedEmail').value.trim().toLowerCase(),
      name: qs('#allowedName').value.trim(),
      role: qs('#allowedRole').value,
      active: true,
      created_by: session.user.id
    };
    const { error } = await supabase.from('allowed_accounts').upsert(payload, { onConflict: 'email' });
    if (error) throw error;
    qs('#allowedForm').reset();
    await loadAllowedAccounts();
    renderUsers();
    toast('Correo autorizado. La persona ya puede registrarse.', 'success');
  }, 'No se pudo autorizar el correo');
}

async function updateProfile(id, changes) {
  if (profile?.role !== 'admin') return;
  await safeCall(async () => {
    const { error } = await supabase.from('profiles').update(changes).eq('id', id);
    if (error) throw error;
    await loadProfiles();
    renderUsers();
    toast('Usuario actualizado.', 'success');
  }, 'No se pudo actualizar el usuario');
}

async function updateAllowedAccount(email, changes) {
  if (profile?.role !== 'admin') return;
  await safeCall(async () => {
    const { error } = await supabase.from('allowed_accounts').update(changes).eq('email', email);
    if (error) throw error;
    await loadAllowedAccounts();
    renderUsers();
    toast('Correo autorizado actualizado.', 'success');
  }, 'No se pudo actualizar el correo autorizado');
}

async function updatePassword(e) {
  e.preventDefault();
  await safeCall(async () => {
    const password = qs('#newPassword').value;
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    qs('#passwordForm').reset();
    toast('Contraseña actualizada.', 'success');
  }, 'No se pudo actualizar la contraseña');
}

function subscribeRealtime() {
  cleanupSubscriptions();
  const itemsChannel = supabase.channel('items-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, async () => {
      await loadItems();
      renderAll();
      toast('Inventario actualizado por otro usuario.');
    })
    .subscribe();
  const movementsChannel = supabase.channel('movements-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movements' }, async () => {
      await loadMovements();
      renderAll();
    })
    .subscribe();
  subscriptions.push(itemsChannel, movementsChannel);
}

function cleanupSubscriptions() {
  subscriptions.forEach(channel => supabase?.removeChannel(channel));
  subscriptions = [];
}

boot().catch(error => {
  console.error(error);
  app.innerHTML = `<main class="auth-layout"><section class="auth-card"><h1>Error al iniciar</h1><p>${escapeHtml(error.message)}</p></section></main>`;
});
