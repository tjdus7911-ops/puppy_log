// 화면 7. 업로드 완료(애니메이션) / 실패(입력 내용 보존 + 재시도)
import { useState } from 'react';
import { Check, RotateCcw, Sparkle } from 'lucide-react';
import { navigate, queryParam, useRoute } from '../../app/router';
import { useStore } from '../../app/store';
import { Draft, publishDraft, useDraft } from '../../app/community';

export default function UploadDone() {
  const route = useRoute();
  const id = queryParam(route, 'id');
  const failed = queryParam(route, 'fail') === '1';
  const { pets, settings } = useStore();
  const d = useDraft();
  const [busy, setBusy] = useState(false);
  const pet = pets[0];

  if (failed && !id) {
    const retry = async () => {
      setBusy(true);
      const r = await publishDraft({ name: settings.userName || (pet ? `${pet.name} 보호자` : '나'), petName: pet?.name ?? null, photo: pet?.photoUri ?? null });
      setBusy(false);
      if (r.ok) navigate(`/community/new/done?id=${r.id}`, { replace: true });
    };
    return (
      <div className="up-done fail" role="alert">
        <div className="up-check" style={{ background: '#E5484D' }}><RotateCcw size={46} color="#fff" /></div>
        <h1>게시물을 등록하지 못했어요</h1>
        <p style={{ opacity: 0.85, fontSize: 14.5, lineHeight: 1.6 }}>{d.lastError ?? '잠시 후 다시 시도해 주세요.'}<br />작성한 내용과 선택한 사진 {d.media.length}개는 그대로 남아 있어요.</p>
        <button className="btn white xl" disabled={busy || Draft.isEmpty()} onClick={retry}>{busy ? '다시 시도하는 중…' : '다시 시도'}</button>
        <button className="btn line xl" onClick={() => navigate('/community/new/write', { replace: true })}>작성 화면으로</button>
      </div>
    );
  }

  return (
    <div className="up-done" role="status">
      <div style={{ position: 'relative' }}>
        <Sparkle className="up-spark" size={18} style={{ left: -34, top: -6 }} />
        <Sparkle className="up-spark" size={14} style={{ right: -30, top: 4, animationDelay: '.4s' }} />
        <Sparkle className="up-spark" size={12} style={{ right: -14, bottom: -18, animationDelay: '.8s', color: '#8daef5' }} />
        <div className="up-check"><Check size={54} color="#fff" strokeWidth={3} /></div>
      </div>
      <h1>게시물이<br />등록되었어요!</h1>
      <span className="badge sample" style={{ height: 26 }}>데모 · 서버 미연동으로 이 기기에만 저장됐어요</span>
      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        <button className="btn white xl" onClick={() => navigate(id ? `/community/post/${id}` : '/community', { replace: true })}>게시글 보러가기</button>
        <button className="btn line xl" onClick={() => navigate('/community?tab=new', { replace: true })}>커뮤니티로 돌아가기</button>
      </div>
    </div>
  );
}
