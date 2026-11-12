// 이 기기에 저장된 멍슐랭 후기(방문 장소 기록) 불러오기
import { useEffect, useState } from 'react';
import { repo } from '../data/db';
import type { VisitedPlace } from '../domain/models';

export function useMungReviews(deps: unknown[] = []): VisitedPlace[] {
  const [list, setList] = useState<VisitedPlace[]>([]);
  useEffect(() => {
    let alive = true;
    repo.allVisitedPlaces().then((all) => { if (alive) setList(all.filter((p) => !!p.review)); }).catch(() => {});
    return () => { alive = false; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}
