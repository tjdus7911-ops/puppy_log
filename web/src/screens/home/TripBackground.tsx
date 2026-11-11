// '새 여행 시작' 배경: 기본 일러스트 3종 + 직접 올린 사진. 반려견 프로필과 별도로 저장(이 기기).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ImagePlus, RotateCcw } from 'lucide-react';
import { BG_SYNC, DEFAULT_BG, HomeBackground, imageFileToBg, useHomeBackground } from '../../app/homeBg';
import { useStore } from '../../app/store';
import { TripController } from '../../trip/TripController';
import { Sheet } from '../../ui/components';
import { SCENE_LABEL, TripScene, type SceneId } from '../../ui/scenes';

/** 현재 배경. 업로드 사진을 불러오지 못하면 기본 배경으로 표시 */
export function TripBackground() {
  const bg = useHomeBackground();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  useEffect(() => { void HomeBackground.load(); }, []);
  if (bg.kind === 'upload' && failedSrc !== bg.src) {
    return (
      <>
        <img src={bg.src} alt="직접 올린 여행 배경 사진" onError={() => setFailedSrc(bg.src)} />
        <span className="bg-src">내 사진 · 이 기기에만 저장</span>
      </>
    );
  }
  const id: SceneId = bg.kind === 'preset' ? bg.id : (DEFAULT_BG as { id: SceneId }).id;
  return <TripScene id={id} />;
}

export function BackgroundSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useStore();
  const bg = useHomeBackground();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const locked = live.driving;

  const pick = async (id: SceneId) => {
    try { await HomeBackground.set({ kind: 'preset', id, updatedAt: Date.now() }); toast(`배경을 ‘${SCENE_LABEL[id]}’로 바꿨어요.`); onClose(); }
    catch { toast('배경을 저장하지 못했어요. 다시 시도해 주세요.', 'error'); }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const src = await imageFileToBg(f);
      await HomeBackground.set({ kind: 'upload', src, updatedAt: Date.now() });
      toast('내 사진을 배경으로 설정했어요.');
      onClose();
    } catch (e) {
      toast((e as Error).message || '사진을 배경으로 설정하지 못했어요.', 'error');
    } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  const reset = async () => {
    try { await HomeBackground.reset(); toast('기본 배경(바닷가 드라이브)으로 되돌렸어요.'); onClose(); }
    catch { toast('초기화하지 못했어요.', 'error'); }
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy="bg-title">
      <h2 id="bg-title" className="h-md">여행 배경 변경</h2>
      <p className="t-cap mt-8">‘새 여행 시작’ 카드의 배경이에요. 반려견 프로필 사진과는 따로 저장돼요.</p>
      {locked ? (
        <div className="hint mt-16">주행 중에는 배경을 바꿀 수 없어요. 정차 후 이용해 주세요.</div>
      ) : (
        <div className="bg-grid mt-16">
          {(Object.keys(SCENE_LABEL) as SceneId[]).map((id) => (
            <button key={id} className={`bg-opt ${bg.kind === 'preset' && bg.id === id ? 'on' : ''}`} onClick={() => pick(id)} aria-pressed={bg.kind === 'preset' && bg.id === id}>
              <span className="th"><TripScene id={id} thumb /></span>{SCENE_LABEL[id]}{id === 'sea' ? ' (기본)' : ''}
            </button>
          ))}
          <button className={`bg-opt ${bg.kind === 'upload' ? 'on' : ''}`} onClick={() => file.current?.click()} disabled={busy}>
            <span className="th">{bg.kind === 'upload' ? <img src={bg.src} alt="" /> : <ImagePlus size={28} />}</span>{busy ? '불러오는 중…' : '직접 사진 업로드'}
          </button>
        </div>
      )}
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} aria-label="배경 사진 선택" />
      <button className="btn ghost block mt-16" onClick={reset} disabled={locked || (bg.kind === 'preset' && bg.id === 'sea')}><RotateCcw size={16} />기본 배경으로 초기화</button>
      <p className="t-cap mt-12" style={{ textAlign: 'center' }}>
        {BG_SYNC === 'local' ? '저장 위치: 이 기기(브라우저)에만 저장 · 계정 동기화는 서버 연동 후 지원' : '계정에 동기화됨'}
      </p>
    </Sheet>
  );
}
