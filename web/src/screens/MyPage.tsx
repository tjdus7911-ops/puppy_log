import { Fragment, useEffect, useState, useSyncExternalStore } from 'react';
import { ChevronRight, FlaskConical, Info, LocateFixed, Plus, Server, ShieldCheck, Trash2, Volume2 , Map as MapIcon } from 'lucide-react';
import { realStats, useStore } from '../app/store';
import { navigate } from '../app/router';
import { repo } from '../data/db';
import { formatDuration, formatKm, ageFrom } from '../domain/format';
import { mapJsKey, PET_SIZE_LABEL } from '../domain/models';
import { storageMode } from '../data/db';
import { speechRecognitionSupported } from '../trip/voice';
import { TripController } from '../trip/TripController';
import { Hint, Sheet, Switch, TopBar } from '../ui/components';
import { PetAvatar } from '../ui/Art';
import { RestIntervalPicker } from './PetForm';
import { DEMO_SPEEDS } from './TripSetup';

type Wipe = 'demo' | 'trips' | 'all' | null;

export default function MyPage() {
  const { pets, trips, settings, updateSettings, reload, toast } = useStore();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const stats = realStats(trips);
  const regions = new Set(trips.filter((t) => !t.isDemo && t.status === 'ended' && t.endLocation).map((t) => t.endLocation!.regionName)).size;
  const [perm, setPerm] = useState<string>('확인 중');
  const [wipe, setWipe] = useState<Wipe>(null);
  const [api, setApi] = useState(settings.apiBaseUrl);
  const [name, setName] = useState(settings.userName);
  const [jsKey, setJsKey] = useState(settings.kakaoJsKey);

  useEffect(() => {
    if (!navigator.permissions?.query) { setPerm('확인할 수 없음'); return; }
    navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((s) => {
      const map: Record<string, string> = { granted: '허용됨', denied: '거부됨', prompt: '아직 묻지 않음' };
      setPerm(map[s.state] ?? s.state);
      s.onchange = () => setPerm(map[s.state] ?? s.state);
    }).catch(() => setPerm('확인할 수 없음'));
  }, []);

  const doWipe = async () => {
    try {
      if (wipe === 'demo') {
        for (const t of trips.filter((x) => x.isDemo)) await repo.deleteTrip(t.id);
        toast('데모 기록을 삭제했어요.');
      } else if (wipe === 'trips') {
        await repo.wipe({ includePets: false });
        toast('모든 여행 기록과 위치 데이터를 삭제했어요.');
      } else if (wipe === 'all') {
        await repo.wipe({ includePets: true });
        toast('모든 개인정보와 위치 데이터를 삭제했어요.');
        await reload();
        setWipe(null);
        navigate('/onboarding', { replace: true });
        return;
      }
      await reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setWipe(null);
  };

  return (
    <div className="screen">
      <TopBar title="마이페이지" showBack={false} />

      <section>
        <div className="section-head"><h2 className="h-md">반려견 프로필</h2><button className="link" onClick={() => navigate('/pet/new')}><Plus size={16} />추가</button></div>
        <div className="card" style={{ padding: '2px 18px' }}>
          {pets.length === 0 && <p className="t-sub" style={{ padding: '16px 0' }}>등록된 반려견이 없어요.</p>}
          {pets.map((p) => (
            <button key={p.id} className="row-btn" onClick={() => navigate(`/pet/${p.id}`)}>
              <PetAvatar uri={p.photoUri} size={48} />
              <div className="grow">
                <p style={{ fontWeight: 700 }}>{p.name}</p>
                <p className="t-cap">{[PET_SIZE_LABEL[p.size], ageFrom(p.birthDate, p.ageYears), p.weight ? `${p.weight}kg` : null, `휴식 ${p.restIntervalMinutes}분`].filter(Boolean).join(' · ')}</p>
              </div>
              <ChevronRight size={18} color="var(--text-3)" />
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="h-md" style={{ marginBottom: 12 }}>누적 여행 통계</h2>
        <div className="grid-2">
          <div className="stat"><span className="k">여행 횟수</span><p className="v">{stats.count}회</p></div>
          <div className="stat"><span className="k">이동 거리</span><p className="v">{formatKm(stats.km)}</p></div>
          <div className="stat"><span className="k">실제 주행 시간</span><p className="v">{formatDuration(stats.drivingSec)}</p></div>
          <div className="stat"><span className="k">다녀온 지역</span><p className="v">{regions}곳</p></div>
        </div>
        <p className="t-cap mt-8">실제 기록만 집계해요. 데모 시뮬레이션 기록은 포함되지 않아요.</p>
      </section>

      <section className="section">
        <h2 className="h-md" style={{ marginBottom: 12 }}>기능별 연동 상태</h2>
        <div className="card">
          <div className="integ">
            {integrations(settings.apiBaseUrl, mapJsKey(settings)).map(([k, st, cls]) => (
              <Fragment key={k}><span>{k}</span><span className={`st ${cls}`}>{st}</span></Fragment>
            ))}
          </div>
          <p className="t-cap mt-12">실제 동작 = 이 기기에서 실제로 동작 · 데모 = 가상 데이터(화면에 데모/샘플 배지) · 미연동 = 키·서버 설정 필요</p>
        </div>
      </section>

      <section className="section">
        <h2 className="h-md" style={{ marginBottom: 12 }}>설정</h2>
        <div className="card" style={{ padding: '2px 18px' }}>
          <div className="row-item">
            <div className="grow">
              <p style={{ fontWeight: 650 }}>보호자 이름</p>
              <input className="input mt-8" style={{ height: 44 }} maxLength={12} placeholder="홈 인사말에 쓰여요 (선택)" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== settings.userName && updateSettings({ userName: name.trim() })} />
            </div>
          </div>
          <div className="row-item" style={{ display: 'block' }}>
            <p style={{ fontWeight: 650, marginBottom: 8 }}>기본 휴식 알림 간격 <span className="t-cap">(새 반려견 등록 시)</span></p>
            <RestIntervalPicker value={settings.defaultRestIntervalMinutes} onChange={(v) => updateSettings({ defaultRestIntervalMinutes: v })} />
            <p className="t-cap mt-8">반려견별 간격은 각 프로필에서 바꿀 수 있어요. 의학적 기준이 아닌 보호자 설정값이에요.</p>
          </div>
          <div className="row-item">
            <Volume2 size={20} color="var(--text-2)" />
            <div className="grow"><p style={{ fontWeight: 650 }}>음성 안내</p><p className="t-cap">휴식 알림 등을 소리로 알려드려요</p></div>
            <Switch checked={settings.voiceGuidance} onChange={(v) => updateSettings({ voiceGuidance: v })} label="음성 안내" />
          </div>
          <div className="row-item" style={{ display: 'block' }}>
            <div className="row">
              <FlaskConical size={20} color="var(--text-2)" />
              <div className="grow"><p style={{ fontWeight: 650 }}>데모 모드</p><p className="t-cap">서울 → 강릉 가상 주행으로 시연해요</p></div>
              <Switch checked={settings.demoMode} onChange={(v) => updateSettings({ demoMode: v })} label="데모 모드" />
            </div>
            {settings.demoMode && (
              <div className="chips mt-12">
                {DEMO_SPEEDS.map((s) => <button key={s} className={`chip ${settings.demoSpeed === s ? 'on' : ''}`} onClick={() => updateSettings({ demoSpeed: s })}>{s}배속</button>)}
              </div>
            )}
            {live.active && <p className="t-cap mt-8">진행 중인 여행에는 바뀐 설정이 적용되지 않아요.</p>}
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="h-md" style={{ marginBottom: 12 }}>위치 권한</h2>
        <div className="card">
          <div className="row"><LocateFixed size={20} color="var(--primary)" /><p className="grow" style={{ fontWeight: 650 }}>현재 상태</p><span className="badge">{perm}</span></div>
          <p className="t-sub mt-12">멍로드는 여행을 기록하는 동안에만 위치를 사용하고, 기록은 이 기기 안에만 저장해요. 권한은 브라우저 주소창의 사이트 설정(Android 앱은 설정 › 앱 › 멍로드 › 권한)에서 바꿀 수 있어요. 권한이 없어도 수동 기록 모드로 여행을 남길 수 있어요.</p>
        </div>
      </section>

      <section className="section">
        <h2 className="h-md" style={{ marginBottom: 12 }}>데이터 관리</h2>
        <div className="card" style={{ padding: '2px 18px' }}>
          {[
            { k: 'demo' as const, label: '데모 기록만 삭제', desc: `${trips.filter((t) => t.isDemo).length}개` },
            { k: 'trips' as const, label: '여행 기록 전체 삭제', desc: '경로·휴식·사진·일기 포함' },
            { k: 'all' as const, label: '개인정보 및 위치 데이터 전체 삭제', desc: '반려견 프로필·설정까지 모두 초기화' },
          ].map((x) => (
            <button key={x.k} className="row-btn" disabled={live.active} onClick={() => setWipe(x.k)} style={{ opacity: live.active ? 0.5 : 1 }}>
              <Trash2 size={18} color="#D93F3C" />
              <div className="grow"><p style={{ fontWeight: 650, color: x.k === 'all' ? '#D93F3C' : undefined }}>{x.label}</p><p className="t-cap">{x.desc}</p></div>
            </button>
          ))}
        </div>
        {live.active && <p className="t-cap mt-8">여행 기록 중에는 삭제할 수 없어요.</p>}
      </section>

      <section className="section">
        <h2 className="h-md" style={{ marginBottom: 12 }}>연동 서버 (개발용)</h2>
        <div className="card">
          <div className="row"><Server size={18} color="var(--text-2)" /><p style={{ fontWeight: 650 }}>AI 일기·장소 검색 프록시 주소</p></div>
          <input className="input mt-12" style={{ height: 46 }} placeholder="예: http://localhost:8787 (비우면 샘플·템플릿 사용)" value={api} onChange={(e) => setApi(e.target.value)} />
          <button className="btn secondary sm mt-12" onClick={() => {
            const v = api.trim();
            if (v) { try { new URL(v); } catch { toast('주소 형식을 확인해 주세요.', 'error'); return; } }
            void updateSettings({ apiBaseUrl: v });
            toast(v ? '서버 주소를 저장했어요.' : '샘플 데이터·기본 일기를 사용해요.');
          }}>저장</button>
          <div className="mt-12"><Hint tone="green">카카오 REST·ITS·AI 키는 앱에 저장하지 않아요. 키는 서버(server/) 환경 변수에만 두고, 앱은 서버 주소만 알고 있어요.</Hint></div>
          <div className="divider" />
          <div className="row"><MapIcon size={18} color="var(--text-2)" /><p style={{ fontWeight: 650 }}>카카오맵 JavaScript 키 (실제 지도)</p></div>
          <input className="input mt-12" style={{ height: 46 }} placeholder="비우면 개요 지도(도로 없음)를 사용해요" value={jsKey} onChange={(e) => setJsKey(e.target.value)} />
          <button className="btn secondary sm mt-12" onClick={() => { void updateSettings({ kakaoJsKey: jsKey.trim() }); toast(jsKey.trim() ? '지도 키를 저장했어요. 여행 화면에서 지도를 불러와요.' : '개요 지도를 사용해요.'); }}>저장</button>
          <p className="t-cap mt-8">JavaScript 키는 도메인 제한 키예요. 카카오디벨로퍼스의 'JavaScript SDK 도메인'에 이 웹 주소(예: http://localhost:5173)를 등록해야 지도가 열려요.</p>
        </div>
      </section>

      <section className="section">
        <h2 className="h-md" style={{ marginBottom: 12 }}>앱 정보</h2>
        <div className="card t-sub" style={{ fontSize: 13.5 }}>
          <div className="row"><Info size={18} color="var(--text-2)" /><p style={{ fontWeight: 700, color: 'var(--text)' }}>멍로드 MUNG ROAD · 웹 프로토타입 v0.2.0</p></div>
          <p className="mt-8">우리 강아지와 함께 달린 모든 길이 추억이 된다.</p>
          <p className="mt-8">이 웹 프로토타입은 사용자 흐름 검증용이에요. 최종 목표는 현대자동차 Pleos Connect용 Android 앱이며, 차량 SDK 연동은 Android 코드에서 진행해요.</p>
          <div className="divider" />
          <p className="row" style={{ gap: 6 }}><ShieldCheck size={15} />오픈소스·데이터 라이선스</p>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Pretendard — SIL Open Font License 1.1</li>
            <li>Lucide 아이콘 — ISC License</li>
            <li>지도 해안선 — Natural Earth (퍼블릭 도메인), world-atlas (ISC)</li>
            <li>일러스트 — 멍로드 자체 제작 SVG</li>
          </ul>
        </div>
      </section>

      <Sheet open={wipe != null} onClose={() => setWipe(null)} center labelledBy="wipe-title">
        <h2 id="wipe-title" className="h-md">{wipe === 'demo' ? '데모 기록을 삭제할까요?' : wipe === 'trips' ? '모든 여행 기록을 삭제할까요?' : '모든 데이터를 삭제할까요?'}</h2>
        <p className="t-sub mt-8">{wipe === 'all' ? '반려견 프로필, 여행 기록, 위치 경로, 사진, 설정이 모두 지워지고 처음 화면으로 돌아가요.' : '삭제한 기록은 되돌릴 수 없어요.'}</p>
        <div className="btn-row mt-24">
          <button className="btn ghost" onClick={() => setWipe(null)}>취소</button>
          <button className="btn danger" onClick={doWipe}>삭제</button>
        </div>
      </Sheet>
    </div>
  );
}

type Integ = [string, string, 'ok' | 'demo' | 'off'];
function integrations(api: string, jsKey: string): Integ[] {
  const server = !!api.trim();
  return [
    ['여행 기록·휴식 알림·여행 종료', '실제 동작', 'ok'],
    ['기록 저장(새로고침 유지)', storageMode === 'persistent' ? '실제 동작' : '임시 메모리', storageMode === 'persistent' ? 'ok' : 'off'],
    ['서울 → 강릉 차량 주행', '데모', 'demo'],
    ['차량 데이터(Pleos SDK)', '미연동 · Android 앱 전용', 'off'],
    ['내비 목적지·남은 거리·ETA', '데모(추정) / 앱 목적지', 'demo'],
    ['실제 도로 지도(카카오맵)', jsKey ? '키 설정됨 · 확인 필요' : '미연동 · 개요 지도', jsKey ? 'ok' : 'off'],
    ['주변 반려견 동반 장소', server ? '서버 연동(카카오)' : '샘플 데이터', server ? 'ok' : 'demo'],
    ['도로 위험 정보(사고·공사 등)', server ? '서버 연동(ITS) · 데모 여행은 데모' : '데모 여행에서만 데모', server ? 'ok' : 'demo'],
    ['AI 여행 일기', server ? '서버 연동(AI)' : '기록 기반 템플릿', server ? 'ok' : 'demo'],
    ['음성 명령', speechRecognitionSupported() ? '브라우저 인식 + 데모 명령' : '데모 명령', speechRecognitionSupported() ? 'ok' : 'demo'],
    ['커뮤니티', '예시 게시물(준비 중)', 'demo'],
  ];
}
