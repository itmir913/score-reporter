/* ───────────────────────────────────────────
   § 상위 N명 명단 렌더링 (전역 기준 적용)
─────────────────────────────────────────── */
function renderTopN() {
    const limit = parseInt(document.getElementById('top-n-count').value, 10);
    const basis = globalReportBasis;
    const basisLabel = labelMap[basis];

    const getSum = (s, type) => {
        let sum = 0;
        ['korean', 'math', 'inquiry1', 'inquiry2'].forEach(subj => {
            if (s[subj] && typeof s[subj][type] === 'number') {
                sum += s[subj][type];
            }
        });
        return sum;
    };

    const sortedData = [...ST.data].sort((a, b) => getSum(b, basis) - getSum(a, basis));
    const topData = sortedData.slice(0, limit);

    document.getElementById('top-n-title').innerText = `${basisLabel} 합(국어+수학+탐구1+탐구2) 상위 ${limit}명 학생`;

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
    tbody.innerHTML = topData.map((s, i) => {
        const sumScore = getSum(s, basis);
        const displaySum = basis === 'pct' ? sumScore.toFixed(1) : Math.round(sumScore);
        return `
            <tr class="hover:bg-slate-50 cursor-pointer transition-colors divide-x divide-slate-100 border-b border-slate-100"
                data-name="${escapeAttr(s.name)}" data-class="${escapeAttr(s.class)}" data-num="${escapeAttr(s.number)}"
    onclick="handleRowClick(this)">
                <td class="px-2 py-2 text-center font-bold text-slate-500">${i + 1}</td>
                <td class="px-2 py-2 text-center">${s.class || '-'}</td>
                <td class="px-2 py-2 text-center">${s.number || '-'}</td>
                <td class="px-2 py-2 text-center font-semibold text-slate-800 whitespace-nowrap">${s.name || '-'}</td>
                <td class="px-2 py-2 text-center font-bold text-blue-600 bg-blue-50/20">
                    ${sumScore > 0 ? displaySum : '-'}
                </td>
                <td class="px-1 py-2 text-center">${s.korean?.subject || '-'}</td>
                <td class="px-1 py-2 text-center">${s.math?.subject || '-'}</td>
                <td class="px-1 py-2 text-center">${s.inquiry1?.subject || '-'}</td>
                <td class="px-1 py-2 text-center">${s.inquiry2?.subject || '-'}</td>
            </tr>
        `;
    }).join('');
}

// 행 클릭 시 데이터를 읽어와 상세 모달을 띄우는 핸들러
function handleRowClick(el) {
    const name = el.dataset.name;
    const cls = el.dataset.class;
    const num = el.dataset.num;

    // 기존에 사용하던 상세 보기 함수 호출
    showStudentDetail(name, cls, num);
}
