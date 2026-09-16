const PAGE_SIZE = 1000; // PostgREST 기본 최대 반환 행 수

// range()로 페이지를 끊어 읽을 수 있는 최소 형태만 요구한다(Supabase 쿼리 빌더의 복잡한 제네릭에 묶이지 않도록).
interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

// Supabase(PostgREST)는 한 번에 최대 1000행만 돌려주므로, 전부 필요할 때는 range로 끊어서 모두 가져온다.
// 집계 화면들이 1000행 제한에 걸려 잘못된 합계를 보여주는 걸 막기 위한 공용 헬퍼.
export async function fetchAllRows<T>(build: () => RangeQuery<T>): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}
