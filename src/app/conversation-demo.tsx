'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { matches } from '@/lib/matching';
import styles from './landing.module.css';

type DemoState = 'ready' | 'checking' | 'matched' | 'unmatched';

export default function ConversationDemo() {
  const [comment, setComment] = useState('لینک رو برام می‌فرستی؟');
  const [keyword, setKeyword] = useState('لینک');
  const [state, setState] = useState<DemoState>('matched');
  const [run, setRun] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const busy = state === 'checking';
  const valid = comment.trim().length > 0 && keyword.trim().length > 0;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function preview() {
    if (running.current || !valid) return;
    running.current = true;
    const matched = matches(comment, keyword);
    setState('checking');
    setRun((previous) => previous + 1);
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 850;
    timer.current = setTimeout(() => {
      setState(matched ? 'matched' : 'unmatched');
      running.current = false;
      timer.current = null;
    }, delay);
  }

  const message =
    state === 'matched'
      ? 'کلمه پیدا شد؛ این پاسخ آماده نمایش داده می‌شود.'
      : state === 'unmatched'
        ? 'کلمه پیدا نشد؛ پاسخی نمایش داده نمی‌شود.'
        : state === 'checking'
          ? 'در حال بررسی کامنت…'
          : 'متن عوض شد. دوباره امتحان کن.';

  return (
    <section className={styles.demo} aria-labelledby="demo-title" data-state={state}>
      <div className={styles.demoHeader}>
        <h2 id="demo-title">
          نمونهٔ تعاملی <span>بدون ارسال پیام</span>
        </h2>
        <button
          className={styles.replay}
          type="button"
          onClick={preview}
          disabled={busy || !valid}
          aria-label="بازپخش نمونه با متن فعلی"
        >
          <ArrowCounterClockwiseIcon size={21} aria-hidden="true" />
          <span>دوباره</span>
        </button>
      </div>
      <form
        className={styles.workbench}
        onSubmit={(event) => {
          event.preventDefault();
          preview();
        }}
      >
        <div className={styles.commentArea}>
          <label htmlFor="demo-comment">کامنت را اینجا بنویس</label>
          <textarea
            id="demo-comment"
            value={comment}
            maxLength={300}
            rows={2}
            disabled={busy}
            onChange={(event) => {
              setComment(event.target.value);
              setState('ready');
            }}
            aria-describedby="demo-privacy"
          />
          <div className={styles.tryRow}>
            <p id="demo-privacy">این نمونه فقط در مرورگر اجرا می‌شود.</p>
            <button className={styles.tryButton} type="submit" disabled={busy || !valid}>
              {busy ? 'در حال بررسی…' : 'امتحان کن'}
              <ArrowLeftIcon size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className={styles.keywordArea}>
          <label htmlFor="demo-keyword">کلمهٔ محرک</label>
          <div className={styles.keywordInput}>
            <input
              id="demo-keyword"
              value={keyword}
              maxLength={40}
              disabled={busy}
              onChange={(event) => {
                setKeyword(event.target.value);
                setState('ready');
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <CheckIcon className={styles.matchCheck} size={19} aria-hidden="true" />
          </div>
          <div className={styles.progress} key={run} aria-hidden="true">
            <span />
          </div>
          <p className={styles.demoStatus} role="status">
            {message}
          </p>
        </div>
        <div className={styles.resultArea} aria-busy={busy}>
          {state === 'matched' ? (
            <div key={run} className={styles.reply}>
              <p className={styles.replyLabel}>پاسخ آمادهٔ تو</p>
              <p className={styles.replyText}>سلام! این هم لینکی که خواستی.</p>
              <span className={styles.exampleLink} dir="ltr">
                example.com/product
              </span>
            </div>
          ) : (
            <div className={styles.emptyReply}>
              <p className={styles.replyLabel}>پاسخ آمادهٔ تو</p>
              <p>
                {state === 'unmatched'
                  ? 'این کامنت به پاسخی نیاز ندارد.'
                  : state === 'checking'
                    ? 'داریم کلمه را در کامنت پیدا می‌کنیم…'
                    : 'یک تغییر کوچک، یک نتیجهٔ تازه.'}
              </p>
              <span>
                {state === 'unmatched'
                  ? 'کلمهٔ محرک را عوض کن و دوباره امتحان کن.'
                  : 'نتیجهٔ نمونه اینجا نمایش داده می‌شود.'}
              </span>
            </div>
          )}
        </div>
      </form>
      <noscript>
        <p>
          برای امتحان‌کردن نمونه، JavaScript مرورگر را فعال کن. ورود به حساب از دکمهٔ بالای صفحه در
          دسترس است.
        </p>
      </noscript>
    </section>
  );
}
