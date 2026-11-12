// 주행 중 자동 추천 카드: "2km 앞에 반려견 동반 카페가 있어요. 들렀다 갈까요?"  [들르기] [괜찮아요]
// 긴 목록·상세 화면 없이 한 곳만, 같은 장소는 다시 추천하지 않고, 경유지 요청은 '들르기'를 눌렀을 때만.
import { useEffect, useRef, useState } from 'react';
import { Mic, Navigation, X } from 'lucide-react';
import { TripController, type LiveSnapshot } from '../trip/TripController';
import type { AppSettings, GeoPoint, PlaceCategory } from '../domain/models';
import { aheadByHeading, aheadOnRoute, COOLDOWN_SEC, isMealTime, parseYesNo, pickSuggestion, suggestionSentence, TRIGGER_CATEGORIES, type RecoCandidate, type RecoTrigger } from '../domain/autoReco';
import { haversineKm } from '../domain/geo';
import { getPlaceProvider } from '../places/providers';
import type { Place } from '../places/PlaceSearchProvider';
import { openNavigation } from '../places/navigation';
import { speak } from '../trip/speech';
import { listenOnce, speechRecognitionSupported } from '../trip/voice';
import { formatKm } from '../domain/format';
import { PlaceThumb } from '../ui/Art';

interface Props {
  live: LiveSnapshot;
  settings: AppSettings;
  planned: GeoPoint[];
  /** 음성 장소 요청이 들어올 때마다 1씩 증가 */
  voiceRequest: { n: number; category: PlaceCategory | null };
  toast: (t: string, tone?: 'info' | 'error') => void;
}

export function AutoSuggest({ live, settings, planned, voiceRequest, toast }: Props) {
  const [sug, setSug] = useState<(RecoCandidate & { place: Place; trigger: RecoTrigger }) | null>(null);
  const suggested = useRef(new Set<string>());
  const lastAt = useRef<Record<RecoTrigger, number>>({ rest: -Infinity, meal: -Infinity, voice: -Infinity });
  const handledReminder = useRef<string | null>(null);
  const handledVoice = useRef(0);
  const busy = useRef(false);
  const [listening, setListening] = useState(false);

  const e = live.engine;
  const provider = getPlaceProvider(settings.apiBaseUrl);

  const run = async (trigger: RecoTrigger, onlyCategory: PlaceCategory | null) => {
    const pos = live.position;
    if (!pos || busy.current) return;
    busy.current = true;
    try {
      const cats = (onlyCategory ? [onlyCategory] : TRIGGER_CATEGORIES[trigger]).filter((c) => trigger === 'voice' || settings.autoRecoCategories.includes(c));
      // 경로가 있으면 약 3km 앞을 중심으로 찾음
      let center = pos;
      if (planned.length > 1) {
        let i = 0, bd = Infinity;
        planned.forEach((q, k) => { const d = haversineKm(q, pos); if (d < bd) { bd = d; i = k; } });
        center = planned[Math.min(planned.length - 1, i + 1)] ?? pos;
      }
      const found = (await Promise.all(cats.map((c) => provider.search({ category: c, centers: [center], radiusKm: 8 }).catch(() => [] as Place[])))).flat();
      const prev = live.route.length > 3 ? live.route[live.route.length - 4] : null;
      const cands = found
        .map((p): (RecoCandidate & { place: Place }) | null => {
          const a: { aheadKm: number; detourKm: number | null } | null = planned.length > 1 ? aheadOnRoute(planned, pos, p) : prev ? aheadByHeading(prev, pos, p) : { aheadKm: haversineKm(pos, p), detourKm: null };
          if (!a) return null;
          return { id: p.id, name: p.name, category: p.category, point: p, petConfirmed: p.policy.smallDog === true || p.policy.largeDog === true, ...a, place: p };
        })
        .filter((x): x is RecoCandidate & { place: Place } => !!x);
      const pick = pickSuggestion(cands, { trigger, enabled: trigger === 'voice' ? cats : settings.autoRecoCategories, suggested: suggested.current });
      lastAt.current[trigger] = e?.drivingSec ?? 0;
      if (!pick) {
        if (trigger === 'voice') speak('경로 앞쪽에서 들를 만한 장소를 찾지 못했어요.', 'rest');
        return;
      }
      const full = { ...(pick as RecoCandidate & { place: Place }), trigger };
      suggested.current.add(pick.id); // 같은 장소 반복 추천 금지
      setSug(full);
      TripController.logPlaceSuggestion(pick.id, null);
      if (settings.voiceGuidance) speak(`${full.place.isSample ? '샘플 데이터입니다. ' : ''}${suggestionSentence(pick)}`, 'place');
    } finally {
      busy.current = false;
    }
  };

  // 트리거: 휴식 알림 시점 / 식사 시간대 / 음성 요청
  useEffect(() => {
    // 한 번에 하나: 탑승 안전 안내가 떠 있으면 장소 제안은 기다림
    if (!settings.autoRecommend || !live.driving || !e || sug || live.cabinPrompt) return;
    const key = live.reminder ? `${live.reminder.kind}-${live.reminder.drivenMinutes}` : null;
    if (key && key !== handledReminder.current) {
      handledReminder.current = key;
      void run('rest', null);
      return;
    }
    if (isMealTime(e.lastTick) && e.drivingSec - lastAt.current.meal > COOLDOWN_SEC && e.status === 'driving') {
      void run('meal', null);
    }
  }, [live.reminder, e?.lastTick, live.driving, settings.autoRecommend, sug, live.cabinPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (voiceRequest.n > handledVoice.current && live.driving) {
      handledVoice.current = voiceRequest.n;
      setSug(null);
      void run('voice', voiceRequest.category);
    }
  }, [voiceRequest.n]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sug) return null;

  const accept = () => {
    // 경유지 요청은 사용자가 '들르기'를 눌렀을 때만
    if (sug.place.isSample) toast('샘플 장소라 실제 경유지 추가는 하지 않아요(데모).');
    else {
      const r = openNavigation(sug.place.name, sug.place.latitude, sug.place.longitude, false);
      toast(r.ok ? '길 안내를 열었어요. (차량에서는 내비 경유지로 추가 예정)' : r.message!, r.ok ? 'info' : 'error');
    }
    TripController.logPlaceSuggestion(sug.place.id, true);
    setSug(null);
  };
  const decline = () => { TripController.logPlaceSuggestion(sug.place.id, false); setSug(null); if (settings.voiceGuidance) speak('알겠어요.'); };

  const voiceReply = async () => {
    setListening(true);
    try {
      const a = parseYesNo(await listenOnce());
      if (a === 'yes') accept();
      else if (a === 'no') decline();
      else toast('“응” 또는 “괜찮아”로 답해 주세요.');
    } catch { toast('음성을 인식하지 못했어요. 버튼으로 선택해 주세요.'); }
    setListening(false);
  };

  return (
    <div className="reco-pop" role="dialog" aria-label="주행 중 장소 추천">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <PlaceThumb category={sug.category} size={52} radius={14} />
        <div className="grow" style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 750, fontSize: 16 }}>{suggestionSentence(sug)}</p>
          <p className="t-sub ellipsis mt-8" style={{ fontSize: 13.5 }}>
            <b style={{ color: 'var(--text)' }}>{sug.name}</b>
            {sug.place.isSample && <span className="badge sample" style={{ height: 18, marginLeft: 6 }}>샘플</span>}
          </p>
          <p className="t-cap">
            {sug.detourKm != null ? `경로 이탈 약 ${formatKm(sug.detourKm)}` : '경로 정보 없음(진행 방향 기준)'} ·{' '}
            <span style={{ color: sug.petConfirmed ? 'var(--mint-text)' : undefined, fontWeight: 600 }}>{sug.petConfirmed ? (sug.place.isSample ? '동반 가능(샘플 데이터)' : '반려견 동반 확인됨') : '동반 여부 확인 필요'}</span>
            {' · '}{sug.trigger === 'rest' ? '휴식 시점 추천' : sug.trigger === 'meal' ? '식사 시간 추천' : '음성 요청'}
          </p>
        </div>
        <button className="icon-btn" aria-label="닫기" onClick={decline} style={{ width: 36, height: 36 }}><X size={18} /></button>
      </div>
      <div className="btn-row mt-12">
        <button className="btn primary" onClick={accept}><Navigation size={18} />들르기</button>
        <button className="btn ghost" onClick={decline}>괜찮아요</button>
        {speechRecognitionSupported() && <button className="btn ghost" style={{ flex: 'none', padding: '0 16px' }} aria-label="음성으로 답하기" onClick={voiceReply} disabled={listening}><Mic size={18} /></button>}
      </div>
    </div>
  );
}
