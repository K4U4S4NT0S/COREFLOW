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

async function api(path, options = {}) {
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

  return response.json();
}

function nowLabel() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function setLastUpdate() {
  $("#lastUpdate").textContent = `Última atualização: ${nowLabel()}`;
}

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
  if (!window.signalR || state.hub) return;

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
  });

  state.hub.on("OrderChanged", async (event) => {
    toast("Ordem atualizada", `OS #${event.orderId} foi ${event.type === "created" ? "criada" : "alterada"} por ${event.by}.`);
    await refreshVisibleData();
  });

  state.hub.on("DataChanged", async () => {
    toast("Dados atualizados", "Usuários ou status foram alterados.");
    await refreshVisibleData();
  });

  try {
    await state.hub.start();
    $("#connectionStatus").textContent = "Online";
  } catch {
    $("#connectionStatus").textContent = "Offline";
  }
}

async function refreshVisibleData() {
  setLastUpdate();

  await loadFormData().catch(() => {});
  await loadReports().catch(() => {});

  if (state.currentPage === "orders") await loadOrders();
  if (state.currentPage === "users" && state.user.role === "Admin") await loadUsers();
  if (state.currentPage === "statuses" && state.user.role === "Admin") await loadStatusesPage();
}

async function loadFormData() {
  state.statuses = await api("/api/statuses");
  state.users = await api("/api/users").catch(() => []);

  fillStatusSelect("#statusSelect");
  fillStatusSelect("#editStatusSelect");
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
      order.device,
      order.problemDescription,
      order.status,
      order.technician,
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
          <span class="badge">${order.status}</span>
        </div>

        <p>${order.problemDescription}</p>

        <div class="meta">
          Cadastrado por: ${order.createdBy || "Não informado"} em ${order.createdAt}<br>
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
  const counterFields = ["CustomerName", "CustomerContact", "Device", "EntryDate", "ExpectedExitDate", "TechnicianId", "ProblemDescription", "EntryCondition"];
  const techFields = ["TechnicalDiagnosis", "ServicePerformed"];

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

async function openOrder(id) {
  await loadFormData();

  const data = await api(`/api/orders/${id}`);
  const order = data.order;

  $("#orderView").innerHTML = [
    labelValue("Cliente", order.customerName),
    labelValue("Contato", order.customerContact),
    labelValue("Aparelho", order.device),
    labelValue("Status", order.status),
    labelValue("Data/hora de entrada", order.entryDate),
    labelValue("Data/hora de saída", order.expectedExitDate),
    labelValue("Técnico", order.technician),
    labelValue("Cadastrado por", order.createdBy),
    labelValue("Descrição do problema", order.problemDescription),
    labelValue("Condição de entrada", order.entryCondition),
    labelValue("Diagnóstico técnico", order.technicalDiagnosis),
    labelValue("Serviço realizado", order.servicePerformed),
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

  $("#orderLogs").innerHTML = data.logs.length
    ? data.logs.map(log => `
      <div class="status-card">
        <strong>${log.action}</strong>
        <p>${log.details}</p>
        <span class="meta">${log.user} - ${log.role} • ${log.createdAt}</span>
      </div>
    `).join("")
    : "<p class='meta'>Nenhum histórico registrado.</p>";

  showPage("editOrder");
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
    <div class="status-card">
      <strong>${s.name}</strong>
      <button class="danger" onclick="deleteStatus(${s.id})">Excluir</button>
    </div>
  `).join("");

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

  if ("TechnicianId" in data) {
    data.TechnicianId = data.TechnicianId ? Number(data.TechnicianId) : null;
  }

  return data;
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
