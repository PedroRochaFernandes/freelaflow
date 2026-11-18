/* FreelaFlow — views, eventos e formulários */
(() => {
  'use strict';

  const U = Utils;
  const { money, esc, icon } = U;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const thisMonth = U.today().slice(0, 7);
  const ui = {
    month: thisMonth,
    tx: { type: 'todos', status: 'todos', month: thisMonth, project: 'todos', search: '' },
    clientSearch: '',
  };

  const NAV = [
    { key: 'dashboard', label: 'Visão geral', icon: 'dashboard' },
    { key: 'lancamentos', label: 'Lançamentos', icon: 'swap' },
    { key: 'clientes', label: 'Clientes', icon: 'users' },
    { key: 'projetos', label: 'Freelances', icon: 'briefcase' },
    { key: 'config', label: 'Ajustes', icon: 'sliders' },
  ];

  const btn = (action, label, iconName, variant = 'primary', extra = '') =>
    `<button class="btn ${variant}" data-action="${action}" ${extra}>${icon(iconName)}<span>${label}</span></button>`;

  const VIEWS = {
    dashboard: {
      title: 'Visão geral',
      subtitle: () => {
        const first = Store.state.settings.name.trim().split(' ')[0];
        return `${first ? `Olá, ${first}! ` : ''}Seu resumo financeiro de ${U.monthLabel(ui.month).toLowerCase()}.`;
      },
      actions: () => monthSwitcher() + btn('tx-new', 'Lançamento', 'plus'),
      render: renderDashboard,
    },
    lancamentos: {
      title: 'Lançamentos',
      subtitle: () => 'Todas as entradas e saídas do seu negócio.',
      actions: () => btn('tx-export', 'Exportar CSV', 'download', 'ghost') + btn('tx-new', 'Novo lançamento', 'plus'),
      render: renderTransactions,
    },
    clientes: {
      title: 'Clientes',
      subtitle: () => 'Quem paga as contas — e quanto cada um representa.',
      actions: () => btn('client-new', 'Novo cliente', 'plus'),
      render: renderClients,
    },
    projetos: {
      title: 'Freelances',
      subtitle: () => 'Cada trabalho realizado, do orçamento à entrega.',
      actions: () => btn('project-new', 'Novo freelance', 'plus'),
      render: renderProjects,
    },
    config: {
      title: 'Ajustes',
      subtitle: () => 'Metas, impostos e backup dos seus dados.',
      actions: () => '',
      render: renderSettings,
    },
  };

  /* =========================================================
     Helpers de domínio
     ========================================================= */
  const clientName = (id) => {
    const c = id && Store.byId('clients', id);
    return c ? c.company || c.name : '';
  };
  const projectName = (id) => (id && Store.byId('projects', id)?.name) || '';
  const categoryColor = (cat) => {
    const i = Store.CATEGORIES.despesa.indexOf(cat);
    return `var(--cat-${i < 0 ? 7 : i})`;
  };

  function statusInfo(t) {
    if (t.status === 'pago') return { cls: 'paid', label: t.type === 'receita' ? 'Recebido' : 'Pago' };
    if (t.date < U.today()) return { cls: 'overdue', label: 'Vencido' };
    return { cls: 'pending', label: 'Pendente' };
  }

  function dueLabel(iso) {
    const d = U.daysFromToday(iso);
    if (d < 0) return `<span class="text-warn">Vencido há ${U.plural(-d, 'dia', 'dias')}</span>`;
    if (d === 0) return '<span class="text-warn">Vence hoje</span>';
    if (d <= 7) return `Vence em ${U.plural(d, 'dia', 'dias')}`;
    return `Vence em ${U.fmtDate(iso)}`;
  }

  function delta(curr, prev, lowerIsBetter = false) {
    if (!prev) return '<span class="muted">Sem dados do mês anterior</span>';
    const pct = ((curr - prev) / prev) * 100;
    const up = pct >= 0;
    const good = lowerIsBetter ? !up : up;
    return `<span class="delta ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span><span class="muted">vs mês anterior</span>`;
  }

  const avatar = (name, cls = '') =>
    `<span class="avatar ${cls}">${esc(U.initials(name))}</span>`;

  const emptyState = (iconName, title, text, action = '') =>
    `<div class="empty">${icon(iconName, 28)}<h3>${title}</h3><p class="muted">${text}</p>${action}</div>`;

  /* =========================================================
     Render principal
     ========================================================= */
  function currentView() {
    const key = location.hash.slice(1);
    return VIEWS[key] ? key : 'dashboard';
  }

  function renderShell() {
    $('#nav').innerHTML = NAV.map(
      (n) => `<a href="#${n.key}" class="nav-link" data-nav="${n.key}">${icon(n.icon, 20)}<span>${n.label}</span></a>`
    ).join('');
  }

  function render() {
    const key = currentView();
    const view = VIEWS[key];
    const { settings, isDemo } = Store.state;
    document.title = `${view.title} · FreelaFlow`;
    $('#view-title').textContent = view.title;
    $('#view-subtitle').textContent = view.subtitle();
    $('#topbar-actions').innerHTML = view.actions();
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
    $('#demo-banner').hidden = !isDemo;
    $('#user-name').textContent = settings.name || 'Freelancer';
    $('#user-avatar').innerHTML = avatar(settings.name || 'Freelancer');
    $('#view').innerHTML = view.render();
  }

  function applyTheme() {
    const saved = Store.state.settings.theme;
    const theme = saved || 'dark'; // preto e verde por padrão
    document.documentElement.dataset.theme = theme;
    $('#theme-toggle').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon') + `<span>${theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>`;
  }

  /* =========================================================
     Dashboard
     ========================================================= */
  const monthSwitcher = () => `
    <div class="month-switch">
      <button class="icon-btn" data-action="month-prev" aria-label="Mês anterior">${icon('chevronLeft')}</button>
      <span>${U.monthLabel(ui.month)}</span>
      <button class="icon-btn" data-action="month-next" aria-label="Próximo mês">${icon('chevronRight')}</button>
    </div>`;

  const kpi = (label, value, foot, tone, iconName) => `
    <article class="card kpi">
      <div class="kpi-head"><span>${label}</span><span class="kpi-icon tone-${tone}">${icon(iconName)}</span></div>
      <strong class="kpi-value">${value}</strong>
      <div class="kpi-foot">${foot}</div>
    </article>`;

  function renderDashboard() {
    const s = Store.state.settings;
    const m = ui.month;
    const t = Store.monthTotals(m);
    const p = Store.monthTotals(U.shiftMonth(m, -1));
    const profit = t.income - t.expense;
    const margin = t.income > 0 ? (profit / t.income) * 100 : 0;
    const recv = Store.receivables();
    const overdue = recv.filter((x) => x.date < U.today());
    const goalPct = s.monthlyGoal > 0 ? (t.income / s.monthlyGoal) * 100 : 0;
    const remaining = Math.max(0, s.monthlyGoal - t.income);
    const tax = t.income * (s.taxRate / 100);

    const cats = Store.expensesByCategory(m);
    const donutItems = cats.map((c) => ({ label: c.category, value: c.amount, color: categoryColor(c.category) }));
    const top = Store.topClients(5);
    const maxBilled = top[0]?.billed || 1;
    const services = Store.revenueByService();
    const servicesTotal = U.sum(services) || 1;

    return `
      <div class="kpis">
        ${kpi('Faturamento', money(t.income), delta(t.income, p.income), 'income', 'trendUp')}
        ${kpi('Despesas', money(t.expense), delta(t.expense, p.expense, true), 'expense', 'trendDown')}
        ${kpi('Lucro líquido', money(profit), `<span class="muted">Margem de ${margin.toFixed(0)}%</span>`, 'primary', 'wallet')}
        ${kpi(
          'A receber',
          money(U.sum(recv)),
          overdue.length
            ? `<span class="pill overdue">${U.plural(overdue.length, 'vencido', 'vencidos')}</span><span class="muted">${money(U.sum(overdue))}</span>`
            : `<span class="muted">${U.plural(recv.length, 'pagamento pendente', 'pagamentos pendentes')}</span>`,
          'warn',
          'clock'
        )}
      </div>

      <div class="grid grid-dash">
        <section class="card">
          <header class="card-head">
            <div><h2>Receitas × despesas</h2><p class="muted">Valores pagos nos últimos 6 meses</p></div>
            <div class="legend"><span><i class="sw income"></i>Receitas</span><span><i class="sw expense"></i>Despesas</span></div>
          </header>
          ${Charts.bars(Store.monthlySeries(m, 6), m)}
        </section>

        <section class="card goal-card">
          <header class="card-head"><div><h2>Meta do mês</h2><p class="muted">${money(s.monthlyGoal)}</p></div><span class="kpi-icon tone-primary">${icon('target')}</span></header>
          <div class="goal-ring">${Charts.ring(goalPct)}</div>
          <p class="goal-text">${remaining > 0 ? `Faltam <strong>${money(remaining)}</strong> para bater a meta` : '<strong class="text-income">Meta batida!</strong> Bora pra próxima.'}</p>
          <dl class="stats">
            <div><dt>Reserva p/ impostos (${s.taxRate}%)</dt><dd>${money(tax)}</dd></div>
            <div><dt>Lucro após impostos</dt><dd class="${profit - tax >= 0 ? 'text-income' : 'text-expense'}">${money(profit - tax)}</dd></div>
          </dl>
        </section>
      </div>

      <div class="grid grid-pair">
        <section class="card">
          <header class="card-head"><div><h2>Receita por tipo de freelance</h2><p class="muted">Total já recebido por serviço prestado</p></div><span class="kpi-icon tone-primary">${icon('briefcase')}</span></header>
          ${
            services.length
              ? `<ul class="service-list">${services
                  .map(
                    (x) => `<li>
                      <div class="rank-row"><strong>${esc(x.type)}</strong><span>${money(x.amount)} <em>${((x.amount / servicesTotal) * 100).toFixed(0)}%</em></span></div>
                      <div class="bar-track"><span style="width:${(x.amount / services[0].amount) * 100}%"></span></div>
                    </li>`
                  )
                  .join('')}</ul>`
              : emptyState('briefcase', 'Nada recebido ainda', 'Selecione o freelance realizado ao lançar uma receita.')
          }
        </section>

        <section class="card">
          <header class="card-head"><div><h2>Próximos recebimentos</h2><p class="muted">Pagamentos pendentes de clientes</p></div></header>
          ${
            recv.length
              ? `<ul class="list">${recv
                  .slice(0, 5)
                  .map(
                    (r) => `<li class="list-item">
                      ${avatar(clientName(r.clientId) || r.description, 'sm')}
                      <div class="grow"><strong title="${esc(r.description)}">${esc(r.description)}</strong><span class="muted small">${esc(clientName(r.clientId) || 'Sem cliente')}</span><span class="small due">${dueLabel(r.date)}</span></div>
                      <div class="list-right"><strong class="text-income">${money(r.amount)}</strong>
                        <button class="chip-btn" data-action="tx-received" data-id="${r.id}">${icon('check', 14)}Recebido</button></div>
                    </li>`
                  )
                  .join('')}</ul>`
              : emptyState('check', 'Tudo recebido', 'Nenhum pagamento pendente no momento.')
          }
        </section>
      </div>

      <div class="grid grid-pair">
        <section class="card">
          <header class="card-head"><div><h2>Para onde foi o dinheiro</h2><p class="muted">Despesas pagas por categoria</p></div></header>
          ${
            donutItems.length
              ? `<div class="donut-wrap">${Charts.donut(donutItems, 'em despesas')}
                  <ul class="donut-legend">${donutItems
                    .map((it) => `<li><i class="sw" style="background:${it.color}"></i><span>${esc(it.label)}</span><b>${money(it.value)}</b></li>`)
                    .join('')}</ul></div>`
              : emptyState('wallet', 'Nenhuma despesa paga', 'Ótimo sinal — ou só falta lançar.')
          }
        </section>

        <section class="card">
          <header class="card-head"><div><h2>Top clientes</h2><p class="muted">Total já faturado</p></div></header>
          ${
            top.length
              ? `<ol class="rank">${top
                  .map(
                    (x, i) => `<li>
                      <span class="rank-n">${i + 1}</span>
                      <div class="grow">
                        <div class="rank-row"><strong>${esc(x.client.company || x.client.name)}</strong><span>${money(x.billed)}</span></div>
                        <div class="bar-track"><span style="width:${(x.billed / maxBilled) * 100}%"></span></div>
                      </div>
                    </li>`
                  )
                  .join('')}</ol>`
              : emptyState('users', 'Sem faturamento ainda', 'Vincule receitas a clientes para ver o ranking.')
          }
        </section>
      </div>`;
  }

  /* =========================================================
     Lançamentos
     ========================================================= */
  function filteredTx() {
    const { type, status, month, project, search } = ui.tx;
    const q = search.trim().toLowerCase();
    const todayISO = U.today();
    return Store.state.transactions
      .filter((t) => {
        if (type !== 'todos' && t.type !== type) return false;
        if (status === 'vencido' && !(t.status === 'pendente' && t.date < todayISO)) return false;
        if ((status === 'pago' || status === 'pendente') && t.status !== status) return false;
        if (month !== 'todos' && !t.date.startsWith(month)) return false;
        if (project === 'avulso' ? t.projectId : project !== 'todos' && t.projectId !== project) return false;
        if (q) {
          const hay = [t.description, t.category, clientName(t.clientId), projectName(t.projectId)].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function renderTransactions() {
    const months = [...new Set([thisMonth, ...Store.state.transactions.map((t) => t.date.slice(0, 7))])].sort().reverse();
    const types = { todos: 'Todos', receita: 'Receitas', despesa: 'Despesas' };
    const statuses = { todos: 'Todos os status', pago: 'Pagos / recebidos', pendente: 'Pendentes', vencido: 'Vencidos' };
    const opt = (value, label, current) => `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`;
    return `
      <div class="card toolbar">
        <div class="segmented">${Object.entries(types)
          .map(([v, l]) => `<button class="${ui.tx.type === v ? 'active' : ''}" data-action="tx-type" data-value="${v}">${l}</button>`)
          .join('')}</div>
        <select data-tx-filter="month" aria-label="Mês">${opt('todos', 'Todos os meses', ui.tx.month)}${months
          .map((k) => opt(k, U.monthLabel(k), ui.tx.month))
          .join('')}</select>
        <select data-tx-filter="status" aria-label="Status">${Object.entries(statuses).map(([v, l]) => opt(v, l, ui.tx.status)).join('')}</select>
        <select data-tx-filter="project" aria-label="Freelance">${optionsHTML(
          [{ value: 'todos', label: 'Todos os freelances' }, { value: 'avulso', label: 'Sem freelance (avulsos)' }, ...projectOptions('').slice(1)],
          ui.tx.project
        )}</select>
        <label class="search">${icon('search', 16)}<input type="search" placeholder="Buscar descrição, cliente, freelance…" data-tx-filter="search" value="${esc(ui.tx.search)}"></label>
      </div>
      <div id="tx-results">${renderTxResults()}</div>`;
  }

  function renderTxResults() {
    const list = filteredTx();
    if (!list.length) {
      return `<div class="card">${emptyState('swap', 'Nenhum lançamento encontrado', 'Ajuste os filtros ou registre uma nova entrada/saída.', btn('tx-new', 'Novo lançamento', 'plus'))}</div>`;
    }
    const income = U.sum(list.filter((t) => t.type === 'receita'));
    const expense = U.sum(list.filter((t) => t.type === 'despesa'));
    return `
      <div class="summary">
        <div><span class="muted small">Entradas</span><strong class="text-income">${money(income)}</strong></div>
        <div><span class="muted small">Saídas</span><strong class="text-expense">${money(expense)}</strong></div>
        <div><span class="muted small">Saldo</span><strong>${money(income - expense)}</strong></div>
        <div><span class="muted small">Lançamentos</span><strong>${list.length}</strong></div>
      </div>
      <div class="card table-card">
        <table class="tx-table">
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Status</th><th class="num">Valor</th><th><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>${list
            .map((t) => {
              const st = statusInfo(t);
              const sub = [clientName(t.clientId), projectName(t.projectId)].filter(Boolean).map(esc).join(' · ');
              return `<tr>
                <td class="date">${U.fmtDate(t.date)}</td>
                <td class="desc"><span class="dot ${t.type}"></span><div><strong>${esc(t.description)}</strong>${sub ? `<span class="muted small">${sub}</span>` : ''}</div></td>
                <td class="cat"><span class="tag">${esc(t.category || 'Outros')}</span></td>
                <td class="st"><button class="pill ${st.cls}" data-action="tx-toggle" data-id="${t.id}" title="Clique para alternar o status">${st.label}</button></td>
                <td class="num amount text-${t.type === 'receita' ? 'income' : 'expense'}">${t.type === 'receita' ? '+' : '−'} ${money(t.amount)}</td>
                <td class="row-actions">
                  <button class="icon-btn" data-action="tx-edit" data-id="${t.id}" aria-label="Editar">${icon('edit', 16)}</button>
                  <button class="icon-btn danger" data-action="tx-delete" data-id="${t.id}" aria-label="Excluir">${icon('trash', 16)}</button>
                </td>
              </tr>`;
            })
            .join('')}</tbody>
        </table>
      </div>`;
  }

  function exportCSV(list, filename) {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Cliente', 'Projeto', 'Status', 'Valor'];
    const rows = list.map((t) =>
      [
        U.fmtDate(t.date),
        t.type === 'receita' ? 'Receita' : 'Despesa',
        t.description,
        t.category,
        clientName(t.clientId),
        projectName(t.projectId),
        statusInfo(t).label,
        (t.type === 'receita' ? t.amount : -t.amount).toFixed(2).replace('.', ','),
      ]
        .map(cell)
        .join(';')
    );
    U.download(filename, '﻿' + [header.map(cell).join(';'), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
    toast(`${U.plural(list.length, 'lançamento exportado', 'lançamentos exportados')}`);
  }

  /* =========================================================
     Clientes
     ========================================================= */
  function renderClients() {
    return `
      <div class="card toolbar">
        <label class="search grow">${icon('search', 16)}<input type="search" placeholder="Buscar por nome, empresa ou e-mail…" data-client-search value="${esc(ui.clientSearch)}"></label>
        <span class="muted small">${U.plural(Store.state.clients.length, 'cliente', 'clientes')}</span>
      </div>
      <div id="client-results">${renderClientResults()}</div>`;
  }

  function renderClientResults() {
    const q = ui.clientSearch.trim().toLowerCase();
    const list = Store.state.clients
      .filter((c) => !q || [c.name, c.company, c.email].join(' ').toLowerCase().includes(q))
      .map((c) => ({ c, st: Store.clientStats(c.id) }))
      .sort((a, b) => b.st.billed - a.st.billed);

    if (!list.length) {
      return `<div class="card">${emptyState('users', q ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda', q ? 'Tente outro termo de busca.' : 'Cadastre seu primeiro cliente para vincular projetos e receitas.', q ? '' : btn('client-new', 'Novo cliente', 'plus'))}</div>`;
    }
    return `<div class="clients-grid">${list
      .map(
        ({ c, st }) => `<article class="card client-card">
          <header>
            ${avatar(c.name)}
            <div class="grow"><h3>${esc(c.name)}</h3><p class="muted small">${esc(c.company || 'Pessoa física')}</p></div>
            <div class="row-actions">
              <button class="icon-btn" data-action="client-edit" data-id="${c.id}" aria-label="Editar">${icon('edit', 16)}</button>
              <button class="icon-btn danger" data-action="client-delete" data-id="${c.id}" aria-label="Excluir">${icon('trash', 16)}</button>
            </div>
          </header>
          <div class="contacts">
            ${c.email ? `<a href="mailto:${esc(c.email)}">${icon('mail', 14)}${esc(c.email)}</a>` : ''}
            ${c.phone ? `<span>${icon('phone', 14)}${esc(c.phone)}</span>` : ''}
          </div>
          ${c.notes ? `<p class="notes">${esc(c.notes)}</p>` : ''}
          <div class="client-stats">
            <div><span class="muted small">Faturado</span><strong>${money(st.billed)}</strong></div>
            <div><span class="muted small">A receber</span><strong class="${st.pending ? 'text-warn' : ''}">${money(st.pending)}</strong></div>
            <div><span class="muted small">Freelances</span><strong>${st.projects}</strong></div>
          </div>
          <button class="btn ghost sm full" data-action="tx-new" data-type="receita" data-client="${c.id}">${icon('plus', 16)}<span>Registrar receita</span></button>
        </article>`
      )
      .join('')}</div>`;
  }

  /* =========================================================
     Projetos (kanban)
     ========================================================= */
  function deadlineBadge(p) {
    if (!p.deadline || p.status === 'concluido') return p.deadline ? `<span class="muted small">${icon('calendar', 14)}${U.fmtDate(p.deadline)}</span>` : '';
    const d = U.daysFromToday(p.deadline);
    if (d < 0) return `<span class="pill overdue">${icon('clock', 12)}Atrasado ${U.plural(-d, 'dia', 'dias')}</span>`;
    if (d <= 14) return `<span class="pill pending">${icon('clock', 12)}${d === 0 ? 'Entrega hoje' : `Faltam ${U.plural(d, 'dia', 'dias')}`}</span>`;
    return `<span class="muted small">${icon('calendar', 14)}${U.fmtDate(p.deadline)}</span>`;
  }

  function renderProjects() {
    const projects = Store.state.projects;
    if (!projects.length) {
      return `<div class="card">${emptyState('briefcase', 'Nenhum freelance ainda', 'Cadastre os trabalhos que você fez (ou orçou) para acompanhar quanto já recebeu de cada um.', btn('project-new', 'Novo freelance', 'plus'))}</div>`;
    }
    return `<div class="kanban">${Store.PROJECT_STATUS.map((st) => {
      const items = projects.filter((p) => p.status === st.value).sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9'));
      return `<section class="kanban-col">
        <header class="kanban-head">
          <span class="status-dot ${st.value}"></span><h2>${st.label}</h2><span class="count">${items.length}</span>
          <span class="muted small push">${money(U.sum(items, (p) => p.value))}</span>
        </header>
        <div class="kanban-list">${items.map(projectCard).join('') || '<p class="empty-col muted small">Nenhum freelance aqui</p>'}</div>
      </section>`;
    }).join('')}</div>`;
  }

  function projectCard(p) {
    const received = Store.projectReceived(p.id);
    const pct = p.value > 0 ? Math.min(100, (received / p.value) * 100) : 0;
    return `<article class="card project-card">
      <div class="project-top">
        <span class="muted small">${esc(clientName(p.clientId) || 'Sem cliente')}</span>
        <div class="row-actions">
          <button class="icon-btn" data-action="project-edit" data-id="${p.id}" aria-label="Editar">${icon('edit', 15)}</button>
          <button class="icon-btn danger" data-action="project-delete" data-id="${p.id}" aria-label="Excluir">${icon('trash', 15)}</button>
        </div>
      </div>
      <h3>${esc(p.name)}</h3>
      <span class="type-badge">${icon('briefcase', 12)}${esc(p.type || 'Outro')}</span>
      <p class="project-value">${money(p.value)}</p>
      <div class="bar-track ${pct >= 100 ? 'done' : ''}"><span style="width:${pct}%"></span></div>
      <div class="project-meta"><span class="muted small">${money(received)} recebido · ${pct.toFixed(0)}%</span>${deadlineBadge(p)}</div>
      <div class="project-actions">
        <button class="btn ghost sm" data-action="tx-new" data-type="receita" data-project="${p.id}" title="Registrar um pagamento deste freelance">${icon('plus', 15)}<span>Pagamento</span></button>
        <button class="btn ghost sm" data-action="tx-filter-project" data-id="${p.id}" title="Ver os lançamentos deste freelance">${icon('swap', 15)}<span>Histórico</span></button>
      </div>
      <select class="status-select" data-change="project-status" data-id="${p.id}" aria-label="Mover freelance">
        ${Store.PROJECT_STATUS.map((s) => `<option value="${s.value}" ${s.value === p.status ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>
    </article>`;
  }

  /* =========================================================
     Ajustes
     ========================================================= */
  function renderSettings() {
    const s = Store.state.settings;
    return `
      <div class="grid grid-2">
        <section class="card">
          <header class="card-head"><div><h2>Perfil e metas</h2><p class="muted">Usados nos cálculos do dashboard.</p></div></header>
          <form id="settings-form" class="form-grid">
            <div class="field full"><label for="s-name">Seu nome</label><input id="s-name" name="name" value="${esc(s.name)}" placeholder="Como quer ser chamado(a)?"></div>
            <div class="field"><label for="s-goal">Meta de faturamento mensal (R$)</label><input id="s-goal" name="monthlyGoal" type="number" min="0" step="100" value="${s.monthlyGoal}"></div>
            <div class="field"><label for="s-tax">Alíquota para reserva de impostos (%)</label><input id="s-tax" name="taxRate" type="number" min="0" max="100" step="0.5" value="${s.taxRate}"></div>
            <p class="hint full muted small">Dica: MEI costuma reservar o valor fixo do DAS; no Simples Nacional (Anexo III) a alíquota inicial é de 6%.</p>
            <div class="full form-actions">
              <button class="btn primary" type="submit">${icon('check')}<span>Salvar ajustes</span></button>
              ${btn('theme', document.documentElement.dataset.theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro', document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 'ghost', 'type="button"')}
            </div>
          </form>
        </section>

        <section class="card">
          <header class="card-head"><div><h2>Seus dados</h2><p class="muted">Tudo fica salvo apenas neste navegador. Nada é enviado para servidores.</p></div></header>
          <div class="data-actions">
            ${btn('data-export', 'Baixar backup (JSON)', 'download', 'ghost')}
            <label class="btn ghost" for="import-file">${icon('upload')}<span>Importar backup</span></label>
            <input id="import-file" type="file" accept="application/json,.json" hidden>
            ${btn('data-csv', 'Exportar todos os lançamentos (CSV)', 'download', 'ghost')}
            ${btn('data-demo', 'Carregar dados de exemplo', 'sparkles', 'ghost')}
            ${btn('data-reset', 'Apagar todos os dados', 'trash', 'danger-ghost')}
          </div>
          <div class="about">
            <strong>FreelaFlow</strong>
            <p class="muted small">Feito com HTML, CSS e JavaScript puros — sem frameworks, sem dependências e com gráficos em SVG desenhados à mão.</p>
            <p class="muted small">Atalho: pressione <kbd>N</kbd> em qualquer tela para criar um lançamento.</p>
          </div>
        </section>
      </div>`;
  }

  /* =========================================================
     Modal, formulários, confirmação e toasts
     ========================================================= */
  const modal = () => $('#modal');

  function fieldHTML(f) {
    const id = `f-${f.name}`;
    const v = f.value ?? '';
    const attrs = [
      f.required ? 'required' : '',
      f.step ? `step="${f.step}"` : '',
      f.min != null ? `min="${f.min}"` : '',
      f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '',
    ].join(' ');
    let input;
    if (f.type === 'select') {
      input = `<select id="${id}" name="${f.name}" ${attrs}>${optionsHTML(f.options, v)}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${id}" name="${f.name}" rows="3" ${attrs}>${esc(v)}</textarea>`;
    } else if (f.type === 'segmented') {
      input = `<div class="segmented big" role="radiogroup">${f.options
        .map((o) => `<label class="seg-${o.value}"><input type="radio" name="${f.name}" value="${o.value}" ${o.value === v ? 'checked' : ''}><span>${o.label}</span></label>`)
        .join('')}</div>`;
    } else {
      input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${attrs}>`;
    }
    const label = f.type === 'segmented' ? `<span class="label">${f.label}</span>` : `<label for="${id}">${f.label}</label>`;
    const hint = f.hint ? `<span class="field-hint">${f.hint}</span>` : '';
    return `<div class="field ${f.full ? 'full' : ''}${f.name === 'projectId' ? ' field-freelance' : ''}">${label}${input}${hint}</div>`;
  }

  // Aceita opções com `group` para gerar <optgroup> (ex.: freelances agrupados por etapa)
  function optionsHTML(options, value) {
    const one = (o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`;
    let html = '';
    let group = null;
    for (const o of options) {
      if (o.group !== group) {
        if (group) html += '</optgroup>';
        if (o.group) html += `<optgroup label="${esc(o.group)}">`;
        group = o.group;
      }
      html += one(o);
    }
    return group ? `${html}</optgroup>` : html;
  }

  function setOptions(select, options) {
    const current = select.value;
    select.innerHTML = optionsHTML(options, current);
    if (!options.some((o) => String(o.value) === current)) select.value = options[0]?.value ?? '';
  }

  function openForm({ title, fields, submitLabel = 'Salvar', onSubmit, onChange }) {
    const dlg = modal();
    dlg.innerHTML = `
      <form class="modal-body">
        <header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Fechar">${icon('x')}</button></header>
        <div class="form-grid">${fields.map(fieldHTML).join('')}</div>
        <footer class="modal-foot"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="submit" class="btn primary">${icon('check')}<span>${submitLabel}</span></button></footer>
      </form>`;
    const form = $('form', dlg);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = {};
      for (const f of fields) {
        const raw = form.elements.namedItem(f.name).value;
        data[f.name] = f.type === 'number' ? Number(raw) || 0 : typeof raw === 'string' ? raw.trim() : raw;
      }
      onSubmit(data);
      dlg.close();
    });
    if (onChange) form.addEventListener('change', (e) => onChange(form, e.target.name));
    $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
    dlg.showModal();
    $('input:not([type=radio]), select, textarea', form)?.focus();
  }

  function confirmDialog({ title, message, confirmLabel = 'Excluir', danger = true }) {
    const dlg = modal();
    dlg.innerHTML = `
      <form method="dialog" class="modal-body confirm">
        <div class="confirm-icon ${danger ? 'danger' : ''}">${icon(danger ? 'trash' : 'alert', 22)}</div>
        <h2>${esc(title)}</h2>
        <p class="muted">${esc(message)}</p>
        <footer class="modal-foot"><button value="cancel" class="btn ghost">Cancelar</button><button value="ok" class="btn ${danger ? 'danger' : 'primary'}">${esc(confirmLabel)}</button></footer>
      </form>`;
    dlg.returnValue = '';
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
      dlg.showModal();
    });
  }

  function toast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check', 16)}<span>${esc(message)}</span>`;
    $('#toasts').append(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  /* ---------- Formulários de domínio ---------- */
  const catOptions = (type) => Store.CATEGORIES[type].map((c) => ({ value: c, label: c }));
  const clientOptions = () => [
    { value: '', label: 'Nenhum' },
    ...[...Store.state.clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.company ? `${c.company} (${c.name})` : c.name })),
  ];
  // Freelances para selecionar, agrupados por etapa (concluídos e em andamento primeiro)
  const projectOptions = (clientId) => {
    const order = ['concluido', 'andamento', 'proposta'];
    const projects = Store.state.projects
      .filter((p) => !clientId || p.clientId === clientId)
      .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.name.localeCompare(b.name));
    return [
      { value: '', label: projects.length ? 'Nenhum (lançamento avulso)' : 'Nenhum freelance cadastrado' },
      ...projects.map((p) => ({
        value: p.id,
        label: `${p.name} · ${clientName(p.clientId) || 'sem cliente'}`,
        group: Store.PROJECT_STATUS.find((s) => s.value === p.status)?.label,
      })),
    ];
  };

  function txForm(tx = null, preset = {}) {
    const t = tx || {
      type: preset.type || 'receita',
      description: '',
      amount: '',
      category: '',
      date: U.today(),
      status: 'pago',
      clientId: preset.clientId || Store.byId('projects', preset.projectId)?.clientId || '',
      projectId: preset.projectId || '',
    };
    if (!tx && preset.projectId) {
      t.category = 'Projeto';
      t.description = `Pagamento — ${projectName(preset.projectId)}`;
    }
    openForm({
      title: tx ? 'Editar lançamento' : 'Novo lançamento',
      submitLabel: tx ? 'Salvar alterações' : 'Adicionar',
      fields: [
        { name: 'type', label: 'Tipo', type: 'segmented', value: t.type, full: true, options: [{ value: 'receita', label: 'Receita' }, { value: 'despesa', label: 'Despesa' }] },
        { name: 'projectId', label: 'Freelance realizado', type: 'select', value: t.projectId, full: true, options: projectOptions(t.clientId), hint: 'Escolha o trabalho a que este valor se refere: cliente, categoria e descrição são preenchidos para você.' },
        { name: 'description', label: 'Descrição', required: true, value: t.description, full: true, placeholder: 'Ex.: Entrada do site, assinatura de software…' },
        { name: 'amount', label: 'Valor (R$)', type: 'number', step: '0.01', min: '0.01', required: true, value: t.amount, placeholder: '0,00' },
        { name: 'date', label: 'Data / vencimento', type: 'date', required: true, value: t.date },
        { name: 'category', label: 'Categoria', type: 'select', value: t.category, options: catOptions(t.type) },
        { name: 'status', label: 'Status', type: 'select', value: t.status, options: [{ value: 'pago', label: 'Pago / recebido' }, { value: 'pendente', label: 'Pendente' }] },
        { name: 'clientId', label: 'Cliente', type: 'select', value: t.clientId, options: clientOptions(), full: true },
      ],
      onChange(form, name) {
        const el = (n) => form.elements.namedItem(n);
        if (name === 'type') setOptions(el('category'), catOptions(el('type').value));
        if (name === 'clientId') setOptions(el('projectId'), projectOptions(el('clientId').value));
        if (name === 'projectId') {
          const p = Store.byId('projects', el('projectId').value);
          if (!p) return;
          // Preenche o resto a partir do freelance escolhido
          el('clientId').value = p.clientId;
          setOptions(el('projectId'), projectOptions(p.clientId));
          el('projectId').value = p.id;
          if (el('type').value === 'receita') el('category').value = 'Projeto';
          const desc = el('description');
          if (!desc.value.trim() || desc.dataset.auto) {
            desc.value = `${el('type').value === 'receita' ? 'Pagamento' : 'Custo'} — ${p.name}`;
            desc.dataset.auto = '1';
          }
        }
        if (name === 'description') delete el('description').dataset.auto;
      },
      onSubmit(data) {
        data.amount = Math.round(data.amount * 100) / 100;
        if (data.projectId && !data.clientId) data.clientId = Store.byId('projects', data.projectId)?.clientId || '';
        if (tx) Store.update('transactions', tx.id, data);
        else Store.add('transactions', data);
        toast(tx ? 'Lançamento atualizado' : `${data.type === 'receita' ? 'Receita' : 'Despesa'} adicionada`);
      },
    });
  }

  function clientForm(c = null) {
    const v = c || {};
    openForm({
      title: c ? 'Editar cliente' : 'Novo cliente',
      submitLabel: c ? 'Salvar alterações' : 'Cadastrar',
      fields: [
        { name: 'name', label: 'Nome do contato', required: true, value: v.name, placeholder: 'Ex.: Maria Silva' },
        { name: 'company', label: 'Empresa', value: v.company, placeholder: 'Opcional' },
        { name: 'email', label: 'E-mail', type: 'email', value: v.email, placeholder: 'maria@empresa.com' },
        { name: 'phone', label: 'Telefone / WhatsApp', type: 'tel', value: v.phone, placeholder: '(00) 00000-0000' },
        { name: 'notes', label: 'Observações', type: 'textarea', value: v.notes, full: true, placeholder: 'Forma de pagamento, preferências, contrato…' },
      ],
      onSubmit(data) {
        if (c) Store.update('clients', c.id, data);
        else Store.add('clients', data);
        toast(c ? 'Cliente atualizado' : 'Cliente cadastrado');
      },
    });
  }

  function projectForm(p = null) {
    if (!Store.state.clients.length) {
      toast('Cadastre um cliente antes de criar um freelance', 'error');
      clientForm();
      return;
    }
    const v = p || { status: 'proposta' };
    openForm({
      title: p ? 'Editar freelance' : 'Novo freelance',
      submitLabel: p ? 'Salvar alterações' : 'Cadastrar freelance',
      fields: [
        { name: 'name', label: 'Nome do freelance', required: true, value: v.name, full: true, placeholder: 'Ex.: Site da Padaria Central' },
        { name: 'type', label: 'Tipo de freelance', type: 'select', value: v.type || Store.SERVICE_TYPES[0], options: Store.SERVICE_TYPES.map((t) => ({ value: t, label: t })) },
        { name: 'clientId', label: 'Cliente', type: 'select', value: v.clientId, options: clientOptions().slice(1) },
        { name: 'value', label: 'Valor total (R$)', type: 'number', step: '0.01', min: '0', required: true, value: v.value, placeholder: '0,00' },
        { name: 'status', label: 'Etapa', type: 'select', value: v.status, options: Store.PROJECT_STATUS },
        { name: 'deadline', label: 'Prazo de entrega', type: 'date', value: v.deadline, full: false },
      ],
      onSubmit(data) {
        if (p) Store.update('projects', p.id, data);
        else Store.add('projects', { ...data, startDate: data.status === 'proposta' ? '' : U.today() });
        toast(p ? 'Freelance atualizado' : 'Freelance cadastrado');
      },
    });
  }

  /* =========================================================
     Ações (delegação de eventos)
     ========================================================= */
  const actions = {
    'month-prev': () => { ui.month = U.shiftMonth(ui.month, -1); render(); },
    'month-next': () => { ui.month = U.shiftMonth(ui.month, 1); render(); },

    'tx-new': (el) => txForm(null, { type: el.dataset.type, clientId: el.dataset.client, projectId: el.dataset.project }),
    'tx-edit': (el) => txForm(Store.byId('transactions', el.dataset.id)),
    'tx-delete': async (el) => {
      if (await confirmDialog({ title: 'Excluir lançamento?', message: 'Essa ação não pode ser desfeita.' })) {
        Store.remove('transactions', el.dataset.id);
        toast('Lançamento excluído');
      }
    },
    'tx-toggle': (el) => {
      const t = Store.byId('transactions', el.dataset.id);
      Store.update('transactions', t.id, { status: t.status === 'pago' ? 'pendente' : 'pago' });
    },
    'tx-received': (el) => {
      Store.update('transactions', el.dataset.id, { status: 'pago', date: U.today() });
      toast('Pagamento registrado como recebido hoje');
    },
    'tx-type': (el) => { ui.tx.type = el.dataset.value; render(); },
    'tx-filter-project': (el) => {
      Object.assign(ui.tx, { project: el.dataset.id, month: 'todos', status: 'todos', type: 'todos', search: '' });
      location.hash = 'lancamentos';
    },
    'tx-export': () => exportCSV(filteredTx(), `freelaflow-lancamentos-${U.today()}.csv`),

    'client-new': () => clientForm(),
    'client-edit': (el) => clientForm(Store.byId('clients', el.dataset.id)),
    'client-delete': async (el) => {
      const c = Store.byId('clients', el.dataset.id);
      const n = Store.state.projects.filter((p) => p.clientId === c.id).length;
      const ok = await confirmDialog({
        title: `Excluir ${c.name}?`,
        message: `${n ? `${U.plural(n, 'freelance deste cliente será excluído', 'freelances deste cliente serão excluídos')}. ` : ''}Os lançamentos financeiros são mantidos, apenas sem vínculo.`,
      });
      if (ok) { Store.remove('clients', c.id); toast('Cliente excluído'); }
    },

    'project-new': () => projectForm(),
    'project-edit': (el) => projectForm(Store.byId('projects', el.dataset.id)),
    'project-delete': async (el) => {
      if (await confirmDialog({ title: 'Excluir freelance?', message: 'Os lançamentos vinculados são mantidos, apenas sem vínculo.' })) {
        Store.remove('projects', el.dataset.id);
        toast('Freelance excluído');
      }
    },

    theme: () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      Store.updateSettings({ theme: next });
    },
    'demo-keep': () => Store.keepDemo(),
    'demo-clear': async () => {
      if (await confirmDialog({ title: 'Começar do zero?', message: 'Os dados de exemplo serão apagados para você cadastrar os seus.', confirmLabel: 'Limpar e começar' })) {
        Store.reset();
        toast('Tudo pronto! Comece cadastrando um cliente.');
      }
    },
    'data-export': () => {
      U.download(`freelaflow-backup-${U.today()}.json`, Store.exportData(), 'application/json');
      toast('Backup baixado');
    },
    'data-csv': () => exportCSV(Store.state.transactions, `freelaflow-todos-lancamentos-${U.today()}.csv`),
    'data-demo': async () => {
      if (await confirmDialog({ title: 'Carregar dados de exemplo?', message: 'Seus dados atuais serão substituídos. Baixe um backup antes, se quiser mantê-los.', confirmLabel: 'Carregar exemplo', danger: false })) {
        Store.loadDemo();
        toast('Dados de exemplo carregados');
      }
    },
    'data-reset': async () => {
      if (await confirmDialog({ title: 'Apagar todos os dados?', message: 'Clientes, projetos e lançamentos serão removidos deste navegador. Não dá para desfazer.', confirmLabel: 'Apagar tudo' })) {
        Store.reset();
        toast('Dados apagados');
      }
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !actions[el.dataset.action]) return;
    e.preventDefault();
    actions[el.dataset.action](el);
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.txFilter) {
      ui.tx[el.dataset.txFilter] = el.value;
      $('#tx-results').innerHTML = renderTxResults();
    } else if ('clientSearch' in el.dataset) {
      ui.clientSearch = el.value;
      $('#client-results').innerHTML = renderClientResults();
    }
  });

  document.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.change === 'project-status') {
      Store.update('projects', el.dataset.id, { status: el.value });
      toast(`Freelance movido para "${Store.PROJECT_STATUS.find((s) => s.value === el.value).label}"`);
    }
    if (el.id === 'import-file' && el.files[0]) {
      const file = el.files[0];
      el.value = '';
      const ok = await confirmDialog({ title: 'Importar backup?', message: `Os dados atuais serão substituídos pelo conteúdo de "${file.name}".`, confirmLabel: 'Importar', danger: false });
      if (!ok) return;
      try {
        Store.importData(JSON.parse(await file.text()));
        toast('Backup importado com sucesso');
      } catch {
        toast('Arquivo inválido: use um backup gerado pelo FreelaFlow', 'error');
      }
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'settings-form') return;
    e.preventDefault();
    const f = new FormData(e.target);
    Store.updateSettings({
      name: String(f.get('name')).trim(),
      monthlyGoal: Math.max(0, Number(f.get('monthlyGoal')) || 0),
      taxRate: Math.min(100, Math.max(0, Number(f.get('taxRate')) || 0)),
    });
    toast('Ajustes salvos');
  });

  // Atalho de teclado: "N" abre um novo lançamento
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (modal().open || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    txForm();
  });

  function setupTooltip() {
    const tip = $('#tooltip');
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest?.('[data-tip]');
      if (!el) { tip.hidden = true; return; }
      tip.innerHTML = el.dataset.tip;
      tip.hidden = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (tip.hidden) return;
      const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
      const y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8);
      tip.style.transform = `translate(${x}px, ${y}px)`;
    });
  }

  /* ---------- Inicialização ---------- */
  renderShell();
  applyTheme();
  render();
  setupTooltip();
  Store.subscribe(() => { applyTheme(); render(); });
  window.addEventListener('hashchange', () => { render(); window.scrollTo({ top: 0 }); });
  modal().addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
})();
