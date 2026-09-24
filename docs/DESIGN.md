# CLOSET — 설계 문서

> 핵심 질문: **"내가 가진 옷으로 얼마나 많은 코디를 만들 수 있는가?"**
> 옷을 더 사게 만드는 앱이 아니라, 이미 가진 옷을 더 잘 입게 만드는 앱.

---

## STEP 1. 전체 서비스 구조

```
            ┌─────────── 사진 찍기 ───────────┐
            ▼                                 │
  [클라이언트 이미지 처리]  리사이즈·중앙정렬·4:5 카드·대표색 추출 (무료, 로컬)
            ▼
  [Claude 분석 1회]  /api/analyze → JSON 태그 (카테고리·색·핏·스타일·계절…)
            ▼
  [사용자 확인/수정]  AI 결과는 "초안" — 모든 필드 편집 가능
            ▼
  [DB 저장]  wardrobe_items  ──► 이후 검색·필터·조합은 전부 로컬 JS
            ▼
  ┌────────────┬──────────────┬──────────────┬───────────────┐
  │ WARDROBE   │ OUTFIT       │ MY OUTFITS   │ AI STYLIST    │
  │ 필터·상세  │ BUILDER      │ 저장 코디    │ (Phase 2)     │
  │            │ 좌우 스와이프│ 착용 기록    │ 옷장 JSON만   │
  │            │ 랜덤(규칙)   │              │ 넘겨 추천     │
  └────────────┴──────────────┴──────────────┴───────────────┘
```

**MANUAL ↕ AI ASSISTED 공존 원칙**
- AI 없이도 100% 동작한다. API 키가 없으면 분석 단계는 "대표색 자동 추출 + 원탭 칩 선택"으로 대체된다.
- AI는 고부가가치 지점에만: ① 옷 사진 분석(등록당 1회) ② 코디 추천 ③ 자연어 상담 ④ 트렌드 해석 ⑤ 옷장 분석.
- 랜덤 코디·오늘의 코디·필터·정렬은 규칙 기반 로컬 로직(`lib/styling.ts`).

**저장소 이중화 (Phase 1의 안정성 핵심)**
- `NEXT_PUBLIC_SUPABASE_URL` 이 없으면 → **LocalRepo** (IndexedDB). 설치 즉시 폰에서 사용 가능.
- 있으면 → **SupabaseRepo** (Postgres + Storage + 익명 로그인, RLS).
- 두 구현이 같은 `Repo` 인터페이스를 따르므로 화면 코드는 저장소를 모른다.

---

## STEP 2. 페이지 구조

| 경로 | 화면 | Phase |
|---|---|---|
| `/` | HOME — 인사, +옷 추가, 옷장 요약(카테고리 수), 오늘의 코디 + WEAR THIS, Discover(잠든 옷), 최근 추가 | 1 |
| `/add` | 옷 추가 — 촬영/업로드 → 처리 → 분석 → 확인 → 저장 (+ 연속 등록) | 1 |
| `/wardrobe` | 전체 옷장 — 카테고리 탭, 색상·계절·스타일·정렬 필터, 그리드 | 1 |
| `/wardrobe/[id]` | 옷 상세 — 이미지, 태그, 착용 통계, 편집/삭제, 이 옷으로 코디하기 | 1 |
| `/outfit` | OUTFIT BUILDER — 3D 아바타(회전·줌) + 카테고리별 옷 선택, 랜덤, 저장, AI TRY-ON (→ `docs/OUTFIT_3D.md`) | 1 |
| `/outfits` | MY OUTFITS — 상황별 필터, 불러오기/입기/삭제 | 1 |
| `/ai` | AI STYLIST — 조건 입력 → 3개 코디 + 이유 | 2 |
| `/profile` | 프로필/선호 — 성별, 체형(선택형), 선호 핏·스타일·색, 피할 색, 난이도 | 1 |

**네비게이션**: 모바일 하단 탭 `HOME · WARDROBE · OUTFIT · AI · PROFILE` / 데스크톱 좌측 사이드바.

---

## STEP 3. Database Schema (Supabase / PostgreSQL)

전체 SQL: `supabase/schema.sql`

```
auth.users (Supabase 관리)
  │
  ├── user_preferences   1:1  성별·키(선택)·체형·선호 핏/스타일/색·피할 색·브랜드·활동·난이도
  ├── wardrobe_items     1:N  옷 한 벌 = 한 행
  │     id, user_id, image_path, name, category, subcategory,
  │     color, secondary_color, pattern, material, fit,
  │     style text[], season text[], gender, brand, formality(1-5),
  │     notes, ai_raw jsonb, archived, created_at, updated_at,
  │     wear_count, last_worn_at      ← wear_log_items 트리거로 자동 갱신
  ├── outfits            1:N  name, occasion, style[], source('manual'|'random'|'ai'), note
  │     └── outfit_items N:M  outfit_id, wardrobe_item_id, slot(top/bottom/outer/shoes/acc), position
  ├── wear_logs          1:N  worn_at(date), outfit_id(nullable — 코디 없이 단품 착용도 기록)
  │     └── wear_log_items    wear_log_id, wardrobe_item_id
  └── ai_recommendations 1:N  request jsonb, response jsonb, model, tokens — 캐시·재사용·비용 추적
```

원안 대비 변경점
- `wear_logs` → `wear_logs + wear_log_items`: 저장 코디 없이 "오늘 이 3벌 입음"도 기록 가능, 아이템별 활용도 집계가 정확해짐.
- `wear_count / last_worn_at` 은 트리거로 파생 → 앱 코드가 값을 직접 쓰지 않아 불일치 없음.
- `ai_raw jsonb` 보존 → 사용자가 수정한 값과 AI 원본 비교, 추후 프롬프트 개선에 활용.
- `formality 1–5` 수치화 → 상황별 코디 규칙을 로컬 JS로 계산.
- 이미지: Storage 버킷 `wardrobe/{user_id}/{uuid}.webp`, 폴더 기반 RLS.

---

## STEP 4. 컴포넌트 구조

```
app/
  layout.tsx            AppShell (Sidebar | BottomNav) + RepoProvider
  page.tsx              Home
  add/page.tsx          AddFlow  (Capture → Review)
  wardrobe/page.tsx     WardrobeGrid + FilterBar
  wardrobe/[id]/page.tsx ItemDetail + ItemForm(edit)
  outfit/page.tsx       OutfitBuilder
  outfits/page.tsx      OutfitList
  ai/page.tsx           (Phase 2 자리)
  profile/page.tsx      PreferencesForm
  api/analyze/route.ts  Claude vision → 태그 JSON (서버, 키 보호)

components/
  AppShell, BottomNav, Sidebar
  ItemCard              4:5 카드 (사진 또는 GarmentGlyph)
  GarmentGlyph          사진 없는 아이템용 SVG 실루엣 (서브카테고리·색 반영)
  ItemForm              AI 결과 확인·수정 폼 (칩 기반, 타이핑 최소화)
  ChipGroup             단일/다중 선택 칩
  OutfitBoard           flat-lay 썸네일 (실제 옷 이미지, 마네킹 없음)
  SlotCarousel          < [카드] > 좌우 스와이프 선택
  SaveOutfitSheet       바텀시트 (이름·상황)
  Sheet, Empty, Toast

lib/
  types.ts              도메인 타입
  taxonomy.ts           카테고리·색상 팔레트·스타일·계절·상황 사전 (한/영 라벨)
  image.ts              리사이즈·캔버스 정규화·대표색 추출
  styling.ts            규칙 기반 조합 점수 (색 조화·계절·격식·활용도)
  repo/                 Repo 인터페이스 + local(IndexedDB) + supabase 구현
  sample.ts             샘플 옷장 (체험용)
```

---

## 규칙 기반 조합 점수 (`lib/styling.ts`) — Phase 1에서 AI 없이 동작

```
score = 색 조화      뉴트럴(블랙·화이트·그레이·네이비·베이지·데님) 비중↑, 유채색 2개 초과 시 감점
      + 계절 일치    오늘 월 → 계절, 아이템 season 교집합
      + 격식 일관성  선택 아이템 formality 표준편차가 작을수록 가점
      + 스타일 공유  style 태그 교집합 가점
      + 활용도 보너스 wear_count 낮고 last_worn_at 오래된 아이템 가점 (잠든 옷 깨우기)
      + 최근 착용 감점 3일 내 착용 아이템 감점
```
랜덤 코디 = 후보 조합 N개 샘플링 후 상위 점수에서 가중 랜덤 → "무작위지만 말이 되는" 조합.

---

## 비용 설계

| 동작 | AI 호출 |
|---|---|
| 옷 등록 | 1회 (Haiku 4.5, 이미지 768px 다운스케일 → 입력 토큰 최소화) |
| 필터·검색·빌더·랜덤·오늘의 코디 | 0회 |
| AI 코디 추천 (Phase 2) | 요청당 1회, 옷장은 이미지 없이 텍스트 JSON만 전달, 결과 캐시 |

---

## 이미지 처리 전략

Phase 1 (안정·무료): 브라우저 캔버스에서 EXIF 회전 반영 → 긴 변 1280px 리사이즈 → WebP 인코딩, 카드에서는 오프화이트 배경 위 `object-contain` + `mix-blend-multiply` 로 흰 배경 사진이 카드와 자연스럽게 섞이도록. 대표색은 중앙 영역 픽셀 샘플링으로 로컬 추출.

Phase 2 옵션: `@imgly/background-removal` (브라우저 WASM, 서버 비용 0) 을 "배경 지우기" 토글로 추가. 기본값 off → 저사양 폰에서 등록 흐름이 느려지지 않게.

---

## 로드맵

- **Phase 1 (이 저장소)**: 옷 추가·사진·AI 태깅·옷장·필터·상세·편집·Outfit Builder·코디 저장·프로필 + 최소 착용 기록(WEAR THIS)
- **Phase 2**: 착용 캘린더, 활용도 대시보드(이번 달 28/42), 잠든 옷 섹션 고도화, `/api/stylist` AI 추천 3안 + 이유
- **Phase 3**: 날씨 연동, 트렌드 해석(트렌드 ∩ 내 옷장), 자연어 스타일리스트, 개인화 가중치 학습

---

# v2 · Outfit Builder

> 2D 레이어드 마네킹(SVG + 옷 이미지 z-index)은 **폐기**되었다. 3D 빌더 + AI Try-On 구조는 `docs/OUTFIT_3D.md` 참고.
> `placement`/`anchor_*` 필드와 `render.tuck/openOuter` 는 기존 데이터 호환을 위해 남아 있지만 더 이상 렌더링에 쓰이지 않는다.

## 배경 제거 파이프라인 (`lib/cutout.ts`)
원본 → BackgroundRemover(api → local) → 알파 마스크 → bbox 트림 → WebP(알파) 저장
- local: 테두리 k-means 배경 모델(YCbCr, 그림자 관대) + 엣지 차단 region growing + 연결 성분 정리 + 페더링. 480px 마스크, 약 0.3초.
- 품질 게이트: 면적 1.2~93%, 테두리 점유 < 45%, bbox 채움률 ≥ 40% — 통과 못 하면 `failed` → 원본 사진 사용.
- api: `REMOVE_BG_API_KEY` 설정 시 `/api/cutout`(remove.bg, type=product) 우선.
- 기존 옷: 앱이 열려 있을 때 `useCutoutBackfill` 이 한 벌씩 자동 처리(세션당 1회 시도).

## DB 변경 (`supabase/migrations/002_mannequin.sql`, 추가만)
wardrobe_items: cutout_path, cutout_status, anchor_x, anchor_y, garment_scale, garment_rotation, layer_order
outfits: outfit_date, render(jsonb: tuck/openOuter/body)
마이그레이션 전 DB에서도 앱은 동작(자동 감지, 누끼·위치 저장만 비활성).

## 랜덤
- RANDOM(스마트): 색 조화·계절·격식·실루엣·스타일 점수 + 고정 슬롯 유지 + 현재/저장된 조합 제외
- PURE RANDOM: 고정 슬롯만 유지, 나머지 완전 무작위
- 조합 수: 상의×하의×신발×(아우터+없음) 전체 / 계절 공통·격식차≤2·포인트색≤2·패턴≤1 을 만족하는 '잘 어울리는 조합' (4만 초과 시 표본 추정)
