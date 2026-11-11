// 커뮤니티 공통 조각: 미디어(필터·텍스트·동영상), 작성자 아바타, 주행 중 잠금 화면
import { FILTER_CSS, type PostMedia } from '../../domain/community';
import { formatDurationShort, useBlobUrl } from '../../app/media';
import { EmptyState, TopBar } from '../../ui/components';

export function MediaView({ m, contain = false, controls = false, showDuration = false }: { m: PostMedia; contain?: boolean; controls?: boolean; showDuration?: boolean }) {
  const videoUrl = useBlobUrl(m.kind === 'video' ? m.blob : undefined);
  const style = { filter: FILTER_CSS[m.filter] };
  return (
    <div className={`media ${contain ? 'contain' : ''}`}>
      {m.kind === 'video' ? (
        videoUrl ? <video src={videoUrl} style={style} controls={controls} muted={!controls} playsInline preload="metadata" /> : null
      ) : (
        <img src={m.src} alt={m.memo || m.text || '게시물 사진'} style={style} draggable={false} />
      )}
      {m.text && <span className={`txt ${m.textPos}`}>{m.text}</span>}
      {showDuration && m.kind === 'video' && <span className="dur">{formatDurationShort(m.durationSec) || '동영상'}</span>}
    </div>
  );
}

export function Author({ name, photo, size = 'sm' }: { name: string; photo: string | null; size?: 'sm' | 'lg' }) {
  return <span className={`au ${size === 'lg' ? 'lg' : ''}`}>{photo ? <img src={photo} alt="" /> : name.replace(/^예시·/, '').slice(0, 1)}</span>;
}

export function DriveLock({ title = '멍친구 커뮤니티' }: { title?: string }) {
  return (
    <div className="screen">
      <TopBar title={title} showBack={false} />
      <EmptyState kind="empty-place" title="주행 중에는 커뮤니티를 쓸 수 없어요" desc="안전을 위해 정차하거나 휴식 중일 때 이용해 주세요. 작성 중인 내용은 그대로 남아 있어요." />
    </div>
  );
}
