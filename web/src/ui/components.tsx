import { useEffect, type ReactNode } from 'react';
import { ChevronLeft, CircleAlert, RotateCcw } from 'lucide-react';
import { Scene } from './Art';
import { back } from '../app/router';

export function TopBar({ title, onBack, right, showBack = true }: { title?: string; onBack?: () => void; right?: ReactNode; showBack?: boolean }) {
  return (
    <header className={`topbar ${showBack ? 'back' : ''}`}>
      {showBack && (
        <button className="icon-btn" aria-label="뒤로" onClick={onBack ?? (() => back())}>
          <ChevronLeft size={24} />
        </button>
      )}
      <h1>{title}</h1>
      {right}
    </header>
  );
}

export function Sheet({ open, onClose, children, center = false, labelledBy }: { open: boolean; onClose: () => void; children: ReactNode; center?: boolean; labelledBy?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={`overlay ${center ? 'center' : ''}`} onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={(e) => e.stopPropagation()}>
        {!center && <div className="grab" />}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ kind = 'empty-trip', title, desc, action }: { kind?: 'empty-trip' | 'empty-place' | 'error'; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="art"><Scene kind={kind} height={110} /></div>
      <p className="h-md">{title}</p>
      {desc && <p className="t-sub">{desc}</p>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = '문제가 생겼어요', desc, onRetry, extra }: { title?: string; desc?: string; onRetry?: () => void; extra?: ReactNode }) {
  return (
    <EmptyState
      kind="error"
      title={title}
      desc={desc}
      action={
        <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          {onRetry && (
            <button className="btn ghost sm" onClick={onRetry}>
              <RotateCcw size={16} /> 다시 시도
            </button>
          )}
          {extra}
        </div>
      }
    />
  );
}

export function Loading({ label = '불러오는 중이에요' }: { label?: string }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center' }} role="status" aria-live="polite">
      <div className="spinner" />
      <p className="t-sub mt-12">{label}</p>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

export function Hint({ children, tone = 'beige', icon = true }: { children: ReactNode; tone?: 'beige' | 'green' | 'red'; icon?: boolean }) {
  return (
    <div className={`hint ${tone === 'green' ? 'green' : tone === 'red' ? 'red' : ''}`}>
      {icon && <CircleAlert size={16} />}
      <div>{children}</div>
    </div>
  );
}

export function Field({ label, optional, error, children }: { label: string; optional?: boolean; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">
        {label}
        {optional && <span className="opt">(선택)</span>}
      </span>
      {children}
      {error && <p className="field-error">{error}</p>}
    </label>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
