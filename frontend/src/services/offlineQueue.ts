import { currentToken } from "./auth";
import { isOnline, onNetworkChange, storage } from "./native";

const QUEUE_KEY = "fitai.offline_queue";
const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1";

export interface QueuedRequest {
  id: string;
  path: string;
  method: string;
  body: string;
  label: string;
  createdAt: number;
}

type Listener = (pending: number) => void;

let queue: QueuedRequest[] | null = null;
let syncing = false;
const listeners = new Set<Listener>();

async function readQueue(): Promise<QueuedRequest[]> {
  if (queue) return queue;
  const raw = await storage.get(QUEUE_KEY);
  try {
    queue = raw ? (JSON.parse(raw) as QueuedRequest[]) : [];
  } catch {
    queue = [];
  }
  return queue;
}

async function writeQueue(next: QueuedRequest[]): Promise<void> {
  queue = next;
  await storage.set(QUEUE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener(next.length));
}

export function subscribePending(listener: Listener): () => void {
  listeners.add(listener);
  void readQueue().then((items) => listener(items.length));
  return () => listeners.delete(listener);
}

export async function pendingCount(): Promise<number> {
  return (await readQueue()).length;
}

/** Кладёт запись в очередь: до синхронизации она живёт только на устройстве. */
export async function enqueue(
  path: string,
  method: string,
  body: unknown,
  label: string,
): Promise<void> {
  const items = await readQueue();
  await writeQueue([
    ...items,
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path,
      method,
      body: JSON.stringify(body),
      label,
      createdAt: Date.now(),
    },
  ]);
}

/**
 * Проигрывает очередь по порядку. Сетевая ошибка останавливает синхронизацию и
 * сохраняет запись, ответ 4xx отбрасывает её — повтор всё равно не поможет.
 */
export async function syncPending(): Promise<{ sent: number; failed: number }> {
  if (syncing) return { sent: 0, failed: 0 };
  const token = currentToken();
  if (!token) return { sent: 0, failed: 0 };
  if (!(await isOnline())) return { sent: 0, failed: 0 };

  syncing = true;
  let sent = 0;
  let failed = 0;
  try {
    let items = await readQueue();
    while (items.length) {
      const item = items[0];
      let response: Response;
      try {
        response = await fetch(`${API_URL}${item.path}`, {
          method: item.method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: item.body,
        });
      } catch {
        break; // сеть снова пропала — остальное досинхронизируем позже
      }
      if (response.ok) {
        sent += 1;
      } else if (response.status >= 500) {
        break; // сервер лежит, запись не теряем
      } else {
        failed += 1;
      }
      items = items.slice(1);
      await writeQueue(items);
    }
  } finally {
    syncing = false;
  }
  return { sent, failed };
}

export function startAutoSync(): () => void {
  void syncPending();
  return onNetworkChange((connected) => {
    if (connected) void syncPending();
  });
}
