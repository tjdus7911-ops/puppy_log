import { useState } from 'react';
import { BookImage, ChevronRight, Coffee, Play, Trees, Utensils } from 'lucide-react';
import { realStats, useStore } from '../app/store';
import { navigate } from '../app/router';
import { formatKm, formatShortDate } from '../domain/format';
import { callName } from '../domain/tripText';
import { regionShort } from '../domain/regions';
import { Logo, PetAvatar } from '../ui/Art';
import { EmptyState } from '../ui/components';
import { TripCard } from './Album';

export default function Home() {
  const { pets, trips, tripPets, settings } = useStore();
  const [petIdx, setPetIdx] = useState(0);
  const pet = pets[Math.min(petIdx, pets.length - 1)];
  const stats = realStats(trips, pet?.id, tripPets);
  const recent = trips.filter((t) => t.status === 'ended').slice(0, 3);

  const shortcuts = [
    { label: '반려견 동반\n음식점', icon: Utensils, to: '/explore?cat=restaurant' },
    { label: '주변\n카페', icon: Coffee, to: '/explore?cat=cafe' },
    { label: '주변\n산책 장소', icon: Trees, to: '/explore?cat=park' },
    { label: '내 여행\n앨범', icon: BookImage, to: '/album' },
  ];

  return (
    <div className="screen">
      <header className="row between" style={{ height: 60 }}>
        <Logo />
        <button className="icon-btn" aria-label="마이페이지" onClick={() => navigate('/my')} style={{ padding: 0 }}>
          <PetAvatar uri={pet?.photoUri ?? null} size={36} />
        </button>
      </header>

      <h1 className="h-xl mt-8">
        {settings.userName ? `${settings.userName}님, ` : ''}오늘은 {pet ? callName(pet.name) : '우리 강아지'}와
        <br />어디로 떠나볼까요?
      </h1>

      {pet ? (
        <div className="card mt-16" style={{ background: 'linear-gradient(135deg, #fff 0%, #FBF6EE 100%)' }}>
          <div className="row" style={{ gap: 14 }}>
            <PetAvatar uri={pet.photoUri} size={64} ring />
            <div className="grow">
              <p className="h-md">{pet.name}</p>
              <p className="t-cap mt-8">함께 달린 기록</p>
            </div>
            {pets.length > 1 && (
              <button className="chip" onClick={() => setPetIdx((petIdx + 1) % pets.length)}>다른 친구</button>
            )}
          </div>
          <div className="grid-2 mt-16">
            <div className="muted-box"><p className="t-cap">누적 여행</p><p className="num" style={{ fontWeight: 750, fontSize: 20, marginTop: 4 }}>{stats.count}회</p></div>
            <div className="muted-box"><p className="t-cap">누적 이동 거리</p><p className="num" style={{ fontWeight: 750, fontSize: 20, marginTop: 4 }}>{formatKm(stats.km)}</p></div>
          </div>
          {trips.some((t) => t.isDemo) && <p className="t-cap mt-8">데모 기록은 누적 통계에 포함되지 않아요.</p>}
        </div>
      ) : (
        <div className="card mt-16">
          <p className="h-md">반려견을 먼저 등록해 주세요</p>
          <button className="btn secondary sm mt-12" onClick={() => navigate('/pet/new')}>반려견 등록</button>
        </div>
      )}

      <button className="btn primary block xl mt-16" onClick={() => navigate('/trip/setup')} disabled={!pet}>
        <Play size={22} fill="#fff" /> 여행 시작하기
      </button>
      {settings.demoMode && <p className="t-cap mt-8" style={{ textAlign: 'center' }}>데모 모드가 켜져 있어요 · 서울 → 강릉 시뮬레이션</p>}

      <div className="grid-4 mt-24">
        {shortcuts.map((s) => (
          <button key={s.to} onClick={() => navigate(s.to)} style={{ border: 0, background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ width: 58, height: 58, borderRadius: 18, background: 'var(--surface)', boxShadow: 'var(--shadow)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}>
              <s.icon size={24} />
            </span>
            <span style={{ fontSize: 12.5, lineHeight: 1.3, whiteSpace: 'pre-line', textAlign: 'center', color: 'var(--text)' }}>{s.label}</span>
          </button>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="h-md">최근 여행</h2>
          {recent.length > 0 && <button className="link" onClick={() => navigate('/album')}>전체 보기 <ChevronRight size={16} /></button>}
        </div>
        {recent.length === 0 ? (
          <div className="card">
            <EmptyState title="아직 기록된 여행이 없어요" desc="첫 여행을 시작하면 이곳에 추억이 쌓여요." />
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {recent.map((t) => (
              <TripCard key={t.id} trip={t} compact subtitle={`${formatShortDate(t.startTime)} · ${regionShort(t.endLocation)}`} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
