(function(){
"use strict";

/* ===================== UTIL ===================== */
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const uid = (p='id') => p + '_' + Math.random().toString(36).slice(2,9);
const todayISO = () => new Date().toISOString().slice(0,10);
function fmtDate(iso){ if(!iso) return '—'; const d = new Date(iso+'T00:00:00'); return d.toLocaleDateString('pt-BR'); }
function escapeHtml(s){ return (s||'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function toast(msg, type='ok'){
  const wrap = $('#toastWrap');
  const el = document.createElement('div');
  el.className = 'toast' + (type==='error' ? ' error' : '');
  el.innerHTML = (type==='error' ? '&#9888; ' : '&#10003; ') + escapeHtml(msg);
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),300); }, 3200);
}

/* ===================== ESTADO / PERSISTÊNCIA ===================== */
const STORAGE_KEY = 'bmb_biblioteca_v1';
let state = null;

/*
  Estrutura de dados, conforme pedido:
  users  -> Nome, R.A., Senha, Acesso (1 = admin, 0 = usuário comum)
  books  -> ID_livro, Nome_livro, Categoria, Autor, pkEmprestimo (id do empréstimo ativo ou null)
  loans  -> ID_Emprestimo, Autores, Data_pegou, Data_devolucao, Sala, Quantidade de livros
*/
function seedData(){
  const users = [
    { id: uid('usr'), name:'Administração da Biblioteca', ra:'adm@escola.com.edu', password:'12345UU', access:1 },
  ];

  const bk = (title, category, author, vest) => ({
    id: uid('bk'), title, category, author, pkEmprestimo: null, vestibular: vest||null
  });

  const books = [
    bk('Dom Casmurro','Literatura Brasileira','Machado de Assis',
      { exams:['FUVEST','UNICAMP','ENEM'], topic:'literatura', themes:'narrador não confiável, ciúme, subjetividade da memória, condição da mulher no século XIX' }),
    bk('Memórias Póstumas de Brás Cubas','Literatura Brasileira','Machado de Assis',
      { exams:['FUVEST','UNICAMP'], topic:'literatura', themes:'realismo, narrador defunto, crítica social, ironia machadiana' }),
    bk('Iracema','Literatura Brasileira','José de Alencar',
      { exams:['FUVEST','UNESP'], topic:'literatura', themes:'indianismo, formação da identidade nacional, romantismo, mito fundador do Brasil' }),
    bk('Vidas Secas','Literatura Brasileira','Graciliano Ramos',
      { exams:['FUVEST','UNICAMP','ENEM','UNESP'], topic:'literatura', themes:'seca, migração, linguagem enxuta, desumanização, regionalismo de 30' }),
    bk('A Hora da Estrela','Literatura Brasileira','Clarice Lispector',
      { exams:['UNICAMP','ENEM'], topic:'literatura', themes:'existencialismo, invisibilidade social, metaficção, migração nordestina' }),
    bk('Ensaio sobre a Cegueira','Literatura Estrangeira','José Saramago',
      { exams:['UNICAMP','ENEM'], topic:'filosofia', themes:'alegoria, colapso civilizatório, ética coletiva, condição humana' }),
    bk('1984','Literatura Estrangeira','George Orwell',
      { exams:['ENEM','UNICAMP'], topic:'atualidades', themes:'totalitarismo, vigilância, manipulação da linguagem, liberdade individual' }),
    bk('Grande Sertão: Veredas','Literatura Brasileira','Guimarães Rosa',
      { exams:['FUVEST','UNICAMP'], topic:'literatura', themes:'linguagem regional inventiva, dualidade bem/mal, sertão como universo, amor e identidade' }),
    bk('O Cortiço','Literatura Brasileira','Aluísio Azevedo',
      { exams:['FUVEST','UNICAMP','UNESP'], topic:'sociologia', themes:'naturalismo, determinismo social, coletividade, degradação urbana' }),
    bk('Sapiens: Uma Breve História da Humanidade','História & Sociedade','Yuval Noah Harari',
      { exams:['ENEM','UNICAMP'], topic:'historia', themes:'evolução humana, revolução agrícola, capitalismo, processos históricos de longa duração' }),
  ];

  const loans = [];
  function makeLoan(idx, sala, qtd, diasAtras, devolvido){
    const b = books[idx];
    const loan = {
      id: uid('emp'), bookId: b.id, authors: b.author,
      pickupDate: new Date(Date.now() - diasAtras*86400000).toISOString().slice(0,10),
      returnDate: devolvido ? todayISO() : null,
      room: sala, quantity: qtd
    };
    loans.push(loan);
    b.pkEmprestimo = devolvido ? null : loan.id;
  }
  makeLoan(0, '9º A', 1, 4, false);
  makeLoan(3, '2º EM B', 1, 12, false);
  makeLoan(6, '1º EM A', 2, 20, true);

  return { users, books, loans };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){ console.warn('Falha ao carregar estado salvo, recriando dados de exemplo.', e); }
  const seeded = seedData();
  saveStateRaw(seeded);
  return seeded;
}
function saveStateRaw(s){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }catch(e){ console.warn(e); } }
function saveState(){ saveStateRaw(state); }

state = loadState();

/* ===================== SESSÃO / LOGIN DO ADMINISTRADOR ===================== */
/* Não há tela de login separada: o site abre direto no Dashboard (usuário comum, valor 0).
   Um botão no topo abre um modal simples de login; ao validar, currentUser vira o
   registro do administrador (valor 1) e as opções de cadastro deixam de ficar invisíveis. */
const SESSION_KEY = 'bmb_sessao_v1';
let currentUser = null;

function findUser(identifier, password){
  const idNorm = (identifier||'').trim().toLowerCase();
  return state.users.find(u => u.ra.toLowerCase() === idNorm && u.password === password);
}
function isAdmin(){ return !!(currentUser && Number(currentUser.access) === 1); }

function restoreSession(){
  try{
    const raw = sessionStorage.getItem(SESSION_KEY);
    if(!raw) return false;
    const { userId } = JSON.parse(raw);
    const u = state.users.find(x=>x.id===userId);
    if(!u) return false;
    currentUser = u;
    return true;
  }catch(e){ return false; }
}
function persistSession(){ try{ sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: currentUser.id })); }catch(e){} }
function clearSession(){ try{ sessionStorage.removeItem(SESSION_KEY); }catch(e){} }

function renderUserChip(){
  if(currentUser){
    const initials = currentUser.name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
    $('#userAvatar').textContent = initials;
    $('#userAvatar').classList.remove('guest');
    $('#userName').textContent = currentUser.name;
    $('#userRole').textContent = isAdmin() ? 'Administrador' : 'Usuário comum';
    $('#loginBtn').classList.add('hidden');
    $('#logoutBtn').classList.remove('hidden');
  } else {
    $('#userAvatar').textContent = '?';
    $('#userAvatar').classList.add('guest');
    $('#userName').textContent = 'Visitante';
    $('#userRole').textContent = 'Usuário comum';
    $('#loginBtn').classList.remove('hidden');
    $('#logoutBtn').classList.add('hidden');
  }
}

/* IF usuario == valor1 (admin): pode cadastrar. ELSE: fica invisível. */
function applyRoleVisibility(){
  $$('[data-admin-only]').forEach(el=>{ el.style.display = isAdmin() ? '' : 'none'; });
  const activeSection = $('.section.active');
  if(activeSection && activeSection.id === 'sec-cadastro' && !isAdmin()){ goSection('dashboard'); }
}

function openLoginModal(){
  openModal({
    title: 'Acesso administrativo',
    bodyHtml: `
      <div class="login-intro"><div class="login-seal">MB</div><div><h4>Área reservada</h4><p>Entre para gerenciar livros, empréstimos, usuários e dados da biblioteca.</p></div></div>
      <div class="form-group full"><label>Usuário (e-mail ou R.A.)</label><input id="f-login-user" placeholder="Ex: adm@escola.com.edu" autocomplete="username"></div>
      <div class="form-group full"><label>Senha</label><input id="f-login-pass" type="password" placeholder="Digite sua senha" autocomplete="current-password"></div>
      <div class="helper" id="loginModalError" style="color:var(--stamp-red); display:none;">Usuário ou senha inválidos.</div>
      <div class="login-demo"><strong>Acesso de demonstração</strong><br>Usuário: adm@escola.com.edu<br>Senha: 12345UU</div>`,
    footButtons: [
      {label:'Cancelar', cls:'btn-ghost', onClick: closeModal},
      {label:'Entrar', cls:'btn-primary', onClick: ()=>{
        const found = findUser($('#f-login-user').value, $('#f-login-pass').value);
        if(!found){ $('#loginModalError').style.display = 'block'; return; }
        currentUser = found;
        persistSession();
        renderUserChip();
        applyRoleVisibility();
        closeModal();
        toast('Login realizado como ' + found.name + '.');
        renderAll();
      }}
    ]
  });
}
$('#loginBtn').addEventListener('click', openLoginModal);
$('#logoutBtn').addEventListener('click', ()=>{
  currentUser = null;
  clearSession();
  renderUserChip();
  applyRoleVisibility();
  goSection('dashboard');
  toast('Sessão de administrador encerrada.');
});
$('#notifBtn').addEventListener('click', ()=>{
  $('#notifDot').style.display = 'none';
  toast('Nenhuma notificação nova.');
});

/* ===================== DERIVADOS ===================== */
function bookById(id){ return state.books.find(b=>b.id===id); }
function loanById(id){ return state.loans.find(l=>l.id===id); }
function bookStatus(book){ return book.pkEmprestimo ? 'emprestado' : 'disponivel'; }

function renderHomeSearch(query=''){
  const wrap = $('#homeSearchResults');
  const term = query.trim().toLowerCase();
  if(!term){ wrap.innerHTML = ''; return; }
  const matches = state.books.filter(book => [book.title, book.author, book.category].some(value => value.toLowerCase().includes(term))).slice(0,4);
  if(!matches.length){ wrap.innerHTML = '<div class="home-search-empty">Nenhum título encontrado. Tente outro termo.</div>'; return; }
  wrap.innerHTML = matches.map(book => `
    <button class="home-result" data-book-id="${book.id}">
      <span class="result-icon"><svg class="ic" viewBox="0 0 24 24"><path d="M4 4.5C4 3.7 4.7 3 5.5 3H12v18H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M12 3h6.5A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5H12"/></svg></span>
      <span><strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(book.author)} · ${escapeHtml(book.category)}</span></span>
      <span class="status">${bookStatus(book)==='disponivel' ? 'Disponível' : 'Emprestado'}</span>
    </button>`).join('');
  $$('.home-result', wrap).forEach(result => result.addEventListener('click', ()=>{
    $('#livrosSearch').value = result.querySelector('strong').textContent;
    goSection('livros');
    renderLivros();
  }));
}

$('#homeSearch').addEventListener('input', event => renderHomeSearch(event.target.value));
$('#homeSearchBtn').addEventListener('click', ()=> renderHomeSearch($('#homeSearch').value));
$('#homeSearch').addEventListener('keydown', event => { if(event.key === 'Enter') renderHomeSearch(event.target.value); });

/* ===================== NAVEGAÇÃO ===================== */
const sectionTitles = {
  dashboard: ['Dashboard','Painel geral do acervo — atualizado em tempo real'],
  livros: ['Livros','ID_livro, Nome_livro, Categoria e status de empréstimo (PK_Emprestimo)'],
  emprestimos: ['Empréstimos','ID_Emprestimo, Autores, datas, sala e quantidade de livros'],
  historico: ['Histórico','Registro de todas as movimentações'],
  vestibular: ['Preparatório para o Vestibular','Relevância das obras em FUVEST, UNICAMP, ENEM e UNESP'],
  cadastro: ['Cadastro','Nome, R.A., Senha e Acesso (1 = administrador, 0 = usuário comum)'],
};

function goSection(name){
  if(name === 'cadastro' && !isAdmin()){ toast('Apenas administradores podem acessar o cadastro.','error'); return; }
  $$('.section').forEach(s=>s.classList.remove('active'));
  $('#sec-'+name).classList.add('active');
  $$('.nav button[data-section]').forEach(b=>b.classList.toggle('active', b.dataset.section===name));
  $('#pageTitle').textContent = sectionTitles[name][0];
  $('#pageSub').textContent = sectionTitles[name][1];
  renderTopbarActions(name);
  renderSection(name);
  $('#sidebar').classList.remove('open');
  $('#scrim').classList.remove('show');
  window.scrollTo({top:0, behavior:'smooth'});
}

$$('.nav button[data-section]').forEach(btn=>{
  btn.addEventListener('click', ()=> goSection(btn.dataset.section));
});

$('#menuToggle').addEventListener('click', ()=>{
  $('#sidebar').classList.add('open');
  $('#scrim').classList.add('show');
});
$('#scrim').addEventListener('click', ()=>{
  $('#sidebar').classList.remove('open');
  $('#scrim').classList.remove('show');
});

function renderTopbarActions(name){
  const wrap = $('#topbarActions'); wrap.innerHTML = '';
  if(!isAdmin()) return; // cadastrar só aparece para o administrador (acesso = 1)
  const actions = {
    livros: [['+ Novo livro', ()=>openBookForm()]],
    emprestimos: [['+ Novo empréstimo', ()=>openLoanForm()]],
    cadastro: [['+ Novo usuário', ()=>openUserForm()]],
  };
  (actions[name]||[]).forEach(([label, fn])=>{
    const b = document.createElement('button');
    b.className = 'btn btn-primary'; b.textContent = label; b.onclick = fn;
    wrap.appendChild(b);
  });
}

/* ===================== MODAL HELPERS ===================== */
function openModal({title, bodyHtml, footButtons, wide}){
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modal').classList.toggle('wide', !!wide);
  const foot = $('#modalFoot'); foot.innerHTML = '';
  (footButtons||[]).forEach(fb=>{
    const b = document.createElement('button');
    b.className = 'btn ' + (fb.cls||'');
    b.textContent = fb.label;
    b.onclick = fb.onClick;
    foot.appendChild(b);
  });
  $('#overlay').classList.add('show');
}
function closeModal(){ $('#overlay').classList.remove('show'); }
$('#modalClose').addEventListener('click', closeModal);
$('#overlay').addEventListener('click', e=>{ if(e.target.id==='overlay') closeModal(); });

/* ===================== CADASTRO (usuários / login) ===================== */
function openUserForm(existing){
  if(!isAdmin()) return;
  const isEdit = !!existing;
  openModal({
    title: isEdit ? 'Editar cadastro' : 'Novo cadastro',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group full"><label>Nome</label><input id="f-usr-nome" value="${escapeHtml(existing?.name||'')}"></div>
        <div class="form-group full"><label>R.A. (ou e-mail, usado no login)</label><input id="f-usr-ra" value="${escapeHtml(existing?.ra||'')}"></div>
        <div class="form-group"><label>Senha</label><input id="f-usr-senha" value="${escapeHtml(existing?.password||'')}"></div>
        <div class="form-group">
          <label>Acesso</label>
          <select id="f-usr-acesso">
            <option value="0" ${(!existing || Number(existing.access)===0) ? 'selected':''}>Usuário comum (0)</option>
            <option value="1" ${existing && Number(existing.access)===1 ? 'selected':''}>Administrador (1)</option>
          </select>
        </div>
      </div>`,
    footButtons: [
      {label:'Cancelar', cls:'btn-ghost', onClick: closeModal},
      {label: isEdit ? 'Salvar alterações' : 'Cadastrar', cls:'btn-primary', onClick: ()=>{
        const name = $('#f-usr-nome').value.trim();
        const ra = $('#f-usr-ra').value.trim();
        const password = $('#f-usr-senha').value.trim();
        if(!name || !ra || !password){ toast('Preencha nome, R.A. e senha.','error'); return; }
        const dup = state.users.find(u=> u.ra.toLowerCase()===ra.toLowerCase() && u.id !== existing?.id);
        if(dup){ toast('Já existe um cadastro com este R.A./e-mail.','error'); return; }
        const data = { name, ra, password, access: Number($('#f-usr-acesso').value) };
        if(isEdit){ Object.assign(existing, data); if(currentUser && currentUser.id===existing.id) currentUser = existing; toast('Cadastro atualizado.'); }
        else{ state.users.push({ id: uid('usr'), ...data }); toast('Cadastro realizado.'); }
        saveState(); closeModal(); renderAll();
      }}
    ]
  });
}
function deleteUser(user){
  if(!isAdmin()) return;
  if(user.id === currentUser.id){ toast('Você não pode excluir o próprio usuário logado.','error'); return; }
  const admins = state.users.filter(u=>Number(u.access)===1);
  if(Number(user.access)===1 && admins.length<=1){ toast('Deve existir ao menos um administrador cadastrado.','error'); return; }
  if(!confirm(`Excluir o cadastro de "${user.name}"?`)) return;
  state.users = state.users.filter(u=>u.id!==user.id);
  saveState(); toast('Cadastro excluído.'); renderAll();
}

/* ===================== CRUD: LIVROS ===================== */
const TOPICOS_VEST = [
  { id:'literatura', label:'Literatura', desc:'Romances, contos, poesia' },
  { id:'historia', label:'História', desc:'Processos e memória histórica' },
  { id:'sociologia', label:'Sociologia', desc:'Sociedade e desigualdade' },
  { id:'filosofia', label:'Filosofia', desc:'Pensamento crítico e ética' },
  { id:'atualidades', label:'Atualidades', desc:'Temas contemporâneos' },
];
const CATEGORIAS_LIVROS = [
  'Literatura Brasileira',
  'Literatura Estrangeira',
  'História',
  'Geografia',
  'Filosofia',
  'Sociologia',
  'Ciências',
  'Matemática',
  'Artes',
  'Tecnologia',
];

function getBookCategories(){
  return [...new Set([
    ...CATEGORIAS_LIVROS,
    ...state.books.map(book => book.category).filter(Boolean),
  ])].sort((a,b)=>a.localeCompare(b, 'pt-BR'));
}

function renderBookCategoryFilters(){
  const filter = $('#livrosFiltroCategoria');
  if(!filter) return;
  const current = filter.value;
  filter.innerHTML = '<option value="">Todas as categorias</option>' +
    getBookCategories().map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
  filter.value = current;
}

function openBookForm(existing){
  if(!isAdmin()) return;
  const isEdit = !!existing;
  const vest = existing?.vestibular || {};
  const category = existing?.category || '';
  const isCustomCategory = category && !CATEGORIAS_LIVROS.includes(category);
  const categoryOptions = getBookCategories().map(item =>
    `<option value="${escapeHtml(item)}" ${item===category ? 'selected' : ''}>${escapeHtml(item)}</option>`
  ).join('');
  openModal({
    wide:true,
    title: isEdit ? 'Editar livro' : 'Novo livro',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group full"><label>Nome_livro</label><input id="f-bk-title" value="${escapeHtml(existing?.title||'')}"></div>
        <div class="form-group">
          <label>Categoria</label>
          <select id="f-bk-category">
            <option value="">Não informar</option>
            ${categoryOptions}
            <option value="__outra__" ${isCustomCategory ? 'selected' : ''}>Outra categoria</option>
          </select>
          <input id="f-bk-category-custom" class="field hidden" style="width:100%; margin-top:7px;" placeholder="Digite a categoria" value="${isCustomCategory ? escapeHtml(category) : ''}">
        </div>
        <div class="form-group"><label>Autor</label><input id="f-bk-author" value="${escapeHtml(existing?.author||'')}"></div>
        <div class="form-group"><label>Área (radar do vestibular)</label>
          <select id="f-bk-topic">
            <option value="">Não informar</option>
            ${TOPICOS_VEST.map(t=>`<option value="${t.id}" ${vest.topic===t.id?'selected':''}>${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Provas relevantes</label><input id="f-bk-exams" placeholder="FUVEST, UNICAMP, ENEM, UNESP" value="${escapeHtml((vest.exams||[]).join(', '))}"></div>
        <div class="form-group full"><label>Temas cobrados</label><textarea id="f-bk-themes">${escapeHtml(vest.themes||'')}</textarea></div>
      </div>
      <div class="helper">O campo PK_Emprestimo é preenchido automaticamente ao registrar ou devolver um empréstimo.</div>`,
    footButtons: [
      {label:'Cancelar', cls:'btn-ghost', onClick: closeModal},
      {label: isEdit ? 'Salvar alterações' : 'Cadastrar livro', cls:'btn-primary', onClick: ()=>{
        const title = $('#f-bk-title').value.trim();
        if(!title){ toast('Informe o nome do livro.','error'); return; }
        const selectedCategory = $('#f-bk-category').value;
        const category = selectedCategory === '__outra__'
          ? $('#f-bk-category-custom').value.trim()
          : selectedCategory;
        if(selectedCategory === '__outra__' && !category){ toast('Informe o nome da categoria.','error'); return; }
        const exams = $('#f-bk-exams').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
        const topic = $('#f-bk-topic').value;
        const themes = $('#f-bk-themes').value.trim();
        const vestibular = (topic || exams.length || themes) ? { topic, exams, themes } : null;
        const data = { title, category, author: $('#f-bk-author').value.trim(), vestibular };
        if(isEdit){ Object.assign(existing, data); toast('Livro atualizado.'); }
        else{ state.books.push({ id: uid('bk'), pkEmprestimo:null, ...data }); toast('Livro cadastrado.'); }
        saveState(); closeModal(); renderAll();
      }}
    ]
  });
  const categorySelect = $('#f-bk-category');
  const customCategory = $('#f-bk-category-custom');
  const updateCustomCategory = () => customCategory.classList.toggle('hidden', categorySelect.value !== '__outra__');
  categorySelect.addEventListener('change', updateCustomCategory);
  updateCustomCategory();
}
function deleteBook(book){
  if(!isAdmin()) return;
  if(book.pkEmprestimo){ toast('Não é possível excluir: o livro está emprestado.','error'); return; }
  if(!confirm(`Excluir o livro "${book.title}"?`)) return;
  state.books = state.books.filter(b=>b.id!==book.id);
  state.loans = state.loans.filter(l=>l.bookId!==book.id);
  saveState(); toast('Livro excluído.'); renderAll();
}

/* ===================== CRUD: EMPRÉSTIMOS ===================== */
function openLoanForm(){
  if(!isAdmin()) return;
  const disponiveis = state.books.filter(b=>!b.pkEmprestimo);
  if(disponiveis.length===0){ toast('Não há livros disponíveis para empréstimo.','error'); return; }
  openModal({
    title:'Novo empréstimo',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group full">
          <label>Livro</label>
          <select id="f-emp-book">${disponiveis.map(b=>`<option value="${b.id}" data-author="${escapeHtml(b.author)}">${escapeHtml(b.title)}</option>`).join('')}</select>
        </div>
        <div class="form-group full"><label>Autores</label><input id="f-emp-authors" value="${escapeHtml(disponiveis[0].author||'')}"></div>
        <div class="form-group"><label>Data_pegou</label><input id="f-emp-pegou" type="date" value="${todayISO()}"></div>
        <div class="form-group"><label>Data_devolucao (opcional)</label><input id="f-emp-devolucao" type="date"></div>
        <div class="form-group"><label>Sala</label><input id="f-emp-sala" placeholder="Ex: 9º A"></div>
        <div class="form-group"><label>Quantd.Livro</label><input id="f-emp-qtd" type="number" min="1" value="1"></div>
      </div>`,
    footButtons: [
      {label:'Cancelar', cls:'btn-ghost', onClick: closeModal},
      {label:'Confirmar empréstimo', cls:'btn-primary', onClick: ()=>{
        const bookId = $('#f-emp-book').value;
        const room = $('#f-emp-sala').value.trim();
        const quantity = parseInt($('#f-emp-qtd').value)||1;
        if(!room){ toast('Informe a sala.','error'); return; }
        const loan = {
          id: uid('emp'), bookId, authors: $('#f-emp-authors').value.trim(),
          pickupDate: $('#f-emp-pegou').value || todayISO(),
          returnDate: $('#f-emp-devolucao').value || null,
          room, quantity
        };
        state.loans.push(loan);
        const book = bookById(bookId);
        book.pkEmprestimo = loan.id;
        saveState(); toast('Empréstimo registrado.'); closeModal(); renderAll();
      }}
    ]
  });
  $('#f-emp-book').addEventListener('change', function(){
    const opt = this.selectedOptions[0];
    $('#f-emp-authors').value = opt ? opt.dataset.author : '';
  });
}
function returnLoan(loan){
  if(!isAdmin()) return;
  if(!confirm('Confirmar devolução deste livro?')) return;
  loan.returnDate = todayISO();
  const book = bookById(loan.bookId);
  if(book) book.pkEmprestimo = null;
  saveState(); toast('Devolução registrada.'); renderAll();
}
function deleteLoan(loan){
  if(!isAdmin()) return;
  if(!loan.returnDate){ toast('Registre a devolução antes de excluir o empréstimo.','error'); return; }
  if(!confirm('Excluir este registro de empréstimo?')) return;
  state.loans = state.loans.filter(l=>l.id!==loan.id);
  saveState(); toast('Registro excluído.'); renderAll();
}

/* ===================== RENDER: DASHBOARD ===================== */
const MESES_ABREV = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
function renderDashboard(){
  const totalTitulos = state.books.length;
  const disponiveis = state.books.filter(b=>!b.pkEmprestimo).length;
  const ativos = state.loans.filter(l=>!l.returnDate).length;

  $('#st-titulos').textContent = totalTitulos;
  $('#st-disponiveis').textContent = disponiveis;
  $('#st-ativos').textContent = ativos;
  $('#st-usuarios').textContent = state.users.length;

  const moves = [];
  state.loans.forEach(l=>{
    moves.push({ date: l.pickupDate, type:'Empréstimo', loan:l });
    if(l.returnDate) moves.push({ date: l.returnDate, type:'Devolução', loan:l });
  });
  moves.sort((a,b)=> b.date.localeCompare(a.date));
  const dashHist = $('#dash-historico');
  $('#hist-count').textContent = moves.length + ' registros';
  if(moves.length===0){ dashHist.innerHTML = '<div class="empty-state">Nenhuma movimentação ainda.</div>'; }
  else{
    dashHist.innerHTML = moves.slice(0,6).map(m=>{
      const b = bookById(m.loan.bookId);
      return `<div class="mini-row"><span>${m.type==='Empréstimo'?'&#8594;':'&#8592;'} <strong>${escapeHtml(b?b.title:'—')}</strong> — ${escapeHtml(m.loan.room)}</span><span class="tag mono">${fmtDate(m.date)}</span></div>`;
    }).join('');
  }

  const emprestados = state.loans.filter(l=>!l.returnDate);
  const dashEmp = $('#dash-emprestados');
  if(emprestados.length===0){ dashEmp.innerHTML = '<div class="empty-state">Nenhum livro emprestado. ✓</div>'; }
  else{
    dashEmp.innerHTML = emprestados.map(l=>{
      const b = bookById(l.bookId);
      return `<div class="mini-row"><span><strong>${escapeHtml(b?b.title:'—')}</strong> — ${escapeHtml(l.room)}</span><span class="tag mono">${fmtDate(l.pickupDate)}</span></div>`;
    }).join('');
  }
}

/* ===================== RENDER: LIVROS ===================== */
function renderLivros(){
  const term = ($('#livrosSearch').value||'').toLowerCase();
  const filtroCategoria = $('#livrosFiltroCategoria').value;
  const filtroStatus = $('#livrosFiltroStatus').value;
  renderBookCategoryFilters();
  const tbody = $('#livrosTbody'); tbody.innerHTML = '';
  const rows = state.books.filter(b=>{
    const status = bookStatus(b);
    if(filtroCategoria && b.category!==filtroCategoria) return false;
    if(filtroStatus && status!==filtroStatus) return false;
    if(term && !(b.title.toLowerCase().includes(term) || (b.category||'').toLowerCase().includes(term) || (b.author||'').toLowerCase().includes(term))) return false;
    return true;
  });
  if(rows.length===0){ tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">Nenhum livro encontrado.</div></td></tr>`; }
  else{
    rows.forEach(b=>{
      const status = bookStatus(b);
      const stampHtml = status==='disponivel' ? `<span class="stamp stamp-ok">Disponível</span>` : `<span class="stamp stamp-out">Emprestado</span>`;
      tbody.innerHTML += `<tr>
        <td class="mono">${escapeHtml(b.id.slice(-6))}</td>
        <td class="book-title-cell"><div class="cover-thumb placeholder"><svg class="ic" viewBox="0 0 24 24"><path d="M4 4.5C4 3.7 4.7 3 5.5 3H12v18H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M12 3h6.5A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5H12"/></svg></div>${escapeHtml(b.title)}</td>
        <td>${escapeHtml(b.category||'—')}</td>
        <td>${escapeHtml(b.author||'—')}</td>
        <td>${stampHtml}</td>
        <td class="row-actions" data-admin-only>
          <button class="btn btn-sm" onclick="__editBook('${b.id}')">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="__deleteBook('${b.id}')">Excluir</button>
        </td>
      </tr>`;
    });
  }
  $('#cnt-livros').textContent = state.books.length;
  applyRoleVisibility();
}
window.__editBook = id => openBookForm(bookById(id));
window.__deleteBook = id => deleteBook(bookById(id));

/* ===================== RENDER: EMPRÉSTIMOS ===================== */
function renderEmprestimos(){
  const term = ($('#emprestimosSearch').value||'').toLowerCase();
  const filtroStatus = $('#emprestimosFiltroStatus').value;
  const tbody = $('#emprestimosTbody'); tbody.innerHTML = '';
  const rows = state.loans.filter(l=>{
    const status = l.returnDate ? 'devolvido' : 'ativo';
    if(filtroStatus && status!==filtroStatus) return false;
    const b = bookById(l.bookId);
    if(term && !((b?.title||'').toLowerCase().includes(term) || (l.authors||'').toLowerCase().includes(term) || (l.room||'').toLowerCase().includes(term))) return false;
    return true;
  }).sort((a,b)=> b.pickupDate.localeCompare(a.pickupDate));
  if(rows.length===0){ tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">Nenhum empréstimo encontrado.</div></td></tr>`; }
  else{
    rows.forEach(l=>{
      const b = bookById(l.bookId);
      const status = l.returnDate ? 'devolvido' : 'ativo';
      const stampHtml = status==='ativo' ? `<span class="stamp stamp-out">Ativo</span>` : `<span class="stamp stamp-ok">Devolvido</span>`;
      tbody.innerHTML += `<tr>
        <td class="mono">${escapeHtml(l.id.slice(-6))}</td>
        <td>${escapeHtml(b?b.title:'—')}</td>
        <td>${escapeHtml(l.authors||'—')}</td>
        <td class="mono">${fmtDate(l.pickupDate)}</td>
        <td class="mono">${fmtDate(l.returnDate)}</td>
        <td>${escapeHtml(l.room)}</td>
        <td>${l.quantity}</td>
        <td>${stampHtml}</td>
        <td class="row-actions" data-admin-only>
          ${!l.returnDate ? `<button class="btn btn-sm btn-primary" onclick="__returnLoan('${l.id}')">Devolver</button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="__deleteLoan('${l.id}')">Excluir</button>
        </td>
      </tr>`;
    });
  }
  $('#cnt-emprestimos').textContent = state.loans.length;
  applyRoleVisibility();
}
window.__returnLoan = id => returnLoan(loanById(id));
window.__deleteLoan = id => deleteLoan(loanById(id));

/* ===================== RENDER: HISTÓRICO ===================== */
function renderHistorico(){
  const term = ($('#historicoSearch').value||'').toLowerCase();
  const tbody = $('#historicoTbody'); tbody.innerHTML = '';
  const moves = [];
  state.loans.forEach(l=>{
    const b = bookById(l.bookId);
    moves.push({ date:l.pickupDate, tipo:'Empréstimo', livro:b?b.title:'—', sala:l.room, detalhe:`Quantidade: ${l.quantity}` });
    if(l.returnDate) moves.push({ date:l.returnDate, tipo:'Devolução', livro:b?b.title:'—', sala:l.room, detalhe:'Livro devolvido' });
  });
  moves.sort((a,b)=> b.date.localeCompare(a.date));
  const filtered = moves.filter(m=> !term || m.livro.toLowerCase().includes(term) || m.sala.toLowerCase().includes(term));
  if(filtered.length===0){ tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">Nenhum registro encontrado.</div></td></tr>`; }
  else{
    filtered.forEach(m=>{
      tbody.innerHTML += `<tr><td class="mono">${fmtDate(m.date)}</td><td>${escapeHtml(m.tipo)}</td><td>${escapeHtml(m.livro)}</td><td>${escapeHtml(m.sala)}</td><td>${escapeHtml(m.detalhe)}</td></tr>`;
    });
  }
}

/* ===================== RENDER: VESTIBULAR ===================== */
let vestActiveTopic = '';
let vestActiveExam = '';
const TOPIC_ICONS = {
  literatura: `<path d="M4 4.5C4 3.7 4.7 3 5.5 3H12v18H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M12 3h6.5A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5H12"/>`,
  historia: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>`,
  sociologia: `<circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 13.2c2.6.4 4.5 2.3 4.5 4.8"/>`,
  filosofia: `<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.7v.5"/><path d="M12 17h.01"/>`,
  atualidades: `<path d="M4 19V9l8-5 8 5v10"/><path d="M9 19v-6h6v6"/>`,
};
function livrosComVestibular(){ return state.books.filter(b=>b.vestibular); }
function renderTopicGrid(){
  const grid = $('#topicGrid');
  const counts = {};
  livrosComVestibular().forEach(b=>{ const t=b.vestibular.topic; if(t) counts[t]=(counts[t]||0)+1; });
  grid.innerHTML = TOPICOS_VEST.map(t=>`
    <button class="topic-card ${vestActiveTopic===t.id?'active':''}" data-topic="${t.id}">
      <svg class="ic t-ico" viewBox="0 0 24 24">${TOPIC_ICONS[t.id]||''}</svg>
      <strong>${t.label}</strong>
      <span>${t.desc} · ${counts[t.id]||0} título(s)</span>
    </button>`).join('');
  $$('.topic-card', grid).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      vestActiveTopic = (vestActiveTopic === btn.dataset.topic) ? '' : btn.dataset.topic;
      renderVestibular();
    });
  });
}
function renderVestGrid(){
  const term = ($('#vestSearch').value||'').toLowerCase();
  const grid = $('#vestGrid');
  const rows = livrosComVestibular().filter(b=>{
    if(vestActiveTopic && b.vestibular.topic !== vestActiveTopic) return false;
    if(vestActiveExam && !(b.vestibular.exams||[]).includes(vestActiveExam)) return false;
    if(term && !(b.title.toLowerCase().includes(term) || (b.author||'').toLowerCase().includes(term))) return false;
    return true;
  });
  if(rows.length===0){ grid.innerHTML = `<div class="empty-state">Nenhum título com dados de vestibular para este filtro.</div>`; return; }
  grid.innerHTML = rows.map(b=>`
    <div class="vest-card">
      <div class="exam-badges">${(b.vestibular.exams||[]).map(e=>`<span class="exam-badge">${escapeHtml(e)}</span>`).join('')}</div>
      <h4>${escapeHtml(b.title)}</h4>
      <div class="author">${escapeHtml(b.author||'')}</div>
      <div class="themes"><strong>Temas cobrados:</strong> ${escapeHtml(b.vestibular.themes||'—')}</div>
      <button class="speak-btn" data-id="${b.id}">
        <span class="wave"><span></span><span></span><span></span></span> Ouvir análise
      </button>
    </div>`).join('');
  $$('.speak-btn', grid).forEach(btn=>{ btn.addEventListener('click', ()=> falarSobreLivro(btn)); });
}
function renderVestibular(){ renderTopicGrid(); renderVestGrid(); }

function pararLeitura(){
  if('speechSynthesis' in window) window.speechSynthesis.cancel();
  $$('.speak-btn.speaking').forEach(b=> b.classList.remove('speaking'));
}
function falarSobreLivro(btn){
  const b = bookById(btn.dataset.id);
  if(!b || !b.vestibular) return;
  if(!('speechSynthesis' in window)){ toast('Seu navegador não suporta leitura em voz alta.','error'); return; }
  const jaFalando = btn.classList.contains('speaking');
  pararLeitura();
  if(jaFalando) return;
  const exams = (b.vestibular.exams||[]).join(', ') || 'nenhum vestibular específico mapeado';
  const texto = `${b.title}, de ${b.author}. Esta obra tem relevância em: ${exams}. Os principais temas cobrados são: ${b.vestibular.themes || 'não informados'}.`;
  const utt = new SpeechSynthesisUtterance(texto);
  utt.lang = 'pt-BR';
  utt.onend = () => btn.classList.remove('speaking');
  utt.onerror = () => btn.classList.remove('speaking');
  btn.classList.add('speaking');
  window.speechSynthesis.speak(utt);
}
$('#stopSpeechBtn').addEventListener('click', pararLeitura);
$('#vestSearch').addEventListener('input', renderVestGrid);
$$('#vestExamFilter button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    vestActiveExam = btn.dataset.exam;
    $$('#vestExamFilter button').forEach(b=>b.classList.toggle('active', b===btn));
    renderVestGrid();
  });
});

/* ===================== RENDER: CADASTRO ===================== */
function renderCadastro(){
  if(!isAdmin()) return;
  const term = ($('#cadastroSearch').value||'').toLowerCase();
  const tbody = $('#cadastroTbody'); tbody.innerHTML = '';
  const rows = state.users.filter(u=> !term || u.name.toLowerCase().includes(term) || u.ra.toLowerCase().includes(term));
  if(rows.length===0){ tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">Nenhum cadastro encontrado.</div></td></tr>`; }
  else{
    rows.forEach(u=>{
      const stampHtml = Number(u.access)===1 ? `<span class="stamp stamp-admin">Admin (1)</span>` : `<span class="stamp stamp-ok">Usuário (0)</span>`;
      tbody.innerHTML += `<tr>
        <td>${escapeHtml(u.name)}</td>
        <td class="mono">${escapeHtml(u.ra)}</td>
        <td class="mono">${'•'.repeat(Math.min(u.password.length,10))}</td>
        <td>${stampHtml}</td>
        <td class="row-actions">
          <button class="btn btn-sm" onclick="__editUser('${u.id}')">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="__deleteUser('${u.id}')">Excluir</button>
        </td>
      </tr>`;
    });
  }
}
window.__editUser = id => openUserForm(state.users.find(u=>u.id===id));
window.__deleteUser = id => deleteUser(state.users.find(u=>u.id===id));

/* ===================== ORQUESTRAÇÃO ===================== */
function renderSection(name){
  if(name==='dashboard') renderDashboard();
  else if(name==='livros') renderLivros();
  else if(name==='emprestimos') renderEmprestimos();
  else if(name==='historico') renderHistorico();
  else if(name==='vestibular') renderVestibular();
  else if(name==='cadastro') renderCadastro();
}
function renderAll(){
  const active = $('.section.active');
  const name = active ? active.id.replace('sec-','') : 'dashboard';
  renderDashboard();
  renderSection(name);
  $('#cnt-livros').textContent = state.books.length;
  $('#cnt-emprestimos').textContent = state.loans.length;
}

['livrosSearch','livrosFiltroCategoria','livrosFiltroStatus'].forEach(id=> $('#'+id).addEventListener('input', renderLivros));
$('#livrosNovoBtn').addEventListener('click', ()=>openBookForm());
['emprestimosSearch','emprestimosFiltroStatus'].forEach(id=> $('#'+id).addEventListener('input', renderEmprestimos));
$('#historicoSearch').addEventListener('input', renderHistorico);
$('#cadastroSearch').addEventListener('input', renderCadastro);

/* ===================== INICIALIZAÇÃO ===================== */
restoreSession();
renderUserChip();
applyRoleVisibility();
goSection('dashboard');

})();
