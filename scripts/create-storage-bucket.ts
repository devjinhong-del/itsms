// 실사 사진을 저장할 Supabase Storage 버킷을 만드는 스크립트(이미 있으면 그냥 넘어간다).
// 실행: npx tsx scripts/create-storage-bucket.ts
import "dotenv/config";
import { getSupabaseAdmin } from "../src/lib/db/supabaseAdmin";

const BUCKET = "audit-photos";

async function main() {
  const supabase = getSupabaseAdmin();

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`버킷 목록 조회 실패: ${listError.message}`);
  }

  if (buckets.some((b) => b.name === BUCKET)) {
    console.log(`버킷 "${BUCKET}"이 이미 존재합니다.`);
    return;
  }

  // private로 생성: 실사 사진은 사내 인력/자산 정보라 공개 URL로 노출하지 않고,
  // 관리자 페이지에서 service_role로 signed URL을 그때그때 발급해서 보여준다.
  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: "5MB",
  });

  if (createError) {
    throw new Error(`버킷 생성 실패: ${createError.message}`);
  }

  console.log(`버킷 "${BUCKET}" 생성 완료 (private).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
