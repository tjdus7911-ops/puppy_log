const pad = (n: number) => String(n).padStart(2, '0');

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export function formatDuration(sec: number): string {
  const totalMin = Math.round(Math.max(0, sec) / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 100) return `${km.toFixed(1)}km`;
  return `${Math.round(km).toLocaleString('ko-KR')}km`;
}

export function formatKoreanDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function formatShortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ageFrom(birthDate: string | null, ageYears: number | null, now = Date.now()): string | null {
  if (birthDate) {
    const b = new Date(birthDate);
    if (!Number.isNaN(b.getTime())) {
      const n = new Date(now);
      let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
      if (n.getDate() < b.getDate()) months -= 1;
      if (months < 0) return null;
      return months < 12 ? `${months}개월` : `${Math.floor(months / 12)}살`;
    }
  }
  return ageYears != null ? `${ageYears}살` : null;
}
