const state = {
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),
  users: [],
  statuses: [],
  orders: [],
  currentPage: "dashboard",
  hub: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function pad2(value) { return String(value).padStart(2, "0"); }

function localSqlNow(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function localDatetimeInput(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function statusColor(name) {
  const status = state.statuses.find(s => s.name === name);
  return status?.color || "#38bdf8";
}

function statusBadge(name) {
  const color = statusColor(name);
  return `<span class="badge" style="--status-color:${escapeHtml(color)}">${escapeHtml(name || "Sem status")}</span>`;
}


// ------------------------------------------------------------
// MODO VERCEL/DEMO
// ------------------------------------------------------------
// O Vercel não executa backend ASP.NET/C# diretamente.
// Quando o backend /api não estiver disponível, o sistema usa
// este modo demo com localStorage para a interface continuar
// funcionando no deploy estático.
const demoDbKey = "coreflow_demo_db_v1";
const demoChannelName = "coreflow_realtime_channel";
const demoChannel = "BroadcastChannel" in window ? new BroadcastChannel(demoChannelName) : null;
let demoLastSnapshot = localStorage.getItem(demoDbKey) || "";
let demoRealtimeInterval = null;

function createDemoDb() {
  const now = localSqlNow();
  return {
    nextOrderId: 2,
    nextUserId: 4,
    nextStatusId: 8,
    users: [
      { id: 1, name: "Administrador", email: "admin@coreflow.com", password: "admin123", role: "Admin", active: true },
      { id: 2, name: "Balconista", email: "balconista@coreflow.com", password: "123456", role: "Balconista", active: true },
      { id: 3, name: "Técnico", email: "tecnico@coreflow.com", password: "123456", role: "Tecnico", active: true }
    ],
    statuses: [
      { id: 1, name: "Em andamento", color: "#38bdf8" },
      { id: 2, name: "Concluído", color: "#22c55e" },
      { id: 3, name: "Não feito", color: "#ef4444" },
      { id: 4, name: "Entrar em contato", color: "#f59e0b" },
      { id: 5, name: "Aguardando peça", color: "#8b5cf6" },
      { id: 6, name: "Cancelado", color: "#64748b" },
      { id: 7, name: "Entregue", color: "#10b981" }
    ],
    orders: [
      {
        id: 1,
        customerName: "Cliente Demonstração",
        customerContact: "(11) 99999-9999",
        customerDocument: "000.000.000-00",
        device: "Smartphone",
        serviceValue: 120.00,
        entryDate: now,
        expectedExitDate: "",
        status: "Em andamento",
        technicianId: 3,
        technician: "Técnico",
        receptionistId: 2,
        receptionist: "Balconista",
        createdBy: "Balconista",
        createdAt: now,
        updatedAt: now,
        completedAt: "",
        problemDescription: "Aparelho não liga.",
        entryCondition: "Aparelho não liga.",
        technicalDiagnosis: "",
        servicePerformed: "",
        notes: "Registro inicial de demonstração.",
        logs: [
          { action: "Cadastro", details: "Ordem cadastrada no modo demo.", user: "Sistema", role: "Demo", createdAt: now }
        ]
      }
    ]
  };
}

function getDemoDb() {
  const saved = localStorage.getItem(demoDbKey);
  if (saved) {
    const db = JSON.parse(saved);
    db.statuses = (db.statuses || []).map(s => ({ ...s, color: s.color || "#38bdf8" }));
    return db;
  }
  const db = createDemoDb();
  localStorage.setItem(demoDbKey, JSON.stringify(db));
  return db;
}

function saveDemoDb(db) {
  localStorage.setItem(demoDbKey, JSON.stringify(db));
  notifyDemoRealtime();
}

function notifyDemoRealtime() {
  demoLastSnapshot = localStorage.getItem(demoDbKey) || "";
  demoChannel?.postMessage({ type: "demo-data-changed", at: Date.now() });
}

function startDemoRealtime() {
  if ($("#connectionStatus")) $("#connectionStatus").textContent = "Online";

  const onChange = async () => {
    if (!state.user) return;
    await refreshVisibleData(false);
  };

  demoChannel?.addEventListener("message", (event) => {
    if (event.data?.type === "demo-data-changed") onChange();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === demoDbKey) onChange();
  });

  if (!demoRealtimeInterval) {
    demoRealtimeInterval = setInterval(async () => {
      const current = localStorage.getItem(demoDbKey) || "";
      if (current !== demoLastSnapshot) {
        demoLastSnapshot = current;
        await onChange();
      }
    }, 1500);
  }
}

function currentDemoUser(db) {
  if (!state.user) return null;
  return db.users.find(u => u.id === state.user.id);
}

function toCamelOrder(data, db, existing = {}) {
  const tech = db.users.find(u => u.id === Number(data.TechnicianId || data.technicianId));
  const receptionist = db.users.find(u => u.id === Number(data.ReceptionistId || data.receptionistId));
  const now = localSqlNow();
  return {
    ...existing,
    customerName: data.CustomerName ?? data.customerName ?? existing.customerName ?? "",
    customerContact: data.CustomerContact ?? data.customerContact ?? existing.customerContact ?? "",
    customerDocument: data.CustomerDocument ?? data.customerDocument ?? existing.customerDocument ?? "",
    device: data.Device ?? data.device ?? existing.device ?? "",
    serviceValue: Number(data.ServiceValue ?? data.serviceValue ?? existing.serviceValue ?? 0),
    entryDate: (data.EntryDate ?? data.entryDate ?? existing.entryDate ?? "").replace("T", " "),
    expectedExitDate: (data.ExpectedExitDate ?? data.expectedExitDate ?? existing.expectedExitDate ?? "").replace("T", " "),
    status: data.Status ?? data.status ?? existing.status ?? "Em andamento",
    receptionistId: data.ReceptionistId ?? data.receptionistId ?? existing.receptionistId ?? null,
    receptionist: receptionist?.name || existing.receptionist || "",
    technicianId: data.TechnicianId ?? data.technicianId ?? existing.technicianId ?? null,
    technician: tech?.name || existing.technician || "",
    problemDescription: data.ProblemDescription ?? data.problemDescription ?? existing.problemDescription ?? "",
    entryCondition: data.EntryCondition ?? data.ProblemDescription ?? data.entryCondition ?? data.problemDescription ?? existing.entryCondition ?? "",
    technicalDiagnosis: data.TechnicalDiagnosis ?? data.technicalDiagnosis ?? existing.technicalDiagnosis ?? "",
    servicePerformed: data.ServicePerformed ?? data.servicePerformed ?? existing.servicePerformed ?? "",
    notes: data.Notes ?? data.notes ?? existing.notes ?? "",
    updatedAt: now,
    completedAt: ["Concluído", "Entregue"].includes(data.Status ?? data.status ?? existing.status) ? now : (existing.completedAt || "")
  };
}


const orderFieldLabels = {
  customerName: "Nome do cliente",
  customerContact: "WhatsApp do cliente",
  customerDocument: "CPF/RG",
  device: "Aparelho",
  serviceValue: "Valor do serviço",
  entryDate: "Data/hora de entrada",
  expectedExitDate: "Data/hora de saída",
  status: "Status",
  receptionist: "Balconista responsável",
  technician: "Técnico responsável",
  problemDescription: "Descrição do problema",
  notes: "Observações"
};

function normalizeDiffValue(value) {
  if (value === null || value === undefined || value === "") return "Não informado";
  if (typeof value === "number") return formatCurrency(value);
  return String(value);
}

function buildOrderDiff(before, after) {
  const fields = Object.keys(orderFieldLabels);
  const changes = fields
    .filter(field => normalizeDiffValue(before?.[field]) !== normalizeDiffValue(after?.[field]))
    .map(field => `${orderFieldLabels[field]}: "${normalizeDiffValue(before?.[field])}" → "${normalizeDiffValue(after?.[field])}"`);

  return changes.length ? changes.join("; ") : "Nenhum campo principal foi alterado.";
}

async function demoApi(path, options = {}) {
  const db = getDemoDb();
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const now = localSqlNow();

  if (path === "/api/login" && method === "POST") {
    const user = db.users.find(u => u.email === body.email && u.password === body.password && u.active);
    if (!user) throw new Error("Login inválido.");
    return { token: "demo-token", user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  }

  if (!state.user) throw new Error("Sessão expirada.");

  if (path === "/api/statuses" && method === "GET") return db.statuses;
  if (path === "/api/statuses" && method === "POST") {
    db.statuses.push({ id: db.nextStatusId++, name: body.Name || body.name, color: body.Color || body.color || "#38bdf8" });
    saveDemoDb(db);
    return { message: "Status criado." };
  }
  if (path.startsWith("/api/statuses/") && method === "PUT") {
    const id = Number(path.split("/").pop());
    const status = db.statuses.find(s => s.id === id);
    if (!status) throw new Error("Status não encontrado.");
    status.name = body.Name || body.name || status.name;
    status.color = body.Color || body.color || status.color || "#38bdf8";
    saveDemoDb(db);
    return { message: "Status atualizado." };
  }

  if (path.startsWith("/api/statuses/") && method === "DELETE") {
    const id = Number(path.split("/").pop());
    db.statuses = db.statuses.filter(s => s.id !== id);
    saveDemoDb(db);
    return { message: "Status removido." };
  }

  if (path === "/api/users" && method === "GET") return db.users.map(({ password, ...u }) => u);
  if (path === "/api/users" && method === "POST") {
    db.users.push({
      id: db.nextUserId++,
      name: body.Name,
      email: body.Email,
      password: body.Password || "123456",
      role: body.Role,
      active: true
    });
    saveDemoDb(db);
    return { message: "Usuário criado." };
  }
  if (path.startsWith("/api/users/") && method === "PUT") {
    const id = Number(path.split("/").pop());
    const user = db.users.find(u => u.id === id);
    if (!user) throw new Error("Usuário não encontrado.");
    user.name = body.Name;
    user.email = body.Email;
    user.role = body.Role;
    user.active = !!body.Active;
    if (body.Password) user.password = body.Password;
    saveDemoDb(db);
    return { message: "Usuário atualizado." };
  }
  if (path.startsWith("/api/users/") && method === "DELETE") {
    const id = Number(path.split("/").pop());
    db.users = db.users.filter(u => u.id !== id);
    db.orders.forEach(o => {
      if (o.technicianId === id) {
        o.technicianId = null;
        o.technician = "";
      }
      if (o.receptionistId === id) {
        o.receptionistId = null;
        o.receptionist = "";
      }
    });
    saveDemoDb(db);
    return { message: "Usuário apagado." };
  }

  if (path === "/api/orders" && method === "GET") return db.orders;
  if (path === "/api/orders" && method === "POST") {
    const user = currentDemoUser(db);
    const order = toCamelOrder(body, db, {
      id: db.nextOrderId++,
      createdBy: user?.name || state.user.name,
      createdAt: now,
      logs: []
    });
    order.logs.push({ action: "Cadastro", details: `Ordem cadastrada por ${order.createdBy}.`, user: order.createdBy, role: state.user.role, createdAt: now });
    db.orders.unshift(order);
    saveDemoDb(db);
    return { id: order.id };
  }
  if (path.startsWith("/api/orders/") && method === "GET") {
    const id = Number(path.split("/").pop());
    const order = db.orders.find(o => o.id === id);
    if (!order) throw new Error("OS não encontrada.");
    return { order, logs: order.logs || [] };
  }
  if (path.startsWith("/api/orders/") && method === "PUT") {
    const id = Number(path.split("/").pop());
    const index = db.orders.findIndex(o => o.id === id);
    if (index < 0) throw new Error("OS não encontrada.");
    const previous = { ...db.orders[index] };
    const updated = toCamelOrder(body, db, db.orders[index]);
    updated.logs = updated.logs || [];
    const diff = buildOrderDiff(previous, updated);
    updated.logs.push({ action: "Atualização", details: diff, user: state.user.name, role: state.user.role, createdAt: now });
    db.orders[index] = updated;
    saveDemoDb(db);
    return { message: "OS atualizada." };
  }

  if (path === "/api/reports" && method === "GET") {
    const byStatus = db.statuses.map(s => ({ status: s.name, total: db.orders.filter(o => o.status === s.name).length }));
    const techs = db.users.filter(u => u.role === "Tecnico");
    const byTechnician = techs.map(t => ({ technician: t.name, total: db.orders.filter(o => Number(o.technicianId) === t.id).length }));
    return { today: db.orders.length, week: db.orders.length, month: db.orders.length, byStatus, byTechnician };
  }

  throw new Error("Recurso demo não encontrado.");
}

async function api(path, options = {}) {
  try {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": state.token ? `Bearer ${state.token}` : "",
        ...(options.headers || {})
      }
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error("Acesso negado ou sessão expirada.");
    }

    if (!response.ok) {
      throw new Error("Erro ao processar solicitação.");
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("Backend indisponível no deploy estático.");
    }

    return response.json();
  } catch (error) {
    return demoApi(path, options);
  }
}

function nowLabel() {
  return new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

function setLastUpdate() {
  const el = $("#lastUpdate");
  if (el) el.textContent = `Hora atual: ${nowLabel()}`;
}

setInterval(setLastUpdate, 1000);

function toast(title, message) {
  const item = document.createElement("div");
  item.className = "toast";
  item.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  $("#toastContainer").appendChild(item);

  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(12px)";
    setTimeout(() => item.remove(), 250);
  }, 4200);
}

function showApp() {
  $("#loginPage").classList.add("hidden");
  $("#appPage").classList.remove("hidden");

  $("#userBox").innerHTML = `
    <strong>${state.user.name}</strong><br>
    ${state.user.email}<br>
    Perfil: ${state.user.role}
  `;

  $$(".only-admin").forEach(el => {
    el.style.display = state.user.role === "Admin" ? "" : "none";
  });

  $$(".only-balconista").forEach(el => {
    const allowed = state.user.role === "Balconista" || state.user.role === "Admin";
    el.style.display = allowed ? "" : "none";
  });
}

function showLogin() {
  $("#loginPage").classList.remove("hidden");
  $("#appPage").classList.add("hidden");
}

function setDefaultNewOrderDates() {
  const form = $("#orderForm");
  if (!form) return;
  if (form.elements.EntryDate && !form.elements.EntryDate.value) {
    form.elements.EntryDate.value = localDatetimeInput();
  }
}

function pageTitle(id) {
  const titles = {
    dashboard: "Dashboard",
    orders: "Ordens de Serviço",
    newOrder: "Nova OS",
    editOrder: "Editar OS",
    users: "Usuários",
    statuses: "Status"
  };
  return titles[id] || "CoreFlow";
}

function showPage(id) {
  state.currentPage = id;
  if (id === "newOrder") setTimeout(setDefaultNewOrderDates, 0);
  $$(".page").forEach(page => page.classList.add("hidden"));
  $("#" + id).classList.remove("hidden");
  $("#pageTitle").textContent = pageTitle(id);

  if (id === "dashboard") loadReports();
  if (id === "orders") loadOrders();
  if (id === "newOrder") loadFormData();
  if (id === "users") loadUsers();
  if (id === "statuses") loadStatusesPage();
}

async function loadAll() {
  showApp();
  await loadFormData();
  await loadReports();
  await connectRealtime();
  showPage("dashboard");
}

async function connectRealtime() {
  if (state.hub) return;

  if (!window.signalR) {
    startDemoRealtime();
    return;
  }

  state.hub = new signalR.HubConnectionBuilder()
    .withUrl("/ordersHub")
    .withAutomaticReconnect()
    .build();

  state.hub.onreconnecting(() => {
    $("#connectionStatus").textContent = "Reconectando...";
  });

  state.hub.onreconnected(() => {
    $("#connectionStatus").textContent = "Online";
    toast("Tempo real ativo", "A conexão foi restaurada.");
    refreshVisibleData(false);
  });

  state.hub.on("OrderChanged", async (event) => {
    toast("Ordem atualizada", `OS #${event.orderId} foi ${event.type === "created" ? "criada" : "alterada"} por ${event.by}.`);
    await refreshVisibleData(false);
  });

  state.hub.on("DataChanged", async () => {
    toast("Dados atualizados", "Usuários ou status foram alterados.");
    await refreshVisibleData(false);
  });

  try {
    await state.hub.start();
    $("#connectionStatus").textContent = "Online";
  } catch {
    startDemoRealtime();
  }
}

async function refreshVisibleData(showNotification = true) {
  setLastUpdate();

  await loadFormData().catch(() => {});
  await loadReports().catch(() => {});

  if (state.currentPage === "orders") await loadOrders();
  if (state.currentPage === "editOrder") {
    const id = $("#editOrderForm")?.elements?.Id?.value;
    if (id) await openOrder(id, false);
  }
  if (state.currentPage === "users" && state.user.role === "Admin") await loadUsers();
  if (state.currentPage === "statuses" && state.user.role === "Admin") await loadStatusesPage();

  if (showNotification) toast("Atualizado em tempo real", "Os dados da tela foram sincronizados.");
}

async function loadFormData() {
  state.statuses = await api("/api/statuses");
  state.users = await api("/api/users").catch(() => []);

  fillStatusSelect("#statusSelect");
  fillStatusSelect("#editStatusSelect");
  fillReceptionistSelect("#receptionistSelect");
  fillReceptionistSelect("#editReceptionistSelect");
  fillTechnicianSelect("#technicianSelect");
  fillTechnicianSelect("#editTechnicianSelect");
}

function fillStatusSelect(selector) {
  const select = $(selector);
  if (!select) return;
  const current = select.value;
  select.innerHTML = state.statuses.map(s => `<option value="${s.name}">${s.name}</option>`).join("");
  if (current) select.value = current;
}

function fillReceptionistSelect(selector) {
  const select = $(selector);
  if (!select) return;
  const current = select.value;
  const receptionists = state.users.filter(u => u.role === "Balconista" || u.role === "Admin");
  select.innerHTML = `<option value="">Selecione o balconista que pegou o serviço</option>` +
    receptionists.map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join("");

  if (current) select.value = current;
  if (!select.value && state.user && (state.user.role === "Balconista" || state.user.role === "Admin")) {
    const logged = receptionists.find(u => u.id === state.user.id);
    if (logged) select.value = String(logged.id);
  }
}

function fillTechnicianSelect(selector) {
  const select = $(selector);
  if (!select) return;
  const current = select.value;
  const techs = state.users.filter(u => u.role === "Tecnico");
  select.innerHTML = `<option value="">Sem técnico definido</option>` +
    techs.map(u => `<option value="${u.id}">${u.name}</option>`).join("");
  if (current) select.value = current;
}

async function loadReports() {
  const report = await api("/api/reports");
  $("#todayCount").textContent = report.today;
  $("#weekCount").textContent = report.week;
  $("#monthCount").textContent = report.month;

  $("#statusReport").innerHTML = report.byStatus.length
    ? report.byStatus.map(item => `<div class="row"><span>${item.status}</span><strong>${item.total}</strong></div>`).join("")
    : "<p class='meta'>Nenhuma OS cadastrada.</p>";

  $("#techReport").innerHTML = report.byTechnician.length
    ? report.byTechnician.map(item => `<div class="row"><span>${item.technician}</span><strong>${item.total}</strong></div>`).join("")
    : "<p class='meta'>Nenhuma OS cadastrada.</p>";

  setLastUpdate();
}

function filterOrders(orders) {
  const search = ($("#orderSearch")?.value || "").toLowerCase().trim();
  if (!search) return orders;

  return orders.filter(order => {
    return [
      order.customerName,
      order.customerContact,
      order.customerDocument,
      order.device,
      formatCurrency(order.serviceValue),
      order.problemDescription,
      order.status,
      order.technician,
      order.receptionist,
      order.createdBy
    ].join(" ").toLowerCase().includes(search);
  });
}

async function loadOrders() {
  state.orders = await api("/api/orders");
  renderOrders();
  setLastUpdate();
}

function renderOrders() {
  const orders = filterOrders(state.orders);

  $("#ordersList").innerHTML = orders.length
    ? orders.map(order => `
      <article class="order-card">
        <div class="order-top">
          <div>
            <h3>#${order.id} - ${order.device}</h3>
            <p>${order.customerName} • ${order.customerContact}</p>
          </div>
          ${statusBadge(order.status)}
        </div>

        <p>${order.problemDescription}</p>

        <div class="meta">
          Cadastrado por: ${order.createdBy || "Não informado"} em ${order.createdAt}<br>
          Balconista responsável: ${order.receptionist || order.createdBy || "Não informado"}<br>
          Técnico: ${order.technician || "Sem técnico"}<br>
          Atualizado: ${order.updatedAt || "Sem atualização"}<br>
          Concluído/Entregue: ${order.completedAt || "Ainda não"}
        </div>

        <button onclick="openOrder(${order.id})">Visualizar</button>
      </article>
    `).join("")
    : "<p class='meta'>Nenhuma ordem de serviço encontrada.</p>";
}

function toDatetimeLocal(value) {
  if (!value) return "";
  return String(value).replace(" ", "T").slice(0, 16);
}

function labelValue(label, value) {
  return `<div class="view-item"><span>${label}</span><strong>${value || "Não informado"}</strong></div>`;
}

function applyOrderPermissions(form) {
  const role = state.user.role;
  const counterFields = ["CustomerName", "CustomerContact", "CustomerDocument", "Device", "ServiceValue", "EntryDate", "ExpectedExitDate", "ReceptionistId", "TechnicianId", "ProblemDescription"];
  const techFields = [];

  [...form.elements].forEach(field => {
    if (!field.name || field.name === "Id") return;
    field.disabled = false;
  });

  if (role === "Tecnico") {
    counterFields.forEach(name => form.elements[name] && (form.elements[name].disabled = true));
    $("#editPermissionInfo").textContent = "Técnico edita apenas status, diagnóstico, serviço realizado e observações.";
  } else if (role === "Balconista") {
    techFields.forEach(name => form.elements[name] && (form.elements[name].disabled = true));
    $("#editPermissionInfo").textContent = "Balconista edita dados do cliente/aparelho, datas, status, técnico e observações.";
  } else {
    $("#editPermissionInfo").textContent = "Administrador pode editar todos os campos da OS.";
  }
}

async function openOrder(id, changePage = true) {
  await loadFormData();

  const data = await api(`/api/orders/${id}`);
  const order = data.order;

  $("#orderView").innerHTML = [
    labelValue("Cliente", order.customerName),
    labelValue("Contato/WhatsApp", order.customerContact),
    labelValue("CPF/RG", order.customerDocument),
    labelValue("Aparelho", order.device),
    labelValue("Valor do serviço", formatCurrency(order.serviceValue)),
    labelValue("Status", order.status),
    labelValue("Data/hora de entrada", order.entryDate),
    labelValue("Data/hora de saída", order.expectedExitDate),
    labelValue("Balconista responsável", order.receptionist || order.createdBy),
    labelValue("Técnico", order.technician),
    labelValue("Cadastrado por", order.createdBy),
    labelValue("Descrição do problema", order.problemDescription),
    labelValue("Observações", order.notes)
  ].join("");

  const form = $("#editOrderForm");
  Object.keys(order).forEach(key => {
    const pascalKey = key.charAt(0).toUpperCase() + key.slice(1);
    const field = form.elements[pascalKey] || form.elements[key];
    if (!field) return;
    field.value = field.type === "datetime-local" ? toDatetimeLocal(order[key]) : (order[key] || "");
  });

  form.elements.Id.value = order.id;
  form.elements.Status.value = order.status;
  applyOrderPermissions(form);

  const whatsappBtn = $("#whatsappBtn");
  whatsappBtn.classList.add("whatsapp");
  whatsappBtn.onclick = () => openWhatsApp(order, true);

  const canReceipt = ["Concluído", "Entregue"].includes(order.status);
  const receiptBtn = $("#receiptBtn");
  receiptBtn.classList.toggle("hidden", !canReceipt);
  receiptBtn.onclick = () => emitReceipt(order);

  $("#orderLogs").innerHTML = data.logs.length
    ? data.logs.map(log => `
      <div class="status-card">
        <strong>${log.action}</strong>
        <p>${log.details}</p>
        <span class="meta">${log.user} - ${log.role} • ${log.createdAt}</span>
      </div>
    `).join("")
    : "<p class='meta'>Nenhum histórico registrado.</p>";

  if (changePage) showPage("editOrder");
}

async function loadUsers() {
  state.users = await api("/api/users");

  $("#usersList").innerHTML = state.users.map(u => `
    <form class="user-card user-edit-form" data-id="${u.id}">
      <input name="Name" value="${u.name}" required />
      <input name="Email" type="email" value="${u.email}" required />
      <input name="Password" type="password" placeholder="Nova senha opcional" />
      <select name="Role">
        <option ${u.role === "Admin" ? "selected" : ""}>Admin</option>
        <option ${u.role === "Balconista" ? "selected" : ""}>Balconista</option>
        <option ${u.role === "Tecnico" ? "selected" : ""}>Tecnico</option>
      </select>
      <label class="check-line"><input name="Active" type="checkbox" ${u.active ? "checked" : ""} /> Ativo</label>
      <div class="user-actions">
        <button type="submit">Salvar</button>
        <button type="button" class="danger" onclick="deleteUser(${u.id})" ${state.user.id === u.id ? "disabled" : ""}>Apagar</button>
      </div>
    </form>
  `).join("");

  $$(".user-edit-form").forEach(form => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = form.dataset.id;
      const data = formToJson(form);
      data.Active = form.elements.Active.checked;
      await api(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) });
      toast("Usuário atualizado", "Função e dados do usuário foram salvos.");
      await loadUsers();
    });
  });

  fillReceptionistSelect("#receptionistSelect");
  fillReceptionistSelect("#editReceptionistSelect");
  fillTechnicianSelect("#technicianSelect");
  fillTechnicianSelect("#editTechnicianSelect");
  setLastUpdate();
}

async function deleteUser(id) {
  if (!confirm("Deseja apagar este usuário? Essa ação não pode ser desfeita.")) return;
  await api(`/api/users/${id}`, { method: "DELETE" });
  toast("Usuário apagado", "O usuário foi removido do sistema.");
  await loadUsers();
}

async function loadStatusesPage() {
  state.statuses = await api("/api/statuses");

  $("#statusesList").innerHTML = state.statuses.map(s => `
    <form class="status-card status-edit-form" data-id="${s.id}">
      <span class="badge" style="--status-color:${escapeHtml(s.color || '#38bdf8')}">${escapeHtml(s.name)}</span>
      <input name="Name" value="${escapeHtml(s.name)}" required />
      <input name="Color" type="color" value="${escapeHtml(s.color || '#38bdf8')}" title="Cor do status" />
      <div class="user-actions">
        <button type="submit">Salvar cor/status</button>
        <button type="button" class="danger" onclick="deleteStatus(${s.id})">Excluir</button>
      </div>
    </form>
  `).join("");

  $$(".status-edit-form").forEach(form => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await api(`/api/statuses/${form.dataset.id}`, { method: "PUT", body: JSON.stringify(formToJson(form)) });
      toast("Status atualizado", "Nome e cor do status foram salvos.");
      await loadStatusesPage();
      await loadFormData();
    });
  });

  setLastUpdate();
}

async function deleteStatus(id) {
  if (!confirm("Deseja excluir este status?")) return;
  await api(`/api/statuses/${id}`, { method: "DELETE" });
  await loadStatusesPage();
  await loadFormData();
}

function formToJson(form) {
  const disabled = [...form.elements].filter(el => el.disabled);
  disabled.forEach(el => el.disabled = false);
  const data = Object.fromEntries(new FormData(form).entries());
  disabled.forEach(el => el.disabled = true);

  if ("ProblemDescription" in data && !("EntryCondition" in data)) {
    data.EntryCondition = data.ProblemDescription;
  }

  if (!("TechnicalDiagnosis" in data)) {
    data.TechnicalDiagnosis = "";
  }

  if (!("ServicePerformed" in data)) {
    data.ServicePerformed = "";
  }

  if ("ReceptionistId" in data) {
    data.ReceptionistId = data.ReceptionistId ? Number(data.ReceptionistId) : null;
  }

  if ("TechnicianId" in data) {
    data.TechnicianId = data.TechnicianId ? Number(data.TechnicianId) : null;
  }

  if ("ServiceValue" in data) {
    data.ServiceValue = data.ServiceValue ? Number(data.ServiceValue) : 0;
  }

  return data;
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function openWhatsApp(order, includeCouponPdf = false) {
  const digits = onlyDigits(order.customerContact);
  if (!digits) {
    alert("Cadastre o número do cliente para abrir o WhatsApp.");
    return;
  }

  if (includeCouponPdf) {
    generateCouponPdf(order, true);
  }

  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  const message = encodeURIComponent(`Olá ${order.customerName || ""}, tudo bem? Aqui é da ORIENTE. Segue o cupom de garantia da OS #${order.id} referente ao aparelho ${order.device || ""}. O PDF do cupom foi gerado para anexar nesta conversa. Valor do serviço: ${formatCurrency(order.serviceValue)}.`);
  window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function receiptLine(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Não informado")}</strong></div>`;
}

const storeInfo = {
  name: "ORIENTE",
  subtitle: "ASSISTÊNCIA TÉCNICA E ACESSÓRIOS",
  address: "Av. Rubens Caramez, 51 - Centro, Itapevi - SP, 06653-005",
  phone: ""
};

function dotLine(label, value) {
  const cleanLabel = String(label || "").toUpperCase();
  const cleanValue = String(value || "Não informado");
  return `<div class="dot-row"><span>${escapeHtml(cleanLabel)}</span><strong>${escapeHtml(cleanValue)}</strong></div>`;
}

function splitText(text, max = 36) {
  const words = String(text || "Não informado").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function generateCouponPdf(order, download = true) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    alert("Biblioteca de PDF não carregada. Use a opção de imprimir o cupom.");
    return null;
  }

  const doc = new jsPDF({ unit: "mm", format: [80, 230] });
  const left = 5;
  const width = 70;
  let y = 7;
  const line = () => { doc.text("----------------------------------------", left, y); y += 4; };
  const center = (text, size = 9, bold = false) => {
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(String(text), 40, y, { align: "center" });
    y += size > 13 ? 6 : 4;
  };
  const row = (label, value) => {
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    const labelText = `${label}`.toUpperCase().slice(0, 17);
    const valueText = String(value || "Não informado");
    const dots = ".".repeat(Math.max(2, 18 - labelText.length));
    const lines = doc.splitTextToSize(`${labelText}${dots}: ${valueText}`, width);
    lines.forEach(l => { doc.text(l, left, y); y += 4; });
  };
  const paragraph = (title, text) => {
    line();
    center(title, 9, true);
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    doc.splitTextToSize(String(text || "Não informado"), width).forEach(l => { doc.text(l, left, y); y += 4; });
  };

  center(storeInfo.name, 18, true);
  center(storeInfo.subtitle, 8);
  splitText(storeInfo.address, 34).forEach(t => center(t, 7));
  line();
  center("CUPOM FISCAL DE SERVIÇO / GARANTIA", 8, true);
  line();
  row("OS Nº", order.id);
  row("DATA ENTRADA", order.entryDate);
  row("DATA RETIRADA", order.expectedExitDate || order.completedAt);
  line();
  center("DADOS DO CLIENTE", 9, true);
  row("NOME", order.customerName);
  row("Nº CLIENTE", order.customerContact);
  row("CPF/RG", order.customerDocument);
  line();
  center("APARELHO", 9, true);
  row("APARELHO", order.device);
  paragraph("DESCRIÇÃO DO PROBLEMA", order.problemDescription);
  line();
  center("VALOR DO SERVIÇO", 9, true);
  center(formatCurrency(order.serviceValue), 13, true);
  paragraph("CONDIÇÕES DA GARANTIA", "Garantia de 90 (noventa) dias para o serviço realizado. A garantia não cobre mau uso, queda, contato com líquido, oxidação, violação do aparelho, troca/manutenção por terceiros ou defeitos diferentes do serviço descrito. Para acionar a garantia, apresente este cupom.");
  y += 10;
  doc.line(12, y, 68, y); y += 5;
  center("ASSINATURA DO CLIENTE", 8);
  y += 4;
  center("Agradecemos a preferência!", 8);
  center("ORIENTE - Assistência que você confia!", 7);

  if (download) doc.save(`cupom-garantia-OS-${order.id}.pdf`);
  return doc;
}

function emitReceipt(order) {
  const receiptWindow = window.open("", "_blank", "width=420,height=900");
  if (!receiptWindow) {
    alert("Permita pop-ups para emitir o cupom de assinatura.");
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>Cupom de Garantia OS #${escapeHtml(order.id)} - ORIENTE</title>
      <style>
        * { box-sizing: border-box; }
        @page { size: 80mm auto; margin: 3mm; }
        body { font-family: "Courier New", monospace; margin: 0; padding: 6px; color: #111; background: #f3f4f6; font-size: 11px; }
        .coupon { width: 80mm; max-width: 80mm; margin: auto; background: #fffdf8; border: 1px dashed #111; padding: 8px; }
        .center { text-align: center; }
        h1 { margin: 0; font-size: 24px; letter-spacing: 1px; line-height: 1; }
        .small { font-size: 10px; line-height: 1.35; }
        .dash { border-top: 1px dashed #111; margin: 8px 0; }
        .title { text-align: center; font-weight: 700; font-size: 12px; margin: 7px 0; }
        .dot-row { display: grid; grid-template-columns: 118px 1fr; gap: 2px; padding: 3px 0; align-items: start; }
        .dot-row span { color: #111; font-size: 10px; overflow: hidden; white-space: nowrap; }
        .dot-row span::after { content: "................"; }
        .dot-row strong { font-size: 11px; overflow-wrap: anywhere; white-space: pre-wrap; }
        .block { padding: 4px 0; }
        .block span { display: block; font-weight: 700; font-size: 11px; margin-bottom: 4px; }
        .block p, .warranty p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.35; }
        .value { text-align: center; font-weight: 700; font-size: 18px; margin: 4px 0; }
        .signature { margin-top: 34px; border-top: 1px solid #111; text-align: center; padding-top: 5px; font-size: 11px; }
        .footer { text-align: center; margin-top: 12px; font-size: 10px; }
        .actions { width: 80mm; margin: 10px auto 0; display: grid; gap: 6px; }
        button { border: 0; border-radius: 8px; padding: 9px 14px; background: #111827; color: white; cursor: pointer; }
        @media print { body { background: white; padding: 0; } .coupon { border: none; } .actions { display: none; } }
      </style>
    </head>
    <body>
      <section class="coupon">
        <div class="center">
          <h1>${escapeHtml(storeInfo.name)}</h1>
          <div class="small">${escapeHtml(storeInfo.subtitle)}</div>
          <div class="small">${escapeHtml(storeInfo.address)}</div>
        </div>
        <div class="dash"></div>
        <div class="title">CUPOM FISCAL DE SERVIÇO / GARANTIA</div>
        <div class="dash"></div>
        ${dotLine("OS Nº", order.id)}
        ${dotLine("DATA ENTRADA", order.entryDate)}
        ${dotLine("DATA RETIRADA", order.expectedExitDate || order.completedAt)}
        <div class="dash"></div>
        <div class="title">DADOS DO CLIENTE</div>
        ${dotLine("NOME", order.customerName)}
        ${dotLine("Nº CLIENTE", order.customerContact)}
        ${dotLine("CPF/RG", order.customerDocument)}
        <div class="dash"></div>
        <div class="title">APARELHO</div>
        ${dotLine("APARELHO", order.device)}
        <div class="dash"></div>
        <div class="block"><span>DESCRIÇÃO DO PROBLEMA</span><p>${escapeHtml(order.problemDescription || "Não informado")}</p></div>
        <div class="dash"></div>
        <div class="title">VALOR DO SERVIÇO</div>
        <div class="value">${escapeHtml(formatCurrency(order.serviceValue))}</div>
        <div class="dash"></div>
        <div class="warranty">
          <div class="title">CONDIÇÕES DA GARANTIA</div>
          <p>Garantia de 90 (noventa) dias para o serviço realizado. A garantia não cobre mau uso, queda, contato com líquido, oxidação, violação do aparelho, troca/manutenção por terceiros ou defeitos diferentes do serviço descrito. Para acionar a garantia, apresente este cupom.</p>
        </div>
        <div class="dash"></div>
        <div class="signature">ASSINATURA DO CLIENTE</div>
        <div class="footer">Agradecemos a preferência!<br>ORIENTE - Assistência que você confia!</div>
      </section>
      <div class="actions">
        <button onclick="window.print()">Imprimir cupom</button>
        <button onclick="window.opener && window.opener.generateCouponPdf && window.opener.generateCouponPdf(window.__ORDER__, true)">Baixar PDF do cupom</button>
      </div>
      <script>window.__ORDER__ = ${JSON.stringify(order).replaceAll("<", "\\u003c")};<\/script>
    </body>
    </html>`;

  receiptWindow.document.open();
  receiptWindow.document.write(html);
  receiptWindow.document.close();
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("#email").value,
        password: $("#password").value
      })
    });

    state.token = result.token;
    state.user = result.user;

    localStorage.setItem("token", state.token);
    localStorage.setItem("user", JSON.stringify(state.user));

    await loadAll();
  } catch {
    alert("Login inválido.");
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  if (state.hub) {
    await state.hub.stop().catch(() => {});
    state.hub = null;
  }

  localStorage.removeItem("token");
  localStorage.removeItem("user");
  state.token = null;
  state.user = null;
  showLogin();
});

$$(".sidebar button[data-page]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

$("#orderSearch")?.addEventListener("input", renderOrders);

$("#orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/orders", {
    method: "POST",
    body: JSON.stringify(formToJson(e.target))
  });

  notifyDemoRealtime();
  toast("OS cadastrada", "A ordem de serviço foi criada com sucesso.");
  e.target.reset();
  showPage("orders");
});

$("#editOrderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = formToJson(e.target);
  const id = data.Id;
  delete data.Id;

  await api(`/api/orders/${id}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });

  notifyDemoRealtime();
  toast("OS atualizada", "As alterações foram salvas com sucesso.");
  showPage("orders");
});

$("#userForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  await api("/api/users", {
    method: "POST",
    body: JSON.stringify(formToJson(e.target))
  });

  toast("Usuário criado", "Novo usuário adicionado ao sistema.");
  e.target.reset();
  await loadUsers();
});

$("#statusForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  await api("/api/statuses", {
    method: "POST",
    body: JSON.stringify(formToJson(e.target))
  });

  toast("Status criado", "Novo status adicionado ao sistema.");
  e.target.reset();
  await loadStatusesPage();
  await loadFormData();
});

if (state.token && state.user) {
  loadAll().catch(() => {
    localStorage.clear();
    showLogin();
  });
} else {
  showLogin();
}
