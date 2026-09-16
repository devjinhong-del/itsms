"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useEffect, useRef, useState } from "react";
import { logout } from "../login/actions";
import { LogoutIcon } from "@/components/icons";
import {
  lookupAsset,
  lookupUserOrgByName,
  submitAudit,
  listMyAudits,
  type AssetLookupResult,
  type MyAuditRow,
} from "./actions";

// 자산 태그에 흔히 쓰이는 1D 바코드 형식만 시도하게 좁히고(속도↑), TRY_HARDER로 인식률을 높인다.
const SCAN_HINTS = new Map();
SCAN_HINTS.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
]);
SCAN_HINTS.set(DecodeHintType.TRY_HARDER, true);

const FIELD_PLACEHOLDER = "바코드 스캔 후 정보를 불러옵니다.";

// KRS 자산 바코드는 "모델코드 자산번호"처럼 공백(그 외 쉼표/세미콜론/파이프)으로 묶여
// 하나의 바코드로 스캔되는 경우가 있다. 사내에서 쓰던 스캐너 페이지의 파싱 규칙을 그대로 따른다:
// - 구분자로 2개 이상 나뉘면 앞부분은 모델코드, 뒷부분은 자산번호.
// - 모델코드가 "1"로 시작하면 그 앞자리 "1"은 제거한다(자산번호는 그대로 둔다).
// - 구분자가 없으면 같은 값을 모델코드/자산번호 둘 다에 쓴다.
function parseBarcodeText(raw: string): { modelCode: string; assetNo: string } {
  const stripLeadingOne = (value: string) => (value.startsWith("1") ? value.slice(1) : value);
  const parts = raw.trim().split(/[\s,;|]+/);

  if (parts.length >= 2) {
    return {
      modelCode: stripLeadingOne(parts[0].toUpperCase()),
      assetNo: parts[1].toUpperCase(),
    };
  }

  const code = stripLeadingOne(raw.trim().toUpperCase());
  return { modelCode: code, assetNo: code };
}

type Status = "idle" | "scanning" | "camera-error" | "found" | "submitting" | "submitted" | "list";

export default function ScanClient() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const lookingUpRef = useRef(false); // 같은 바코드로 조회를 중복 호출하지 않기 위한 잠금

  const [status, setStatus] = useState<Status>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [frozen, setFrozen] = useState(false); // 바코드 인식 순간 화면을 사진처럼 멈춘 상태

  const [asset, setAsset] = useState<AssetLookupResult | null>(null);
  const [orgInput, setOrgInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [edited, setEdited] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const nameLookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [myAudits, setMyAudits] = useState<MyAuditRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // "바코드 읽는 중" 뒤에 점이 하나씩 늘었다 줄었다 하는 로딩 표시
  const [dots, setDots] = useState(".");
  useEffect(() => {
    if (asset) return;
    const id = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "." : prev + "."));
    }, 450);
    return () => clearInterval(id);
  }, [asset]);

  function freezeFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFrozen(true);
  }

  // @zxing/browser는 카메라에 조명(torch) 기능이 있으면, stop() 호출 시 내부적으로 조명을
  // 자동으로 꺼주는데(우리가 조명을 켠 적이 없어도 항상 실행됨), 이 정리 과정에서 안드로이드
  // 기기 카메라 드라이버가 UnknownError: setPhotoOptions failed로 실패하는 경우가 있다.
  // 타입 선언과 달리 stop()은 실제로 Promise를 반환하므로, 그 rejection을 잡아 처리한다.
  // (안 잡으면 unhandled rejection이 되어 Next.js 개발 모드 에러 화면이 뜬다 — 기능엔 영향 없음.)
  function stopScanner() {
    const result = controlsRef.current?.stop() as unknown;
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch(() => {});
    }
  }

  // 아이폰(사파리)은 권한을 한 번 거부하면 다음부터는 창을 띄우지 않고 바로 NotAllowedError를
  // 던진다. 안내 문구도 기기마다 다른 위치를 알려줘야 해서 iOS 여부를 따로 본다.
  function isIOS() {
    const ua = navigator.userAgent;
    // 아이패드(iPadOS 13+)는 UA를 Mac으로 보고하므로 터치 지원 여부로 함께 판별한다.
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  // 카메라 스트림은 버튼을 누른 그 순간(사용자 제스처) 안에서 직접 요청해야 한다.
  // zxing의 decodeFromConstraints에 맡기지 않고 여기서 getUserMedia를 먼저 호출하는 이유:
  //  - 요청한 해상도를 기기가 못 맞추면 낮은 조건으로 한 번 더 시도할 수 있고,
  //  - 실패 원인(권한 거부 / 해상도 / 사용 중)을 구분해 정확한 안내를 띄울 수 있다.
  async function requestStream() {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          // 해상도를 높게 요청할수록 바코드의 얇은 줄무늬가 더 선명하게 잡혀 인식률이 좋아진다.
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
    } catch (err) {
      const name = (err as Error).name;
      // 기기가 요청 해상도를 못 맞추는 경우엔 조건을 최소로 낮춰 한 번 더 시도한다.
      if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" || name === "NotFoundError") {
        return await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      }
      throw err;
    }
  }

  function openCamera() {
    lookingUpRef.current = false;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      // 이펙트 본문에서 setState를 동기 호출하지 않도록, 나머지 상태 갱신과 같이 마이크로태스크로 미룬다.
      Promise.resolve().then(() => {
        setStatus("camera-error");
        setCameraError("보안(HTTPS) 접속 환경이 아닙니다. 주소창이 https:// 로 시작하는지 확인해주세요.");
      });
      return;
    }

    const reader = new BrowserMultiFormatReader(SCAN_HINTS);

    requestStream()
      .then((stream) =>
        reader.decodeFromStream(stream, videoRef.current!, (result) => {
          if (!result || lookingUpRef.current) return;
          const text = result.getText();
          lookingUpRef.current = true;

          const { assetNo } = parseBarcodeText(text);

          lookupAsset(assetNo)
            .then((found) => {
              if (!found) {
                // DB에 없는 바코드면 계속 스캔한다(화면을 멈추지 않음).
                lookingUpRef.current = false;
                return;
              }
              freezeFrame();
              stopScanner();
              setAsset(found);
              setOrgInput(found.assetUserOrg ?? "");
              setNameInput(found.assetUserName ?? "");
              setStatus("found");
            })
            .catch(() => {
              lookingUpRef.current = false;
            });
        }),
      )
      .then((controls) => {
        controlsRef.current = controls;

        const stream = videoRef.current?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchSupported(Boolean(capabilities?.torch));
      })
      .catch((err: Error) => {
        setStatus("camera-error");
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError" || err.name === "SecurityError") {
          setCameraError(
            isIOS()
              ? "카메라 권한이 꺼져 있습니다. 주소창 왼쪽 버튼(aA 또는 ··· )을 눌러 [웹사이트 설정] → 카메라 → 허용으로 바꾸고 새로고침해주세요. 그래도 안 되면 아이폰 [설정] → Safari → 카메라 → 허용을 확인해주세요."
              : "카메라 접근 권한이 차단되어 있습니다. 브라우저 주소창의 자물쇠(또는 사이트 정보) 아이콘에서 카메라 권한을 허용으로 바꾼 뒤 새로고침해주세요.",
          );
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setCameraError("사용 가능한 카메라를 찾을 수 없습니다.");
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
          setCameraError("다른 앱이 카메라를 사용 중일 수 있습니다. 카메라를 쓰는 다른 앱(카메라·화상회의 등)을 종료한 뒤 새로고침해주세요.");
        } else {
          setCameraError(err.message || "카메라를 열 수 없습니다.");
        }
      });
  }

  // 삼성 인터넷 등 일부 모바일 브라우저는 사용자의 탭(제스처) 없이 자동으로 호출된
  // getUserMedia는 권한 창조차 띄우지 않고 조용히 막아버린다. 그래서 마운트 시 자동으로
  // 카메라를 열지 않고, 아래 "카메라 시작" 버튼을 탭했을 때만 openCamera()를 호출한다.
  useEffect(() => {
    return () => {
      stopScanner();
      if (nameLookupTimerRef.current) clearTimeout(nameLookupTimerRef.current);
    };
  }, []);

  function startScanning() {
    setStatus("scanning");
    setCameraError(null);
    setFrozen(false);
    setAsset(null);
    setOrgInput("");
    setNameInput("");
    setSubmitError(null);
    setEdited(false);
    if (nameLookupTimerRef.current) clearTimeout(nameLookupTimerRef.current);
    openCamera();
  }

  // 실사자가 사용자 이름을 고칠 때마다(타이핑을 멈추고 잠깐 뒤) m365_users를 다시 찾아 조직을
  // 갱신한다. 다른 곳을 눌러 포커스를 옮기지 않아도 반영되도록, 매 입력마다 디바운스로 예약한다.
  function scheduleNameLookup(name: string) {
    if (nameLookupTimerRef.current) clearTimeout(nameLookupTimerRef.current);
    nameLookupTimerRef.current = setTimeout(() => {
      lookupUserOrgByName(name).then((org) => {
        setOrgInput(org ?? "");
      });
    }, 400);
  }

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      // 일부 기기/브라우저는 조명 제어를 지원하지 않는다 — 조용히 무시한다.
    }
  }

  async function handleSubmit() {
    if (!asset) return;
    setStatus("submitting");
    setSubmitError(null);

    // 바코드 매칭 순간 얼려둔 캔버스 화면을 그대로 사진으로 같이 제출한다.
    const photoDataUrl = canvasRef.current?.toDataURL("image/jpeg", 0.8) ?? null;

    const result = await submitAudit({
      assetNo: asset.assetNo,
      assetUserOrg: orgInput,
      assetUserName: nameInput,
      isEdited: edited,
      photoDataUrl,
    });

    if (!result.ok) {
      setSubmitError(result.error);
      setStatus("found");
      return;
    }
    setStatus("submitted");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleConfirm() {
    setLoadingList(true);
    const rows = await listMyAudits();
    setMyAudits(rows);
    setLoadingList(false);
    setStatus("list");
  }

  // 이미 실사가 완료된 장비인데 사용자 이름도 안 고쳤다면, 굳이 다시 제출할 필요가 없으니 버튼을 막는다.
  const canSubmit = Boolean(asset) && status === "found" && !(asset?.alreadyInspected && !edited);

  // 점은 항상 3칸을 차지하게 하고 보이기만/안 보이기만 바꿔서,
  // 점 개수가 바뀌어도 앞의 글자 위치 자체는 움직이지 않게 한다.
  function withDots(label: string) {
    return (
      <span>
        {label}
        <span aria-hidden className="inline-block w-[1.5em] text-left">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= dots.length ? "opacity-100" : "opacity-0"}>
              .
            </span>
          ))}
        </span>
      </span>
    );
  }
  const infoPlaceholder = status === "camera-error" || status === "idle" ? "-" : withDots("바코드 읽는 중");

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-50">
      {/* 최상단 로고 — 고정 이미지, 고정 크기(width/height 태그값). 화면 크기가 바뀌어도 절대 바뀌지 않는다.
          ⚠️ 이 로고 블록은 사용자 요청으로 고정됨 — 앞으로 임의로 수정하지 말 것. */}
      <img src="/audit-oa-logo.png" alt="Jeisys" width={160} height={55} />

      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-2 py-4">
        <h1 className="text-center text-xl font-bold text-gray-900">OA 자산 현황 실사</h1>

        {status === "list" && (
          <div className="w-full space-y-3">
            <button
              type="button"
              onClick={startScanning}
              className="w-full rounded-xl bg-[#1d428a] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#173568]"
            >
              실사 계속하기
            </button>

            <hr className="border-t border-gray-200" />

            <h2 className="text-center text-sm font-semibold text-gray-900">내가 실사한 장비 리스트</h2>

            <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">자산번호</th>
                    <th className="px-3 py-2.5 font-medium">모델코드</th>
                    <th className="px-3 py-2.5 font-medium">제품카테고리</th>
                    <th className="px-3 py-2.5 font-medium">사용자조직</th>
                    <th className="px-3 py-2.5 font-medium">사용자이름</th>
                  </tr>
                </thead>
                <tbody>
                  {myAudits.map((row) => (
                    <tr key={row.assetNo} className="border-t border-gray-100 text-gray-800">
                      <td className="px-3 py-2.5">{row.assetNo}</td>
                      <td className="px-3 py-2.5">{row.modelCode ?? "-"}</td>
                      <td className="px-3 py-2.5">{row.productCategory ?? "-"}</td>
                      <td className="px-3 py-2.5">{row.assetUserOrg ?? "-"}</td>
                      <td className="px-3 py-2.5">{row.assetUserName ?? "-"}</td>
                    </tr>
                  ))}
                  {myAudits.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                        아직 실사한 장비가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {status === "submitted" && (
          <div className="w-full space-y-4 rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
            <p className="text-base font-medium text-green-600">제출 완료되었습니다.</p>
            <p className="text-sm text-gray-500">감사합니다.</p>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loadingList}
              className="w-full rounded-xl bg-[#1d428a] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#173568] disabled:opacity-50"
            >
              {loadingList ? "불러오는 중..." : "확인"}
            </button>
          </div>
        )}

        {/* 카메라/스캔/입력 화면 — list·submitted 화면일 때는 감춰두기만 하고(비디오 참조가 계속
            유효해야 하므로) DOM에서 완전히 떼어내지 않는다. 떼어냈다 다시 붙이면, "실사 계속하기"
            클릭 시 아직 마운트되지 않은 video 엘리먼트를 참조하게 되어 카메라 화면이 검게 나온다. */}
        <div className={`flex w-full flex-col gap-4 ${status === "list" || status === "submitted" ? "hidden" : ""}`}>
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                className={`h-full w-full object-cover ${frozen ? "hidden" : ""}`}
                muted
                playsInline
              />
              <canvas ref={canvasRef} className={`h-full w-full object-cover ${frozen ? "" : "hidden"}`} />

              {status === "scanning" && (
                <>
                  {/* 가로로 긴 바코드 정렬 가이드라인 + 스캔 중임을 보여주는 빨간 라인 */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="relative h-20 w-[90%] rounded-2xl border-2 border-white/80">
                      <div className="scan-line absolute left-1 right-1 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-red-500" />
                    </div>
                  </div>
                  <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-xs text-white/90">
                    바코드를 가이드라인에 맞추면 자동으로 인식됩니다
                  </p>

                  {/* 모바일 등 조명(플래시) 제어가 가능한 기기에서만 화면 상단 가운데에 노출 */}
                  {torchSupported && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      // 조명을 켠 상태면 "빛이 나오고 있는" 느낌을 주기 위해 배경을 노란색으로 바꾼다(투명도는 그대로 유지).
                      className={`absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium backdrop-blur-sm ${
                        torchOn ? "bg-yellow-400/40 text-black" : "bg-black/40 text-white"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M14.615 1.595a.75.75 0 01.359.852l-1.99 7.302h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z"
                        />
                      </svg>
                      {torchOn ? "조명 끄기" : "조명 켜기"}
                    </button>
                  )}
                </>
              )}

              {status === "camera-error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-white">
                  <p>{cameraError ?? "카메라를 사용할 수 없습니다. 카메라 권한을 확인해주세요."}</p>
                  <button
                    type="button"
                    onClick={startScanning}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900"
                  >
                    다시 시도
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-xl border border-white/40 px-4 py-2 text-sm font-semibold text-white"
                  >
                    새로고침
                  </button>
                </div>
              )}

              {status === "idle" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                  <button
                    type="button"
                    onClick={startScanning}
                    className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm"
                  >
                    📷 카메라 시작
                  </button>
                  <p className="text-xs text-white/90">
                    카메라 권한을 묻는 창이 뜨면 &ldquo;허용&rdquo;을 눌러주세요.
                  </p>
                </div>
              )}
            </div>

            {asset && status === "found" && (
              <button
                type="button"
                onClick={startScanning}
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-[#1d428a] transition hover:bg-gray-50"
              >
                다시 스캔
              </button>
            )}

            <div className="w-full space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">자산번호</dt>
                  <dd className={asset ? "font-medium text-gray-900" : "text-gray-400"}>
                    {asset?.assetNo ?? infoPlaceholder}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">모델코드</dt>
                  <dd className={asset ? "font-medium text-gray-900" : "text-gray-400"}>
                    {asset?.modelCode ?? infoPlaceholder}
                  </dd>
                </div>
              </dl>

              <div className="space-y-1">
                <label className="text-sm text-gray-700">사용자 조직</label>
                <input
                  value={orgInput}
                  readOnly
                  disabled
                  // 스캔 전에는 "바코드 스캔 후..." 안내를, 스캔 후(자산을 이미 한 번 불러온 뒤)에는
                  // 조직 값이 비어 있어도 다시 이 안내로 되돌아가지 않고 "조직 정보 없음."을 보여준다.
                  placeholder={asset ? "조직 정보 없음." : FIELD_PLACEHOLDER}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm text-gray-700">사용자 이름</label>
                <input
                  value={nameInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNameInput(value);
                    setEdited(true);
                    scheduleNameLookup(value);
                  }}
                  disabled={status !== "found"}
                  // 조직 칸과 동일한 이유: 스캔 후에는 이름이 비어 있어도 "바코드 스캔 후..."로
                  // 되돌아가지 않고 "사용자 이름 없음."을 보여준다.
                  placeholder={asset ? "사용자 이름 없음." : FIELD_PLACEHOLDER}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/5 disabled:bg-gray-50"
                />
                {/* 스캔되기 전에는 자리만 차지하고 안 보이게(invisible) 해서, "카메라를 시작해주세요"
                    버튼이 위로 붙지 않게 한다. 스캔에 성공(asset 있음)하면 그때 보이게 한다. */}
                <p className={`slow-blink text-center text-xs text-amber-600 ${asset ? "" : "invisible"}`}>
                  {asset?.alreadyInspected && !edited ? (
                    <>
                      실사가 완료된 장비입니다.
                      <br />
                      사용자 변경이 필요할 경우 반영 후 제출 버튼 눌러주세요.
                      <br />
                      다른 장비 실사를 하실 경우 위 [다시 스캔] 버튼을 눌러주세요.
                    </>
                  ) : (
                    <>
                      위 사용자 이름과 실제 사용자가 다를 시
                      <br />
                      이름을 눌러 수정해주세요.
                      <br />
                      입력된 정보가 맞을 시 제출 버튼을 눌러주세요.
                    </>
                  )}
                </p>
              </div>

              {submitError && <p className="text-sm text-red-600">{submitError}</p>}

              <hr className="border-t border-gray-200" />

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full rounded-xl bg-[#1d428a] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#173568] disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
              >
                {status === "idle"
                  ? "카메라를 시작해주세요"
                  : !asset
                    ? withDots("스캔중")
                    : status === "submitting"
                      ? "제출 중..."
                      : "제출"}
              </button>
            </div>
          </div>
        </div>

      {/* 모바일에서는 상단바(대시보드)로 갈 수 없으므로, 로그아웃은 이 화면 아래에 둔다 */}
      <div className="mx-auto w-full max-w-md px-2 pb-6">
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
          >
            <LogoutIcon />
            로그아웃
          </button>
        </form>
      </div>

      {/* 하단 회사 정보 — Jeisys.html의 output.css에 있는 .footer .info_list_area 규칙을 그대로 옮김
          (배경 #292929, 로고는 반투명 흰색 마스크, 폰트 크기·색상 전부 원본과 동일하게 맞춤).
          모바일(md 미만, 원본의 max-width:767px 규칙)에서는 로고·글자·여백을 원본처럼 한 단계 작게 줄인다. */}
      <footer className="mt-8 w-full bg-[#292929] px-4 py-9 md:py-8">
        <div className="info_list_area mx-auto max-w-md">
          <div
            aria-hidden
            className="aspect-[103/40] w-[130px] md:w-[206px]"
            style={{
              background: "rgba(255,255,255,0.2)",
              WebkitMask: "url(/jeisys-logo.svg) no-repeat 0 0 / contain",
              mask: "url(/jeisys-logo.svg) no-repeat 0 0 / contain",
            }}
          />
          <div className="company_name mb-3 mt-4 text-[13px] font-bold text-white md:mb-4 md:mt-8 md:text-base">
            제이시스메디칼 주식회사
          </div>
          <ul className="info_list flex flex-col gap-1 text-xs text-white/70 md:flex-row md:flex-wrap md:gap-x-8 md:gap-y-1 md:text-[15px]">
            <li>
              <span className="mr-2 font-semibold text-white/90">대표이사</span>이라미
            </li>
            <li>
              <span className="mr-2 font-semibold text-white/90">사업자등록번호</span>424-87-00852
            </li>
            <li>
              <span className="mr-2 font-semibold text-white/90">TEL</span>
              <a href="tel:0226036417" className="hover:underline">
                02-2603-6417
              </a>
            </li>
            <li className="w-full">
              <span className="mr-2 font-semibold text-white/90">주소</span>서울특별시 금천구 가산디지털단지1로 159, 2-5층 (가산동, 이랜드 가산동 사옥)
            </li>
          </ul>
          <small className="copy mt-3 block text-xs text-white/70 md:mt-4 md:text-[15px]">
            Copyright © 2025 Jeisys Medical Inc. All rights reserved.
          </small>
        </div>
      </footer>
    </div>
  );
}
