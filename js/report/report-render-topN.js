/* ───────────────────────────────────────────
   § 상위 N명 명단 렌더링 (전역 기준 적용)
─────────────────────────────────────────── */
function renderTopN(cache) {
    const topNValue = document.getElementById('top-n-count').value;
    // 'all'이 선택되면 무한대(Infinity)를 주어 전체 배열이 잘리지 않게 합니다.
    const limit = topNValue === 'all' ? Infinity : parseInt(topNValue, 10);
    const basisLabel = labelMap[cache.basis];

    // ★ 캐시의 studentWithSums 활용 — 정렬 시 getSum() 재호출 없음
    const topData = [...cache.studentWithSums]
        .sort((a, b) => {
            // 1차 기준: 총점(sum) 내림차순
            if (b.sum !== a.sum) {
                return b.sum - a.sum;
            }

            // 2차 기준: 반(class) 오름차순
            if (a.class !== b.class) {
                return a.class - b.class;
            }

            // 3차 기준: 번호(number) 오름차순
            return a.number - b.number;
        })
        .slice(0, limit);

    document.getElementById('top-n-title').innerText =
        `${basisLabel} 합(국어+수학+탐구1+탐구2) 상위 ${limit}명 학생`;

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
                onclick="handleRowClick(this)">
                <td class="px-2 py-2 text-center font-bold text-slate-500">${i + 1}</td>
                <td class="px-2 py-2 text-center">${s.class || '-'}</td>
                <td class="px-2 py-2 text-center">${s.number || '-'}</td>
                <td class="px-2 py-2 text-center font-semibold text-slate-800 whitespace-nowrap">${s.name || '-'}</td>
                <td class="px-2 py-2 text-center font-bold text-blue-600 bg-blue-50/20">
                    ${sum > 0 ? displaySum : '-'}
                </td>
                <td class="px-1 py-2 text-center">${s.korean?.subject || '-'}</td>
                <td class="px-1 py-2 text-center">${s.math?.subject || '-'}</td>
                <td class="px-1 py-2 text-center">${s.inquiry1?.subject || '-'}</td>
                <td class="px-1 py-2 text-center">${s.inquiry2?.subject || '-'}</td>
            </tr>
        `;
    }).join('');
}