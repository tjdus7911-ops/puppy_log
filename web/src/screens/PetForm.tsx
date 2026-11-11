import { useState } from 'react';
import { Camera, Minus, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../app/store';
import { navigate, queryParam } from '../app/router';
import { fileToDataUrl, pickImages } from '../app/image';
import { newId, PET_SIZE_LABEL, type Pet, type PetSize } from '../domain/models';
import { Field, Hint, Segmented, Sheet, TopBar } from '../ui/components';
import { PetAvatar } from '../ui/Art';

export const REST_PRESETS = [60, 90, 120];

export function RestIntervalPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(15, Math.min(240, v));
  return (
    <div>
      <div className="row" style={{ gap: 8 }}>
        {REST_PRESETS.map((m) => (
          <button key={m} type="button" className={`chip ${value === m ? 'on' : ''}`} onClick={() => onChange(m)}>
            {m}분
          </button>
        ))}
        <div className="row grow" style={{ justifyContent: 'flex-end', gap: 4 }}>
          <button type="button" className="icon-btn" aria-label="5분 줄이기" onClick={() => onChange(clamp(value - 5))}><Minus size={18} /></button>
          <span className="num" style={{ fontWeight: 700, minWidth: 48, textAlign: 'center' }}>{value}분</span>
          <button type="button" className="icon-btn" aria-label="5분 늘리기" onClick={() => onChange(clamp(value + 5))}><Plus size={18} /></button>
        </div>
      </div>
    </div>
  );
}

export default function PetForm({ id, route }: { id: string; route: string }) {
  const { pets, savePet, deletePet, toast, settings } = useStore();
  const existing = pets.find((p) => p.id === id);
  const isFirst = queryParam(route, 'first') === '1';
  const [form, setForm] = useState<Pet>(
    existing ?? {
      id: newId(), name: '', photoUri: null, birthDate: null, ageYears: null, weight: null, size: 'small',
      notes: '', restIntervalMinutes: settings.defaultRestIntervalMinutes || 90, createdAt: Date.now(),
    },
  );
  const [ageMode, setAgeMode] = useState<'birth' | 'age'>(existing?.ageYears != null && !existing.birthDate ? 'age' : 'birth');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const set = <K extends keyof Pet>(k: K, v: Pet[K]) => setForm((f) => ({ ...f, [k]: v }));
  const nameError = touched && !form.name.trim() ? '이름을 입력해 주세요.' : null;
  const weightError = form.weight != null && (form.weight <= 0 || form.weight > 120) ? '몸무게를 확인해 주세요.' : null;
  const today = new Date().toISOString().slice(0, 10);
  const birthError = form.birthDate && form.birthDate > today ? '미래 날짜는 입력할 수 없어요.' : null;

  const pickPhoto = async () => {
    const files = await pickImages(false);
    if (!files) return; // 사진 선택 취소: 아무것도 바꾸지 않음
    try {
      set('photoUri', await fileToDataUrl(files[0], 720));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const submit = async () => {
    setTouched(true);
    if (!form.name.trim() || weightError || birthError) return;
    setBusy(true);
    const ok = await savePet({
      ...form,
      name: form.name.trim(),
      birthDate: ageMode === 'birth' ? form.birthDate : null,
      ageYears: ageMode === 'age' ? form.ageYears : null,
    });
    setBusy(false);
    if (!ok) return;
    toast(existing ? '프로필을 수정했어요.' : `${form.name.trim()} 프로필을 등록했어요.`);
    navigate(isFirst ? '/home' : existing ? '/my' : '/my', { replace: true });
  };

  return (
    <div className="screen no-nav">
      <TopBar title={existing ? '반려견 프로필 수정' : '반려견 등록'} showBack={!isFirst} />
      {isFirst && (
        <div className="mt-8" style={{ marginBottom: 6 }}>
          <h1 className="h-lg">함께 달릴 친구를 소개해 주세요</h1>
          <p className="t-sub mt-8">여러 마리도 나중에 마이페이지에서 추가할 수 있어요.</p>
        </div>
      )}
      <div style={{ display: 'grid', placeItems: 'center', margin: '20px 0 6px' }}>
        <button type="button" onClick={pickPhoto} style={{ border: 0, background: 'none', position: 'relative', padding: 0 }} aria-label="반려견 사진 선택">
          <PetAvatar uri={form.photoUri} size={108} ring />
          <span style={{ position: 'absolute', right: 0, bottom: 2, width: 34, height: 34, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 3px #fff' }}>
            <Camera size={17} />
          </span>
        </button>
        {form.photoUri && <button className="link" onClick={() => set('photoUri', null)}>사진 지우기</button>}
      </div>

      <Field label="이름" error={nameError}>
        <input className={`input ${nameError ? 'invalid' : ''}`} value={form.name} maxLength={20} placeholder="예: 사슴" onChange={(e) => set('name', e.target.value)} onBlur={() => setTouched(true)} />
      </Field>

      <div className="field">
        <span className="label" style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>생년월일 또는 나이 <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>(선택)</span></span>
        <Segmented ariaLabel="나이 입력 방식" value={ageMode} onChange={setAgeMode} options={[{ value: 'birth', label: '생년월일' }, { value: 'age', label: '나이' }]} />
        <div className="mt-8">
          {ageMode === 'birth' ? (
            <input type="date" className={`input ${birthError ? 'invalid' : ''}`} max={today} value={form.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value || null)} aria-label="생년월일" />
          ) : (
            <input type="number" inputMode="numeric" className="input" min={0} max={30} placeholder="나이(살)" value={form.ageYears ?? ''} onChange={(e) => set('ageYears', e.target.value === '' ? null : Number(e.target.value))} aria-label="나이" />
          )}
          {birthError && <p className="field-error">{birthError}</p>}
        </div>
      </div>

      <Field label="몸무게 (kg)" optional error={weightError}>
        <input type="number" inputMode="decimal" step="0.1" className={`input ${weightError ? 'invalid' : ''}`} placeholder="예: 6.5" value={form.weight ?? ''} onChange={(e) => set('weight', e.target.value === '' ? null : Number(e.target.value))} />
      </Field>

      <div className="field">
        <span className="label" style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>크기</span>
        <Segmented ariaLabel="크기" value={form.size} onChange={(v: PetSize) => set('size', v)} options={(Object.keys(PET_SIZE_LABEL) as PetSize[]).map((k) => ({ value: k, label: PET_SIZE_LABEL[k] }))} />
      </div>

      <Field label="이동 시 특이사항" optional>
        <textarea className="input" maxLength={300} placeholder="예: 차멀미가 있어요, 창밖 보는 걸 좋아해요" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>

      <div className="field">
        <span className="label" style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>기본 휴식 알림 간격</span>
        <RestIntervalPicker value={form.restIntervalMinutes} onChange={(v) => set('restIntervalMinutes', v)} />
        <div className="mt-12">
          <Hint>휴식 간격은 의학적 기준이 아닌 예시 값이에요. 반려견의 나이·건강·컨디션에 맞게 보호자가 판단해 조정해 주세요.</Hint>
        </div>
      </div>

      {isFirst && (
        <button className="btn secondary block mt-24" disabled={busy} onClick={async () => {
          setBusy(true);
          const ok = await savePet({ ...form, name: '사슴', size: 'medium', weight: 7.2, notes: '샘플 프로필(체험용)', restIntervalMinutes: 90 });
          setBusy(false);
          if (ok) { toast('샘플 반려견 ‘사슴’으로 시작해요. 마이페이지에서 언제든 수정할 수 있어요.'); navigate('/home', { replace: true }); }
        }}>샘플 반려견 ‘사슴’으로 바로 체험하기</button>
      )}
      <button className={`btn primary block ${isFirst ? 'mt-12' : 'mt-24'}`} disabled={busy} onClick={submit}>
        {busy ? '저장 중…' : existing ? '저장하기' : '등록하기'}
      </button>
      {existing && (
        <button className="btn danger block mt-12" onClick={() => setConfirmDel(true)}>
          <Trash2 size={18} /> 프로필 삭제
        </button>
      )}

      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)} center labelledBy="del-title">
        <h2 id="del-title" className="h-md">{existing?.name} 프로필을 삭제할까요?</h2>
        <p className="t-sub mt-8">여행 기록은 남지만, 기록에서 이 반려견 연결은 사라져요.</p>
        <div className="btn-row mt-24">
          <button className="btn ghost" onClick={() => setConfirmDel(false)}>취소</button>
          <button className="btn danger" onClick={async () => { await deletePet(form.id); toast('프로필을 삭제했어요.'); navigate('/my', { replace: true }); }}>삭제</button>
        </div>
      </Sheet>
    </div>
  );
}
