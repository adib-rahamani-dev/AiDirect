'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import styles from './inbox.module.css';

type Thread = {
  id: string;
  contactUsername: string | null;
  starred: boolean;
  archived: boolean;
  handedOff: boolean;
  unread: boolean;
  lastMessageAt: string;
  lastInboundAt: string;
  hasHistory: boolean;
  historySyncedAt: string | null;
  canReply: boolean;
  preview: string;
};
type Message = {
  id: string;
  direction: string;
  source: string;
  receivedAt: string;
  text: string | null;
};
type Detail = {
  thread: Omit<Thread, 'preview' | 'lastMessageAt' | 'unread'> & { note: string };
  messages: Message[];
  before: string | null;
};
type Inbox = {
  threads: Thread[];
  nextCursor: string | null;
  total: number;
  unreadCount: number;
  connection: {
    username: string;
    status: string;
    historyHasMore: boolean;
    historySyncedAt: string | null;
  } | null;
};
const endpoint = '/api/customer/instagram';
const filters = [
  ['all', 'همه'],
  ['unread', 'نخوانده'],
  ['starred', 'ستاره‌دار'],
  ['human', 'پاسخ انسانی'],
  ['archived', 'بایگانی'],
  ['closed', 'مهلت گذشته'],
] as const;
const n = (v: number) => v.toLocaleString('fa-IR');
const date = (v: string, full = false) =>
  new Intl.DateTimeFormat('fa-IR', {
    ...(full ? { month: 'short', day: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(v));
const errors: Record<string, string> = {
  not_found: 'این گفتگو در فضای کاری تو پیدا نشد.',
  wait: 'چند لحظه فاصله بده؛ سقف بررسی متا یا برنامه پر شده است.',
  history_busy: 'همگام‌سازی دیگری در حال انجام است.',
  history_index_required: 'اول فهرست گفتگوها را از متا همگام کن.',
  connection_required: 'یک پیج حرفه‌ای متصل کن.',
  connection_changed: 'اتصال پیج تغییر کرده؛ وضعیت را به‌روز کن.',
  invalid_history: 'متا دادهٔ قابل‌تأیید این گفتگو را برنگرداند؛ چیزی به مخاطب ارسال نشد.',
  meta_permission: 'متا مجوز خواندن این گفتگو را نداد. دسترسی اپ باید بررسی شود.',
  meta_token: 'اعتبار اتصال تمام شده؛ دوباره پیج را متصل کن.',
  meta_rate_limit: 'متا موقتاً تعداد درخواست‌ها را محدود کرده؛ کمی بعد دوباره تلاش کن.',
  reply_window_closed: 'بازهٔ پاسخ تمام شده؛ منتظر پیام تازهٔ مخاطب باش.',
  result_unknown: 'نتیجهٔ ارسال قبلی معلوم نیست؛ برای جلوگیری از تکرار فعلاً دوباره نفرست.',
};
async function request<T>(
  query: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(endpoint + query, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(
          body?.action === 'sync_history' || body?.action === 'sync_thread' ? 55000 : 20000,
        ),
  });
  const v = await r.json();
  if (!r.ok)
    throw Error(
      errors[v.error] ??
        'درخواست کامل نشد. اگر پاسخ فرستاده‌ای، گزارش را پیش از تلاش دوباره بررسی کن.',
    );
  return v;
}
function Icon({ kind }: { kind: 'search' | 'refresh' | 'send' | 'back' | 'chat' }) {
  const paths = {
    search: 'M21 21l-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16',
    refresh: 'M21 4v6h-6M3 20v-6h6M5 7a8 8 0 0 1 13-2l3 5M3 14l3 5a8 8 0 0 0 13-2',
    send: 'M22 2L9 15M22 2l-7 20-6-7-7-6 20-7Z',
    back: 'M9 5l7 7-7 7M16 12H3',
    chat: 'M21 11a8 8 0 0 1-8 8H6l-4 3V9a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8v2Z',
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
const mergeMessages = (old: Message[], fresh: Message[]) =>
  [...new Map([...old, ...fresh].map((m) => [m.id, m])).values()].sort(
    (a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id),
  );

export default function InstagramInbox({
  sendingEnabled,
  autoDm,
  quickReplies,
  onChanged,
}: {
  sendingEnabled: boolean;
  autoDm: boolean;
  quickReplies: string[];
  onChanged: () => Promise<void>;
}) {
  const [inbox, setInbox] = useState<Inbox | null>(null),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [cursors, setCursors] = useState<(string | undefined)[]>([undefined]),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState(''),
    [detail, setDetail] = useState<Detail['thread'] | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [before, setBefore] = useState<string | null>(null),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [messageLoading, setMessageLoading] = useState(false),
    [olderLoading, setOlderLoading] = useState(false),
    [notice, setNotice] = useState(''),
    [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const selectedRef = useRef(''),
    pending = useRef(false),
    nonce = useRef<{ thread: string; text: string; id: string } | null>(null),
    bottom = useRef<HTMLDivElement>(null),
    autoScroll = useRef(true);
  const loadThread = useCallback(async (id: string, reset = false, signal?: AbortSignal) => {
    const d = await request<Detail>('?thread=' + encodeURIComponent(id), undefined, signal);
    if (selectedRef.current !== id || signal?.aborted) return;
    setDetail(d.thread);
    setMessages((old) => (reset ? d.messages : mergeMessages(old, d.messages)));
    if (reset) setBefore(d.before);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setCursors([undefined]);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const c = new AbortController();
    let refreshing = false;
    const load = async (initial = false) => {
      if (refreshing) return;
      refreshing = true;
      if (initial) setLoading(true);
      try {
        const params = new URLSearchParams({ view: 'inbox', q: query, filter });
        if (cursors[page]) params.set('cursor', cursors[page]!);
        const d = await request<Inbox>('?' + params, undefined, c.signal);
        if (c.signal.aborted) return;
        setInbox(d);
        setLastUpdate(new Date().toISOString());
        if (!initial && selectedRef.current) await loadThread(selectedRef.current, false, c.signal);
      } catch (e) {
        if (!c.signal.aborted && initial)
          setNotice(e instanceof Error ? e.message : 'دریافت گفتگوها کامل نشد.');
      } finally {
        refreshing = false;
        if (!c.signal.aborted) setLoading(false);
      }
    };
    void load(true);
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, [query, filter, page, cursors, revision, loadThread]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setMessages([]);
      return;
    }
    const c = new AbortController();
    setDetail(null);
    setMessages([]);
    setBefore(null);
    setMessageLoading(true);
    autoScroll.current = true;
    void loadThread(selected, true, c.signal)
      .catch((e) => {
        if (!c.signal.aborted) setNotice(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setMessageLoading(false);
      });
    return () => c.abort();
  }, [selected, loadThread]);
  useEffect(() => {
    if (autoScroll.current)
      bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [messages]);
  const refresh = () => setRevision((v) => v + 1);
  async function mutate(body: Record<string, unknown>, success: string) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setNotice('');
    try {
      await request('', body);
      setNotice(success);
      refresh();
      if (selectedRef.current)
        await loadThread(
          selectedRef.current,
          body.action === 'sync_thread' && body.threadId === selectedRef.current,
        );
      void onChanged().catch(() => {});
      return true;
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : 'ارتباط قطع شد؛ نتیجه را پیش از تلاش دوباره بررسی کن.',
      );
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function selectThread(id: string) {
    selectedRef.current = id;
    setSelected(id);
    setNotice('');
    void request('', { action: 'thread_state', threadId: id, read: true })
      .then(refresh)
      .catch(() => {});
  }
  async function syncPage(restart: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice('');
    try {
      const d = await request<{ indexed: number; hasMore: boolean }>('', {
        action: 'sync_history',
        restart,
      });
      setNotice(
        `${n(d.indexed)} گفتگو بررسی شد.${d.hasMore ? ' برای ادامه، «دریافت گفتگوهای بیشتر» را بزن.' : ' به پایان فهرست فعلی متا رسیدیم.'}`,
      );
      setCursors([undefined]);
      setPage(0);
      refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'همگام‌سازی کامل نشد.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    const text = (drafts[selected] ?? '').trim(),
      target = selected;
    if (!text || !detail?.canReply || !sendingEnabled || !connected || pending.current) return;
    if (nonce.current?.thread !== target || nonce.current.text !== text)
      nonce.current = { thread: target, text, id: crypto.randomUUID() };
    if (
      await mutate(
        { action: 'reply', threadId: target, text, requestId: nonce.current.id },
        'پاسخ در صف ثبت شد؛ پذیرش نهایی را در گزارش بررسی کن.',
      )
    ) {
      setDrafts((old) => ({ ...old, [target]: '' }));
      nonce.current = null;
      autoScroll.current = true;
    }
  }
  async function older() {
    if (!before || olderLoading) return;
    const target = selected;
    setOlderLoading(true);
    autoScroll.current = false;
    try {
      const d = await request<Detail>(
        '?thread=' + encodeURIComponent(target) + '&before=' + encodeURIComponent(before),
      );
      if (selectedRef.current === target) {
        setMessages((old) => mergeMessages(d.messages, old));
        setBefore(d.before);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'پیام‌های قبلی دریافت نشد.');
    } finally {
      setOlderLoading(false);
    }
  }
  function setDraft(value: string) {
    setDrafts((old) => ({ ...old, [selected]: value.slice(0, 900) }));
  }
  const connected = inbox?.connection?.status === 'connected',
    draft = drafts[selected] ?? '',
    title = detail?.contactUsername ? '@' + detail.contactUsername : 'گفتگوی مشتری';
  return (
    <section className={styles.inbox} aria-label="صندوق پیام اینستاگرام">
      <header className={styles.heading}>
        <div>
          <span className={styles.kicker}>میز گفتگو</span>
          <h1>هر پیام، یک آدم.</h1>
          <p>
            {inbox
              ? `${n(inbox.total)} گفتگوی ثبت‌شده · ${n(inbox.unreadCount)} نخوانده در پنل`
              : 'در حال دریافت گفتگوها…'}
          </p>
        </div>
        <div className={styles.headingActions}>
          <span className={styles.connection}>
            <i data-online={connected} />
            {inbox?.connection ? '@' + inbox.connection.username : 'پیج متصل نیست'}
          </span>
          <button
            className={styles.sync}
            disabled={busy || !connected}
            onClick={() => void syncPage(true)}
          >
            <Icon kind="refresh" />
            {busy ? 'در حال انجام…' : 'همگام‌سازی با متا'}
          </button>
        </div>
      </header>
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      <div className={styles.workbench} data-selected={Boolean(selected)}>
        <aside className={styles.sidebar} aria-label="فهرست گفتگوها">
          <div className={styles.search}>
            <Icon kind="search" />
            <input
              type="search"
              aria-label="جستجوی نام کاربری مخاطب"
              placeholder="جستجوی نام کاربری…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className={styles.filters} aria-label="فیلتر گفتگوها">
            {filters.map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                  setCursors([undefined]);
                  setPage(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.threadList} aria-busy={loading}>
            {loading && !inbox ? (
              <div className={styles.empty}>گفتگوها را می‌آوریم…</div>
            ) : inbox?.threads.length ? (
              inbox.threads.map((t, i) => (
                <button
                  key={t.id}
                  className={styles.thread}
                  data-unread={t.unread}
                  aria-pressed={selected === t.id}
                  onClick={() => selectThread(t.id)}
                >
                  <span className={styles.avatar} aria-hidden="true">
                    {t.contactUsername?.slice(0, 1).toUpperCase() ?? '↗'}
                  </span>
                  <span className={styles.threadCopy}>
                    <span className={styles.threadTop}>
                      <strong dir={t.contactUsername ? 'ltr' : 'rtl'}>
                        {t.contactUsername
                          ? '@' + t.contactUsername
                          : 'گفتگو ' + n(page * 30 + i + 1)}
                      </strong>
                      <time>{date(t.lastMessageAt, true)}</time>
                    </span>
                    <span className={styles.preview}>{t.preview}</span>
                    <span className={styles.threadMeta}>
                      {t.handedOff ? 'پاسخ انسانی' : autoDm ? 'دستیار فروشگاه' : 'دستیار خاموش'}
                      {t.starred ? ' · ★' : ''}
                      {t.unread ? <i aria-label="نخوانده در پنل" /> : null}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className={styles.empty}>
                <Icon kind="chat" />
                <strong>{query ? 'چنین نام کاربری پیدا نشد.' : 'اینجا آرام است.'}</strong>
                <p>
                  {query
                    ? 'جستجو فقط روی نام‌های کاربری همگام‌شده انجام می‌شود.'
                    : filter === 'all'
                      ? 'فهرست دایرکت‌های مجاز را از متا همگام کن، یا یک پیام تازه دریافت کن.'
                      : 'گفتگویی با این فیلتر نداریم.'}
                </p>
              </div>
            )}
          </div>
          <footer className={styles.listFooter}>
            <div className={styles.pager}>
              <button disabled={loading || page === 0} onClick={() => setPage((v) => v - 1)}>
                قبلی
              </button>
              <span>صفحهٔ {n(page + 1)}</span>
              <button
                disabled={loading || !inbox?.nextCursor}
                onClick={() => {
                  setCursors((old) => [...old.slice(0, page + 1), inbox?.nextCursor ?? undefined]);
                  setPage((v) => v + 1);
                }}
              >
                بعدی
              </button>
            </div>
            {connected && inbox?.connection?.historyHasMore ? (
              <button disabled={busy} onClick={() => void syncPage(false)}>
                دریافت گفتگوهای بیشتر از متا ↓
              </button>
            ) : null}
            <small>
              {lastUpdate
                ? 'آخرین بررسی پنل ' + date(lastUpdate)
                : 'پیام‌های تازه به‌صورت خودکار بررسی می‌شوند.'}
            </small>
          </footer>
        </aside>
        <section className={styles.conversation} aria-label="گفتگوی انتخاب‌شده">
          {selected ? (
            <>
              <header className={styles.chatHead}>
                <button
                  className={styles.back}
                  aria-label="بازگشت به فهرست گفتگوها"
                  onClick={() => {
                    selectedRef.current = '';
                    setSelected('');
                  }}
                >
                  <Icon kind="back" />
                </button>
                <span className={styles.avatar} aria-hidden="true">
                  {detail?.contactUsername?.slice(0, 1).toUpperCase() ?? '↗'}
                </span>
                <div className={styles.contact}>
                  <h2 dir={detail?.contactUsername ? 'ltr' : 'rtl'}>{title}</h2>
                  <span>
                    {detail?.handedOff
                      ? 'فروشنده پاسخ می‌دهد'
                      : detail?.canReply
                        ? 'بازهٔ پاسخ باز است'
                        : 'منتظر پیام تازهٔ مخاطب'}
                  </span>
                </div>
                <div className={styles.tools}>
                  <button
                    disabled={busy || !detail}
                    aria-label={detail?.starred ? 'برداشتن ستاره' : 'ستاره‌دارکردن گفتگو'}
                    aria-pressed={detail?.starred ?? false}
                    onClick={() =>
                      void mutate(
                        { action: 'thread_state', threadId: selected, starred: !detail?.starred },
                        'وضعیت ستاره ثبت شد.',
                      )
                    }
                  >
                    {detail?.starred ? '★' : '☆'}
                  </button>
                  <button
                    disabled={busy || !detail}
                    onClick={() =>
                      void mutate(
                        { action: 'thread_state', threadId: selected, archived: !detail?.archived },
                        detail?.archived ? 'گفتگو به فهرست برگشت.' : 'گفتگو در پنل بایگانی شد.',
                      )
                    }
                  >
                    {detail?.archived ? 'بازگردانی' : 'بایگانی'}
                  </button>
                </div>
              </header>
              {detail ? (
                <details className={styles.details}>
                  <summary>کنترل و اطلاعات گفتگو</summary>
                  <div className={styles.controlGrid}>
                    <div>
                      <p>
                        خوانده‌شدن و بایگانی، وضعیت همین پنل هستند و صندوق Instagram را تغییر
                        نمی‌دهند.
                      </p>
                      <div className={styles.controlActions}>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              { action: 'handoff', threadId: selected, paused: !detail.handedOff },
                              detail.handedOff
                                ? 'دستیار برای پیام‌های تازه ادامه می‌دهد.'
                                : 'پاسخ خودکار این گفتگو متوقف شد.',
                            )
                          }
                        >
                          {detail.handedOff ? 'ادامهٔ پاسخ خودکار' : 'سپردن به فروشنده'}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              { action: 'thread_state', threadId: selected, read: false },
                              'در پنل نخوانده علامت خورد.',
                            )
                          }
                        >
                          علامت نخوانده
                        </button>
                        <button
                          disabled={busy || !detail.hasHistory || !connected}
                          onClick={() =>
                            void mutate(
                              { action: 'sync_thread', threadId: selected },
                              'تاریخچهٔ مجاز این گفتگو بارگیری شد.',
                            )
                          }
                        >
                          بارگیری ۲۰ پیام آخر
                        </button>
                      </div>
                      <small>
                        {detail.historySyncedAt
                          ? 'تاریخچه: ' + date(detail.historySyncedAt, true)
                          : 'تاریخچهٔ گفتگو هنوز بارگیری نشده است.'}
                      </small>
                    </div>
                    <form
                      key={detail.id + detail.note}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void mutate(
                          {
                            action: 'thread_state',
                            threadId: selected,
                            note: String(new FormData(e.currentTarget).get('note') ?? ''),
                          },
                          'یادداشت خصوصی ذخیره شد.',
                        );
                      }}
                    >
                      <label>
                        یادداشت خصوصی
                        <textarea
                          name="note"
                          maxLength={1000}
                          defaultValue={detail.note}
                          placeholder="نکته‌ای برای ادامهٔ گفتگو…"
                        />
                      </label>
                      <button disabled={busy}>ذخیره یادداشت</button>
                      <small>برای مخاطب یا هوش مصنوعی ارسال نمی‌شود.</small>
                    </form>
                  </div>
                </details>
              ) : null}
              {detail?.hasHistory && !detail.historySyncedAt ? (
                <div className={styles.historyHint}>
                  <span>پیام‌های قبلی این گفتگو در متا موجودند.</span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        { action: 'sync_thread', threadId: selected },
                        'تاریخچهٔ مجاز بارگیری شد؛ پاسخی خودکار ارسال نشد.',
                      )
                    }
                  >
                    نمایش تاریخچه
                  </button>
                </div>
              ) : null}
              <div
                className={styles.messages}
                aria-label="پیام‌ها"
                aria-busy={messageLoading}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                }}
              >
                {before ? (
                  <button
                    className={styles.older}
                    disabled={olderLoading}
                    onClick={() => void older()}
                  >
                    {olderLoading ? 'در حال دریافت…' : 'پیام‌های ذخیره‌شدهٔ قبلی ↑'}
                  </button>
                ) : null}
                {messageLoading ? (
                  <p className={styles.empty}>دریافت پیام‌ها…</p>
                ) : messages.length ? (
                  messages.map((m, i) => {
                    const divider =
                      i === 0 ||
                      new Date(messages[i - 1].receivedAt).toDateString() !==
                        new Date(m.receivedAt).toDateString();
                    return (
                      <div key={m.id}>
                        {divider ? (
                          <div className={styles.day}>
                            {new Intl.DateTimeFormat('fa-IR', {
                              weekday: 'long',
                              month: 'short',
                              day: 'numeric',
                            }).format(new Date(m.receivedAt))}
                          </div>
                        ) : null}
                        <article
                          className={styles.message}
                          data-outgoing={m.direction === 'outbound'}
                        >
                          <p dir="auto">
                            {m.text ?? 'متن این پیام طبق سیاست نگهداری پاک شده است.'}
                          </p>
                          <footer>
                            <span>
                              {m.direction === 'outbound'
                                ? m.source === 'api'
                                  ? 'پذیرفته‌شده توسط API'
                                  : 'ارسال‌شده در Instagram'
                                : 'مخاطب'}
                              {m.source === 'history' ? ' · تاریخچه' : ''}
                            </span>
                            <time>{date(m.receivedAt)}</time>
                          </footer>
                        </article>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.empty}>
                    <Icon kind="chat" />
                    <p>فعلاً پیامی در نسخهٔ ذخیره‌شده نداریم.</p>
                    {detail?.hasHistory ? (
                      <span>با «نمایش تاریخچه» پیام‌های مجاز متا را ببین.</span>
                    ) : null}
                  </div>
                )}
                <div ref={bottom} />
              </div>
              <form className={styles.composer} onSubmit={(e) => void send(e)}>
                {quickReplies.length ? (
                  <label className={styles.quickLabel}>
                    پاسخ آماده
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setDraft(draft + (draft ? '\n' : '') + e.target.value);
                      }}
                      disabled={!detail?.canReply || busy}
                    >
                      <option value="">انتخاب و ویرایش…</option>
                      {quickReplies.slice(0, 6).map((r, i) => (
                        <option key={i} value={r}>
                          {r.slice(0, 65)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label htmlFor="inbox-reply" className={styles.srOnly}>
                  متن پاسخ به مخاطب
                </label>
                <textarea
                  id="inbox-reply"
                  value={draft}
                  maxLength={900}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={
                    detail?.canReply
                      ? 'از زبان فروشگاهت بنویس…'
                      : 'پس از پیام تازهٔ مخاطب می‌توانی پاسخ بدهی.'
                  }
                  disabled={busy || !detail?.canReply || !sendingEnabled || !connected}
                />
                <div className={styles.composerFoot}>
                  <small>
                    {n(draft.length)}/۹۰۰ · پاسخ دستی، دستیار این گفتگو را متوقف می‌کند.
                  </small>
                  <button
                    className={styles.send}
                    disabled={
                      busy || !draft.trim() || !detail?.canReply || !sendingEnabled || !connected
                    }
                  >
                    <Icon kind="send" />
                    {busy ? 'در حال ثبت…' : 'ثبت پاسخ'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className={styles.welcome}>
              <span className={styles.chatMark}>
                <Icon kind="chat" />
              </span>
              <span className={styles.kicker}>صندوق فروشگاه تو</span>
              <h2>گفتگو را از همین‌جا ادامه بده.</h2>
              <p>
                یک نفر را از فهرست انتخاب کن. پیام‌های تازه، تاریخچهٔ مجاز، یادداشت و کنترل دستیار
                کنار هم‌اند.
              </p>
              <div className={styles.welcomeTags}>
                <span>اتصال مستقیم متا</span>
                <span>بدون ارسال خودکار تاریخچه</span>
                <span>فضای خصوصی فروشگاه</span>
              </div>
            </div>
          )}
        </section>
      </div>
      <p className={styles.footnote}>
        فهرست فقط داده‌های مجاز Meta را نشان می‌دهد؛ جزئیات تاریخچه حداکثر ۲۰ پیام آخر هر گفتگو است.
        متن بارگیری‌شده تا ۷ روز نگهداری می‌شود. عکس، صوت و ویدئو در این نسخه نمایش داده نمی‌شوند.
        «نخوانده» وضعیت محلی پنل است.
      </p>
    </section>
  );
}
