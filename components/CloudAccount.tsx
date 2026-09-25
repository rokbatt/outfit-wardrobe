"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Sheet } from "./ui";

/** Banner: the wardrobe saved on this device (IndexedDB) can be copied into the Supabase account. */
export function LocalImportBanner() {
  const { backend, localPending, importLocal, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<[number, number] | null>(null);
  if (backend !== "supabase" || localPending === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-line bg-card px-4 py-3 text-[13px]">
      <p className="min-w-0 flex-1 leading-relaxed">
        <b>이 기기에 저장된 옷 {localPending}벌</b>이 있어요. 클라우드로 옮기면 브라우저 데이터를 지워도 남아요.
        <span className="text-mute"> (기기에 있는 원본은 지우지 않아요)</span>
      </p>
      <button
        className="btn btn-dark btn-sm shrink-0"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await importLocal((d, t) => setProg([d, t]));
            toast("클라우드로 옮겼어요");
          } catch (e) {
            toast(`옮기다 멈췄어요 · 다시 누르면 이어서 해요 (${e instanceof Error ? e.message : e})`);
          } finally {
            setBusy(false);
            setProg(null);
          }
        }}
      >
        {busy ? (prog ? `옮기는 중 ${prog[0]}/${prog[1]}` : "준비 중…") : "클라우드로 옮기기"}
      </button>
    </div>
  );
}

/** Profile → account: anonymous until an email is linked; sign in on another browser with the same email. */
export function AccountSection() {
  const { backend, account, linkEmail, signIn, signOut, toast, items } = useStore();
  const [mode, setMode] = useState<"link" | "signin" | "signout" | null>(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  if (backend !== "supabase" || !account) return null;

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "link") {
        const r = await linkEmail(email.trim(), pw);
        toast(r === "linked" ? "이메일 계정으로 저장했어요" : "확인 메일을 보냈어요 · 링크를 누른 뒤 다시 한 번 연결해 주세요");
      } else if (mode === "signin") {
        await signIn(email.trim(), pw);
      }
      setMode(null);
      setPw("");
    } catch (e) {
      toast(`실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-14">
      <p className="eyebrow mb-3">Account</p>
      <div className="divide-y divide-line border-y border-line text-[14px]">
        <div className="flex justify-between gap-4 py-3">
          <span className="text-mute">계정</span>
          <span className="truncate">{account.anonymous ? "익명 (이 브라우저에만 연결)" : account.email}</span>
        </div>
        {account.anonymous ? (
          <>
            <button className="flex w-full justify-between py-3 text-left" onClick={() => setMode("link")}>
              <span className="font-semibold">이메일로 계정 저장하기</span>
              <span className="text-mute">→</span>
            </button>
            <button className="flex w-full justify-between py-3 text-left" onClick={() => setMode("signin")}>
              <span>이미 만든 계정으로 로그인</span>
              <span className="text-mute">→</span>
            </button>
          </>
        ) : (
          <button className="flex w-full justify-between py-3 text-left" onClick={() => setMode("signout")}>
            <span>로그아웃</span>
            <span className="text-mute">→</span>
          </button>
        )}
      </div>
      {account.anonymous && (
        <p className="mt-3 text-[12px] leading-relaxed text-mute">
          지금은 익명 계정이라 브라우저 데이터를 지우면 이 옷장에 다시 들어올 수 없어요. 이메일을 연결하면 어느 브라우저·기기에서든 로그인해서 그대로 볼 수 있어요.
        </p>
      )}

      <Sheet
        open={mode === "link" || mode === "signin"}
        onClose={() => !busy && setMode(null)}
        title={mode === "link" ? "이메일로 계정 저장" : "로그인"}
      >
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          {mode === "link"
            ? "지금 옷장이 이 이메일 계정에 그대로 이어져요."
            : items.length > 0
              ? `로그인하면 그 계정의 옷장으로 바뀌어요. 지금 익명 계정의 옷 ${items.length}벌은 이 계정에 합쳐지지 않아요.`
              : "로그인하면 그 계정의 옷장을 불러와요."}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <input className="field" type="email" autoComplete="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className="field"
            type="password"
            autoComplete={mode === "link" ? "new-password" : "current-password"}
            placeholder={mode === "link" ? "비밀번호 (6자 이상)" : "비밀번호"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <button className="btn btn-dark mt-5 w-full" disabled={busy || !email.includes("@") || pw.length < 6} onClick={submit}>
          {busy ? "처리 중…" : mode === "link" ? "저장" : "로그인"}
        </button>
      </Sheet>

      <Sheet open={mode === "signout"} onClose={() => setMode(null)} title="로그아웃할까요?">
        <p className="text-[14px] leading-relaxed text-ink-2">옷장은 계정에 그대로 남아 있고, 같은 이메일로 다시 로그인하면 돌아와요.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="btn btn-line" onClick={() => setMode(null)}>
            취소
          </button>
          <button className="btn btn-dark" onClick={() => signOut()}>
            로그아웃
          </button>
        </div>
      </Sheet>
    </section>
  );
}
