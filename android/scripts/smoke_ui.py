#!/usr/bin/env python3
"""에뮬레이터 UI 스모크 테스트: 데모 여행 전체 흐름(등록 → 3단계 준비 → 주행 → 차량 상태 안내 → 도착 → 돌아오는 길 → 여행 완료).
uiautomator 덤프에서 글자를 찾아 누르고, 단계마다 화면을 저장합니다. 앱이 죽으면(FATAL) 실패합니다."""
import re, subprocess, sys, time, os, xml.etree.ElementTree as ET

PKG = sys.argv[1] if len(sys.argv) > 1 else "com.mungroad"
OUT = "shots"; os.makedirs(OUT, exist_ok=True)
log = []

def sh(*a, check=False):
    r = subprocess.run(["adb", *a], capture_output=True, text=True)
    return r.stdout

def nodes():
    for _ in range(3):
        sh("shell", "uiautomator", "dump", "/sdcard/ui.xml")
        x = sh("shell", "cat", "/sdcard/ui.xml")
        if "<hierarchy" in x:
            try:
                return list(ET.fromstring(x[x.index("<hierarchy"):]).iter("node"))
            except ET.ParseError:
                pass
        time.sleep(1)
    return []

def find(text, exact=False):
    for n in nodes():
        t = (n.get("text") or "") + "|" + (n.get("content-desc") or "")
        if (exact and (n.get("text") == text)) or (not exact and text in t):
            b = re.findall(r"\d+", n.get("bounds"))
            x1, y1, x2, y2 = map(int, b)
            return ((x1 + x2) // 2, (y1 + y2) // 2)
    return None

def tap(text, wait=8, exact=False, optional=False):
    end = time.time() + wait
    while time.time() < end:
        p = find(text, exact)
        if p:
            sh("shell", "input", "tap", str(p[0]), str(p[1])); log.append(f"tap {text}"); time.sleep(1.2); return True
        time.sleep(1)
    log.append(f"NOT FOUND {text}")
    if not optional:
        shot("fail-" + re.sub(r"\W", "", text)[:12])
        dump_texts()
        raise SystemExit(f"찾지 못함: {text}")
    return False

def wait_for(text, wait=60):
    end = time.time() + wait
    while time.time() < end:
        if find(text): log.append(f"saw {text}"); return True
        time.sleep(2)
    log.append(f"TIMEOUT {text}"); return False

def dump_texts():
    print("화면 글자:", [n.get("text") for n in nodes() if n.get("text")][:60])

def shot(name):
    sh("shell", "screencap", "-p", f"/sdcard/{name}.png")
    subprocess.run(["adb", "pull", f"/sdcard/{name}.png", f"{OUT}/{name}.png"], capture_output=True)
    log.append(f"shot {name}")

def crashed():
    l = sh("logcat", "-d", "-b", "crash")
    return "FATAL EXCEPTION" in l and PKG in l, l

sh("shell", "am", "start", "-n", f"{PKG}/com.mungroad.ui.MainActivity"); time.sleep(5)
for t in ["While using the app", "Only this time", "Allow", "앱 사용 중에만 허용", "허용"]:
    tap(t, wait=3, optional=True)
shot("01-home")
tap("내 반려견", exact=True)
tap("반려견 추가")
p = find("이름")
sh("shell", "input", "tap", str(p[0]), str(p[1])); sh("shell", "input", "text", "Coco"); time.sleep(1)
p = find("나이(살)")
sh("shell", "input", "tap", str(p[0]), str(p[1])); sh("shell", "input", "text", "3"); time.sleep(1)
sh("shell", "input", "keyevent", "4"); time.sleep(1)  # 화면 키보드만 닫기
tap("노령견", exact=True)  # 기준표: 노령견 90분
shot("02-pet-edit")
tap("저장", exact=True)
shot("03-pets")
tap("여행", exact=True)
shot("04-setup-1")
tap("다음", exact=True)
tap("강릉", exact=True)
shot("05-setup-2")
tap("다음", exact=True)
tap("60배", exact=True, optional=True)
shot("06-setup-3")
tap("출발", exact=True)
time.sleep(4); shot("07-driving")
tap("뒷창 열기"); time.sleep(2); shot("08-window")
time.sleep(8)
tap("더운 날"); time.sleep(3); shot("09-heat")
tap("에어컨 켜기", wait=6)
wait_for("쉬어갈 시간이에요 (", 150); shot("10-rest-due")
tap("가까운 휴식 장소 찾기", exact=True, wait=4)
time.sleep(4); shot("11-suggest")
tap("괜찮아요", wait=4, optional=True)
tap("휴게소 정차"); time.sleep(5); shot("12-door-rest")
tap("휴식 시작", wait=6)
time.sleep(2); shot("13-pet-stay")
tap("차에 잠깐 둬요", wait=5); time.sleep(2); shot("14-petmode")
tap("확인", exact=True, wait=4)
tap("휴식 끝", wait=5)
tap("여행 정보 수정"); time.sleep(2); shot("15-edit")
tap("속초", exact=True, optional=True); tap("저장", exact=True, wait=4, optional=True); time.sleep(2); shot("15b-edited")
tap("확인", exact=True, wait=4, optional=True)
if not wait_for("집으로 출발", 240):
    tap("도착했어요", exact=True); tap("도착", exact=True)
time.sleep(3); shot("16-arrived")
tap("해변 산책", optional=True); time.sleep(2); tap("확인", exact=True, wait=4, optional=True)
sh("shell","input","swipe","500","900","500","250","300"); time.sleep(1)
tap("시동 끄기"); time.sleep(5); sh("shell","input","swipe","500","300","500","900","300"); time.sleep(1); shot("17-leave-check")
tap("잠깐 두고 내려요", wait=5, optional=True); time.sleep(2); shot("17b-petmode"); tap("확인", exact=True, wait=4, optional=True)
time.sleep(5)
tap("집으로 출발")
time.sleep(5); shot("18-return")
tap("도착했어요", exact=True); tap("도착", exact=True)
time.sleep(3); shot("19-home-arrived")
tap("여행 완료 · 기록 저장"); tap("여행 완료", exact=True)
time.sleep(3); shot("20-records")
tap("홈", exact=True); time.sleep(2); shot("21-home-after")
c, l = crashed()
print("\n".join(log))
if c:
    print(l[-6000:]); raise SystemExit("앱 비정상 종료")
print("SMOKE OK")
