import { useMemo, useState } from 'react';
import { Check, FlaskConical, MapPin, Play, X } from 'lucide-react';
import { useStore } from '../app/store';
import { navigate } from '../app/router';
import { REGIONS } from '../domain/regions';
import type { GeoPoint } from '../domain/models';
import { TripController, type StartKind } from '../trip/TripController';
import { DEMO_DESTINATION } from '../vehicle/demoRoute';
import { Hint, Sheet, Switch, TopBar } from '../ui/components';
import { PetAvatar, Scene } from '../ui/Art';
import { RestIntervalPicker } from './PetForm';

export const DEMO_SPEEDS = [1, 10, 30, 60, 120, 300];

export default function TripSetup() {
  const { pets, settings, updateSettings, toast } = useStore();
  const [selected, setSelected] = useState<string[]>(pets[0] ? [pets[0].id] : []);
  const [destText, setDestText] = useState(settings.demoMode ? DEMO_DESTINATION.name : '');
  const [dest, setDest] = useState<GeoPoint | null>(settings.demoMode ? DEMO_DESTINATION.point : null);
  const [interval, setIntervalMin] = useState(pets[0]?.restIntervalMinutes ?? settings.defaultRestIntervalMinutes);
  const [recordRoute, setRecordRoute] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permSheet, setPermSheet] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const q = destText.trim();
    if (!q || dest) return [];
    return REGIONS.filter((r) => r.name.includes(q) || r.province.includes(q)).slice(0, 6);
  }, [destText, dest]);

  const togglePet = (id: string) => {
    setSelected((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      const first = pets.find((p) => p.id === next[0]);
      if (first) setIntervalMin(first.restIntervalMinutes);
      return next;
    });
  };

  const start = async (kind: StartKind) => {
    if (selected.length === 0) {
      toast('함께 이동할 반려견을 선택해 주세요.', 'error');
      return;
    }
    setBusy(true);
    const res = await TripController.start({
      pets: pets.filter((p) => selected.includes(p.id)),
      destinationName: destText.trim() || null,
      destination: dest,
      restIntervalMinutes: interval,
      recordRoute,
      kind,
      demoSpeed: settings.demoSpeed,
      voice: settings.voiceGuidance,
    });
    setBusy(false);
    if (res.ok) {
      navigate('/trip/live', { replace: true });
      return;
    }
    if (res.reason === 'already-active') {
      toast(res.message);
      navigate('/trip/live', { replace: true });
    } else if (res.reason === 'permission-denied' || res.reason === 'unavailable' || res.reason === 'unsupported') {
      setPermSheet(res.message); // 오류 대신 수동 기록 모드 안내
    } else {
      toast(res.message, 'error');
    }
  };

  const kind: StartKind = settings.demoMode ? 'demo' : 'device-location';

  return (
    <div className="screen no-nav">
      <TopBar title="여행 시작" />
      {settings.demoMode && (
        <div className="demo-ribbon"><FlaskConical size={14} /> 데모 모드 · 실제 차량·위치 대신 가상 주행 데이터를 사용해요</div>
      )}

      <div className="setup-hero">
        <div>
          <p className="h-xl">여행 시작하기</p>
          <p className="t-body mt-8" style={{ color: 'var(--text-2)' }}>{pets.find((p) => p.id === selected[0])?.name ?? '우리 강아지'}와<br />새로운 여행을 시작할까요?</p>
        </div>
        <div style={{ width: 170, flex: 'none' }}><Scene kind="drive" height={120} /></div>
      </div>
      <section className="section" style={{ marginTop: 18 }}>
        <h2 className="h-md">함께 이동할 반려견</h2>
        <div className="row mt-12" style={{ flexWrap: 'wrap', gap: 14 }}>
          {pets.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button key={p.id} onClick={() => togglePet(p.id)} aria-pressed={on} style={{ border: 0, background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative', padding: 0 }}>
                <div style={{ borderRadius: '50%', boxShadow: on ? '0 0 0 3px var(--primary)' : '0 0 0 1px var(--line)', opacity: on ? 1 : 0.6 }}>
                  <PetAvatar uri={p.photoUri} size={64} />
                </div>
                {on && <span style={{ position: 'absolute', top: 0, right: -2, width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center' }}><Check size={14} strokeWidth={3} /></span>}
                <span style={{ fontSize: 13.5, fontWeight: on ? 700 : 500 }}>{p.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2 className="h-md">목적지 <span className="t-cap" style={{ fontWeight: 500 }}>(선택)</span></h2>
        <div style={{ position: 'relative' }} className="mt-12">
          <MapPin size={18} style={{ position: 'absolute', left: 14, top: 17, color: 'var(--text-2)' }} />
          <input
            className="input"
            style={{ paddingLeft: 40, paddingRight: 44 }}
            placeholder="목적지 없이도 출발할 수 있어요"
            value={destText}
            onChange={(e) => { setDestText(e.target.value); setDest(null); }}
            aria-label="목적지"
          />
          {destText && (
            <button className="icon-btn" aria-label="목적지 지우기" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => { setDestText(''); setDest(null); }}>
              <X size={18} />
            </button>
          )}
        </div>
        {suggestions.length > 0 && (
          <div className="card mt-8" style={{ padding: '4px 16px' }}>
            {suggestions.map((r) => (
              <button key={r.id} className="row-btn" onClick={() => { setDestText(r.name); setDest(r); }}>
                <MapPin size={16} color="var(--text-2)" />
                <span className="grow">{r.name} <span className="t-cap">{r.province}</span></span>
              </button>
            ))}
          </div>
        )}
        {destText && !dest && suggestions.length === 0 && <p className="t-cap mt-8">목록에 없는 곳은 이름만 기록하고 위치는 여행 경로로 정리해요.</p>}
      </section>

      <section className="section">
        <h2 className="h-md">휴식 알림 간격</h2>
        <div className="mt-12"><RestIntervalPicker value={interval} onChange={setIntervalMin} /></div>
        <p className="t-cap mt-8">실제 주행 시간이 이 간격에 이르면 알려드려요. 신호 대기·정체는 휴식으로 세지 않아요.</p>
      </section>

      <section className="section">
        <div className="card">
          <div className="row">
            <div className="grow">
              <p style={{ fontWeight: 700 }}>이동 경로 기록</p>
              <p className="t-cap mt-8">허용한 위치 범위에서만 경로를 저장해요. 끄면 시간·거리만 기록해요.</p>
            </div>
            <Switch checked={recordRoute} onChange={setRecordRoute} label="이동 경로 기록" />
          </div>
          {settings.demoMode && (
            <>
              <div className="divider" />
              <p style={{ fontWeight: 700 }}>시뮬레이션 속도</p>
              <div className="chips mt-8">
                {DEMO_SPEEDS.map((s) => (
                  <button key={s} className={`chip ${settings.demoSpeed === s ? 'on' : ''}`} onClick={() => updateSettings({ demoSpeed: s })}>{s}배속</button>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {!settings.demoMode && (
        <div className="mt-16"><Hint tone="green">여행을 시작하면 위치 권한을 요청해요. 허용하지 않아도 수동 기록 모드로 여행을 기록할 수 있어요.</Hint></div>
      )}

      <button className="btn primary block xl mt-24" disabled={busy || selected.length === 0} onClick={() => start(kind)}>
        <Play size={22} fill="#fff" /> {busy ? '준비 중…' : '여행 시작'}
      </button>

      <Sheet open={!!permSheet} onClose={() => setPermSheet(null)} labelledBy="perm-title">
        <h2 id="perm-title" className="h-lg">위치 없이 기록할까요?</h2>
        <p className="t-sub mt-8">{permSheet}</p>
        <div className="muted-box mt-16 t-body" style={{ fontSize: 14 }}>
          <b>수동 기록 모드</b>에서는 여행 시간과 주행·정차 상태를 직접 기록해요. 이동 거리는 여행을 마친 뒤 입력할 수 있어요.
          위치 권한은 브라우저(또는 기기) 설정에서 언제든 다시 허용할 수 있어요.
        </div>
        <div className="btn-row mt-24">
          <button className="btn ghost" onClick={() => setPermSheet(null)}>취소</button>
          <button className="btn primary" onClick={() => { setPermSheet(null); void start('manual'); }}>수동으로 시작</button>
        </div>
      </Sheet>
    </div>
  );
}
