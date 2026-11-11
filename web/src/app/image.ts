/** 사진을 긴 변 maxSide 로 줄여 JPEG data URL 로 만듭니다(로컬 저장 용량 절약). */
export async function fileToDataUrl(file: File, maxSide = 1280, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 선택할 수 있어요.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('사진을 열 수 없어요.'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 파일 선택 창을 열고 선택 취소 시 null 을 돌려줍니다. */
export function pickImages(multiple = false): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    let done = false;
    input.onchange = () => {
      done = true;
      const files = input.files ? [...input.files] : [];
      resolve(files.length ? files : null);
    };
    input.addEventListener('cancel', () => {
      if (!done) resolve(null);
    });
    input.click();
  });
}
