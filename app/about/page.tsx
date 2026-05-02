import type { Metadata } from 'next'
import Link from 'next/link'

const SITE_URL = 'https://aib.vote'

export const metadata: Metadata = {
  title: 'MindBusiness 소개 — 노트에 쓰듯 만드는 AI 마인드맵',
  description:
    'MindBusiness는 노트에 쓰듯 자유롭게 마인드맵을 만들고, 막힐 땐 AI가 새로운 방향을 제안하며, 완성된 아이디어는 보고서로 정리해 주는 도구입니다. 무료로 시작할 수 있고 본인의 API 키를 사용합니다.',
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: 'MindBusiness 소개',
    description:
      '노트에 쓰듯 자유롭게 마인드맵을 만들고, 막힐 땐 AI가 새로운 방향을 제안해 드립니다.',
    url: `${SITE_URL}/about`,
    type: 'article',
  },
}

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 md:py-24">
      {/* 상단 네비 */}
      <nav className="mb-12 text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-800 transition-colors">
          ← 홈으로
        </Link>
      </nav>

      <article className="prose prose-slate max-w-none">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
          MindBusiness
        </h1>
        <p className="text-lg text-slate-600 leading-relaxed mb-4 italic">
          노트를 꺼내 손으로 쓰는 것과 같은 감각 그대로.
        </p>
        <p className="text-lg text-slate-600 leading-relaxed mb-12">
          아이디어가 떠오르면 마음 가는 대로 나만의 마인드맵을 만들어도 좋고,
          생각이 잘 정리되지 않아 막막할 땐 AI의 도움을 받으며 아이디어를
          확장하고 정리해 보세요.
        </p>

        {/* MindBusiness 로 할 수 있는 것 */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">
            MindBusiness로 할 수 있는 것
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-slate-700 leading-relaxed">
            <li>AI와 대화를 통해 첫 아이디어를 구체화합니다</li>
            <li>아이디어를 추가하다 막히면, AI가 분석해서 새로운 방향을 제안합니다</li>
            <li>마인드맵이 완성되면, AI가 조사와 분석을 더해 보고서로 정리해 드립니다</li>
            <li>다른 마인드맵 서비스에서 작성한 파일을 불러오거나, 완성된 아이디어를 PDF로 저장할 수 있습니다</li>
          </ul>
        </section>

        {/* 어떤 프레임워크 */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">
            지원하는 프레임워크
          </h2>
          <p className="text-slate-700 leading-relaxed mb-4">
            MindBusiness의 AI는 막연한 아이디어를 구체적인 계획으로 만들어 주는
            9가지 프레임워크를 이해하고 있습니다. 마치 옆에 전문 컨설턴트가
            있는 것처럼, 복잡한 분석은 AI에게 맡겨 두세요. 정해진 틀이
            어울리지 않는 아이디어도 자유롭게 펼칠 수 있습니다.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 not-prose">
            {[
              { name: 'BMC (Business Model Canvas)', desc: '사업 모델을 9개 블록으로 정의' },
              { name: 'Lean Canvas', desc: '스타트업 검증을 위한 한 페이지 캔버스' },
              { name: 'SWOT', desc: '내부 강점·약점, 외부 기회·위협' },
              { name: 'PESTEL', desc: '거시 환경 6대 요인 분석' },
              { name: 'PERSONA', desc: '타겟 고객 페르소나 정의' },
              { name: 'PROCESS', desc: '단계별 프로세스 분해' },
              { name: 'CAUSE', desc: '원인과 결과 트리 (5 Whys 포함)' },
              { name: 'SCAMPER', desc: '아이디어 변형 7가지 기법' },
              { name: 'OKR · KPT', desc: '목표 설정과 회고 프레임' },
              { name: 'FREE · 자유 형식', desc: '그 외에 어떤 자유로운 아이디어라도' },
            ].map((f) => (
              <div
                key={f.name}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="font-semibold text-slate-900">{f.name}</div>
                <div className="text-sm text-slate-600 mt-1">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 어떻게 다른가 */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">
            다른 도구와 무엇이 다른가요
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-slate-700 leading-relaxed">
            <li>
              <strong>프레임워크는 AI가 고릅니다.</strong> 무엇을 써야 할지
              미리 알 필요 없습니다. AI가 아이디어의 성격을 읽고 알맞은 구조를
              자동으로 적용합니다.
            </li>
            <li>
              <strong>생각이 끝없이 깊어집니다.</strong> 항목을 클릭할수록
              안으로 들어가며 확장됩니다. 위로 갈수록 큰 그림, 아래로 갈수록
              구체적인 행동 — 깊이에 따라 톤이 자동으로 달라집니다.
            </li>
            <li>
              <strong>모를 땐 먼저 물어봅니다.</strong> 정보가 부족하면 억지로
              채우지 않고, AI가 필요한 것을 먼저 질문합니다. 답을 주면 그걸
              바탕으로 다시 확장합니다.
            </li>
            <li>
              <strong>완전 무료입니다.</strong> 본인의 Gemini API 키를 입력하는
              BYOK 방식으로, 별도 요금이 없습니다. 데이터는 브라우저 안에만
              저장되어 외부로 나가지 않습니다.
            </li>
          </ul>
        </section>

        {/* 사용 사례 */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">
            이럴 때 쓰면 좋아요
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-slate-700 leading-relaxed">
            <li>머릿속에 맴도는 생각을 처음 꺼내 정리하고 싶을 때</li>
            <li>아이디어는 있는데 어디서부터 시작해야 할지 모를 때</li>
            <li>지금 상황의 문제점을 짚고 다음 방향을 찾고 싶을 때</li>
            <li>여러 선택지 앞에서 기준이 필요할 때</li>
            <li>누군가에게 설명하기 전에 내 생각부터 먼저 정리하고 싶을 때</li>
          </ul>
        </section>

        {/* 만든 사람 */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">
            만든 곳
          </h2>
          <p className="text-slate-700 leading-relaxed">
            MindBusiness는{' '}
            <a
              href="https://www.aib.vote/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-700 underline"
            >
              aib
            </a>
            가 만들었어요. AI를 일상의 의사결정에서 실제로 쓸 수 있는 도구로
            만들자는 생각에서 시작했습니다. 이 프로젝트는 오픈소스로,{' '}
            <a
              href="https://www.gnu.org/licenses/gpl-3.0.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-700 underline"
            >
              GPL v3
            </a>{' '}
            라이선스 하에 공개되어 있습니다.
          </p>
        </section>

        {/* CTA */}
        <section className="not-prose mt-16 rounded-xl bg-slate-900 p-8 md:p-10 text-center">
          <p className="text-white text-xl md:text-2xl font-semibold mb-3">
            바로 시작해보세요
          </p>
          <p className="text-slate-300 mb-6">
            지금 떠오른 그 아이디어, 바로 좋은 계획으로 만들어 보세요.
          </p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-100 active:scale-95"
          >
            첫 아이디어 정리해보기 →
          </Link>
        </section>
      </article>
    </main>
  )
}
