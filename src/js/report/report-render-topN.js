import {labelMap} from '../report.js';
/* 아래 마크업의 on* 속성이 부르는 함수는 모듈 스코프가 아니라 전역에서 찾는다.
 * src/main.js가 window에 올려두므로 여기서 import 하지 않는다. */
import {escapeAttr} from '../utils.js';

/* ───────────────────────────────────────────
   § 상위 N명 명단 렌더링 (전역 기준 적용)
─────────────────────────────────────────── */
export function renderTopN(cache) {
    const topNValue = document.getElementById('top-n-count').value;
    // 'all'이 선택되면 무한대(Infinity)를 주어 전체 배열이 잘리지 않게 합니다.
    const limit = topNValue === 'all' ? Infinity : parseInt(topNValue, 10);
    const basisLabel = labelMap[cache.basis];

    // ★ 캐시의 studentWithSums 활용 — 정렬 시 getSum() 재호출 없음
    const topData = [...cache.studentWithSums]
        .sort((a, b) => {
            // 1차 기준: 총점(sum) 내림차순 (총점은 숫자로 보장되어 있다고 가정)
            if (b.sum !== a.sum) {
                return b.sum - a.sum;
            }

            // 2차 기준: 반(class) 오름차순 (안전한 문자/숫자 혼합 정렬)
            const classA = String(a.s.class || "");
            const classB = String(b.s.class || "");
            if (classA !== classB) {
                return classA.localeCompare(classB, undefined, {numeric: true});
            }

            // 3차 기준: 번호(number) 오름차순
            const numA = String(a.s.number || "");
            const numB = String(b.s.number || "");
            return numA.localeCompare(numB, undefined, {numeric: true});
        })
        .slice(0, limit);

    const limitLabel = topNValue === 'all' ? '전체' : `상위 ${limit}명`;
    document.getElementById('top-n-title').innerText =
        `${basisLabel} 합(국어+수학+탐구1+탐구2) ${limitLabel} 학생`;

    const thead = document.getElementById('top20-thead');
    thead.innerHTML = `
        <tr class="divide-x divide-slate-200">
            <th class="px-2 py-2 text-center w-15">순위</th>
            <th class="px-2 py-2 text-center w-10">반</th>
            <th class="px-2 py-2 text-center w-20">번호</th>
            <th class="px-2 py-2 text-center w-30">이름</th>
            <th class="px-2 py-2 text-center text-blue-700 bg-blue-50/50 w-24">${basisLabel} 합</th>
            <th class="px-1 py-2 text-center">국어 선택</th>
            <th class="px-1 py-2 text-center">수학 선택</th>
            <th class="px-1 py-2 text-center">탐구1</th>
            <th class="px-1 py-2 text-center">탐구2</th>
        </tr>
    `;

    const tbody = document.getElementById('top20-tbody');
    tbody.innerHTML = topData.map(({s, sum}, i) => {
        const displaySum = cache.basis === 'pct' ? sum.toFixed(1) : Math.round(sum);
        return `
            <tr class="hover:bg-slate-50 cursor-pointer transition-colors divide-x divide-slate-100 border-b border-slate-100"
                data-name="${escapeAttr(s.name)}" data-class="${escapeAttr(s.class)}" data-num="${escapeAttr(s.number)}"
                data-action="row-click">
                <td class="px-2 py-2 text-center font-bold text-slate-500">${i + 1}</td>
                <td class="px-2 py-2 text-center">${escapeAttr(s.class) || '-'}</td>
                <td class="px-2 py-2 text-center">${escapeAttr(s.number) || '-'}</td>
                <td class="px-2 py-2 text-center font-semibold text-slate-800 whitespace-nowrap">${escapeAttr(s.name) || '-'}</td>
                <td class="px-2 py-2 text-center font-bold text-blue-600 bg-blue-50/20">
                    ${displaySum}
                </td>
                <td class="px-1 py-2 text-center">${escapeAttr(s.korean?.subject) || '-'}</td>
                <td class="px-1 py-2 text-center">${escapeAttr(s.math?.subject) || '-'}</td>
                <td class="px-1 py-2 text-center">${escapeAttr(s.inquiry1?.subject) || '-'}</td>
                <td class="px-1 py-2 text-center">${escapeAttr(s.inquiry2?.subject) || '-'}</td>
            </tr>
        `;
    }).join('');
}