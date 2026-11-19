const STORAGE_KEY = 'raz.conversations.v1';
const listEl = document.getElementById('conversationList');
const messagesEl = document.getElementById('messages');
const welcomeEl = document.getElementById('welcome');
const form = document.getElementById('chatForm');
const input = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const countEl = document.getElementById('charCount');
const chatScroll = document.getElementById('chatScroll');
let conversations = loadConversations();
let activeId = null;
let busy = false;

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
    const remove = document.createElement('button'); remove.className = 'delete-chat'; remove.type = 'button'; remove.setAttribute('aria-label', 'حذف المحادثة'); remove.textContent = '×';
    remove.addEventListener('click', (event) => { event.stopPropagation(); conversations = conversations.filter((item) => item.id !== chat.id); if (activeId === chat.id) activeId = null; save(); renderSidebar(); renderMessages(); });
    row.append(icon, title, remove); row.addEventListener('click', () => { activeId = chat.id; renderSidebar(); renderMessages(); closeSidebar(); }); listEl.append(row);
  });
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
  if (role === 'assistant' && model) { const meta = document.createElement('div'); meta.className = 'message-meta'; const tag = document.createElement('span'); tag.className = 'model-tag'; tag.textContent = model; meta.append('أجابك النموذج', tag); wrap.append(meta); }
  row.append(avatar, wrap); messagesEl.append(row); return { row, bubble, wrap };
}
function addTyping() {
  const row = document.createElement('article'); row.className = 'message-row assistant'; row.id = 'typing';
  const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = 'ر';
  const dots = document.createElement('div'); dots.className = 'typing-dots'; dots.innerHTML = '<span></span><span></span><span></span>';
  const wrap = document.createElement('div'); wrap.className = 'message-content'; wrap.append(dots); row.append(avatar, wrap); messagesEl.append(row); scrollBottom();
}
function scrollBottom() { requestAnimationFrame(() => { chatScroll.scrollTop = chatScroll.scrollHeight; }); }
function setBusy(value) { busy = value; sendButton.disabled = value; input.disabled = value; }
function startNewChat() { activeId = null; renderSidebar(); renderMessages(); input.focus(); closeSidebar(); }
function ensureConversation(message) {
  let chat = activeConversation();
  if (!chat) { chat = { id: id(), title: message.trim().slice(0, 36) || 'محادثة جديدة', messages: [] }; conversations.unshift(chat); activeId = chat.id; }
  if (!chat.messages.length) chat.title = message.trim().slice(0, 36) || 'محادثة جديدة';
  return chat;
}
async function sendMessage(text) {
  const message = text.trim(); if (!message || busy) return;
  const chat = ensureConversation(message);
  chat.messages.push({ role: 'user', content: message }); save(); renderSidebar(); renderMessages(); addTyping(); setBusy(true); input.value = ''; updateCount();
  const history = chat.messages.slice(0, -1).slice(-20).map(({ role, content }) => ({ role, content }));
  let assistant = null; let fullText = ''; let answeredModel = '';
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history }) });
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
        if (eventName === 'token') { fullText += data.content; assistant.bubble.textContent = fullText; scrollBottom(); }
        if (eventName === 'error') throw new Error(data.error || 'حدث خطأ أثناء الرد.');
      }
    }
    if (!fullText) throw new Error('لم يصل أي رد. حاول مرة أخرى.');
    const meta = document.createElement('div'); meta.className = 'message-meta'; const tag = document.createElement('span'); tag.className = 'model-tag'; tag.textContent = answeredModel; meta.append('أجابك النموذج', tag); assistant.wrap.append(meta);
    chat.messages.push({ role: 'assistant', content: fullText, model: answeredModel }); save();
  } catch (error) {
    document.getElementById('typing')?.remove();
    if (assistant && fullText) { assistant.bubble.textContent = `${fullText}\n\n— ${error.message}`; }
    else addMessage('assistant', error instanceof Error ? error.message : 'حدث خطأ غير متوقع.');
    if (assistant && !fullText) assistant.row.remove();
  } finally { setBusy(false); input.focus(); scrollBottom(); }
}
function updateCount() { countEl.textContent = input.value.length > 0 ? `${input.value.length}/12000` : ''; }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('scrim').classList.remove('visible'); }
document.getElementById('newChat').addEventListener('click', startNewChat);
document.getElementById('openSidebar').addEventListener('click', () => { document.getElementById('sidebar').classList.add('open'); document.getElementById('scrim').classList.add('visible'); });
document.getElementById('closeSidebar').addEventListener('click', closeSidebar);
document.getElementById('scrim').addEventListener('click', closeSidebar);
form.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(input.value); });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; updateCount(); });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => sendMessage(button.dataset.prompt || '')));
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); startNewChat(); } });
async function checkModels() {
  const label = document.getElementById('connectionText'); const dot = document.querySelector('.status-dot');
  try { const response = await fetch('/api/models'); const data = await response.json(); if (!response.ok) throw new Error(data.error); label.textContent = data.available.length ? 'متصل بالنماذج' : 'لا توجد نماذج متاحة'; dot.classList.toggle('online', data.available.length > 0); document.getElementById('modelName').textContent = data.default || 'MISTRAL'; }
  catch { label.textContent = 'تحقّق من إعدادات الاتصال'; dot.classList.remove('online'); }
}
renderSidebar(); renderMessages(); checkModels();
