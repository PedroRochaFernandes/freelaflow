/* FreelaFlow — estado da aplicação, persistência (localStorage) e consultas */
const Store = (() => {
  const KEY = 'freelaflow:v1';

  const CATEGORIES = {
    receita: ['Projeto', 'Manutenção', 'Consultoria', 'Hospedagem', 'Outros'],
    despesa: [
      'Software & assinaturas',
      'Hospedagem & domínios',
      'Equipamentos',
      'Impostos',
      'Marketing',
      'Educação',
      'Internet & telefone',
      'Outros',
    ],
  };

  // Tipos de freelance (serviço prestado) — usados nos projetos e no relatório por tipo
  const SERVICE_TYPES = [
    'Landing page',
    'Site institucional',
    'E-commerce',
    'Sistema web / SaaS',
    'App / PWA',
    'API / Back-end',
    'Manutenção',
    'Consultoria',
    'Outro',
  ];

  const PROJECT_STATUS = [
    { value: 'proposta', label: 'Proposta' },
    { value: 'andamento', label: 'Em andamento' },
    { value: 'concluido', label: 'Concluído' },
  ];

  const listeners = new Set();

  const blank = () => ({
    version: 1,
    isDemo: false,
    settings: { name: '', monthlyGoal: 8000, taxRate: 6, theme: null },
    clients: [],
    projects: [],
    transactions: [],
  });

  let state = load();

  /* ---------- Persistência ---------- */
  function normalize(data) {
    const base = blank();
    const arr = (v) => (Array.isArray(v) ? v : []);
    return {
      ...base,
      ...data,
      settings: { ...base.settings, ...(data.settings || {}) },
      clients: arr(data.clients),
      projects: arr(data.projects).map((p) => ({ ...p, type: p.type || 'Outro', value: Number(p.value) || 0 })),
      transactions: arr(data.transactions).map((t) => ({ ...t, amount: Number(t.amount) || 0 })),
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (err) {
      console.warn('[FreelaFlow] Não foi possível ler os dados salvos.', err);
    }
    return buildDemo();
  }

  function commit() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('[FreelaFlow] Não foi possível salvar os dados.', err);
    }
    listeners.forEach((fn) => fn(state));
  }

  /* ---------- CRUD ---------- */
  const byId = (col, id) => state[col].find((x) => x.id === id);

  function add(col, item) {
    const record = { id: Utils.uid(), createdAt: new Date().toISOString(), ...item };
    state[col].push(record);
    commit();
    return record;
  }

  function update(col, id, patch) {
    const i = state[col].findIndex((x) => x.id === id);
    if (i < 0) return;
    state[col][i] = { ...state[col][i], ...patch };
    commit();
  }

  function remove(col, id) {
    if (col === 'clients') {
      const projectIds = state.projects.filter((p) => p.clientId === id).map((p) => p.id);
      state.projects = state.projects.filter((p) => p.clientId !== id);
      state.transactions.forEach((t) => {
        if (t.clientId === id) t.clientId = '';
        if (projectIds.includes(t.projectId)) t.projectId = '';
      });
    }
    if (col === 'projects') {
      state.transactions.forEach((t) => {
        if (t.projectId === id) t.projectId = '';
      });
    }
    state[col] = state[col].filter((x) => x.id !== id);
    commit();
  }

  function updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    commit();
  }

  function keepDemo() {
    state.isDemo = false;
    commit();
  }

  /* ---------- Consultas ---------- */
  function monthTotals(key) {
    const totals = { income: 0, expense: 0, pendingIncome: 0, pendingExpense: 0 };
    for (const t of state.transactions) {
      if (!t.date.startsWith(key)) continue;
      const paid = t.status === 'pago';
      if (t.type === 'receita') totals[paid ? 'income' : 'pendingIncome'] += t.amount;
      else totals[paid ? 'expense' : 'pendingExpense'] += t.amount;
    }
    return totals;
  }

  function monthlySeries(endKey, n = 6) {
    return Array.from({ length: n }, (_, i) => {
      const key = Utils.shiftMonth(endKey, i - (n - 1));
      return { key, ...monthTotals(key) };
    });
  }

  function expensesByCategory(key) {
    const map = new Map();
    for (const t of state.transactions) {
      if (t.type !== 'despesa' || t.status !== 'pago' || !t.date.startsWith(key)) continue;
      map.set(t.category || 'Outros', (map.get(t.category || 'Outros') || 0) + t.amount);
    }
    return [...map].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }

  const receivables = () =>
    state.transactions
      .filter((t) => t.type === 'receita' && t.status === 'pendente')
      .sort((a, b) => a.date.localeCompare(b.date));

  function clientStats(id) {
    const income = state.transactions.filter((t) => t.clientId === id && t.type === 'receita');
    return {
      billed: Utils.sum(income.filter((t) => t.status === 'pago')),
      pending: Utils.sum(income.filter((t) => t.status === 'pendente')),
      projects: state.projects.filter((p) => p.clientId === id).length,
    };
  }

  const projectReceived = (id) =>
    Utils.sum(state.transactions.filter((t) => t.projectId === id && t.type === 'receita' && t.status === 'pago'));

  /** Receita recebida agrupada pelo tipo de freelance (receitas sem freelance usam a categoria) */
  function revenueByService() {
    const map = new Map();
    for (const t of state.transactions) {
      if (t.type !== 'receita' || t.status !== 'pago') continue;
      const project = t.projectId && byId('projects', t.projectId);
      const key = project ? project.type || 'Outro' : t.category === 'Projeto' ? 'Outro' : t.category || 'Outros';
      map.set(key, (map.get(key) || 0) + t.amount);
    }
    return [...map].map(([type, amount]) => ({ type, amount })).sort((a, b) => b.amount - a.amount);
  }

  const topClients = (limit = 5) =>
    state.clients
      .map((client) => ({ client, ...clientStats(client.id) }))
      .filter((x) => x.billed > 0)
      .sort((a, b) => b.billed - a.billed)
      .slice(0, limit);

  /* ---------- Backup ---------- */
  const exportData = () => JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);

  function importData(obj) {
    if (!obj || !Array.isArray(obj.transactions) || !Array.isArray(obj.clients)) {
      throw new Error('Formato de backup inválido');
    }
    const theme = state.settings.theme;
    state = normalize({ ...obj, isDemo: false });
    state.settings.theme = theme;
    commit();
  }

  function reset() {
    const theme = state.settings.theme;
    state = blank();
    state.settings.theme = theme;
    commit();
  }

  function loadDemo() {
    const theme = state.settings.theme;
    state = buildDemo();
    state.settings.theme = theme;
    commit();
  }

  /* ---------- Dados de exemplo (sempre relativos à data atual) ---------- */
  function buildDemo() {
    const s = blank();
    s.isDemo = true;
    s.settings.name = 'Dev Freelancer';

    const now = new Date();
    const todayISO = Utils.today();
    const created = now.toISOString();
    const d = (monthOffset, day) =>
      Utils.toISO(new Date(now.getFullYear(), now.getMonth() + monthOffset, Math.min(day, 28)));
    const rel = (days) => {
      const dt = new Date(now);
      dt.setDate(dt.getDate() + days);
      return Utils.toISO(dt);
    };

    const client = (name, company, email, phone, notes = '') => {
      const c = { id: Utils.uid(), name, company, email, phone, notes, createdAt: created };
      s.clients.push(c);
      return c.id;
    };
    const project = (clientId, name, type, value, status, startDate, deadline) => {
      const p = { id: Utils.uid(), clientId, name, type, value, status, startDate, deadline, createdAt: created };
      s.projects.push(p);
      return p.id;
    };
    const tx = (type, description, amount, category, date, extra = {}) => {
      s.transactions.push({
        id: Utils.uid(),
        type,
        description,
        amount,
        category,
        date,
        status: extra.status || (date <= todayISO ? 'pago' : 'pendente'),
        clientId: extra.clientId || '',
        projectId: extra.projectId || '',
        createdAt: created,
      });
    };

    // Clientes
    const cafe = client('Ana Ribeiro', 'Café Aroma', 'ana@cafearoma.example', '(11) 90000-1234', 'Prefere contato por WhatsApp.');
    const lima = client('Marcos Lima', 'Lima Advocacia', 'contato@limaadv.example', '(21) 90000-5678', 'Contrato de manutenção mensal.');
    const doce = client('Beatriz Alves', 'Doce Encanto', 'bia@doceencanto.example', '(31) 90000-2468');
    const nova = client('Rafael Souza', 'TechNova', 'rafael@technova.example', '(11) 90000-1357', 'Startup SaaS — pagamentos em 3x.');
    const flow = client('Juliana Costa', 'Studio Pilates Flow', 'ju@studioflow.example', '(41) 90000-9753');

    // Projetos
    const pCafe = project(cafe, 'Landing page + cardápio digital', 'Landing page', 3200, 'concluido', d(-5, 2), d(-4, 10));
    const pLima = project(lima, 'Site institucional', 'Site institucional', 5800, 'concluido', d(-4, 1), d(-2, 18));
    const pDoce = project(doce, 'E-commerce de confeitaria', 'E-commerce', 9500, 'andamento', d(-2, 3), d(1, 15));
    const pNova = project(nova, 'Dashboard administrativo SaaS', 'Sistema web / SaaS', 14000, 'andamento', d(-1, 1), d(2, 10));
    project(flow, 'Sistema de agendamento online', 'Sistema web / SaaS', 6500, 'proposta', '', d(2, 28));
    project(cafe, 'App de fidelidade (PWA)', 'App / PWA', 4200, 'proposta', '', d(3, 15));

    // Receitas de projetos
    tx('receita', 'Landing page — entrada 50%', 1600, 'Projeto', d(-5, 8), { clientId: cafe, projectId: pCafe });
    tx('receita', 'Landing page — entrega final', 1600, 'Projeto', d(-4, 12), { clientId: cafe, projectId: pCafe });
    tx('receita', 'Site institucional — entrada', 2900, 'Projeto', d(-4, 3), { clientId: lima, projectId: pLima });
    tx('receita', 'Site institucional — entrega', 2900, 'Projeto', d(-2, 20), { clientId: lima, projectId: pLima });
    tx('receita', 'E-commerce — entrada 40%', 3800, 'Projeto', d(-2, 5), { clientId: doce, projectId: pDoce });
    tx('receita', 'E-commerce — parcela 2/3', 2850, 'Projeto', rel(-4), { clientId: doce, projectId: pDoce, status: 'pendente' });
    tx('receita', 'E-commerce — parcela 3/3', 2850, 'Projeto', d(1, 10), { clientId: doce, projectId: pDoce });
    tx('receita', 'Dashboard SaaS — parcela 1/3', 4000, 'Projeto', d(-1, 2), { clientId: nova, projectId: pNova });
    tx('receita', 'Dashboard SaaS — parcela 2/3', 5000, 'Projeto', d(0, 5), { clientId: nova, projectId: pNova });
    tx('receita', 'Dashboard SaaS — parcela 3/3', 5000, 'Projeto', d(1, 25), { clientId: nova, projectId: pNova });
    tx('receita', 'Consultoria de arquitetura front-end', 1200, 'Consultoria', d(-3, 22), { clientId: nova });
    tx('receita', 'Consultoria SEO técnico', 900, 'Consultoria', rel(-6), { clientId: cafe });

    // Receitas recorrentes
    for (let m = -3; m <= 1; m++) tx('receita', 'Manutenção mensal do site', 450, 'Manutenção', d(m, 10), { clientId: lima });
    for (let m = -4; m <= 0; m++) tx('receita', 'Hospedagem gerenciada', 120, 'Hospedagem', d(m, 15), { clientId: cafe });

    // Despesas recorrentes
    for (let m = -5; m <= 0; m++) {
      tx('despesa', 'Figma Professional', 75, 'Software & assinaturas', d(m, 5));
      tx('despesa', 'GitHub Copilot', 55, 'Software & assinaturas', d(m, 3));
      tx('despesa', 'Servidor VPS', 60, 'Hospedagem & domínios', d(m, 7));
      tx('despesa', 'Internet fibra 500MB', 120, 'Internet & telefone', d(m, 10));
      tx('despesa', 'Notebook — parcela', 450, 'Equipamentos', d(m, 15));
      tx('despesa', 'DAS MEI', 76, 'Impostos', d(m, 20));
    }
    for (let m = -2; m <= 0; m++) tx('despesa', 'Anúncios no Instagram', 150, 'Marketing', d(m, 12));

    // Despesas pontuais
    tx('despesa', 'Renovação de domínio .com.br', 40, 'Hospedagem & domínios', d(-4, 9));
    tx('despesa', 'Curso avançado de TypeScript', 297, 'Educação', d(-3, 14));
    tx('despesa', 'Cadeira ergonômica', 890, 'Equipamentos', d(-1, 25));
    tx('despesa', 'Ingresso evento de tecnologia', 180, 'Educação', d(0, 2));

    return s;
  }

  return {
    get state() {
      return state;
    },
    CATEGORIES,
    SERVICE_TYPES,
    PROJECT_STATUS,
    subscribe: (fn) => listeners.add(fn),
    byId, add, update, remove, updateSettings, keepDemo,
    monthTotals, monthlySeries, expensesByCategory, receivables, clientStats, projectReceived, revenueByService, topClients,
    exportData, importData, reset, loadDemo,
  };
})();
