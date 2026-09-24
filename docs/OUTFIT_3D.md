# OUTFIT BUILDER — 3D Builder + AI Try-On

| | 3D BUILDER (Mode A) | AI TRY-ON (Mode B) |
|---|---|---|
| 목적 | 빠른 조합·탐색 | 실제 착용 모습 확인 |
| 렌더링 | Three.js / React Three Fiber, 실시간 | VTON 모델이 생성한 이미지 |
| 옷 표현 | 3D garment template + 옷의 메타데이터(색·소재·핏·패턴) — 근사 허용 | 실제 옷 사진 — 형태·디테일 보존 우선 |
| 호출 비용 | 0 (로컬) | 조합당 1회, 결과 캐시 |

Claude는 분석·추천(`/api/analyze`, AI Stylist)만 담당하고, 착용 이미지는 별도 `VirtualTryOnService` 가 만든다. 둘을 하나의 AI로 취급하지 않는다.

## 코드 구조

```
lib/avatar/            순수 로직 (React·WebGL 무관, 테스트 가능)
  body.ts              BodyParams (height, shoulder, chest, waist, hip, legRatio) + 프리셋
  rig.ts               BodyParams → 본 트리(Mixamo 이름) + 부위별 단면 + landmarks
  loft.ts              단면(super-ellipse) → BufferGeometry (UV 포함)
components/three/
  Mannequin3D.tsx      본 트리를 group 계층으로 렌더, 본마다 attachments 슬롯
  AvatarViewer.tsx     Canvas · 조명 · 그림자 · CameraControls · FRONT/SIDE/BACK/360
```

### 아바타
- 절차적(parametric) 마네킹. 몸은 `loft.ts` 로 단면을 이어 만든 실제 mesh, 본마다 강체 부위 1개.
- 본 이름은 Mixamo 규약(Hips, Spine, Chest, Neck, Head, LeftArm, LeftHand, LeftUpLeg, LeftFoot …).
  나중에 스킨드 GLB 아바타로 교체해도 같은 본 이름에 옷이 붙는다 → 스켈레탈 애니메이션 확장 경로.
- 키는 프로필 `height_cm`, 체형 프리셋은 `render.body`(SLIM/STANDARD/RELAXED, 코디와 함께 저장).

### 옷
- `lib/garments/templates.ts` — 템플릿 스펙(ease·drape·기장·소매·칼라…) + `templateFor(item)` 자동 선택
- `lib/garments/build.ts` — 스펙 → 몸 단면을 부풀린 loft 조각들 (본별)
- `components/three/garments.tsx` — 색·패턴(스트라이프/체크/도트/카모, 미터 단위 UV)·소재 → 머티리얼, 본 attachments
- 레이어 규칙: 각 레이어는 `Under`(아래 옷의 ease·최소 윤곽)를 받아 그보다 항상 바깥에 생성 → 관통 없음 (상의×아우터×핏 252 조합 레이캐스트로 검증)

- garment template = **몸 단면을 여유분(ease)+두께만큼 부풀린 단면** → `loftGeometry`.
  그래서 어떤 체형에서도 몸을 따라가고, 소매는 `LeftArm` 본에, 바지는 `LeftUpLeg` 본에 붙는다.
- 레이어는 z-index가 아니라 3D 공간의 오프셋: BODY < BOTTOM < TOP < OUTER < ACC 순으로 ease 가 커진다.
- `rig.landmarks`(waist, hip, crotch, knee, ankle, armLength …)로 기장·소매 길이를 정한다.

## 단계

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 2D 마네킹 제거, R3F 3D 아바타 뷰어 (회전·줌·조명·그림자·반응형) | ✅ |
| 2 | garment template (상의 9 · 아우터 7 · 하의 9 · 신발 4 · 모자 2) → 아바타에 착용, 3D 레이어링 | ✅ |
| 3 | wardrobe_items 연결: subcategory+fit → template 자동 선택, 색·패턴·소재 적용 (`garment_template` 컬럼 저장은 남음) | 🔶 |
| 4 | 카테고리별 선택 UI ↔ 3D 착용 | ✅ |
| 5 | Random / Lock / Save 를 3D 상태와 연결 | |
| 6 | `VirtualTryOnService` 인터페이스 + mock, 결과 캐시 | |
| 7 | 실제 VTON provider 연결 준비 | |

## 유지 / 폐기

- **폐기**: `components/outfit/{Mannequin,OutfitRenderer}.tsx`, `lib/mannequin.ts`, 옷 위치 수동 조정 UI,
  넣어 입기/열어 입기 레이어 트릭, 스테이지 스와이프로 옷 넘기기(→ 스와이프는 회전).
- **유지**: `wardrobe_items` 스키마·Repo(Local/Supabase)·Storage 경로, 누끼 파이프라인(`lib/cutout.ts` — Try-On 입력/텍스처 참조로 재사용),
  랜덤 로직(`lib/styling.ts`), 저장·착용 기록, `outfits.render` jsonb.
- **호환용으로만 남김**: `placement` / `anchor_x…layer_order` 컬럼, `render.tuck/openOuter` — 읽고 보존하지만 렌더링엔 쓰지 않음.
