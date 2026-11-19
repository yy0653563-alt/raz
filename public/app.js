const STORAGE_KEY = 'raz.conversations.v1';
const MODEL_KEY = 'raz.model.v1';
const KEY_STORE = 'raz.mistral.key.v1';
const MISTRAL_BASE = 'https://api.mistral.ai/v1';
const STATIC_MODE = /\.github\.io$/.test(location.hostname) || new URLSearchParams(location.search).has('static');
const MODEL_CHAIN = ['mistral-small-latest', 'mistral-medium-latest', 'open-mistral-nemo', 'pixtral-12b-2409'];
const listEl = document.getElementById('conversationList');
const messagesEl = document.getElementById('messages');
const welcomeEl = document.getElementById('welcome');
const form = document.getElementById('chatForm');
const input = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const countEl = document.getElementById('charCount');
const chatScroll = document.getElementById('chatScroll');
const modelSelect = document.getElementById('modelSelect');
let conversations = loadConversations();
let activeId = null;
let busy = false;
let controller = null;
let chosenModel = localStorage.getItem(MODEL_KEY) || '';
let apiKey = localStorage.getItem(KEY_STORE) || '';
let staticModels = [];

function loadConversations() {
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(saved) ? saved : []; }
  catch { return []; }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations)); }
function id() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function activeConversation() { return conversations.find((chat) => chat.id === activeId); }
function renderSidebar() {
  listEl.replaceChildren();
  conversations.forEach((chat) => {
    const row = document.createElement('div'); row.className = `conversation-item${chat.id === activeId ? ' active' : ''}`;
    const icon = document.createElement('span'); icon.className = 'conversation-icon'; icon.textContent = '↳';
    const title = document.createElement('span'); title.className = 'conversation-title'; title.textContent = chat.title || 'محادثة جديدة';
    const exp = document.createElement('button'); exp.className = 'export-chat'; exp.type = 'button'; exp.title = 'تصدير المحادثة (Markdown)'; exp.setAttribute('aria-label', 'تصدير المحادثة'); exp.textContent = '↓';
    exp.addEventListener('click', (event) => { event.stopPropagation(); exportConversation(chat); });
    const remove = document.createElement('button'); remove.className = 'delete-chat'; remove.type = 'button'; remove.setAttribute('aria-label', 'حذف المحادثة'); remove.textContent = '×';
    remove.addEventListener('click', (event) => { event.stopPropagation(); conversations = conversations.filter((item) => item.id !== chat.id); if (activeId === chat.id) activeId = null; save(); renderSidebar(); renderMessages(); });
    row.append(icon, title, exp, remove); row.addEventListener('click', () => { activeId = chat.id; renderSidebar(); renderMessages(); closeSidebar(); }); listEl.append(row);
  });
}
function exportConversation(chat) {
  const lines = [`# ${chat.title || 'محادثة راز'}`];
  chat.messages.forEach((message) => {
    lines.push('', message.role === 'user' ? '**أنت:**' : `**راز**${message.model ? ` · \`${message.model}\`` : ''}:`, message.content);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  const safe = (chat.title || 'محادثة').trim().replace(/\s+/g, '-').slice(0, 40) || 'محادثة';
  link.download = `${safe}.md`; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}
function copyButton() {
  const button = document.createElement('button'); button.className = 'copy-msg'; button.type = 'button'; button.textContent = 'نسخ';
  button.addEventListener('click', async () => {
    const text = button.closest('.message-content')?.querySelector('.bubble')?.textContent ?? '';
    try { await navigator.clipboard.writeText(text); } catch { return; }
    button.textContent = 'تم ✓'; setTimeout(() => { button.textContent = 'نسخ'; }, 1500);
  });
  return button;
}
function appendMeta(wrap, model) {
  const meta = document.createElement('div'); meta.className = 'message-meta';
  if (model) { const tag = document.createElement('span'); tag.className = 'model-tag'; tag.textContent = model; meta.append('أجابك النموذج', tag); }
  meta.append(copyButton()); wrap.append(meta);
}
function renderMessages() {
  const chat = activeConversation(); messagesEl.replaceChildren();
  welcomeEl.hidden = Boolean(chat && chat.messages.length);
  if (!chat) { welcomeEl.hidden = false; return; }
  chat.messages.forEach((message) => addMessage(message.role, message.content, message.model));
  scrollBottom();
}
function addMessage(role, content, model) {
  const row = document.createElement('article'); row.className = `message-row ${role}`;
  const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = role === 'user' ? 'أنت' : 'ر';
  const wrap = document.createElement('div'); wrap.className = 'message-content';
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = content;
  wrap.append(bubble);
  if (role === 'assistant' && model) appendMeta(wrap, model);
  row.append(avatar, wrap); messagesEl.append(row); return { row, bubble, wrap };
}
function addTyping() {
  const row = document.createElement('article'); row.className = 'message-row assistant'; row.id = 'typing';
  const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = 'ر';
  const dots = document.createElement('div'); dots.className = 'typing-dots'; dots.innerHTML = '<span></span><span></span><span></span>';
  const wrap = document.createElement('div'); wrap.className = 'message-content'; wrap.append(dots); row.append(avatar, wrap); messagesEl.append(row); scrollBottom();
}
function scrollBottom() { requestAnimationFrame(() => { chatScroll.scrollTop = chatScroll.scrollHeight; }); }
function setBusy(value) {
  busy = value; input.disabled = value;
  sendButton.classList.toggle('stop', value);
  sendButton.setAttribute('aria-label', value ? 'إيقاف التوليد' : 'إرسال الرسالة');
}
function startNewChat() { activeId = null; renderSidebar(); renderMessages(); input.focus(); closeSidebar(); }
function ensureConversation(message) {
  let chat = activeConversation();
  if (!chat) { chat = { id: id(), title: message.trim().slice(0, 36) || 'محادثة جديدة', messages: [] }; conversations.unshift(chat); activeId = chat.id; }
  if (!chat.messages.length) chat.title = message.trim().slice(0, 36) || 'محادثة جديدة';
  return chat;
}
async function sendMessage(text) {
  const message = text.trim(); if (!message || busy) return;
  if (STATIC_MODE && !apiKey) { openKeyDialog(); return; }
  const chat = ensureConversation(message);
  chat.messages.push({ role: 'user', content: message }); save(); renderSidebar(); renderMessages(); addTyping(); setBusy(true); input.value = ''; updateCount();
  const history = chat.messages.slice(0, -1).slice(-20).map(({ role, content }) => ({ role, content }));
  controller = new AbortController();
  let assistant = null; let fullText = ''; let answeredModel = '';
  const bump = (chunk) => { fullText += chunk; assistant.bubble.textContent = fullText; scrollBottom(); };
  try {
    if (STATIC_MODE) {
      answeredModel = chosenModel || staticModels[0] || 'mistral-small-latest';
      document.getElementById('typing')?.remove();
      assistant = addMessage('assistant', '');
      const response = await fetch(`${MISTRAL_BASE}/chat/completions`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: answeredModel, messages: [...history, { role: 'user', content: message }], stream: true }),
      });
      if (!response.ok) {
        const reason = response.status === 401 ? 'مفتاح Mistral غير صالح. تحقّق منه ثم أعده الإدخال.'
          : response.status === 429 ? 'تجاوزت حد الاستخدام مؤقتًا. حاول بعد قليل.'
          : 'تعذّر الاتصال بخدمة Mistral. حاول مجددًا.';
        throw new Error(reason);
      }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim(); if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim(); if (payload === '[DONE]') continue;
          try { const delta = JSON.parse(payload).choices?.[0]?.delta?.content; if (typeof delta === 'string' && delta) bump(delta); } catch { /* تجاهل الأجزاء غير المكتملة */ }
        }
      }
    } else {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ message, history, model: chosenModel || undefined }),
      });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'تعذّر إرسال رسالتك.'); }
      if (!response.body) throw new Error('الاتصال المباشر غير متاح في هذا المتصفح.');
      document.getElementById('typing')?.remove();
      assistant = addMessage('assistant', '');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n'); buffer = events.pop() || '';
        for (const block of events) {
          const eventName = block.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim();
          const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
          if (!dataLine) continue;
          const data = JSON.parse(dataLine.slice(5).trim());
          if (eventName === 'model') answeredModel = data.model;
          if (eventName === 'token') bump(data.content);
          if (eventName === 'error') throw new Error(data.error || 'حدث خطأ أثناء الرد.');
        }
      }
    }
    if (!fullText) throw new Error('لم يصل أي رد. حاول مرة أخرى.');
    appendMeta(assistant.wrap, answeredModel);
    chat.messages.push({ role: 'assistant', content: fullText, model: answeredModel }); save();
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    document.getElementById('typing')?.remove();
    if (aborted) {
      if (assistant && fullText) { assistant.bubble.textContent = fullText; appendMeta(assistant.wrap, answeredModel); }
      else assistant?.row.remove();
    } else {
      const text = error instanceof Error ? error.message : 'حدث خطأ غير متوقع.';
      if (assistant && fullText) assistant.bubble.textContent = `${fullText}\n\n— ${text}`;
      else { assistant?.row.remove(); addMessage('assistant', text); }
    }
  } finally { controller = null; setBusy(false); input.focus(); scrollBottom(); }
}
function updateCount() { countEl.textContent = input.value.length > 0 ? `${input.value.length}/12000` : ''; }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('scrim').classList.remove('visible'); }
function openKeyDialog() { const overlay = document.getElementById('keyOverlay'); const field = document.getElementById('apiKeyInput'); field.value = apiKey; overlay.classList.add('visible'); field.focus(); }
function closeKeyDialog() { document.getElementById('keyOverlay').classList.remove('visible'); }
function initKeyDialog() {
  if (!STATIC_MODE) { document.getElementById('keyEdit').hidden = true; return; }
  document.getElementById('keyEdit').addEventListener('click', openKeyDialog);
  document.getElementById('keyCancel').addEventListener('click', closeKeyDialog);
  document.getElementById('keyOverlay').addEventListener('click', (event) => { if (event.target.id === 'keyOverlay') closeKeyDialog(); });
  document.getElementById('keySave').addEventListener('click', () => {
    const value = document.getElementById('apiKeyInput').value.trim();
    if (value) { apiKey = value; localStorage.setItem(KEY_STORE, apiKey); }
    closeKeyDialog(); checkModels();
  });
  document.getElementById('apiKeyInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); document.getElementById('keySave').click(); }
    if (event.key === 'Escape') closeKeyDialog();
  });
}
document.getElementById('newChat').addEventListener('click', startNewChat);
document.getElementById('openSidebar').addEventListener('click', () => { document.getElementById('sidebar').classList.add('open'); document.getElementById('scrim').classList.add('visible'); });
document.getElementById('closeSidebar').addEventListener('click', closeSidebar);
document.getElementById('scrim').addEventListener('click', closeSidebar);
form.addEventListener('submit', (event) => { event.preventDefault(); if (busy) return; sendMessage(input.value); });
sendButton.addEventListener('click', () => { if (busy && controller) controller.abort(); });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; updateCount(); });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => sendMessage(button.dataset.prompt || '')));
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); startNewChat(); } });
modelSelect.addEventListener('change', () => { chosenModel = modelSelect.value; localStorage.setItem(MODEL_KEY, chosenModel); });
function fillModelSelect(models, preferred, placeholder) {
  modelSelect.replaceChildren();
  if (!models.length) { const option = document.createElement('option'); option.value = ''; option.textContent = placeholder; modelSelect.append(option); return; }
  models.forEach((model) => { const option = document.createElement('option'); option.value = model; option.textContent = model; modelSelect.append(option); });
  const chosen = models.includes(preferred) ? preferred : models[0];
  modelSelect.value = chosen; chosenModel = chosen; localStorage.setItem(MODEL_KEY, chosenModel);
}
async function checkModels() {
  const label = document.getElementById('connectionText'); const dot = document.querySelector('.status-dot');
  if (STATIC_MODE) {
    if (!apiKey) { label.textContent = 'وضع المتصفح — أضف مفتاح Mistral'; dot.classList.remove('online'); return fillModelSelect([], '', 'أضف مفتاحًا أولًا'); }
    try {
      const response = await fetch(`${MISTRAL_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!response.ok) throw new Error();
      const data = await response.json(); const listed = (data.data ?? []).map((model) => model.id);
      staticModels = MODEL_CHAIN.filter((model) => listed.includes(model));
      label.textContent = staticModels.length ? 'وضع المتصفح — متصل' : 'لا نماذج محادثة متاحة';
      dot.classList.toggle('online', staticModels.length > 0);
      fillModelSelect(staticModels, chosenModel, 'لا نماذج');
    } catch { label.textContent = 'المفتاح غير صالح أو الشبكة محجوبة'; dot.classList.remove('online'); }
    return;
  }
  try {
    const response = await fetch('/api/models'); const data = await response.json(); if (!response.ok) throw new Error(data.error);
    label.textContent = data.available.length ? 'متصل بالنماذج' : 'لا توجد نماذج متاحة'; dot.classList.toggle('online', data.available.length > 0);
    fillModelSelect(data.available, data.available.includes(chosenModel) ? chosenModel : (data.default || ''), 'لا نماذج متاحة');
  } catch { label.textContent = 'تحقّق من إعدادات الاتصال'; dot.classList.remove('online'); }
}
initKeyDialog();
renderSidebar(); renderMessages(); checkModels();
if (STATIC_MODE && !apiKey) setTimeout(openKeyDialog, 400);
