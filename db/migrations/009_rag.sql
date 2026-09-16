-- RAG 챗봇용 표.
-- 업로드한 문서(PDF 등)와 사내 DB 내용을 잘게 쪼개(chunk) 임베딩 벡터로 저장하고,
-- 질문이 들어오면 의미가 가까운 조각을 찾아 그 내용만 근거로 답하게 한다.
--
-- 임베딩 모델: OpenAI text-embedding-3-small (1536차원)

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 원본 문서 한 건(업로드 파일 1개 또는 DB 표 1개)
CREATE TABLE IF NOT EXISTS rag_documents (
    id            BIGSERIAL PRIMARY KEY,
    title         TEXT NOT NULL,              -- 파일명 또는 표 이름
    source_type   TEXT NOT NULL,              -- 'file' | 'database'
    source_key    TEXT,                       -- DB 출처면 표 이름(중복 적재 방지용 키)
    file_size     INTEGER,                    -- 업로드 파일 크기(byte)
    chunk_count   INTEGER NOT NULL DEFAULT 0,
    uploaded_by   TEXT,                       -- 올린 사람 계정
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rag_documents_source_key
    ON rag_documents (source_key)
    WHERE source_key IS NOT NULL;

-- 문서를 쪼갠 조각 + 임베딩 벡터
CREATE TABLE IF NOT EXISTS rag_chunks (
    id            BIGSERIAL PRIMARY KEY,
    document_id   BIGINT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
    chunk_index   INTEGER NOT NULL,
    content       TEXT NOT NULL,
    embedding     extensions.vector(1536),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_rag_chunks_document ON rag_chunks (document_id);

-- 코사인 거리 기준 근사 최근접 검색 인덱스
CREATE INDEX IF NOT EXISTS ix_rag_chunks_embedding
    ON rag_chunks USING hnsw (embedding extensions.vector_cosine_ops);

-- 질문 벡터와 가까운 조각을 찾아 돌려준다(유사도 = 1 - 코사인거리).
CREATE OR REPLACE FUNCTION match_rag_chunks(
    query_embedding extensions.vector(1536),
    match_count     INTEGER DEFAULT 8,
    min_similarity  DOUBLE PRECISION DEFAULT 0.2
)
RETURNS TABLE (
    id          BIGINT,
    document_id BIGINT,
    title       TEXT,
    content     TEXT,
    similarity  DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
    SELECT
        c.id,
        c.document_id,
        d.title,
        c.content,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM rag_chunks c
    JOIN rag_documents d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> query_embedding) >= min_similarity
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- 다른 표와 동일: RLS를 켜고 일반 사용자용 정책은 만들지 않는다(서버 코드에서만 접근).
ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;
