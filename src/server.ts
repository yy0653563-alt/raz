import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mistral } from '@mistralai/mistralai';

const app = express();
const port = Number(process.env.PORT) || 3000;
const apiKey = process.env.MISTRAL_API_KEY;
const modelChain = [
  'mistral-small-latest',
  'mistral-medium-latest',
  'open-mistral-nemo',
  'pixtral-12b-2409',
];
const mistral = new Mistral({ apiKey: apiKey ?? '' });
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../public');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir));

let modelCache: { models: string[]; expiresAt: number } | undefined;
let workingModel: { model: string; expiresAt: number } | undefined;
const hour = 60 * 60 * 1000;

async function getAvailableModels(): Promise<string[]> {
  if (modelCache && modelCache.expiresAt > Date.now()) return modelCache.models;
  if (!apiKey) throw new Error('مفتاح Mistral غير مضبوط. أضف MISTRAL_API_KEY إلى إعدادات البيئة.');
  const result = await mistral.models.list();
  const listed = (result.data ?? []).map((model) => model.id).filter((id): id is string => Boolean(id));
  const models = modelChain.filter((model) => listed.includes(model));
  modelCache = { models, expiresAt: Date.now() + hour };
  return models;
}

function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

app.get('/api/models', async (_req: Request, res: Response) => {
  try {
    const available = await getAvailableModels();
    res.json({ default: available[0] ?? null, available });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : 'تعذّر تحميل النماذج.' });
  }
});

app.post('/api/chat', async (req: Request, res: Response) => {
  const { message, history } = req.body as { message?: unknown; history?: unknown };
  if (typeof message !== 'string' || !message.trim() || message.length > 12_000) {
    res.status(400).json({ error: 'أرسل رسالة نصية لا تتجاوز ١٢٬٠٠٠ حرف.' });
    return;
  }
  if (history !== undefined && (!Array.isArray(history) || history.length > 40 || !history.every((item) =>
    item && typeof item === 'object' && ['user', 'assistant'].includes(item.role) &&
    typeof item.content === 'string' && item.content.length <= 12_000))) {
    res.status(400).json({ error: 'سجل المحادثة غير صالح.' });
    return;
  }

  let available: string[];
  try {
    available = await getAvailableModels();
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : 'تعذّر الاتصال بخدمة النماذج.' });
    return;
  }
  if (!available.length) {
    res.status(503).json({ error: 'لا تتوفر نماذج المحادثة المطلوبة لهذا المفتاح.' });
    return;
  }

  const preferred = workingModel && workingModel.expiresAt > Date.now() ? workingModel.model : undefined;
  const candidates = [...new Set([preferred, ...available].filter((model): model is string => Boolean(model)))];
  const messages = [
    ...(Array.isArray(history) ? history as Array<{ role: 'user' | 'assistant'; content: string }> : []),
    { role: 'user' as const, content: message.trim() },
  ];

  res.status(200);
  res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();

  for (const model of candidates) {
    if (res.destroyed) return;
    try {
      const stream = await mistral.chat.stream({ model, messages });
      workingModel = { model, expiresAt: Date.now() + hour };
      sendEvent(res, 'model', { model });
      for await (const chunk of stream) {
        if (res.destroyed) return;
        const content = chunk.data.choices?.[0]?.delta?.content;
        if (typeof content === 'string' && content) sendEvent(res, 'token', { content });
        else if (Array.isArray(content)) {
          const text = content.map((part) => typeof part === 'string' ? part : 'text' in part ? part.text : '').join('');
          if (text) sendEvent(res, 'token', { content: text });
        }
      }
      sendEvent(res, 'done', { model });
      res.end();
      return;
    } catch (error) {
      workingModel = undefined;
      console.error(`Raz model ${model} failed:`, error);
      // Retry the next available model; communicate a clean message only if all candidates fail.
    }
  }
  sendEvent(res, 'error', { error: 'تعذّر الحصول على رد من النماذج المتاحة. حاول مجدداً بعد قليل.' });
  res.end();
});

app.use((_req: Request, res: Response) => res.sendFile(path.join(publicDir, 'index.html')));

app.listen(port, () => console.log(`راز يعمل على المنفذ ${port}`));
