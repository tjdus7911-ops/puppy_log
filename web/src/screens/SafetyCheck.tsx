import { Check, ShieldCheck } from 'lucide-react';
import { useStore } from '../app/store';
import { SAFETY_ITEMS } from '../domain/plan';

/** 출발 전 안전 체크(보호자 확인용 체크리스트, 새 여행을 시작하면 초기화) */
export function SafetyCheck() {
  const { settings, updateSettings } = useStore();
  const done = new Set(settings.safetyChecks);
  const toggle = (id: string) => {
    const n = new Set(done);
    if (n.has(id)) n.delete(id); else n.add(id);
    void updateSettings({ safetyChecks: [...n] });
  };
  return (
    <section>
      <div className="row between">
        <p id="safety-title" className="h-md row" style={{ gap: 6 }}><ShieldCheck size={18} color="var(--primary)" />출발 전 안전 체크</p>
        <span className="badge">{done.size}/{SAFETY_ITEMS.length}</span>
      </div>
      <div className="mt-12" style={{ display: 'grid', gap: 6 }}>
        {SAFETY_ITEMS.map((it) => {
          const on = done.has(it.id);
          return (
            <button key={it.id} className="check-row" aria-pressed={on} onClick={() => toggle(it.id)}>
              <span className={`check-box ${on ? 'on' : ''}`}>{on && <Check size={14} strokeWidth={3} />}</span>
              <span style={{ textAlign: 'left' }}>{it.label}</span>
            </button>
          );
        })}
      </div>
      <p className="t-cap mt-8">보호자가 직접 확인하는 체크리스트예요. 차량 상태를 자동으로 점검하지 않아요.</p>
    </section>
  );
}
