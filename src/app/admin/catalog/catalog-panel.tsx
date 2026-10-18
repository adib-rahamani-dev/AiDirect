'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Brand } from '../../ui';
import styles from './catalog.module.css';

type Product = {
  id: string;
  pageId: string;
  name: string;
  description: string;
  category: string;
  priceToman: string;
  stock: number;
  active: boolean;
  url: string;
  posts: { id: string; permalink: string }[];
};
type Snapshot = {
  workspace: { id: string; name: string; paused: boolean };
  pages: { id: string; name: string; handle: string }[];
  products: Product[];
};
type Preview = { status: string; reply: string; mode: string };
export default function CatalogPanel({ customer = false }: { customer?: boolean }) {
  const endpoint = customer ? '/api/customer/catalog' : '/api/catalog';
  const [data, setData] = useState<Snapshot | null>(null);
  const [pageId, setPageId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const pending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(endpoint, {
        signal: signal ?? AbortSignal.timeout(20000),
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'نشست تمام شده؛ از پنل مدیریت دوباره وارد شو.'
            : 'دریافت کاتالوگ کامل نشد. دوباره تلاش کن.',
        );
      const snapshot: Snapshot = await response.json();
      setData(snapshot);
      setPageId((current) =>
        snapshot.pages.some((p) => p.id === current) ? current : (snapshot.pages[0]?.id ?? ''),
      );
    },
    [endpoint],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((e: Error) => {
      if (!controller.signal.aborted) setMessage(e.message);
    });
    return () => controller.abort();
  }, [load]);
  async function action(action: string, fields: Record<string, unknown> = {}) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: data?.workspace.id, action, ...fields }),
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'نشست تمام شده؛ دوباره وارد شو.'
            : 'ذخیره نشد؛ ورودی‌ها و تکراری نبودن شناسهٔ پیج را بررسی کن.',
        );
      const result = await response.json();
      if (action === 'preview') setPreview(result);
      else {
        await load();
        setPreview(null);
        setMessage('ذخیره شد.');
      }
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'ارتباط کامل نشد.');
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function addPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (await action('page', { data: { name: values.get('name'), handle: values.get('handle') } }))
      form.reset();
  }
  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const saved = await action('product', {
      data: {
        ...(editing ? { id: editing.id } : {}),
        pageId,
        name: values.get('name'),
        category: values.get('category'),
        description: values.get('description'),
        priceToman: values.get('priceToman'),
        stock: Number(values.get('stock')),
        url: values.get('url'),
        active: values.get('active') === 'on',
      },
    });
    if (saved) {
      setEditing(null);
      form.reset();
    }
  }
  const products =
    data?.products.filter(
      (p) => p.pageId === pageId && `${p.name} ${p.category}`.includes(query),
    ) ?? [];
  const pageProducts = data?.products.filter((p) => p.pageId === pageId) ?? [];
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="مدیریت">
          <a href={customer ? '/dashboard' : '/admin'}>{customer ? 'پنل من' : 'نمای کلی'}</a>
          <a href={customer ? '/dashboard/catalog' : '/admin/catalog'} aria-current="page">
            محصولات
          </a>
          {!customer && <a href="/admin/operations">عملیات و گزارش</a>}
          {customer && <a href="/dashboard/settings">تنظیمات حساب</a>}
        </nav>
      </header>
      <main className={styles.main}>
        <div className={styles.intro}>
          <div>
            <span className={styles.eyebrow}>از محصول، تا پیشنهاد مناسب</span>
            <h1>
              ویترین تو.
              <br />
              <em>دستیار فروش تو.</em>
            </h1>
            <p>محصول را یک‌بار تعریف کن؛ قیمت، موجودی و اطلاعاتش مبنای پیشنهاد می‌شود.</p>
          </div>
          <div className={styles.note}>
            <span>حالت فعلی</span>
            <strong>آزمایش کاتالوگ</strong>
            <p>
              پیشنهادها واقعی و بر اساس دادهٔ ذخیره‌شده‌اند. این بخش هنوز به دایرکت متصل نیست و
              پیج‌های ثبت‌شده، اتصال تأییدشدهٔ اینستاگرام محسوب نمی‌شوند.
            </p>
          </div>
        </div>
        <p role="status" aria-live="polite" className={styles.message}>
          {message}
        </p>
        {!data ? (
          <button onClick={() => void load().catch((e: Error) => setMessage(e.message))}>
            دریافت کاتالوگ
          </button>
        ) : (
          <>
            <div className={styles.toolbar}>
              <label>
                کاتالوگ پیج
                <select
                  value={pageId}
                  onChange={(e) => {
                    setPageId(e.target.value);
                    setEditing(null);
                    setPreview(null);
                  }}
                >
                  <option value="" disabled>
                    ابتدا پیج را تعریف کن
                  </option>
                  {data.pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · @{p.handle}
                    </option>
                  ))}
                </select>
              </label>
              <a className={styles.link} href={endpoint + '?format=csv'}>
                دریافت CSV کاتالوگ
              </a>
              <button
                className={styles.secondary}
                disabled={busy}
                onClick={() => void action('pause', { paused: !data.workspace.paused })}
              >
                {data.workspace.paused ? 'ازسرگیری پیشنهادها' : 'توقف پیشنهادها'}
              </button>
            </div>
            {data.workspace.paused && (
              <p className={styles.warning}>
                پیشنهاد محصول متوقف است. اطلاعات کاتالوگ قابل ویرایش است.
              </p>
            )}
            <details className={styles.panel} open={!data.pages.length}>
              <summary>تعریف پیج برای کاتالوگ</summary>
              <form className={styles.inline} onSubmit={addPage}>
                <label>
                  نام فروشگاه
                  <input name="name" required maxLength={100} placeholder="مثلاً فروشگاه آبان" />
                </label>
                <label>
                  شناسهٔ پیج، بدون @
                  <input
                    name="handle"
                    dir="ltr"
                    required
                    pattern="[a-zA-Z0-9_.]{1,30}"
                    maxLength={30}
                    placeholder="aban.shop"
                  />
                </label>
                <button disabled={busy}>ثبت پیج</button>
              </form>
            </details>
            <div className={styles.columns}>
              <section className={styles.panel} aria-labelledby="product-title">
                <div className={styles.sectionTitle}>
                  <span>۰۱ / اطلاعات محصول</span>
                  <h2 id="product-title">{editing ? 'ویرایش محصول' : 'محصول تازه'}</h2>
                </div>
                <form
                  ref={formRef}
                  key={editing?.id ?? `new-${pageId}`}
                  className={styles.form}
                  onSubmit={saveProduct}
                >
                  <fieldset disabled={busy || !pageId}>
                    <label>
                      نام محصول
                      <input
                        name="name"
                        defaultValue={editing?.name}
                        required
                        maxLength={100}
                        placeholder="مثلاً هدفون استودیو"
                      />
                    </label>
                    <div className={styles.inline}>
                      <label>
                        قیمت کامل، تومان
                        <input
                          name="priceToman"
                          defaultValue={editing?.priceToman}
                          required
                          inputMode="numeric"
                          maxLength={13}
                          placeholder="۲۹۰۰۰۰۰۰"
                        />
                      </label>
                      <label>
                        تعداد موجود
                        <input
                          name="stock"
                          type="number"
                          min="0"
                          max="1000000"
                          defaultValue={editing?.stock ?? 1}
                          required
                        />
                      </label>
                    </div>
                    <label>
                      دسته‌بندی
                      <input
                        name="category"
                        defaultValue={editing?.category}
                        required
                        maxLength={80}
                        placeholder="مثلاً هدفون"
                      />
                    </label>
                    <label>
                      توضیحات قابل استفاده در پاسخ
                      <textarea
                        name="description"
                        defaultValue={editing?.description}
                        maxLength={1000}
                        rows={3}
                        placeholder="ویژگی‌های واقعی، رنگ، اندازه، شرایط فروش…"
                      />
                    </label>
                    <label>
                      لینک محصول (HTTPS)
                      <input
                        name="url"
                        defaultValue={editing?.url}
                        type="url"
                        dir="ltr"
                        required
                        maxLength={1000}
                        placeholder="https://shop.example/product"
                      />
                    </label>
                    <label className={styles.check}>
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={editing?.active ?? true}
                      />
                      در پیشنهادها نمایش داده شود
                    </label>
                    <div className={styles.inline}>
                      <button>{editing ? 'ذخیره تغییرات' : 'افزودن محصول'}</button>
                      {editing && (
                        <button
                          type="button"
                          className={styles.secondary}
                          onClick={() => setEditing(null)}
                        >
                          انصراف
                        </button>
                      )}
                    </div>
                  </fieldset>
                </form>
              </section>
              <section className={styles.panel} aria-labelledby="preview-title">
                <div className={styles.sectionTitle}>
                  <span>۰۲ / قبل از دایرکت، اینجا امتحان کن</span>
                  <h2 id="preview-title">پیشنهاد با بودجه</h2>
                </div>
                <p>
                  بدون کلید API و هزینه کار می‌کند. پیام در این تست ذخیره نمی‌شود و هیچ دایرکتی
                  ارسال نمی‌شود.
                </p>
                <form
                  className={styles.form}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = new FormData(e.currentTarget);
                    void action('preview', {
                      data: {
                        pageId,
                        message: v.get('message'),
                        budgetToman: v.get('budgetToman') || undefined,
                        category: v.get('category'),
                        permalink: v.get('permalink') || undefined,
                      },
                    });
                  }}
                >
                  <fieldset disabled={busy || !pageId}>
                    <label>
                      پیام مشتری
                      <textarea
                        name="message"
                        rows={3}
                        maxLength={1000}
                        defaultValue="تا ۳۰ میلیون تومان یه محصول می‌خوام"
                      />
                    </label>
                    <label>
                      بودجهٔ دقیق به تومان (اختیاری)
                      <input
                        name="budgetToman"
                        inputMode="numeric"
                        maxLength={30}
                        placeholder="مثلاً ۳۰۰۰۰۰۰۰"
                      />
                    </label>
                    <label>
                      دسته‌بندی دلخواه (اختیاری)
                      <input name="category" maxLength={80} placeholder="مثلاً هدفون" />
                    </label>
                    <label>
                      محدودکردن به محصولات یک پست (اختیاری)
                      <select name="permalink">
                        <option value="">همهٔ محصولات این پیج</option>
                        {[
                          ...new Set(
                            pageProducts.flatMap((p) => p.posts.map((post) => post.permalink)),
                          ),
                        ].map((permalink) => (
                          <option key={permalink} value={permalink}>
                            {permalink}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button>دیدن پیشنهاد</button>
                  </fieldset>
                </form>
                {preview && (
                  <div className={styles.response}>
                    <span>پاسخ پیشنهادی · موتور قواعد، بدون AI</span>
                    <p>{preview.reply}</p>
                  </div>
                )}
              </section>
            </div>
            <section className={styles.panel} aria-labelledby="list-title">
              <div className={styles.listHeader}>
                <div className={styles.sectionTitle}>
                  <span>۰۳ / موجودی فروشگاه</span>
                  <h2 id="list-title">
                    محصولات این پیج <small>({pageProducts.length.toLocaleString('fa-IR')})</small>
                  </h2>
                </div>
                <label>
                  جست‌وجوی محصول
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="نام یا دسته‌بندی"
                  />
                </label>
              </div>
              {!products.length ? (
                <p className={styles.empty}>
                  {query
                    ? 'محصولی با این جست‌وجو پیدا نشد.'
                    : 'ویترین هنوز خالی است. اولین محصول را از فرم بالا اضافه کن.'}
                </p>
              ) : (
                <div className={styles.products}>
                  {products.map((p) => (
                    <article key={p.id} className={styles.product}>
                      <div>
                        <span className={styles.category}>{p.category}</span>
                        <h3>{p.name}</h3>
                        <p>{p.description}</p>
                        <strong>
                          {Number(p.priceToman).toLocaleString('fa-IR')} <small>تومان</small>
                        </strong>
                        <p>
                          {p.active ? 'فعال' : 'غیرفعال'} · موجودی:{' '}
                          {p.stock.toLocaleString('fa-IR')}
                        </p>
                      </div>
                      <div className={styles.inline}>
                        <button
                          disabled={busy}
                          className={styles.secondary}
                          onClick={() => {
                            setEditing(p);
                            formRef.current?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'center',
                            });
                          }}
                        >
                          ویرایش
                        </button>
                        <button
                          disabled={busy}
                          className={styles.secondary}
                          onClick={() => {
                            if (window.confirm(`محصول «${p.name}» و ارتباط پست‌هایش حذف شود؟`))
                              void action('delete_product', { id: p.id });
                          }}
                        >
                          حذف
                        </button>
                      </div>
                      <details>
                        <summary>
                          پست‌ها و ریلزهای این محصول ({p.posts.length.toLocaleString('fa-IR')})
                        </summary>
                        <p>
                          رابطهٔ دستی برای طراحی کاتالوگ؛ مالکیت پست هنوز از اینستاگرام تأیید نشده
                          است.
                        </p>
                        {p.posts.map((post) => (
                          <div key={post.id} className={styles.post}>
                            <a href={post.permalink} target="_blank" rel="noreferrer" dir="ltr">
                              {post.permalink}
                            </a>
                            <button
                              disabled={busy}
                              className={styles.secondary}
                              onClick={() => void action('unlink', { id: post.id })}
                            >
                              برداشتن
                            </button>
                          </div>
                        ))}
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const form = e.currentTarget;
                            const v = new FormData(form);
                            if (
                              await action('link', {
                                data: { pageId, productId: p.id, permalink: v.get('permalink') },
                              })
                            )
                              form.reset();
                          }}
                        >
                          <label>
                            لینک پست یا ریلز
                            <input
                              name="permalink"
                              type="url"
                              required
                              dir="ltr"
                              placeholder="https://www.instagram.com/p/.../"
                            />
                          </label>
                          <button disabled={busy} className={styles.secondary}>
                            ثبت ارتباط
                          </button>
                        </form>
                      </details>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <details className={styles.danger}>
              <summary>حذف اطلاعات کاتالوگ</summary>
              <p>
                تمام پیج‌های کاتالوگ، محصولات و ارتباط پست‌ها حذف می‌شود. اتصال آزمایشی اینستاگرام و
                داده‌های سرویس جزو این عملیات نیستند. بازیابی فقط از پشتیبان جداگانه ممکن است.
              </p>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.prompt('برای حذف همهٔ کاتالوگ بنویس: DELETE CATALOG') ===
                    'DELETE CATALOG'
                  )
                    void action('delete_catalog', { confirm: 'DELETE CATALOG' });
                }}
              >
                حذف کاتالوگ این فروشگاه
              </button>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
