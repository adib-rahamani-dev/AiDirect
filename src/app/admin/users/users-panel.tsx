'use client';
import { useEffect, useRef, useState } from 'react';
import { Brand } from '../../ui';
import base from '../catalog/catalog.module.css';
import styles from './users.module.css';
type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  platformRole: 'CUSTOMER' | 'SENIOR_ADMIN';
  suspended: boolean;
  createdAt: string;
  memberships: {
    role: string;
    workspace: { name: string; paused: boolean; _count: { pages: number } };
  }[];
  _count: { sessions: number };
};
type Data = {
  role: 'SUPER_ADMIN' | 'SENIOR_ADMIN';
  users: User[];
  total: number;
  page: number;
  stats: {
    registered: number;
    suspended: number;
    workspaces: number;
    products: number;
    newUsers: number;
  };
  audit: {
    id: string;
    actorId: string;
    action: string;
    targetId: string;
    detail: string;
    createdAt: string;
  }[];
  signupEnabled: boolean;
  emailServiceReady: false;
};
const date = (value: string) =>
  new Date(value).toLocaleString('fa-IR', {
    timeZone: 'Asia/Tehran',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
export default function UsersPanel() {
  const [data, setData] = useState<Data | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [role, setRole] = useState(''),
    [state, setState] = useState(''),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [change, setChange] = useState<{
    action: 'role' | 'suspend' | 'revoke_sessions';
    user: User;
    role?: string;
    suspended?: boolean;
  } | null>(null);
  const pending = useRef(false),
    dialogRef = useRef<HTMLDialogElement>(null);
  const query = new URLSearchParams({ q: search, role, state, page: String(page) }).toString();
  useEffect(() => {
    const c = new AbortController();
    void fetch('/api/admin/users?' + query, { cache: 'no-store', signal: c.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setData(await r.json());
      })
      .catch(() => {
        if (!c.signal.aborted)
          setMessage('دریافت کاربران کامل نشد؛ ورود و سطح دسترسی را بررسی کن.');
      });
    return () => c.abort();
  }, [query, revision]);
  function prepare(value: NonNullable<typeof change>) {
    setMessage('');
    dialogRef.current?.querySelector('form')?.reset();
    setChange(value);
    dialogRef.current?.showModal();
  }
  async function mutate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !change) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    const form = event.currentTarget,
      values = new FormData(form);
    try {
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: change.action,
          id: change.user.id,
          ...(change.action === 'role'
            ? { role: change.role }
            : change.action === 'suspend'
              ? { suspended: change.suspended }
              : {}),
          password: values.get('password'),
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error();
      form.reset();
      dialogRef.current?.close();
      setChange(null);
      setRevision((v) => v + 1);
      setMessage('تغییر ثبت شد؛ نشست‌های قبلی این حساب باطل شدند.');
    } catch {
      setMessage('تغییر ثبت نشد؛ رمز مدیر کل و دسترسی را بررسی کن.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={base.shell}>
      <header className={base.header}>
        <Brand />
        <nav aria-label="مدیریت سرویس">
          {data?.role === 'SUPER_ADMIN' && <a href="/admin">نمای کلی سرویس</a>}
          <a href="/admin/users" aria-current="page">
            کاربران و دسترسی‌ها
          </a>
          <a href={data?.role === 'SUPER_ADMIN' ? '/admin/analytics' : '/dashboard'}>
            {data?.role === 'SUPER_ADMIN' ? 'آمار و تحلیل کاتالوگ' : 'فضای شخصی'}
          </a>
        </nav>
      </header>
      <main className={base.main}>
        <div className={base.intro}>
          <div>
            <span className={base.eyebrow}>مدیریت دقیق، اختیار روشن</span>
            <h1>
              آدم‌های
              <br />
              <em>پشت فروشگاه‌ها.</em>
            </h1>
            <p>حساب‌ها، وضعیت دسترسی و فعالیت ثبت‌نام را از یک جا ببین.</p>
          </div>
          <div className={base.note}>
            <span>سطح دسترسی تو</span>
            <strong>
              {data?.role === 'SUPER_ADMIN'
                ? 'مدیر کل سرویس'
                : data?.role === 'SENIOR_ADMIN'
                  ? 'مدیر ارشد'
                  : 'در حال بررسی…'}
            </strong>
            <p>
              {data?.role === 'SUPER_ADMIN'
                ? 'تغییر نقش، توقف حساب و ابطال نشست فقط با تأیید رمز مدیر کل انجام می‌شود.'
                : 'مدیر ارشد گزارش و کاربران را می‌بیند؛ تغییر نقش و دسترسی‌ها در اختیار مدیر کل است.'}
            </p>
            <p>
              ثبت‌نام: {data ? (data.signupEnabled ? 'فعال' : 'متوقف') : '…'} · تأیید ایمیل خودکار
              هنوز فعال نیست.
            </p>
          </div>
        </div>
        <section className={styles.stats} aria-label="آمار واقعی سرویس">
          {[
            ['حساب ثبت‌شده', data?.stats.registered],
            ['ثبت‌نام ۷ روز اخیر', data?.stats.newUsers],
            ['حساب متوقف', data?.stats.suspended],
            ['محصول کاتالوگ', data?.stats.products],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <span>{label}</span>
              <strong>{typeof value === 'number' ? value.toLocaleString('fa-IR') : '…'}</strong>
            </div>
          ))}
        </section>
        <p className={base.message} role="status" aria-live="polite">
          {message}
        </p>
        <section className={base.panel}>
          <form
            className={base.toolbar}
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q);
              setPage(1);
            }}
          >
            <label>
              جست‌وجوی نام یا ایمیل
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                maxLength={100}
                placeholder="نام فروشگاه، نام یا ایمیل"
              />
            </label>
            <label>
              نقش
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">همهٔ نقش‌ها</option>
                <option value="CUSTOMER">مشتری</option>
                <option value="SENIOR_ADMIN">مدیر ارشد</option>
              </select>
            </label>
            <label>
              وضعیت
              <select
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">همه</option>
                <option value="active">فعال</option>
                <option value="suspended">متوقف</option>
              </select>
            </label>
            <button>جست‌وجو</button>
            <button
              type="button"
              className={base.secondary}
              onClick={() => setRevision((v) => v + 1)}
            >
              به‌روزرسانی
            </button>
          </form>
          <div className={styles.results}>
            <h2>{data?.total.toLocaleString('fa-IR') ?? '…'} حساب</h2>
            <span>حساب داخلی اپراتور در این فهرست نیست.</span>
          </div>
          <div className={styles.users}>
            {data?.users.map((user) => (
              <article className={styles.user} key={user.id}>
                <div className={styles.userTop}>
                  <div className={styles.avatar} aria-hidden="true">
                    {user.name.trim()[0] || '؟'}
                  </div>
                  <div>
                    <h3>{user.name}</h3>
                    <p dir="ltr">{user.email}</p>
                  </div>
                  <span className={user.suspended ? styles.stopped : styles.active}>
                    {user.suspended ? 'متوقف' : 'فعال'}
                  </span>
                </div>
                <div className={styles.meta}>
                  <span>{user.platformRole === 'SENIOR_ADMIN' ? 'مدیر ارشد' : 'مشتری'}</span>
                  <span>{user.emailVerified ? 'ایمیل تأییدشده' : 'ایمیل تأییدنشده'}</span>
                  <span>عضویت: {date(user.createdAt)}</span>
                </div>
                <p>
                  فضاهای کاری:{' '}
                  {user.memberships.map((m) => `${m.workspace.name} (${m.role})`).join('، ') ||
                    'پس از اولین ورود ساخته می‌شود.'}
                </p>
                <p>
                  {user._count.sessions.toLocaleString('fa-IR')} رکورد نشست ·{' '}
                  {user.memberships
                    .reduce((n, m) => n + m.workspace._count.pages, 0)
                    .toLocaleString('fa-IR')}{' '}
                  پیج کاتالوگ
                </p>
                {data.role === 'SUPER_ADMIN' && (
                  <div className={base.inline}>
                    <button
                      disabled={busy}
                      className={base.secondary}
                      onClick={() =>
                        prepare({
                          action: 'role',
                          user,
                          role: user.platformRole === 'CUSTOMER' ? 'SENIOR_ADMIN' : 'CUSTOMER',
                        })
                      }
                    >
                      {user.platformRole === 'CUSTOMER' ? 'تبدیل به مدیر ارشد' : 'تغییر به مشتری'}
                    </button>
                    <button
                      disabled={busy}
                      className={base.secondary}
                      onClick={() =>
                        prepare({ action: 'suspend', user, suspended: !user.suspended })
                      }
                    >
                      {user.suspended ? 'فعال‌کردن حساب' : 'توقف حساب'}
                    </button>
                    <button
                      disabled={busy}
                      className={base.secondary}
                      onClick={() => prepare({ action: 'revoke_sessions', user })}
                    >
                      خروج از همهٔ نشست‌ها
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          {data && !data.users.length && <p className={base.empty}>حسابی با این فیلتر پیدا نشد.</p>}
          <div className={base.inline}>
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              قبلی
            </button>
            <span>صفحهٔ {page.toLocaleString('fa-IR')}</span>
            <button
              disabled={!data || page * 25 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              بعدی
            </button>
          </div>
        </section>
        {data?.role === 'SUPER_ADMIN' && (
          <section className={base.panel}>
            <h2>ردپای تغییرات مدیریتی</h2>
            <p>۲۰ تغییر آخر؛ رمزها و متن پیام‌های مشتری در این گزارش ذخیره نمی‌شوند.</p>
            {data.audit.length ? (
              data.audit.map((item) => (
                <div className={styles.audit} key={item.id}>
                  <strong>
                    {item.action === 'role'
                      ? 'تغییر نقش'
                      : item.action === 'suspend'
                        ? 'تغییر وضعیت حساب'
                        : item.action === 'account_deleted'
                          ? 'حذف حساب مشتری'
                          : 'ابطال نشست‌ها'}
                  </strong>
                  <time dateTime={item.createdAt}>{date(item.createdAt)}</time>
                  <small dir="ltr">{item.targetId}</small>
                  <code dir="ltr">{item.detail}</code>
                </div>
              ))
            ) : (
              <p>هنوز تغییری ثبت نشده است.</p>
            )}
          </section>
        )}
        <dialog
          ref={dialogRef}
          className={styles.dialog}
          aria-labelledby="admin-confirm-title"
          onCancel={(event) => {
            if (busy) {
              event.preventDefault();
              return;
            }
            dialogRef.current?.querySelector('form')?.reset();
            setChange(null);
          }}
        >
          <form onSubmit={mutate}>
            <h2 id="admin-confirm-title">تأیید تغییر دسترسی</h2>
            {message && <p role="alert">{message}</p>}
            <p>حساب: {change?.user.name}</p>
            {change?.action === 'role' && change.role === 'SENIOR_ADMIN' && (
              <p>
                مدیر ارشد نام، ایمیل و وضعیت کاربران را می‌بیند و حق تغییر نقش ندارد. وضعیت ایمیل
                این حساب: {change.user.emailVerified ? 'تأییدشده' : 'تأییدنشده'}.
              </p>
            )}
            <p>
              {change?.action === 'role'
                ? `نقش جدید: ${change.role === 'SENIOR_ADMIN' ? 'مدیر ارشد' : 'مشتری'}`
                : change?.action === 'suspend'
                  ? change.suspended
                    ? 'این حساب از پنل خارج می‌شود و دسترسی‌اش متوقف می‌شود.'
                    : 'دسترسی حساب دوباره فعال می‌شود.'
                  : 'نشست‌های قبلی حساب باطل می‌شوند.'}
            </p>
            <label>
              رمز فعلی مدیر کل
              <input
                name="password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                required
                maxLength={256}
                disabled={busy}
              />
            </label>
            <div className={base.inline}>
              <button disabled={busy}>{busy ? 'در حال ثبت…' : 'تأیید و ثبت'}</button>
              <button
                type="button"
                className={base.secondary}
                disabled={busy}
                onClick={() => {
                  dialogRef.current?.querySelector('form')?.reset();
                  dialogRef.current?.close();
                  setChange(null);
                }}
              >
                انصراف
              </button>
            </div>
          </form>
        </dialog>
      </main>
    </div>
  );
}
