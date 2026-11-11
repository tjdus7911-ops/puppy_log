// 화면 5. 미리보기 및 편집(다크): 큰 미리보기 · 썸네일 순서 변경 · 삭제/추가 · 자르기 · 필터 · 텍스트 · 사진별 메모
// 편집 결과는 초안의 미디어 데이터(src/crop/filter/text/memo)에 바로 반영되어 그대로 게시됩니다.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, Crop, NotebookPen, Plus, Sparkles, Trash2, Type } from 'lucide-react';
import { navigate } from '../../app/router';
import { useStore } from '../../app/store';
import { Draft, useDraft } from '../../app/community';
import { cropDataUrl } from '../../app/media';
import { CROP_LABEL, FILTER_CSS, FILTER_LABEL, type CropRatio, type MediaFilter, type PostMedia, type TextPos } from '../../domain/community';
import { TripController } from '../../trip/TripController';
import { drivingLocked } from '../../trip/driveLock';
import { DriveLock, MediaView } from './parts';

type Tool = 'crop' | 'filter' | 'text' | 'memo' | null;

export default function EditMedia() {
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const { toast } = useStore();
  const d = useDraft();
  const [tool, setTool] = useState<Tool>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const n = d.media.length;
  const cur = Math.min(d.current, Math.max(0, n - 1));
  const m = d.media[cur];

  useEffect(() => { if (n === 0) navigate('/community/new', { replace: true }); }, [n]);
  if (drivingLocked(live)) return <DriveLock title="게시물 작성" />;
  if (!m) return null;

  const patch = (p: Partial<PostMedia>) => Draft.set((s) => ({ media: s.media.map((x, i) => (i === cur ? { ...x, ...p } : x)) }));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= n || from === to) return;
    Draft.set((s) => { const l = [...s.media]; const [it] = l.splice(from, 1); l.splice(to, 0, it); return { media: l, current: to }; });
  };
  const remove = () => Draft.set((s) => ({ media: s.media.filter((_, i) => i !== cur), current: Math.max(0, cur - 1) }));
  const crop = async (c: CropRatio) => {
    if (m.kind === 'video') { toast('동영상은 자르기를 지원하지 않아요.', 'error'); return; }
    try { patch({ crop: c, src: await cropDataUrl(m.original || m.src, c) }); } catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <div className="cm-dark" style={{ paddingBottom: 12 }}>
      <div className="bar">
        <button className="dk-btn" aria-label="앨범으로" onClick={() => navigate('/community/new')}><ChevronLeft size={26} /></button>
        <span className="ttl"><span className="count-chip num">{cur + 1}/{n}</span></span>
        <button className="dk-btn primary" onClick={() => navigate('/community/new/write')}>다음</button>
      </div>

      <div className="ed-stage" style={m.crop === '16:9' ? { aspectRatio: '16 / 9' } : m.crop === '1:1' ? { aspectRatio: '1' } : undefined}>
        <MediaView m={m} contain controls={m.kind === 'video'} />
      </div>

      <div className="ed-tools" role="toolbar" aria-label="편집 도구">
        {([['crop', Crop, '편집'], ['filter', Sparkles, '필터'], ['text', Type, '텍스트'], ['memo', NotebookPen, '메모']] as [Tool, typeof Crop, string][]).map(([k, I, l]) => (
          <button key={k} className={tool === k ? 'on' : ''} aria-pressed={tool === k} onClick={() => setTool(tool === k ? null : k)}><I size={22} />{l}</button>
        ))}
      </div>

      {tool === 'crop' && (
        <div className="ed-panel">
          <span style={{ fontSize: 13, color: '#9aa6ba' }}>비율 자르기 · 원본은 보관돼 언제든 되돌릴 수 있어요</span>
          <div className="chips">{(Object.keys(CROP_LABEL) as CropRatio[]).map((c) => <button key={c} className={`chip ${m.crop === c ? 'on' : ''}`} onClick={() => crop(c)}>{CROP_LABEL[c]}</button>)}</div>
        </div>
      )}
      {tool === 'filter' && (
        <div className="ed-panel">
          <div className="ed-filters">
            {(Object.keys(FILTER_LABEL) as MediaFilter[]).map((f) => (
              <button key={f} className={m.filter === f ? 'on' : ''} onClick={() => patch({ filter: f })} aria-pressed={m.filter === f}>
                <span className="th">{m.kind === 'image' ? <img src={m.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: FILTER_CSS[f] }} /> : <span style={{ display: 'block', width: '100%', height: '100%', background: '#2a3448', filter: FILTER_CSS[f] }} />}</span>
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
      )}
      {tool === 'text' && (
        <div className="ed-panel">
          <input className="input" maxLength={40} placeholder="사진 위에 넣을 문구 (최대 40자)" value={m.text} onChange={(e) => patch({ text: e.target.value })} aria-label="사진 문구" />
          <div className="chips">{([['top', '위'], ['center', '가운데'], ['bottom', '아래']] as [TextPos, string][]).map(([k, l]) => <button key={k} className={`chip ${m.textPos === k ? 'on' : ''}`} onClick={() => patch({ textPos: k })}>{l}</button>)}</div>
        </div>
      )}
      {tool === 'memo' && (
        <div className="ed-panel">
          <textarea className="input" style={{ minHeight: 80 }} maxLength={200} placeholder="이 사진에 남기고 싶은 메모" value={m.memo} onChange={(e) => patch({ memo: e.target.value })} aria-label="사진 메모" />
        </div>
      )}

      <div className="ed-thumbs" aria-label="선택한 미디어 순서">
        {d.media.map((x, i) => (
          <button key={x.id} className={`ed-thumb ${i === cur ? 'on' : ''}`} draggable
            onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag != null) move(drag, i); setDrag(null); }}
            onClick={() => Draft.set({ current: i })} aria-label={`${i + 1}번째 미디어`} aria-current={i === cur}>
            <MediaView m={x} />
          </button>
        ))}
        {n < 10 && <button className="ed-add" aria-label="사진 추가" onClick={() => navigate('/community/new')}><Plus size={24} /></button>}
      </div>
      <div className="ed-order">
        <button className="btn sm" disabled={cur === 0} onClick={() => move(cur, cur - 1)} aria-label="앞으로 이동"><ArrowLeft size={16} />앞으로</button>
        <button className="btn sm" onClick={remove} aria-label="이 사진 빼기"><Trash2 size={16} />빼기</button>
        <button className="btn sm" disabled={cur === n - 1} onClick={() => move(cur, cur + 1)} aria-label="뒤로 이동">뒤로<ArrowRight size={16} /></button>
      </div>
    </div>
  );
}
